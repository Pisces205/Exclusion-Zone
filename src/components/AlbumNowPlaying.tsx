import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { music, type MusicState, type QueueMode } from "../audio/music";
import type { Track } from "../data/site";
import { allAlbums, coverUrl, getAlbum, type Album } from "../data/albums";
import { ncmConfigured } from "../netease/config";
import {
  albumDetail,
  artistAlbums,
  like,
  lyricRaw,
  playlistTracks,
  songUrls,
  type NcmAlbumBrief,
  type NcmAlbumDetail,
  type NcmPlaylistSong,
} from "../netease/api";
import { lyricIndexAt, parseLrc, type LrcLine } from "../netease/lrc";
import LoginModal from "../netease/login";
import { refreshSession, signOut, useNcmSession } from "../netease/session";
import type { PlayerSource, Rect } from "./player-source";

/* ---------- FLIP 转场 ---------- */
const HERO_MS = 640;
const HERO_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

interface Props {
  /** 数据源：专辑库 or 登录用户的网易云歌单（显式判别） */
  source: PlayerSource;
  /** 打开瞬间卡片封面的视口矩形（FLIP 起点），可选 */
  originRect?: Rect;
  onClose: () => void;
}

const FALLBACK_COVER =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#161009"/><circle cx="300" cy="300" r="130" fill="none" stroke="#8fb6ff" stroke-opacity="0.4" stroke-width="2"/></svg>',
  );

const fmtTime = (sec: number) => {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
};

interface Row {
  /** 稳定 key：同一首歌在歌单里可以出现多次 */
  key: string;
  songId: number;
  title: string;
  artist: string;
  ms: number;
}

function toRow(s: NcmPlaylistSong, i: number): Row {
  return {
    key: `${s.id}:${i}`,
    songId: s.id,
    title: s.name,
    artist: (s.artists ?? []).map((a) => a.name).join(" / "),
    ms: s.duration ?? 0,
  };
}

function localRows(album: Album): Row[] {
  return (album.tracks ?? []).map((t, i) => {
    const songId = t.neteaseId ?? -(t.n || i + 1);
    return { key: `${songId}:${i}`, songId, title: t.title, artist: album.artist, ms: t.ms };
  });
}

/** 专辑组里未入库的网易云专辑 → 虚拟 Album（只用于播放浏览，卡片库不落地） */
function virtualAlbum(a: NcmAlbumBrief): Album {
  return {
    id: `ncm:${a.id}`,
    title: a.name,
    artist: a.artist.name,
    year: String(new Date(a.publishTime || Date.now()).getFullYear()),
    date: "",
    genres: [],
    cover: `${a.picUrl}?param=600x600`,
    accent: "#e0a25c",
    intro: "",
    ncmId: a.id,
    tracks: [],
  };
}

/** 歌单 → 播放页的虚拟专辑（封面/标题/背景色用；不参与「是否接入网易云」的判断） */
function playlistAlbum(source: Extract<PlayerSource, { kind: "playlist" }>): Album {
  return {
    id: `playlist:${source.playlistId}`,
    title: source.name,
    artist: "网易云歌单",
    year: "",
    date: "",
    genres: [],
    cover: source.cover ?? "",
    accent: "#8fb6ff",
    intro: "",
    tracks: [],
  };
}

