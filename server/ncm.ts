/**
 * 同源网易云 API 代理。
 *
 * 线上：functions/api/[[path]].ts（Cloudflare Pages Function，和站点同域，无 CORS）
 * 本地：server/vite-plugin-ncm.ts（dev / preview 中间件，直接挂 /api）
 *
 * 只实现本站真正用到的接口：
 *   search / album / artist-album / lyric / song-url / like / account  → /api/*
 *   user-playlist / playlist-track-all → /api/*（登录用户歌单）
 *   login-qr-key / login-qr-check → /weapi/*（网页登录同款加密，见下方 weapi 段）
 *   login-qr-create → 本地生成，不出网
 *
 * 边界：
 * - 路由白名单，不做通用反向代理；
 * - cookie 只来自访客自己的浏览器（优先 x-ncm-cookie 请求头，兼容旧的 query 参数），
 *   只进上游 Cookie 头，不落盘、不记录、不回传；
 * - 上游 10s 超时、响应 no-store；
 * - 不依赖 Node API，Cloudflare Workers 与 Node 24 都能跑。
 */

import qrcode from "qrcode-generator";

const UPSTREAM = "https://music.163.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
/**
 * 不伪造 X-Real-IP / X-Forwarded-For：网易云会优先采信这类头，
 * 一个被用滥的固定 IP 反而会触发 406「操作频繁」，直连出口 IP 才正常。
 */
const TIMEOUT_MS = 10_000;

const BR_BY_LEVEL: Record<string, string> = {
  standard: "128000",
  higher: "192000",
  exhigh: "320000",
  lossless: "999000",
  hires: "1999000",
};

type JsonObject = Record<string, unknown>;
type JsonValue = unknown;

interface UpstreamResult {
  body: JsonObject;
  /** 803 时网易云把 MUSIC_U 放在 Set-Cookie，必须自己拼回来 */
  setCookie: string;
  /** 上游 HTTP 状态；歌单接口用它区分「被重定向到登录页」和真正的 JSON 响应 */
  status: number;
}

