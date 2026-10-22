/**
 * NeteaseCloudMusicAPI Enhanced 的最小客户端封装：
 * 所有请求 GET {base}{path}，自动带 timestamp 防缓存、有登录 cookie 则带 cookie 参数。
 * 登录态完全存在访客浏览器 localStorage（本站不保存任何人账号）。
 *
 * 参数名兼容：QR 三个接口在不同版本里叫 key / qrkey / unikey / qrUniKey 不等，
 * 统一把候选参数名都发过去（未识别的参数服务端会忽略），响应端做多路径取值。
 */
import { getCookie, ncmBase } from "./config";

const TIMEOUT_MS = 12000;

async function get<T>(
  path: string,
  params: Record<string, string | number> = {},
  opts: { cookie?: string; signal?: AbortSignal } = {},
): Promise<T> {
  const base = ncmBase();
  if (!base) throw new Error("api-not-configured");
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) q.set(k, String(v));
  q.set("timestamp", String(Date.now()));
  // 扫码流程要显式传这次扫码的 cookie 会话（而不是已保存的登录态）
  const cookie = opts.cookie !== undefined ? opts.cookie : getCookie();
  const headers: Record<string, string> = {};
  if (cookie) {
    // 同源代理走请求头（不把登录态留在 URL / 访问日志里）；自部署的 NCMAPI 只认 query
    if (base.startsWith("/")) headers["x-ncm-cookie"] = cookie;
    else q.set("cookie", cookie);
  }
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const forwardAbort = () => ctrl.abort();
  if (opts.signal) {
    if (opts.signal.aborted) ctrl.abort();
    else opts.signal.addEventListener("abort", forwardAbort, { once: true });
  }
  try {
    const res = await fetch(`${base}${path}?${q.toString()}`, { signal: ctrl.signal, headers });
    if (!res.ok) throw new Error(`http-${res.status}`);
    return (await res.json()) as T;
  } finally {
    window.clearTimeout(timer);
    opts.signal?.removeEventListener("abort", forwardAbort);
  }
}

/* ---------------- 浏览类（无需登录） ---------------- */

export interface NcmAlbumBrief {
  id: number;
  name: string;
  publishTime: number;
  size: number;
  picUrl: string;
  artist: { id: number; name: string };
}

export async function searchAlbum(keyword: string): Promise<NcmAlbumBrief | null> {
  const r = await get<{ result?: { albums?: NcmAlbumBrief[] } }>("/search", {
    keywords: keyword,
    type: 10,
    limit: 10,
  });
  const list = r.result?.albums ?? [];
  return list.length ? list[0] : null;
}

export interface NcmSong {
  id: number;
  name: string;
  /** 网易云 /album 返回的艺术家数组字段名是 ar，部分端点是 artists；取用时归一 */
  ar?: { id: number; name: string }[];
  artists?: { id: number; name: string }[];
  /** 毫秒：/album 端点实际给的是 dt */
  duration?: number;
  dt?: number;
  fee: number; // 0 免费 1 VIP 4 付费专辑
}

export interface NcmAlbumDetail {
  id: number;
  name: string;
  publishTime: number;
  picUrl: string;
  artist: { id: number; name: string };
  songs: NcmSong[];
  artistId?: number;
}

export async function albumDetail(id: number | string): Promise<NcmAlbumDetail | null> {
  const r = await get<{ album?: NcmAlbumDetail; songs?: NcmSong[] }>("/album", { id });
  if (!r.album) return null;
  const songs = ((r.songs ?? r.album.songs ?? []).map((s) => ({
    ...s,
    artists: s.artists ?? s.ar ?? [],
    duration: s.duration ?? s.dt ?? 0,
  })));
  return { ...r.album, songs };
}

export async function artistAlbums(artistId: number, limit = 50): Promise<NcmAlbumBrief[]> {
  const r = await get<{ hotAlbums?: NcmAlbumBrief[]; albums?: NcmAlbumBrief[] }>("/artist/album", {
    id: artistId,
    limit,
    offset: 0,
  });
  return r.hotAlbums ?? r.albums ?? [];
}

export async function lyricRaw(id: number | string): Promise<string> {
  const r = await get<{ lrc?: { lyric?: string } }>("/lyric", { id });
  return r.lrc?.lyric ?? "";
}

/* ---------------- 播放类（需登录 cookie） ---------------- */

export interface NcmUrl {
  id: number;
  url: string | null;
  code: number;
  fee?: number;
}

export async function songUrls(ids: (number | string)[], level = "exhigh"): Promise<NcmUrl[]> {
  const r = await get<{ data?: NcmUrl[] }>("/song/url/v1", { id: ids.join(","), level });
  return r.data ?? [];
}

/** 专辑全部曲目的「可播性」探测：不传 cookie 时返回的就是游客视角（VIP 曲 url=null） */
export async function playableMap(
  ids: number[],
  withCookie: boolean,
): Promise<Map<number, { url: string | null; ok: boolean }>> {
  if (!ids.length) return new Map();
  const out: NcmUrl[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    // 单次批量上限保护
    const batch = ids.slice(i, i + 50);
    if (withCookie) {
      const part = await songUrls(batch);
      out.push(...part);
    } else {
      const saved = getCookie();
      try {
        localStorage.setItem("rainburst.ncm-cookie", "");
        const part = await songUrls(batch);
        out.push(...part);
      } finally {
        if (saved) localStorage.setItem("rainburst.ncm-cookie", saved);
      }
    }
  }
  const m = new Map<number, { url: string | null; ok: boolean }>();
  for (const s of out) m.set(s.id, { url: s.url, ok: !!s.url && s.code === 200 });
  return m;
}