export default function AlbumNowPlaying({ source, originRect, onClose }: Props) {
  /* ---------- music 单例订阅 ---------- */
  const stateRef = useRef<MusicState>(music.getState());
  const [, bump] = useState(0);
  useEffect(
    () =>
      music.subscribe((s) => {
        stateRef.current = s;
        bump((x) => x + 1);
      }),
    [],
  );
  const st = stateRef.current;

  const mode = source.kind;
  const sourceKey = source.kind === "album" ? `album:${source.albumId}` : `playlist:${source.playlistId}`;
  const playlistId = source.kind === "playlist" ? source.playlistId : null;

  /* ---------- 登录态（与蓝巨星页共用同一个 store） ---------- */
  const session = useNcmSession();
  const user = session.status === "user" ? session : null;
  const loggedIn = user != null;
  const apiOn = ncmConfigured();

  /* ---------- 视图态 ---------- */
  const [album, setAlbum] = useState<Album>(() =>
    source.kind === "album" ? getAlbum(source.albumId) ?? allAlbums[0] : playlistAlbum(source),
  );
  const [detail, setDetail] = useState<NcmAlbumDetail | null>(null);
  const [related, setRelated] = useState<NcmAlbumBrief[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [lyr, setLyr] = useState<{ lines: LrcLine[]; credits: Record<string, string> }>({ lines: [], credits: {} });
  const [urlMap, setUrlMap] = useState<Map<number, string>>(new Map());
  const [canPlayMap, setCanPlayMap] = useState<Map<number, boolean>>(new Map());
  const [loginOpen, setLoginOpen] = useState(false);
  /** 登录前记下的播放意图：稳定 key（不是歌曲 id，重复曲目也能区分） */
  const [pendingPlay, setPendingPlay] = useState<string | null>(null);
  const [bigCover, setBigCover] = useState(true);
  const [showTracks, setShowTracks] = useState(false);
  const [userToggledView, setUserToggledView] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  const [faved, setFaved] = useState(false);

  const heroRef = useRef<HTMLImageElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const lyricBoxRef = useRef<HTMLDivElement>(null);
  const manualUntil = useRef(0);
  const closingRef = useRef(false);

  const ncmId = album?.ncmId ?? null;

  /* ---------- toast 自动消失 ---------- */
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  /* ---------- 登录成功 / 退出 ---------- */
  const handleLoginSuccess = useCallback(() => {
    setLoginOpen(false);
    // 弹窗已用 account() 校验过；这里再让 store 统一刷新，两个页面的登录态一起更新
    void refreshSession(true);
  }, []);
  const handleLoginClose = useCallback(() => {
    setLoginOpen(false);
    setPendingPlay(null);
  }, []);
  const handleSignOut = useCallback(() => {
    signOut();
    setToast("已退出登录");
  }, []);

  /* ---------- 直链缓存：按数据源隔离，in-flight 复用，分批可见 ---------- */
  const urlCache = useRef<{
    key: string;
    map: Map<number, string>;
    canPlay: Map<number, boolean>;
    inflight: Promise<Map<number, string>> | null;
    singles: Map<number, Promise<string | null>>;
  }>({ key: "", map: new Map(), canPlay: new Map(), inflight: null, singles: new Map() });

  const resetUrlCache = useCallback(() => {
    urlCache.current = { key: sourceKey, map: new Map(), canPlay: new Map(), inflight: null, singles: new Map() };
    setUrlMap(new Map());
    setCanPlayMap(new Map());
  }, [sourceKey]);

  /**
   * 专辑模式：整张专辑的直链一次批量取（曲目少，还能提前标记不可播）。
   * 注意 in-flight 时返回同一个 promise——旧实现在请求中返回空 Map，
   * 会把队列裁成一首。
   */
  const ensureUrls = useCallback((ids: number[]): Promise<Map<number, string>> => {
    const c = urlCache.current;
    if (c.map.size) return Promise.resolve(c.map);
    if (c.inflight) return c.inflight;
    const key = c.key;
    const unique = [...new Set(ids.filter((id) => id > 0))];
    c.inflight = (async () => {
      try {
        for (let i = 0; i < unique.length; i += 50) {
          try {
            const part = await songUrls(unique.slice(i, i + 50));
            if (c.key !== key) return c.map;
            for (const p of part) {
              c.canPlay.set(p.id, !!p.url);
              if (p.url) c.map.set(p.id, p.url);
            }
            // 每批都提交：后面某批失败不会丢掉已拿到的链接
            setUrlMap(new Map(c.map));
            setCanPlayMap(new Map(c.canPlay));
          } catch {
            /* 单批失败继续下一批 */
          }
        }
      } finally {
        c.inflight = null;
      }
      return c.map;
    })();
    return c.inflight;
  }, []);

  /** 单曲直链：同一首并发请求去重；歌单模式按需解析（上千首不能全部预取） */
  const resolveTrackUrl = useCallback(
    (track: Track): Promise<string | null> => {
      const id = track.songId;
      if (!id) return Promise.resolve(null);
      const c = urlCache.current;
      const cached = c.map.get(id);
      if (cached) return Promise.resolve(cached);
      const running = c.singles.get(id);
      if (running) return running;
      const key = c.key;
      const job = (async () => {
        try {
          const r = (await songUrls([id])).find((x) => x.id === id);
          if (c.key === key) {
            c.canPlay.set(id, !!r?.url);
            setCanPlayMap(new Map(c.canPlay));
            if (r?.url) {
              c.map.set(id, r.url);
              setUrlMap(new Map(c.map));
            }
          }
          return r?.url ?? null;
        } catch {
          return null;
        } finally {
          c.singles.delete(id);
        }
      })();
      c.singles.set(id, job);
      return job;
    },
    [],
  );

  // music 内核：队列条目缺直链时回调这里
  useEffect(() => {
    music.setUrlResolver(resolveTrackUrl);
    return () => music.setUrlResolver(null);
  }, [resolveTrackUrl]);

  /* ---------- 装载：专辑详情 / 歌单曲目 ---------- */
  useEffect(() => {
    let alive = true;
    setDetail(null);
    setRelated([]);
    setRows([]);
    setLyr({ lines: [], credits: {} });
    resetUrlCache();

    if (mode === "playlist") {
      const id = playlistId;
      if (id == null) {
        return () => {
          alive = false;
        };
      }
      void (async () => {
        try {
          const r = await playlistTracks(id, 1000);
          if (!alive) return;
          if (r.code === 301 || r.code === -460) {
            setToast("登录状态已过期，请重新扫码");
            return;
          }
          if (r.code !== 200) {
            setToast(r.message || "歌单加载失败");
            return;
          }
          setRows(r.songs.map(toRow));
          if (r.truncated) setToast(`歌单共 ${r.songCount} 首，已载入前 ${r.songs.length} 首`);
        } catch {
          if (alive) setToast("歌单加载失败，请检查网络");
        }
      })();
      return () => {
        alive = false;
      };
    }

    if (!ncmId) {
      setRows(localRows(album));
      return () => {
        alive = false;
      };
    }
    void (async () => {
      try {
        const d = await albumDetail(ncmId);
        if (!alive || !d) return;
        setDetail(d);
        setRows(
          (d.songs ?? []).map((s, i) => ({
            key: `${s.id}:${i}`,
            songId: s.id,
            title: s.name,
            artist: (s.artists ?? []).map((a) => a.name).join(" / "),
            ms: s.duration ?? s.dt ?? 0,
          })),
        );
        try {
          const list = await artistAlbums(d.artist.id);
          if (alive) setRelated(list.filter((x) => x.id !== ncmId).slice(0, 6));
        } catch {
          /* 专辑组非关键路径 */
        }
      } catch {
        if (alive) {
          setRows(localRows(album));
          setToast("网易云接口请求失败");
        }
      }
    })();
    return () => {
      alive = false;
    };
    // sourceKey 已经涵盖 mode 与 id；album.id 覆盖「专辑组换专」
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey, ncmId, album.id, mode, playlistId, resetUrlCache]);

  /* ---------- 队列 → 当前曲目 ---------- */
  useEffect(() => {
    if (st.mode !== "queue") {
      setPlayingKey(null);
      setPlayingId(null);
    } else if (st.track) {
      setPlayingKey(st.track.uid ?? null);
      setPlayingId(st.track.songId ?? (Number(st.track.titleEn) || null));
    }
  }, [st.mode, st.track]);

  useEffect(() => {
    setFaved(false);
  }, [playingId]);

  /* ---------- 当前曲目歌词 ---------- */
  useEffect(() => {
    if (!playingId) {
      setLyr({ lines: [], credits: {} });
      return;
    }
    let alive = true;
    void lyricRaw(playingId)
      .then((raw) => alive && setLyr(parseLrc(raw)))
      .catch(() => alive && setLyr({ lines: [], credits: {} }));
    return () => {
      alive = false;
    };
  }, [playingId]);

  /* ---------- 有词且在播 → 自动从大封面切到歌词（一次） ---------- */
  useEffect(() => {
    if (!userToggledView && bigCover && lyr.lines.length > 0 && st.playing) setBigCover(false);
  }, [lyr.lines.length, st.playing, bigCover, userToggledView]);

  /* ---------- 播放 ---------- */
  const playRow = useCallback(
    async (row: Row) => {
      if (mode === "album" && !ncmId) {
        setToast("这张专辑还没接入网易云（部署服务后 npm run album --ncm 重新灌入）");
        return;
      }
      if (!apiOn) {
        setToast("播放服务未配置：部署 api-enhanced 并填 src/netease/config.ts");
        return;
      }
      if (session.status === "loading") {
        setPendingPlay(row.key);
        return;
      }
      if (session.status === "error") {
        setToast("登录状态校验失败，请检查网络后重试");
        return;
      }
      if (session.status !== "user") {
        setPendingPlay(row.key);
        setLoginOpen(true);
        return;
      }

      if (mode === "album") {
        const ids = rows.filter((r) => r.songId > 0).map((r) => r.songId);
        const urls = await ensureUrls(ids);
        let u = urls.get(row.songId);
        if (!u) {
          // 单曲再试一次（可能批量时该曲无权限/临时失败）
          try {
            const r = (await songUrls([row.songId])).find((x) => x.id === row.songId);
            u = r?.url ?? undefined;
          } catch {
            /* 下面统一提示 */
          }
          if (!u) {
            setToast("该曲目在你的账号下不可播（VIP/版权）");
            return;
          }
          urlCache.current.map.set(row.songId, u);
          urlCache.current.canPlay.set(row.songId, true);
          setUrlMap(new Map(urlCache.current.map));
          setCanPlayMap(new Map(urlCache.current.canPlay));
        }
        const queue: Track[] = rows
          .filter((r) => urlCache.current.map.has(r.songId))
          .map((r) => ({
            title: r.title,
            titleEn: String(r.songId),
            artist: r.artist || album.artist,
            songId: r.songId,
            uid: r.key,
            url: urlCache.current.map.get(r.songId),
          }));
        const qi = Math.max(0, queue.findIndex((t) => t.uid === row.key));
        music.playQueue(queue, qi);
      } else {
        // 歌单模式：整单入队；只解析当前这首，其余由 music 在播到时回调 resolveTrackUrl
        const queue: Track[] = rows.map((r) => ({
          title: r.title,
          titleEn: String(r.songId),
          artist: r.artist || album.artist,
          songId: r.songId,
          uid: r.key,
        }));
        const qi = Math.max(0, rows.findIndex((r) => r.key === row.key));
        const current = queue[qi];
        const url = await resolveTrackUrl({ ...current });
        if (url) queue[qi] = { ...current, url };
        music.playQueue(queue, qi);
      }

      music.setUrlRefresher(async (t) => {
        const id = t.songId ?? Number(t.titleEn);
        if (!id) return null;
        try {
          const r = (await songUrls([id])).find((x) => x.id === id);
          if (r?.url) {
            urlCache.current.map.set(id, r.url);
            setUrlMap(new Map(urlCache.current.map));
            return r.url;
          }
        } catch {
          /* 刷新失败按普通错误处理 */
        }
        return null;
      });
    },
    [mode, ncmId, apiOn, session.status, rows, ensureUrls, resolveTrackUrl, album.artist],
  );

  const playRowRef = useRef(playRow);
  playRowRef.current = playRow;

  /* ---------- 播放意图：startId / 登录前点击，统一消费一次 ---------- */
  const startSeededRef = useRef(false);
  useEffect(() => {
    // 首次 rows 就绪后，把「从卡片点进来的那首」转成 pendingPlay
    if (mode !== "playlist" || source.kind !== "playlist" || source.startId == null) return;
    if (startSeededRef.current || !rows.length) return;
    const row = rows.find((r) => r.songId === source.startId);
    startSeededRef.current = true;
    if (row) setPendingPlay(row.key);
  }, [mode, source, rows]);

  useEffect(() => {
    if (!pendingPlay) return;
    const row = rows.find((r) => r.key === pendingPlay);
    if (!row) return; // 曲目还没加载到：保留意图，别清空
    if (session.status === "user") {
      setPendingPlay(null);
      void playRowRef.current(row);
    } else if (session.status === "guest" && !loginOpen) {
      setLoginOpen(true);
    }
    // loading / error：等登录态确定，或由用户重试
  }, [pendingPlay, rows, session.status, loginOpen]);

  /* ---------- FLIP 入场 ---------- */
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hero = heroRef.current;
    if (reduced || !hero || !originRect || originRect.width < 8) return;
    const to = hero.getBoundingClientRect();
    if (!to.width) return;
    const dx = originRect.x + originRect.width / 2 - (to.x + to.width / 2);
    const dy = originRect.y + originRect.height / 2 - (to.y + to.height / 2);
    const sc = originRect.width / to.width;
    hero.style.transition = "none";
    hero.style.transform = `translate(${dx}px, ${dy}px) scale(${sc})`;
    hero.style.opacity = "0.9";
    void hero.offsetWidth;
    requestAnimationFrame(() => {
      hero.style.transition = `transform ${HERO_MS}ms ${HERO_EASE}, opacity ${HERO_MS * 0.6}ms ease`;
      hero.style.transform = "translate(0px, 0px) scale(1)";
      hero.style.opacity = "1";
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- 退出（反向 FLIP） ---------- */
  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hero = heroRef.current;
    const root = rootRef.current;
    if (!reduced && hero && root && originRect && originRect.width >= 8) {
      const to = hero.getBoundingClientRect();
      const dx = originRect.x + originRect.width / 2 - (to.x + to.width / 2);
      const dy = originRect.y + originRect.height / 2 - (to.y + to.height / 2);
      const sc = originRect.width / to.width;
      hero.style.transition = `transform ${HERO_MS * 0.85}ms ${HERO_EASE}, opacity ${HERO_MS * 0.6}ms ease`;
      hero.style.transform = `translate(${dx}px, ${dy}px) scale(${sc})`;
      hero.style.opacity = "0.35";
      root.style.transition = `opacity ${HERO_MS * 0.7}ms ease`;
      root.style.opacity = "0";
      window.setTimeout(onClose, HERO_MS * 0.8);
    } else {
      onClose();
    }
  }, [onClose, originRect]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loginOpen) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, loginOpen]);

  /* ---------- 歌词滚动 ---------- */
  const activeIdx = useMemo(() => lyricIndexAt(lyr.lines, st.currentTime), [lyr.lines, st.currentTime]);
  useEffect(() => {
    if (performance.now() < manualUntil.current) return;
    const box = lyricBoxRef.current;
    if (!box || activeIdx < 0) return;
    const line = box.children[activeIdx] as HTMLElement | undefined;
    if (line) box.scrollTo({ top: line.offsetTop - box.clientHeight / 2 + line.clientHeight / 2, behavior: "smooth" });
  }, [activeIdx]);

  /* ---------- 播放条 ---------- */
  const curRow =
    rows.find((r) => r.key === playingKey) ??
    (playingId != null ? rows.find((r) => r.songId === playingId) ?? null : null);
  const duration = st.duration || 0;
  const progress = scrub !== null ? scrub : duration > 0 ? st.currentTime / duration : 0;
  const nextMode: Record<QueueMode, QueueMode> = { order: "shuffle", shuffle: "one", one: "order" };

  const toggleFav = async () => {
    if (!loggedIn || !playingId) {
      setToast("登录后才能把曲目红心到你自己的网易云账号");
      return;
    }
    try {
      await like(playingId, !faved);
      setFaved(!faved);
    } catch {
      setToast("红心失败");
    }
  };

  const coverSrc = album.cover ? coverUrl(album) : FALLBACK_COVER;
  const accent = album.accent || "#e0a25c";

  /* ---------- 曲目行（右列 / 移动端抽屉共用） ---------- */
  const renderRows = (className: string) => (
    <div className={className}>
      {rows.map((r) => {
        const isCur = playingKey ? r.key === playingKey : playingId != null && r.songId === playingId;
        // 专辑模式知道整张的可播性；歌单模式只有播过才知道，未知按可播显示
        const known = mode === "album" && urlMap.size > 0;
        const ok =
          mode === "album"
            ? known
              ? urlMap.has(r.songId) || (canPlayMap.get(r.songId) ?? false)
              : true
            : canPlayMap.get(r.songId) !== false;
        return (
          <button
            key={r.key}
            onClick={() => void playRow(r)}
            aria-current={isCur ? "true" : undefined}
            className={`group flex w-full cursor-pointer items-center gap-3 rounded-lg px-4 py-2.5 text-left transition-colors duration-200 hover:bg-white/[0.07] ${
              isCur ? "text-white" : ok ? "text-white/70" : "text-white/28"
            }`}
          >
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-[14px] ${isCur ? "font-normal" : "font-light"}`}>{r.title}</span>
              <span className="block truncate text-[11px] text-white/35">{r.artist || album.artist}</span>
            </span>
            {isCur ? (
              <EqBars accent={accent} playing={st.playing && st.mode === "queue"} />
            ) : (mode === "album" && !ncmId) || (loggedIn && ok) || (!known && !loggedIn) ? (
              <span className={loggedIn || (mode === "album" && !ncmId) ? "text-white/25 transition-colors group-hover:text-white/80" : "text-white/15"}>
                <Ico d={IcoPath.play} />
              </span>
            ) : (
              <span className="text-white/15"><Ico d={IcoPath.playNo} /></span>
            )}
          </button>
        );
      })}
    </div>
  );

  return (
    <div ref={rootRef} className="fixed inset-0 z-[60] overflow-hidden text-white" style={{ background: "#0a0605" }}>
      {/* ===== 背景：当前封面 blur + 暖压暗（换专 crossfade 靠 key + anim-fade-in） ===== */}
      <div key={coverSrc} className="anim-fade-in pointer-events-none absolute inset-[-14%]">
        <img src={coverSrc} alt="" className="h-full w-full scale-110 object-cover" style={{ filter: "blur(72px) saturate(1.3)" }} draggable={false} />
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(180deg, rgba(10,6,5,0.5) 0%, rgba(10,6,5,0.85) 100%), radial-gradient(120% 90% at 50% -10%, ${accent}26 0%, transparent 55%)`,
          }}
        />
      </div>

      {/* ===== 顶栏 ===== */}
      <div className="absolute inset-x-0 top-0 z-40 flex items-center justify-between px-5 py-4 sm:px-8">
        <button onClick={close} className="flex cursor-pointer items-center gap-2 rounded-full border border-white/12 bg-black/40 px-4 py-1.5 text-[11px] font-light uppercase tracking-[0.28em] text-white/60 backdrop-blur-xl transition-colors duration-300 hover:text-white">
          <Ico d={IcoPath.back} /> 返回蓝巨星
        </button>
        {user ? (
          <div className="flex items-center gap-2.5 rounded-full border border-white/12 bg-black/40 py-1 pl-1 pr-4 backdrop-blur-xl">
            {user.avatarUrl && (
              <img src={`${user.avatarUrl}?param=80x80`} alt="" className="h-7 w-7 rounded-full object-cover" />
            )}
            <span className="text-[11px] font-light text-white/80">{user.nickname ?? "已登录"}</span>
            <button
              onClick={handleSignOut}
              className="cursor-pointer text-[10px] tracking-[0.2em] text-white/40 transition-colors hover:text-white"
            >
              退出
            </button>
          </div>
        ) : (
          <button onClick={() => setLoginOpen(true)} className="cursor-pointer rounded-full border px-4 py-1.5 text-[11px] font-light tracking-[0.24em] backdrop-blur-xl transition-all duration-300 hover:brightness-125" style={{ borderColor: `${accent}66`, background: `${accent}1f`, color: "#fff" }}>
            {session.status === "error" ? "登录异常 · 重试" : "扫码登录"}
          </button>
        )}
      </div>

      {/* ===== 主体：中列（大封面 ⇄ 歌词 ⇄ 曲目） + 右列曲目表 ===== */}
      <div className="relative flex h-full items-stretch pb-[118px] pt-14 sm:gap-8">
        <div className="flex min-w-0 flex-1 items-center justify-center px-6">
          {showTracks ? (
            <div className="flex h-[58vh] w-full max-w-[560px] flex-col">
              <p className="shrink-0 px-4 pb-2 pt-1 text-[13px] font-light text-white/70">
                {album.title}
                <span className="text-white/35"> · {rows.length} 首</span>
              </p>
              <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {rows.length === 0 ? (
                  <p className="px-4 py-6 text-[12px] font-light text-white/35">曲目加载中…</p>
                ) : (
                  renderRows("")
                )}
              </div>
            </div>
          ) : bigCover ? (
            <img
              ref={heroRef}
              src={coverSrc}
              alt={album.title}
              className="h-[min(40vh,340px)] w-[min(40vh,340px)] rounded-2xl object-cover shadow-[0_30px_90px_rgba(0,0,0,0.6)]"
              draggable={false}
              style={{ transformOrigin: "center", willChange: "transform" }}
            />
          ) : lyr.lines.length > 0 ? (
            <div ref={lyricBoxRef} onWheel={() => (manualUntil.current = performance.now() + 3000)} className="h-[58vh] w-full max-w-[560px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="h-[24vh]" />
              {lyr.lines.map((l, i) => (
                <button
                  key={`${l.t}-${i}`}
                  onClick={() => {
                    manualUntil.current = 0;
                    music.seek(l.t + 0.2);
                  }}
                  className={`block w-full cursor-pointer py-[8px] text-left text-[22px] leading-snug transition-all duration-500 ${
                    i === activeIdx ? "text-[33px] font-normal text-white" : i < activeIdx ? "font-light text-white/25 hover:text-white/50" : "font-light text-white/40 hover:text-white/65"
                  }`}
                >
                  {l.text}
                </button>
              ))}
              <div className="h-[26vh]" />
            </div>
          ) : (
            <div className="max-w-[560px] px-4 text-center">
              <h1 className="text-[40px] font-thin leading-tight text-white/95 sm:text-[48px]">{curRow?.title ?? album.title}</h1>
              <p className="mt-4 text-[13px] font-light text-white/60">
                {curRow?.artist || detail?.artist?.name || album.artist}
                {detail?.publishTime ? ` · ${new Date(detail.publishTime).getFullYear()}` : album.year ? ` · ${album.year}` : ""}
              </p>
              <p className="mt-2 text-[11px] font-light uppercase tracking-[0.32em] text-white/30">暂无歌词</p>
              <div className="mt-9 space-y-2 text-[12px] font-light text-white/45">
                {lyr.credits["作词"] && <p>作词 : {lyr.credits["作词"]}</p>}
                {lyr.credits["作曲"] && <p>作曲 : {lyr.credits["作曲"]}</p>}
                {lyr.credits["编曲"] && <p>编曲 : {lyr.credits["编曲"]}</p>}
                {album.intro && <p className="leading-relaxed">{album.intro}</p>}
              </div>
            </div>
          )}
        </div>

        {/* 右列：曲目表（歌单模式下就是整个歌单） */}
        <aside className="hidden w-[340px] shrink-0 flex-col pb-4 pr-6 xl:flex 2xl:w-[380px]">
          <p className="truncate px-4 py-3 text-[13px] font-light text-white/70">
            {detail?.name ?? album.title}{" "}
            <span className="text-white/35">· {detail?.artist?.name ?? album.artist}</span>
          </p>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {rows.length === 0 ? (
              <p className="px-4 py-6 text-[12px] font-light text-white/35">曲目加载中…</p>
            ) : (
              renderRows("")
            )}
          </div>
        </aside>
      </div>

      {/* ===== 底部：专辑组 + 播放条胶囊 ===== */}
      <div className="absolute inset-x-0 bottom-0 z-40 pb-4">
        {related.length > 0 && (
          <div className="mb-4 flex items-end justify-center gap-4 overflow-x-auto px-6 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <p className="shrink-0 self-center pr-2 text-[10px] font-light uppercase tracking-[0.32em] text-white/30">专辑组</p>
            {related.map((a) => (
              <button
                key={a.id}
                onClick={() => {
                  const lib = allAlbums.find((x) => x.ncmId === a.id);
                  const target = lib ?? virtualAlbum(a);
                  setAlbum(target);
                  setBigCover(true);
                  setShowTracks(false);
                  setUserToggledView(false);
                }}
                className="group shrink-0 cursor-pointer text-center"
                title={`${a.name} · ${a.artist.name}`}
              >
                <span className="block h-[72px] w-[72px] overflow-hidden rounded-lg shadow-[0_10px_28px_rgba(0,0,0,0.5)] transition-transform duration-300 group-hover:-translate-y-1">
                  <img src={`${a.picUrl}?param=300x300`} alt={a.name} className="h-full w-full object-cover" loading="lazy" draggable={false} />
                </span>
                <span className="mt-1.5 block max-w-[96px] truncate text-[10px] font-light text-white/50 transition-colors duration-300 group-hover:text-white/85">{a.name}</span>
              </button>
            ))}
          </div>
        )}

        <div className="mx-auto flex w-[min(1080px,94vw)] items-center gap-4 rounded-2xl border border-white/[0.08] bg-[#140d09]/75 px-4 py-3 shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur-2xl">
          <div className="flex w-[26%] min-w-0 items-center gap-3">
            {!bigCover && <img src={coverSrc} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover shadow-lg" draggable={false} style={{ display: bigCover ? "none" : undefined }} />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] text-white/90">{curRow?.title ?? st.track?.title ?? album.title}</p>
              <p className="truncate text-[10px] text-white/40">{curRow?.artist ?? st.track?.artist ?? album.artist}</p>
            </div>
            <button onClick={() => void toggleFav()} className={`shrink-0 cursor-pointer transition-all duration-200 hover:scale-110 ${faved ? "text-[#ff5f7a]" : "text-white/35 hover:text-white/75"}`} title="红心到你的网易云">
              <Ico d={faved ? IcoPath.heartFill : IcoPath.heart} solid={faved} />
            </button>
          </div>

          <div className="flex flex-1 flex-col items-center gap-1">
            <div className="flex items-center gap-5">
              <button onClick={() => music.setQueueMode(nextMode[st.queueMode])} className="text-white/55 transition-colors duration-200 hover:text-white" title={`播放模式：${st.queueMode === "order" ? "顺序" : st.queueMode === "shuffle" ? "随机" : "单曲循环"}`}>
                <Ico d={st.queueMode === "shuffle" ? IcoPath.shuffle : st.queueMode === "one" ? IcoPath.repeat1 : IcoPath.repeat} />
              </button>
              <button onClick={() => music.prev()} className="text-white/75 transition-colors duration-200 hover:text-white" title="上一首"><Ico d={IcoPath.prev} /></button>
              <button
                onClick={() => {
                  if (st.mode === "queue") music.toggle();
                  else if (rows.length) void playRow(rows.find((r) => r.key === playingKey) ?? rows.find((r) => r.songId > 0) ?? rows[0]);
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black transition-transform duration-200 hover:scale-105 active:scale-95"
                title={st.playing && st.mode === "queue" ? "暂停" : "播放"}
              >
                <Ico d={st.playing && st.mode === "queue" ? IcoPath.pause : IcoPath.play} solid />
              </button>
              <button onClick={() => music.next()} className="text-white/75 transition-colors duration-200 hover:text-white" title="下一首"><Ico d={IcoPath.next} /></button>
            </div>
            <div className="flex w-full max-w-[560px] items-center gap-3">
              <span className="w-9 shrink-0 text-right font-mono text-[10px] text-white/40">{fmtTime(scrub !== null ? scrub * duration : st.currentTime)}</span>
              <Scrubber value={progress} accent={accent} onScrub={setScrub} onCommit={(v) => { setScrub(null); music.seek(v * duration); }} />
              <span className="w-9 shrink-0 font-mono text-[10px] text-white/40">{fmtTime(duration)}</span>
            </div>
          </div>

          <div className="flex w-[24%] items-center justify-end gap-3">
            <button
              onClick={() => setShowTracks((v) => !v)}
              className="rounded-md border border-white/10 px-2.5 py-1 text-[10px] font-light text-white/55 transition-colors duration-200 hover:border-white/25 hover:text-white xl:hidden"
              title="曲目列表"
            >
              {showTracks ? "封面" : "曲目"}
            </button>
            <button
              onClick={() => {
                setUserToggledView(true);
                setShowTracks(false);
                setBigCover((b) => !b);
              }}
              className="rounded-md border border-white/10 px-2.5 py-1 text-[10px] font-light text-white/55 transition-colors duration-200 hover:border-white/25 hover:text-white"
              title="歌词 / 大封面"
            >
              {bigCover ? "歌词" : "封面"}
            </button>
            <button onClick={() => music.setVolume(st.volume > 0 ? 0 : 0.6)} className="text-white/50 transition-colors duration-200 hover:text-white" title="静音"><Ico d={st.volume === 0 ? IcoPath.mute : IcoPath.volume} /></button>
            <input type="range" min={0} max={100} value={Math.round(st.volume * 100)} onChange={(e) => music.setVolume(Number(e.target.value) / 100)} className="hidden w-20 accent-white/70 sm:block" aria-label="音量" />
          </div>
        </div>
      </div>

      {toast && (
        <div className="anim-caption-in absolute bottom-[124px] left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/10 bg-black/80 px-5 py-2 text-[12px] font-light text-white/85 backdrop-blur-xl">
          {toast}
        </div>
      )}
      {loginOpen && (
        <LoginModal onSuccess={handleLoginSuccess} onClose={handleLoginClose} />
      )}
    </div>
  );
}

/* ---------------- 当前曲跳动双柱 ---------------- */
function EqBars({ accent, playing }: { accent: string; playing: boolean }) {
  return (
    <span className="flex h-4 w-4 items-end justify-center gap-[2.5px]">
      {[0, 1].map((i) => (
        <span
          key={i}
          className="w-[2.5px] rounded-full"
          style={{
            background: accent,
            height: "100%",
            transformOrigin: "bottom",
            animation: playing ? `eqbar ${0.85 + i * 0.4}s ease-in-out infinite alternate` : "none",
            transform: playing ? undefined : "scaleY(0.45)",
          }}
        />
      ))}
    </span>
  );
}

/* ---------------- 进度条 ---------------- */
function Scrubber({ value, accent, onScrub, onCommit }: { value: number; accent: string; onScrub: (v: number) => void; onCommit: (v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);
  const posFrom = (clientX: number) => {
    const el = ref.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  };
  return (
    <div
      ref={ref}
      className="group relative flex h-4 flex-1 cursor-pointer items-center"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        onScrub(posFrom(e.clientX));
      }}
      onPointerMove={(e) => {
        if (e.buttons & 1) onScrub(posFrom(e.clientX));
      }}
      onPointerUp={(e) => onCommit(posFrom(e.clientX))}
    >
      <div className="relative h-[3px] w-full rounded-full bg-white/15">
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${value * 100}%`, background: hover ? accent : "rgba(255,255,255,0.78)" }} />
        <span className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 shadow transition-opacity duration-150 group-hover:opacity-100" style={{ left: `${value * 100}%` }} />
      </div>
    </div>
  );
}

/* ---------------- 图标 ---------------- */
const IcoPath: Record<string, string> = {
  back: "m14 6-6 6 6 6",
  play: "M7 4.5v15l13-7.5Z",
  playNo: "M7 4.5v15l13-7.5Z M3 3l18 18",
  pause: "M7 4.5h3.4v15H7zM13.6 4.5H17v15h-3.4z",
  prev: "M7 5v14M19 5.5 9.5 12l9.5 6.5Z",
  next: "M17 5v14M5 5.5 14.5 12 5 18.5Z",
  heart: "M12 20s-7.5-4.6-9.3-9.2C1.4 7.6 3.4 4.5 6.6 4.5c2 0 3.6 1.1 4.4 2.4l1 1.6 1-1.6c.8-1.3 2.4-2.4 4.4-2.4 3.2 0 5.2 3.1 3.9 6.3C17.5 15.4 12 20 12 20Z",
  heartFill: "M12 20s-7.5-4.6-9.3-9.2C1.4 7.6 3.4 4.5 6.6 4.5c2 0 3.6 1.1 4.4 2.4l1 1.6 1-1.6c.8-1.3 2.4-2.4 4.4-2.4 3.2 0 5.2 3.1 3.9 6.3C17.5 15.4 12 20 12 20Z",
  shuffle: "M17 3.5 21 7l-4 3.5M17 13.5 21 17l-4 3.5M3 7h3.5c4 0 5 3.5 8.5 9.5M3 17h3.5c2-4.5 3-7 5.5-9",
  repeat: "M7 4.5h9.5L21 8l-4.5 3.5H7a2 2 0 0 0-2 2V15M17 19.5H7.5L3 16l4.5-3.5H17a2 2 0 0 0 2-2V9",
  repeat1: "M7 4.5h9.5L21 8l-4.5 3.5H7a2 2 0 0 0-2 2V15M17 19.5H7.5L3 16l4.5-3.5H17a2 2 0 0 0 2-2V9M11.5 15.5v-4l-1.5 1",
  volume: "M4 9.5v5h4l5 4.5V5l-5 4.5zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12",
  mute: "M4 9.5v5h4L13 19V5L8 9.5zM17 9.5l4 5m0-5-4 5",
};

function Ico({ d, solid = false }: { d: string; solid?: boolean }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill={solid ? "currentColor" : "none"} stroke={solid ? "none" : "currentColor"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d={d} />
    </svg>
  );
}