function json(body: JsonValue, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function queryInt(url: URL, key: string, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const raw = url.searchParams.get(key);
  const n = raw === null ? NaN : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/** 只接受纯数字 id，避免把任意字符串拼进上游路径 */
function queryId(url: URL, key = "id"): number | null {
  const raw = (url.searchParams.get(key) ?? "").trim();
  return /^\d{1,20}$/.test(raw) ? Number(raw) : null;
}

function queryIdList(url: URL, key = "id"): number[] {
  return (url.searchParams.get(key) ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter((v) => /^\d{1,20}$/.test(v))
    .slice(0, 100)
    .map(Number);
}

/**
 * 数字 id 保留为字符串：Number 会丢 15 位以上的精度，也会把 "007" 改写成 7。
 * 歌单 uid / id 直接透传给上游，不参与任何算术。
 */
function queryDigits(url: URL, key: string, maxLen = 20): string | null {
  const raw = (url.searchParams.get(key) ?? "").trim();
  if (!/^[1-9]\d{0,19}$/.test(raw) || raw.length > maxLen) return null;
  return raw;
}

/**
 * cookie 优先从请求头读（同源前端发 x-ncm-cookie），query 只作兼容回退。
 * 这样登录态不会出现在浏览器地址栏、DevTools 的 URL 和 Cloudflare 的请求日志里。
 */
function readCookie(request: Request, url: URL): string {
  const raw = request.headers.get("x-ncm-cookie") ?? url.searchParams.get("cookie") ?? "";
  // 去掉换行，避免 header 注入；长度设上限
  return raw.replace(/[\r\n]/g, "").trim().slice(0, 4096);
}

/** 从 Set-Cookie 里取出 name=value；Playwright/Node/Workers 都提供 getSetCookie 时优先用 */
function mergeSetCookie(headers: Headers): string {
  const withGet = headers as Headers & { getSetCookie?: () => string[] };
  const rawList: string[] =
    typeof withGet.getSetCookie === "function"
      ? withGet.getSetCookie()
      : headers.get("set-cookie")
        ? [headers.get("set-cookie") as string]
        : [];
  const jar = new Map<string, string>();
  for (const header of rawList) {
    // 单条 header 里若被合并了多个 cookie，按 ", name=" 切开（Expires 里的逗号后面不是 name=）
    for (const piece of header.split(/,(?=\s*[A-Za-z0-9_\-]+=)/)) {
      const first = piece.split(";")[0]?.trim() ?? "";
      const eq = first.indexOf("=");
      if (eq <= 0) continue;
      const name = first.slice(0, eq).trim();
      const value = first.slice(eq + 1).trim();
      if (!value || !/^[A-Za-z0-9_\-]+$/.test(name)) continue;
      if (/max-age\s*=\s*0\b/i.test(piece)) continue;
      jar.set(name, value);
    }
  }
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function upstream(
  path: string,
  init: {
    method?: "GET" | "POST";
    cookie?: string;
    query?: Record<string, string | number>;
    /** 表单体（weapi 用）；传了就自动改成 POST + x-www-form-urlencoded */
    form?: Record<string, string>;
    /** 额外的请求头（扫码登录要带官方登录框的 x-os / x-login-chain-id 等） */
    headers?: Record<string, string>;
    /** manual：不要把 3xx 跟到登录 HTML 页，交给调用方按 code:301 处理 */
    redirect?: "follow" | "manual";
  } = {},
): Promise<UpstreamResult> {
  const target = new URL(path, UPSTREAM);
  for (const [key, value] of Object.entries(init.query ?? {})) {
    target.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = {
    "User-Agent": UA,
    Referer: "https://music.163.com/",
    Origin: UPSTREAM,
  };
  if (init.cookie) headers.Cookie = init.cookie;
  if (init.form) headers["Content-Type"] = "application/x-www-form-urlencoded";
  Object.assign(headers, init.headers ?? {});

  const response = await fetch(target.toString(), {
    method: init.method ?? (init.form ? "POST" : "GET"),
    headers,
    body: init.form ? new URLSearchParams(init.form).toString() : undefined,
    redirect: init.redirect ?? "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  // manual 模式下上游可能直接 302 去登录页（HTML）：不当成 JSON 解析失败
  if (init.redirect === "manual" && response.status >= 300 && response.status < 400) {
    return { body: {}, setCookie: mergeSetCookie(response.headers), status: response.status };
  }
  const text = await response.text();
  let body: JsonObject;
  try {
    body = JSON.parse(text) as JsonObject;
  } catch {
    throw new Error(`upstream-not-json:${response.status}`);
  }
  return { body, setCookie: mergeSetCookie(response.headers), status: response.status };
}

/* ------------------------------------------------------------ weapi 加密 */

/**
 * 扫码登录必须走网页端同款 weapi 加密（官方登录框就是这么发的）：
 *   params = AES-CBC(base64, AES-CBC(预设密钥, JSON))；encSecKey = 反序 16 位密钥的裸 RSA。
 * 而且二维码会话靠 cookie（NMTID 等）串起来——只拿 unikey 不带 cookie 去查状态，
 * 手机确认后服务端对不上会话，就会一直停在 801/802，这正是「确认后无反应」的原因。
 */
const WEAPI_PRESET_KEY = "0CoJUm6Qyw8W8jud";
const WEAPI_IV = "0102030405060708";
const WEAPI_BASE62 = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
/** 网易云 weapi 公钥的模数（1024 bit，e=65537）；WebCrypto 不支持无填充 RSA，用 BigInt 算 */
const WEAPI_RSA_N = BigInt(
  "0x" +
    "e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7",
);
const WEAPI_RSA_E = 65537n;

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function randomHex(bytes: number): string {
  return [...randomBytes(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomChars(length: number, alphabet: string): string {
  return [...randomBytes(length)].map((b) => alphabet[b % alphabet.length]).join("");
}

async function aesCbcBase64(key: string, plain: string): Promise<string> {
  const text = new TextEncoder();
  const imported = await crypto.subtle.importKey("raw", text.encode(key), { name: "AES-CBC" }, false, ["encrypt"]);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-CBC", iv: text.encode(WEAPI_IV) }, imported, text.encode(plain));
  let binary = "";
  for (const byte of new Uint8Array(encrypted)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n;
  let b = base % modulus;
  let e = exponent;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % modulus;
    b = (b * b) % modulus;
    e >>= 1n;
  }
  return result;
}

async function weapi(data: JsonObject): Promise<Record<string, string>> {
  const secretBytes = randomBytes(16);
  const secret = [...secretBytes].map((b) => WEAPI_BASE62[b % WEAPI_BASE62.length]).join("");
  const first = await aesCbcBase64(WEAPI_PRESET_KEY, JSON.stringify(data));
  const params = await aesCbcBase64(secret, first);
  // RSA 的明文是「反序后的 16 位密钥字符串」，不是原始随机字节
  const reversed = [...secret].reverse().join("");
  const m = BigInt("0x" + [...new TextEncoder().encode(reversed)].map((b) => b.toString(16).padStart(2, "0")).join(""));
  const encSecKey = modPow(m, WEAPI_RSA_E, WEAPI_RSA_N).toString(16).padStart(256, "0");
  return { params, encSecKey };
}

async function weapiPost(
  path: string,
  data: JsonObject,
  cookie: string,
  headers?: Record<string, string>,
): Promise<UpstreamResult> {
  const form = await weapi(data);
  return upstream(`/weapi/${path.replace(/^\/api\//, "")}`, { method: "POST", form, cookie, headers });
}

/* --------------------------------------------------------- 二维码 cookie jar */

function parseJar(raw: string): Map<string, string> {
  const jar = new Map<string, string>();
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (value && /^[A-Za-z0-9_\-]+$/.test(name)) jar.set(name, value);
  }
  return jar;
}

function jarToString(jar: Map<string, string>): string {
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

function absorbJar(jar: Map<string, string>, cookies: string) {
  for (const [name, value] of parseJar(cookies)) jar.set(name, value);
}

/** 补齐网页端未登录时的匿名身份 cookie（网易云首次请求就会下发） */
function seedJar(jar: Map<string, string>): Map<string, string> {
  if (!jar.has("_ntes_nuid")) {
    const nuid = randomHex(16);
    jar.set("_ntes_nuid", nuid);
    jar.set("_ntes_nnid", `${nuid},${Date.now()}`);
  }
  if (!jar.has("WNMCID")) jar.set("WNMCID", `${randomChars(6, "abcdefghijklmnopqrstuvwxyz")}.${Date.now()}.01.0`);
  if (!jar.has("WEVNSM")) jar.set("WEVNSM", "1.0.0");
  // 易盾设备号：官方登录框的 sDeviceId 形如 YD-<32 位 base62>。
  // 二维码里的 chainId 和轮询头 x-login-chain-id 都由它派生，缺了手机确认就对不上会话。
  if (!jar.has("sDeviceId")) jar.set("sDeviceId", `YD-${randomChars(32, WEAPI_BASE62)}`);
  return jar;
}

/**
 * 官方登录框的 chainId 生成逻辑（反混淆自 ctWebLogin）：
 *   `v1_${sDeviceId}_web_login_${Date.now()}`
 * 它被写进二维码 URL，手机确认时回传；轮询必须带上同一个值，否则会返回 8821。
 */
function chainIdFor(jar: Map<string, string>): string {
  return `v1_${jar.get("sDeviceId") ?? "unknown"}_web_login_${Date.now()}`;
}

/** 旧版 /api/album 的歌曲字段是 artists/duration，新版是 ar/dt，统一成客户端认的形状 */
function normalizeSong(raw: JsonValue): JsonObject {
  const song = (raw ?? {}) as JsonObject;
  return {
    ...song,
    artists: song.artists ?? song.ar ?? [],
    duration: song.duration ?? song.dt ?? 0,
  };
}

function normalizeAlbum(body: JsonObject): JsonObject {
  const album = (body.album ?? {}) as JsonObject;
  // v1 的 album.songs 经常是空的，曲目在顶层 songs；哪边有就用哪边
  const albumSongs = Array.isArray(album.songs) ? (album.songs as JsonValue[]) : [];
  const topSongs = Array.isArray(body.songs) ? (body.songs as JsonValue[]) : [];
  const songs = (albumSongs.length ? albumSongs : topSongs).map(normalizeSong);
  const artist = (album.artist ?? {}) as JsonObject;
  return {
    ...album,
    songs,
    artistId: artist.id,
  };
}

function httpsUrl(value: JsonValue): string | null {
  if (typeof value !== "string" || !value) return null;
  return value.replace(/^http:\/\//i, "https://");
}

/**
 * v6 歌单的原始曲目每首 1–3KB（ar/al/tns/mv/pop/fee/h/m/l/sq/hr…），
 * 1000 首就是 MB 级；只留下播放器真正要用的字段，裁剪后约 80–120KB。
 */
function pickPlaylistSong(raw: JsonValue): JsonObject {
  const song = (raw ?? {}) as JsonObject;
  const al = (song.al ?? {}) as JsonObject;
  const ar = Array.isArray(song.ar) ? song.ar : Array.isArray(song.artists) ? song.artists : [];
  return {
    id: song.id,
    name: song.name,
    artists: ar.map((item) => {
      const artist = (item ?? {}) as JsonObject;
      return { id: artist.id, name: artist.name };
    }),
    duration: typeof song.dt === "number" ? song.dt : typeof song.duration === "number" ? song.duration : 0,
    fee: typeof song.fee === "number" ? song.fee : 0,
    album: { id: al.id, name: al.name, picUrl: httpsUrl(al.picUrl) },
  };
}

function pickPlaylistBrief(raw: JsonValue): JsonObject {
  const playlist = (raw ?? {}) as JsonObject;
  const creator = (playlist.creator ?? {}) as JsonObject;
  const cover = httpsUrl(playlist.coverImgUrl);
  return {
    id: playlist.id,
    name: playlist.name,
    cover,
    // 兼容 NeteaseCloudMusicAPI 的字段名，自部署 base 时取哪边都行
    coverImgUrl: cover,
    trackCount: Number(playlist.trackCount) || 0,
    specialType: Number(playlist.specialType) || 0,
    privacy: Number(playlist.privacy) || 0,
    subscribed: playlist.subscribed === true,
    creatorId: creator.userId,
  };
}

/** 歌单接口的失败一律 HTTP 200 + 上游 code 透传：让前端能区分「未登录 / 私密 / 已删除」 */
function playlistError(code: number, message: string): Response {
  return json({ code, message, playlist: null, songs: [], songCount: 0, truncated: false });
}

/* ------------------------------------------------------------------ 路由 */

export async function handleNcm(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api(?=\/|$)/, "").replace(/\/+$/, "") || "/";
  const cookie = readCookie(request, url);

  try {
    switch (path) {
      /* 专辑搜索：客户端只要 result.albums */
      case "/search": {
        const keywords = (url.searchParams.get("keywords") ?? "").trim().slice(0, 100);
        if (!keywords) return json({ code: 400, message: "missing keywords" }, 400);
        const { body } = await upstream("/api/search/get/web", {
          query: {
            csrf_token: "",
            s: keywords,
            type: queryInt(url, "type", 10),
            offset: 0,
            total: "true",
            limit: queryInt(url, "limit", 10, 1, 50),
          },
        });
        return json(body);
      }

      /* 专辑详情 + 曲目：优先旧端点，风控时退回 /api/v1/album */
      case "/album": {
        const id = queryId(url);
        if (!id) return json({ code: 400, message: "missing id" }, 400);
        let { body } = await upstream(`/api/album/${id}`, { query: { csrf_token: "" }, cookie });
        if (body.code !== 200 || !body.album) {
          const retry = await upstream(`/api/v1/album/${id}`, { query: { csrf_token: "" }, cookie });
          if (retry.body.code === 200) body = retry.body;
        }
        if (!body.album) return json({ code: body.code ?? -1, album: null, songs: [] });
        const album = normalizeAlbum(body);
        return json({ code: 200, album, songs: album.songs });
      }

      /* 同艺术家专辑组 */
      case "/artist/album": {
        const id = queryId(url);
        if (!id) return json({ code: 400, message: "missing id" }, 400);
        const { body } = await upstream(`/api/artist/albums/${id}`, {
          query: {
            limit: queryInt(url, "limit", 50, 1, 100),
            offset: queryInt(url, "offset", 0),
          },
          cookie,
        });
        return json(body);
      }

      /* 歌词 */
      case "/lyric": {
        const id = queryId(url);
        if (!id) return json({ code: 400, message: "missing id" }, 400);
        const { body } = await upstream("/api/song/lyric", {
          query: { id, lv: -1, kv: -1, tv: -1 },
          cookie,
        });
        return json(body);
      }

      /* 播放直链（批量）。网易云给的是 http，这里统一改 https，避免混合内容被浏览器拦 */
      case "/song/url/v1": {
        const ids = queryIdList(url);
        if (!ids.length) return json({ code: 400, data: [] }, 400);
        const level = url.searchParams.get("level") ?? "exhigh";
        const { body } = await upstream("/api/song/enhance/player/url", {
          query: { ids: JSON.stringify(ids), br: BR_BY_LEVEL[level] ?? BR_BY_LEVEL.exhigh },
          cookie,
        });
        const data = Array.isArray(body.data) ? (body.data as JsonObject[]) : [];
        return json({
          code: body.code ?? 200,
          data: data.map((item) => ({ ...item, url: httpsUrl(item.url) })),
        });
      }

      /* 红心 / 取消红心（网易云对未登录的旧端点会返回 -460，客户端按失败提示即可） */
      case "/like": {
        const id = queryId(url);
        if (!id) return json({ code: 400, message: "missing id" }, 400);
        const add = url.searchParams.get("add") === "1";
        // 旧版 /api/radio/like 对机房 IP 直接风控 -460；v1 端点未登录时是 301，登录后正常
        const { body } = await upstream("/api/v1/radio/like", {
          method: "POST",
          query: { alg: "itembased", trackId: id, like: add ? "true" : "false", time: 3 },
          cookie,
        });
        return json(body);
      }

      /* 当前登录账号 */
      case "/user/account": {
        if (!cookie) return json({ code: 200, account: null, profile: null });
        const { body } = await upstream("/api/w/nuser/account/get", { cookie });
        return json(body);
      }

      /* 登录用户的歌单列表。只服务登录用户：没有 cookie 直接短路，不打上游
         （与 /user/account 一致，也省得拿共享出口 IP 去喂网易云风控）。 */
      case "/user/playlist": {
        if (!cookie) return json({ code: 301, message: "login required", playlist: [], more: false });
        const uid = queryDigits(url, "uid", 12);
        if (!uid) return json({ code: 400, message: "missing or invalid uid", playlist: [] }, 400);
        const { body } = await upstream("/api/user/playlist", {
          query: {
            uid,
            limit: queryInt(url, "limit", 100, 1, 200),
            offset: queryInt(url, "offset", 0),
          },
          cookie, // 只进上游 header
        });
        const list = Array.isArray(body.playlist) ? (body.playlist as JsonValue[]) : [];
        return json({
          code: Number.isFinite(Number(body.code)) ? Number(body.code) : 200,
          more: body.more === true,
          playlist: list.map(pickPlaylistBrief),
        });
      }

      /* 歌单全部曲目。用 v6 端点：一次最多 1000 首，trackIds 是完整列表（tracks 会截断）。
         上游的 301/404/-460 一律放在 body.code 里、HTTP 仍 200，
         让前端能区分「登录过期 / 私密歌单 / 网络故障」，而不是统一显示 502。 */
      case "/playlist/track/all": {
        const id = queryDigits(url, "id");
        if (!id) return json({ code: 400, message: "missing or invalid id", songs: [] }, 400);
        if (queryInt(url, "offset", 0, 0) > 0) {
          // v6 detail 没有 offset；要支持需用 trackIds 切片 + /api/song/detail 回填
          return json({ code: 400, message: "offset not supported", songs: [] }, 400);
        }
        const limit = queryInt(url, "limit", 1000, 1, 1000);
        const { body, status } = await upstream("/api/v6/playlist/detail", {
          query: { id, n: limit },
          cookie,
          redirect: "manual",
        });
        // 被重定向到登录页时上游给的是 HTML，不能当歌单解析
        if (status >= 300 && status < 400) return playlistError(301, "login required");
        const code = Number(body.code);
        const playlist =
          body.playlist && typeof body.playlist === "object" ? (body.playlist as JsonObject) : null;
        if (!Number.isFinite(code) || code !== 200 || !playlist) {
          return playlistError(
            Number.isFinite(code) ? code : -1,
            typeof body.msg === "string" ? body.msg : typeof body.message === "string" ? body.message : "",
          );
        }
        const rawTracks = Array.isArray(playlist.tracks) ? (playlist.tracks as JsonValue[]) : [];
        const trackIds = Array.isArray(playlist.trackIds) ? playlist.trackIds : [];
        const songCount = trackIds.length || Number(playlist.trackCount) || rawTracks.length;
        const songs = rawTracks.map(pickPlaylistSong);
        const cover = httpsUrl(playlist.coverImgUrl);
        return json({
          code: 200,
          playlist: {
            id: playlist.id,
            name: playlist.name,
            cover,
            coverImgUrl: cover,
            trackCount: songCount,
          },
          songs,
          songCount,
          // 我喜欢的音乐常见数千首：n=1000 只拿得回前 1000 首，前端要提示
          truncated: songCount > songs.length,
        });
      }

      /* 扫码登录 1/3：拿 unikey，并建立这次扫码的 cookie 会话。
         type=1 是网页端扫码登录的值（官方登录框与 api-enhanced 都一致）；
         响应里的 cookie 必须由前端保存，轮询时原样带回来，否则手机确认后服务端匹配不到会话。 */
      case "/login/qr/key": {
        const jar = seedJar(parseJar(cookie));
        // 官方 getUuid 的入参就是 {type:1, noCheckToken:true}（noCheckToken 会跳过 csrf 校验）
        const { body, setCookie } = await weapiPost(
          "/api/login/qrcode/unikey",
          { type: 1, noCheckToken: true },
          jarToString(jar),
        );
        absorbJar(jar, setCookie);
        const unikey = typeof body.unikey === "string" ? body.unikey : "";
        // 用最终的设备号生成 chainId：二维码里带一份，轮询头里带同一个
        const chainId = chainIdFor(jar);
        // 406 = 网易云对该出口 IP 的「操作频繁」限流，把原始提示带给前端
        const message = typeof body.message === "string" ? body.message : typeof body.msg === "string" ? body.msg : "";
        return json({ code: body.code ?? 200, unikey, chainId, message, cookie: jarToString(jar), data: { unikey } });
      }

      /* 扫码登录 2/3：本地生成二维码（网易云本身不出图）。
         官方登录框的二维码内容是 scanlogin 路由，必须带上 chainId——手机确认时
         会把它回传，服务端据此把「手机上的确认」和「网页端的轮询」绑在一起。 */
      case "/login/qr/create": {
        const key = (url.searchParams.get("key") ?? "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 64);
        if (!key) return json({ code: 400, message: "missing key" }, 400);
        const chainId = (url.searchParams.get("chainId") ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 96);
        const qrurl = chainId
          ? `https://music.163.com/st/platform/scanlogin?codekey=${key}&chainId=${chainId}&hdw_device=web&hdw_appid=web&hitExp=1`
          : `http://music.163.com/login?codekey=${key}`;
        let qrimg = "";
        if (url.searchParams.get("qrimg")) {
          const qr = qrcode(0, "M");
          qr.addData(qrurl);
          qr.make();
          qrimg = qr.createDataURL(6, 4);
        }
        return json({ code: 200, data: { qrurl, qrimg } });
      }

      /* 扫码登录 3/3：轮询状态。每次都回传更新后的 cookie 会话；803 时里面多了 MUSIC_U */
      case "/login/qr/check": {
        const key = (url.searchParams.get("key") ?? "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 64);
        if (!key) return json({ code: 400, message: "missing key" }, 400);
        const chainId = (url.searchParams.get("chainId") ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 96);
        const jar = seedJar(parseJar(cookie));
        // 与官方 poll 完全一致：noCheckToken + ydDeviceToken 走请求体，
        // x-login-chain-id 必须等于二维码里的 chainId，否则手机确认后会返回 8821。
        const { body, setCookie } = await weapiPost(
          "/api/login/qrcode/client/login",
          { key, type: 1, noCheckToken: true, ydDeviceToken: "" },
          jarToString(jar),
          {
            "X-loginMethod": "QrCode",
            "X-channelSource": "undefined",
            "x-os": "web",
            ...(chainId ? { "x-login-chain-id": chainId } : {}),
          },
        );
        absorbJar(jar, setCookie);
        // 有的上游实现把 cookie 直接放在 JSON 里，也一并吸收
        if (typeof body.cookie === "string") absorbJar(jar, body.cookie);
        return json({ ...body, code: Number(body.code) || 0, cookie: jarToString(jar) });
      }

      default:
        return json({ code: 404, message: "unsupported endpoint" }, 404);
    }
  } catch (error) {
    // 不把上游细节（可能含 cookie）回给浏览器
    const message = error instanceof Error ? error.name : "unknown";
    return json({ code: -1, message: `upstream failed (${message})` }, 502);
  }
}