export async function like(id: number, add: boolean): Promise<void> {
  await get("/like", { id, add: add ? "1" : "0" });
}

export interface NcmAccount {
  ok: boolean;
  nickname?: string;
  avatarUrl?: string;
  userId?: number;
  /** 网络/服务故障（区别于「未登录」），调用方不要把它当成 guest */
  error?: boolean;
}

export async function account(): Promise<NcmAccount> {
  if (!getCookie()) return { ok: false };
  try {
    const r = await get<{ profile?: { nickname?: string; avatarUrl?: string; userId?: number } | null }>("/user/account");
    if (!r.profile) return { ok: false };
    return { ok: true, nickname: r.profile.nickname, avatarUrl: r.profile.avatarUrl, userId: r.profile.userId };
  } catch {
    return { ok: false, error: true };
  }
}

/* ---------------- 登录用户的歌单 ---------------- */

export interface NcmPlaylistBrief {
  id: number;
  name: string;
  cover?: string;
  coverImgUrl?: string;
  trackCount: number;
  specialType: number;
  privacy?: number;
  subscribed?: boolean;
  creatorId?: number;
}

export interface NcmPlaylistSong {
  id: number;
  name: string;
  artists: { id: number; name: string }[];
  duration: number;
  fee: number;
  album?: { id: number; name: string; picUrl?: string | null };
}

export interface UserPlaylistsResult {
  code: number;
  more: boolean;
  playlist: NcmPlaylistBrief[];
}

export async function userPlaylists(
  uid: number | string,
  limit = 100,
  signal?: AbortSignal,
): Promise<UserPlaylistsResult> {
  const r = await get<{ code?: number; more?: boolean; playlist?: NcmPlaylistBrief[] }>(
    "/user/playlist",
    { uid, limit, offset: 0 },
    { signal },
  );
  const list = (r.playlist ?? []).map((p) => ({ ...p, cover: p.cover ?? p.coverImgUrl ?? "" }));
  return { code: r.code ?? 200, more: r.more === true, playlist: list };
}

export interface PlaylistTracksResult {
  code: number;
  message?: string;
  songs: NcmPlaylistSong[];
  songCount: number;
  truncated: boolean;
  playlist?: { id: number | string; name: string; cover?: string | null; trackCount?: number } | null;
}

export async function playlistTracks(
  id: number | string,
  limit = 1000,
  signal?: AbortSignal,
): Promise<PlaylistTracksResult> {
  const r = await get<{
    code?: number;
    message?: string;
    songs?: NcmPlaylistSong[];
    songCount?: number;
    truncated?: boolean;
    playlist?: { id: number | string; name: string; cover?: string | null; trackCount?: number } | null;
  }>("/playlist/track/all", { id, limit }, { signal });
  const songs = (r.songs ?? []).map((s) => ({
    ...s,
    artists: s.artists ?? [],
    duration: s.duration ?? 0,
    fee: s.fee ?? 0,
  }));
  return {
    code: r.code ?? 200,
    message: r.message,
    songs,
    songCount: r.songCount ?? r.playlist?.trackCount ?? songs.length,
    truncated: r.truncated === true,
    playlist: r.playlist ?? null,
  };
}

/* ---------------- 扫码登录 ---------------- */

/**
 * 取 unikey，同时拿到这次扫码的匿名 cookie 会话（_ntes_nuid / sDeviceId / NMTID 等）
 * 和 chainId。轮询时必须把三样原样带回去，手机确认后网易云才会把登录态发给我们。
 */
export async function qrKey(): Promise<{ key: string; chainId: string; cookie: string }> {
  const r = await get<{
    data?: { unikey?: string };
    unikey?: string;
    chainId?: string;
    cookie?: string;
    code?: number;
    message?: string;
  }>("/login/qr/key", {}, { cookie: "" });
  const key = r.data?.unikey ?? r.unikey ?? "";
  if (!key) {
    // 网易云对该出口 IP 限流时是 406「操作频繁」，不要误报成服务没部署
    throw new Error(
      r.code === 406 || r.message
        ? `网易云暂时限制了登录请求（${r.message || r.code}），请等一两分钟再试`
        : "登录服务没有响应，请稍后再试",
    );
  }
  return { key, chainId: r.chainId ?? "", cookie: r.cookie ?? "" };
}

/** 服务端自带二维码渲染（qrimg=1 时直接回 dataURL，无需前端绘制） */
export async function qrCreate(key: string, chainId = ""): Promise<{ qrUrl: string; qrImg: string }> {
  const r = await get<{ data?: { qrurl?: string; qrimg?: string; qrUrl?: string }; message?: string }>("/login/qr/create", {
    key,
    chainId,
    qrimg: 1,
  });
  return {
    qrUrl: r.data?.qrurl ?? r.data?.qrUrl ?? "",
    qrImg: r.data?.qrimg ?? "",
  };
}

/**
 * 轮询：801 未扫 / 802 已扫待确认 / 803 成功 / 800 过期。
 * 返回的 cookie 是这次扫码会话的最新完整 jar；调用方每次都要拿它覆盖。
 */
export async function qrCheck(key: string, chainId: string, cookie: string): Promise<{ code: number; cookie: string }> {
  const r = await get<{
    code?: number;
    cookie?: string;
    body?: { cookie?: string };
    data?: { code?: number; cookie?: string };
  }>("/login/qr/check", { key, chainId }, { cookie });
  const code = r.data?.code ?? r.code ?? 0;
  const jar = r.cookie ?? r.body?.cookie ?? r.data?.cookie ?? "";
  return { code, cookie: jar };
}
