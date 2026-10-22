import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BlackholeScene } from "../universe/blackhole";
import SectionPage from "./SectionPage";
import AlbumNowPlaying from "./AlbumNowPlaying";
import { music } from "../audio/music";
import { coverUrl, featuredAlbum, historyAlbums, pinnedAlbum, type Album } from "../data/albums";
import { site, type StarDef } from "../data/site";
import { ensureSessionStarted, useNcmSession, type Session } from "../netease/session";
import { usePlaylistTracks, useUserPlaylists, type LoadState } from "../netease/playlists";
import type { NcmPlaylistBrief, NcmPlaylistSong } from "../netease/api";
import type { PlayerSource, Rect } from "./player-source";

interface Props {
  star: StarDef;
  onBack: () => void;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export default function BlueGiantPage({ star, onBack }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<BlackholeScene | null>(null);
  const lastProgressRef = useRef(-1);

  const [progress, setProgress] = useState(0);
  const [unsupported, setUnsupported] = useState(false);
  /** 播放放大页：数据源 + 打开瞬间卡片封面矩形（FLIP 起点）；null = 故事页 */
  const [player, setPlayer] = useState<{ source: PlayerSource; rect?: Rect } | null>(null);

  /* ---------- 登录态与用户歌单 ---------- */
  const session = useNcmSession();
  useEffect(() => {
    ensureSessionStarted();
  }, []);
  const playlists = useUserPlaylists(session);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const userId = session.status === "user" ? session.userId : null;

  // 默认选中「我喜欢的音乐」；其次自己创建的；最后第一个
  useEffect(() => {
    if (userId == null) {
      setSelectedId(null);
      return;
    }
    if (!playlists.data.length) return;
    setSelectedId((prev) => {
      if (prev != null && playlists.data.some((p) => p.id === prev)) return prev;
      const mine =
        playlists.data.find((p) => p.specialType === 5) ??
        playlists.data.find((p) => p.creatorId === userId && p.subscribed === false) ??
        playlists.data[0];
      return mine.id;
    });
  }, [userId, playlists.data]);

  const selectedPlaylist = playlists.data.find((p) => p.id === selectedId) ?? null;
  // 卡片只取 5 首做预览；播放器打开后再取全量
  const tracks = usePlaylistTracks(selectedId, 5, userId != null);

  /* DEV 调试钩子：?dev=blue-giant&finale=1 定格终局卡片；window.__bgOpen(id) 直接开播放页
     （用于浏览器面板隐藏、rAF 冻结时的无头布局验证；生产构建剔除） */
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __bgOpen?: (id: string) => void }).__bgOpen = (id: string) =>
      setPlayer({ source: { kind: "album", albumId: id } });
    if (new URLSearchParams(window.location.search).get("finale")) setProgress(1);
  }, []);

  /** 关播放页：若正在播队列 → 淡回板块专属曲 */
  const closePlayer = () => {
    setPlayer(null);
    if (music.getState().mode === "queue") music.switchMode("dedicated");
  };

  /** 本地别名：模块级 const 在 JSX 闭包里不被 TS 收窄，本地 const 会 */
  const feat = featuredAlbum;
  const pin = pinnedAlbum;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = new BlackholeScene(canvas, {
      onProgress: (p) => {
        // 只有变化超过阈值才触发 React 重渲染
        if (Math.abs(p - lastProgressRef.current) > 0.0015) {
          lastProgressRef.current = p;
          setProgress(p);
        }
      },
    });
    sceneRef.current = scene;
    if (!scene.supported) setUnsupported(true);
    return () => {
      scene.destroy();
      sceneRef.current = null;
    };
  }, []);

  if (unsupported) return <SectionPage star={star} onBack={onBack} />;

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll <= 0) return;
    sceneRef.current?.setProgress(el.scrollTop / maxScroll);
  };

  const scrollToEnd = () => {
    const el = containerRef.current;
    el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  // 首屏文案：p < 0.22 可见
  const heroOpacity = clamp01(1 - progress * 4.5);
  // 中段遥测：0.12 → 0.72
  const telemetryOpacity =
    progress > 0.12 && progress < 0.72 ? Math.sin(((progress - 0.12) / 0.6) * Math.PI) : 0;

  // 遥测数值：随滚动一路飙升
  const accretionRate = (0.8 + Math.pow(progress, 1.4) * 41).toFixed(1);
  const diskSpeed = (0.18 + progress * 0.74).toFixed(2);
  const redshift = (1.02 + Math.pow(progress, 2.4) * 4.8).toFixed(2);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={`fixed inset-0 select-none bg-[#030304] text-white ${
        player ? "overflow-hidden" : "overflow-x-hidden overflow-y-auto"
      }`}
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      <div className="relative h-[500vh] w-full">
        <div className="sticky top-0 h-screen w-full overflow-hidden">
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

          {/* 顶栏 */}
          <header className="pointer-events-auto absolute left-[5vw] right-[5vw] top-6 z-30 flex items-center justify-between sm:top-8">
            <div className="flex min-w-0 items-center gap-3 rounded-full bg-black/35 px-3.5 py-1.5 backdrop-blur-md">
              <span className="whitespace-nowrap text-[11px] font-light uppercase tracking-[0.42em] text-white/60">
                {site.nameLatin}
              </span>
              {/* 窄屏只留站名：站名 + 天体学名两段文字会在 390px 把胶囊挤成两行 */}
              <span className="hidden h-3 w-px bg-white/20 sm:block" />
              <span className="hidden whitespace-nowrap text-[10px] font-light uppercase tracking-[0.32em] text-[#8fb6ff]/90 sm:inline">
                {star.nameEn}
              </span>
            </div>

            <button
              onClick={onBack}
              className="group flex shrink-0 cursor-pointer items-center gap-3 rounded-full border border-white/10 bg-black/40 px-4 py-1.5 backdrop-blur-md transition-all duration-300 hover:border-white/30 hover:bg-white/10"
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#8fb6ff] transition-transform duration-300 group-hover:scale-150" />
              <span className="whitespace-nowrap text-[11px] font-light uppercase tracking-[0.28em] text-white/70 group-hover:text-white">
                返回宇宙
              </span>
            </button>
          </header>

          {/* 首屏文案：放在右侧深空一侧，不压在过曝的恒星上 */}
          <div
            className="pointer-events-none absolute inset-0 z-20 transition-opacity duration-300"
            style={{ opacity: heroOpacity, transform: `translateY(-${progress * 60}px)` }}
          >
            <div className="absolute bottom-[14vh] right-[6vw] max-w-[78vw] text-right sm:bottom-auto sm:top-1/2 sm:max-w-[34vw] sm:-translate-y-1/2">
              <p className="anim-fade-up delay-1 text-[11px] font-light uppercase tracking-[0.44em] text-[#8fb6ff]">
                潮汐撕裂 · ROCHE LOBE OVERFLOW
              </p>
              <h1 className="anim-fade-up delay-2 mt-4 text-[17vw] font-thin leading-[0.9] tracking-[-0.04em] text-white/95 sm:text-[7vw]">
                {star.section}
              </h1>
              <p className="anim-fade-up delay-3 mt-3 text-[11px] font-light uppercase tracking-[0.48em] text-white/45">
                {star.sectionEn} & SOUND ARCHIVES · 2026
              </p>
              <p className="anim-fade-up delay-4 ml-auto mt-7 max-w-[26rem] text-sm font-light leading-relaxed text-white/60 sm:text-base">
                一颗蓝巨星把自己的大气一层层交给身旁的黑洞。被撕下来的等离子体绕着视界加速到近乎光速，那是宇宙里最响的一段低音。
              </p>
            </div>

            <button
              onClick={scrollToEnd}
              className="anim-fade-up delay-5 pointer-events-auto absolute bottom-8 right-[6vw] flex cursor-pointer items-center gap-3 text-[11px] font-light tracking-[0.32em] text-white/50 transition-colors duration-300 hover:text-white"
            >
              <span className="anim-breathe">向下滚动 · 靠近视界</span>
              <span className="anim-breathe-soft inline-block h-1.5 w-1.5 rounded-full bg-[#8fb6ff]" />
            </button>
          </div>

          {/* 中段遥测 HUD：右下角，压在深空一侧 */}
          <div
            className="pointer-events-none absolute bottom-8 right-[6vw] z-20 text-right transition-opacity duration-300"
            style={{ opacity: telemetryOpacity }}
          >
            <div className="flex items-end gap-7 border-t border-white/10 pt-4 text-[10px] font-light uppercase tracking-[0.26em] text-white/40 sm:gap-10">
              <div>
                <span className="block text-white/30">吸积速率</span>
                <span className="font-mono text-sm text-white/85">{accretionRate} M☉/yr</span>
              </div>
              <div>
                <span className="block text-white/30">盘面转速</span>
                <span className="font-mono text-sm text-white/85">{diskSpeed} c</span>
              </div>
              <div>
                <span className="block text-white/30">引力红移</span>
                <span className="font-mono text-sm text-[#8fb6ff]">{redshift} Z</span>
              </div>
            </div>
          </div>

          {/* 终局：三张专辑卡沿底部一排渐次浮现（苹果发布页式），避开黑洞与上方拱弧。
              1024px 以下保持横向滑动卡：三列时歌单卡放不下选择器 + 曲目。 */}
          <div className="pointer-events-none absolute bottom-6 left-[5vw] right-[5vw] z-30 flex snap-x gap-3 overflow-x-auto pb-1 sm:bottom-8 lg:grid lg:grid-cols-3 lg:items-end lg:gap-4 lg:overflow-visible">
            {feat && (
              <RevealSlot cp={clamp01((progress - 0.72) / 0.1)}>
                <AlbumCard
                  album={feat}
                  kicker="最近爱听"
                  kickerEn="NOW SPINNING"
                  accent={star.color}
                  onOpen={(r) => setPlayer({ source: { kind: "album", albumId: feat.id }, rect: r })}
                />
              </RevealSlot>
            )}
            <RevealSlot cp={clamp01((progress - 0.8) / 0.1)}>
              <HistoryCard
                accent={star.color}
                albums={historyAlbums}
                sessionStatus={session.status}
                playlists={playlists.data}
                playlistsState={playlists.state}
                playlistsMessage={playlists.message}
                onRetryPlaylists={playlists.retry}
                selectedId={selectedId}
                onSelectPlaylist={setSelectedId}
                selectedPlaylist={selectedPlaylist}
                tracks={tracks.data}
                tracksState={tracks.state}
                tracksMessage={tracks.message}
                onRetryTracks={tracks.retry}
                trackCount={tracks.songCount}
                truncated={tracks.truncated}
                onOpenAlbum={(id, r) => setPlayer({ source: { kind: "album", albumId: id }, rect: r })}
                onPlayTrack={(t, r) => {
                  if (!selectedPlaylist) return;
                  setPlayer({
                    source: {
                      kind: "playlist",
                      playlistId: selectedPlaylist.id,
                      name: selectedPlaylist.name,
                      cover: selectedPlaylist.cover,
                      trackCount: selectedPlaylist.trackCount,
                      startId: t.id,
                    },
                    rect: r,
                  });
                }}
              />
            </RevealSlot>
            {pin && (
              <RevealSlot cp={clamp01((progress - 0.88) / 0.1)}>
                <AlbumCard
                  album={pin}
                  kicker="声音玩具"
                  kickerEn="ARCHIVE PICK"
                  accent="#a8c9ff"
                  onOpen={(r) => setPlayer({ source: { kind: "album", albumId: pin.id }, rect: r })}
                />
              </RevealSlot>
            )}
          </div>

          {/* 右侧微型滚动指示条 */}
          <div className="pointer-events-none absolute right-4 top-1/2 z-30 hidden h-32 w-1 -translate-y-1/2 rounded-full bg-white/10 sm:block">
            <div
              className="w-full rounded-full bg-gradient-to-b from-[#8fb6ff] to-white transition-all duration-100"
              style={{ height: `${Math.max(8, progress * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* 播放器：全屏接管（Esc / 右上角返回退出并淡回专属曲） */}
      {player && <AlbumNowPlaying source={player.source} originRect={player.rect} onClose={closePlayer} />}
    </div>
  );
}

/** 终局卡的浮现槽位（沿用苹果发布页的错峰公式） */
function RevealSlot({ cp, children }: { cp: number; children: React.ReactNode }) {
  return (
    <div
      className={`min-w-[78vw] snap-center transition-all duration-300 lg:min-w-0 ${
        cp > 0.01 ? "pointer-events-auto" : "pointer-events-none"
      }`}
      style={{
        opacity: cp,
        transform: `translateY(${(1 - cp) * 28}px)`,
        visibility: cp > 0.01 ? "visible" : "hidden",
      }}
    >
      {children}
    </div>
  );
}

/** 专辑卡：封面缩略 + 曲名信息 + 统计，点进 SPlayer 播放器（宇宙玻璃语言） */
function AlbumCard({
  album,
  kicker,
  kickerEn,
  accent,
  onOpen,
}: {
  album: Album;
  kicker: string;
  kickerEn: string;
  accent: string;
  onOpen: (rect?: { x: number; y: number; width: number; height: number }) => void;
}) {
  const playable = album.tracks.filter((t) => t.file).length;
  const totalMin = Math.round(album.tracks.reduce((s, t) => s + (t.ms || 0), 0) / 60000);
  return (
    <button
      onClick={(e) => {
        const img = e.currentTarget.querySelector("img");
        onOpen(img?.getBoundingClientRect());
      }}
      className="group relative flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-white/12 bg-black/45 p-5 text-left shadow-2xl backdrop-blur-2xl transition-all duration-500 hover:border-white/30 hover:bg-white/[0.05] lg:h-[360px]"
    >
      <div
        className="pointer-events-none absolute -left-12 -top-12 h-32 w-32 rounded-full opacity-20 blur-2xl transition-opacity duration-500 group-hover:opacity-40"
        style={{ background: accent }}
      />
      <div className="relative flex gap-4">
        <span className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-lg shadow-[0_10px_28px_rgba(0,0,0,0.55)]">
          <img src={coverUrl(album)} alt={album.title} className="h-full w-full object-cover" loading="lazy" draggable={false} />
          {/* 封面底部的播放提示角标 */}
          <span className="absolute inset-x-0 bottom-0 translate-y-full bg-black/65 py-[3px] text-center text-[8px] font-light uppercase tracking-[0.22em] text-white/85 backdrop-blur-sm transition-transform duration-300 group-hover:translate-y-0">
            打开播放器
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-[9px] font-light uppercase tracking-[0.24em]" style={{ color: accent }}>
              {kickerEn}
            </span>
            <span className="font-mono text-[8px] tracking-[0.16em] text-white/25">{album.year}</span>
          </span>
          <span className="mt-1.5 block truncate text-lg font-light tracking-wide text-white/95">{album.title}</span>
          <span className="block truncate text-[10px] font-light text-white/40">
            {kicker} · {album.artist}
          </span>
        </span>
      </div>
      {album.intro && (
        <p className="relative mt-3 line-clamp-2 text-[11px] font-light leading-relaxed text-white/50">{album.intro}</p>
      )}
      <div className="relative mt-auto grid grid-cols-3 gap-2 border-t border-white/10 pt-3.5">
        <span>
          <span className="block text-[8px] font-light tracking-[0.18em] text-white/30">曲目</span>
          <span className="mt-0.5 block font-mono text-[10px] text-white/80">{album.tracks.length} TRACKS</span>
        </span>
        <span>
          <span className="block text-[8px] font-light tracking-[0.18em] text-white/30">时长</span>
          <span className="mt-0.5 block font-mono text-[10px] text-white/80">{totalMin > 0 ? `≈${totalMin} MIN` : "—"}</span>
        </span>
        <span>
          <span className="block text-[8px] font-light tracking-[0.18em] text-white/30">音频</span>
          <span className="mt-0.5 block font-mono text-[10px]" style={{ color: playable ? "#8fb6ff" : "rgba(255,255,255,0.35)" }}>
            {playable ? `${playable} 首可播` : "待导入"}
          </span>
        </span>
      </div>
    </button>
  );
}

/** 当前队列条目的稳定 key（歌曲 id + 序号），用于卡片高亮 */
function usePlayingKey(): string | null {
  return useSyncExternalStore(
    (cb) => music.subscribe(() => cb()),
    () => music.getState().track?.uid ?? null,
  );
}

interface HistoryCardProps {
  accent: string;
  albums: Album[];
  sessionStatus: Session["status"];
  playlists: NcmPlaylistBrief[];
  playlistsState: LoadState;
  playlistsMessage?: string;
  onRetryPlaylists: () => void;
  selectedId: number | null;
  onSelectPlaylist: (id: number) => void;
  selectedPlaylist: NcmPlaylistBrief | null;
  tracks: NcmPlaylistSong[];
  tracksState: LoadState;
  tracksMessage?: string;
  onRetryTracks: () => void;
  trackCount: number;
  truncated: boolean;
  onOpenAlbum: (id: string, rect?: Rect) => void;
  onPlayTrack: (t: NcmPlaylistSong, rect?: Rect) => void;
}

/**
 * 历史列表卡。
 * 未登录：归档墙（叠放缩略墙，悬停/聚焦扇形展开，点任意一张进播放器）。
 * 已登录：换成登录用户自己的网易云歌单——封面选择器 + 前 3 首，点歌直接进播放器。
 */
function HistoryCard({
  accent,
  albums,
  sessionStatus,
  playlists,
  playlistsState,
  playlistsMessage,
  onRetryPlaylists,
  selectedId,
  onSelectPlaylist,
  selectedPlaylist,
  tracks,
  tracksState,
  tracksMessage,
  onRetryTracks,
  trackCount,
  truncated,
  onOpenAlbum,
  onPlayTrack,
}: HistoryCardProps) {
  const [hover, setHover] = useState(false);
  const wallRef = useRef<HTMLDivElement>(null);
  const playingKey = usePlayingKey();
  const guest = sessionStatus === "guest";
  const shown = albums.slice(0, 5);
  const n = Math.max(1, shown.length);
  // 扇形按容器宽度排版，不再写死 64px——1/3 卡宽时第 5 张会被裁掉
  const step = n > 1 ? `(100% - 54px) / ${n - 1}` : "0px";

  return (
    <div className="group relative flex h-full min-h-[300px] w-full flex-col overflow-hidden rounded-2xl border border-white/12 bg-black/45 p-5 text-left shadow-2xl backdrop-blur-2xl transition-all duration-500 hover:border-white/30 hover:bg-white/[0.05] lg:h-[360px]">
      <div
        className="pointer-events-none absolute -left-12 -top-12 h-32 w-32 rounded-full opacity-20 blur-2xl transition-opacity duration-500 group-hover:opacity-40"
        style={{ background: accent }}
      />
      <div className="relative flex shrink-0 items-baseline justify-between gap-2">
        <span className="text-[9px] font-light uppercase tracking-[0.24em]" style={{ color: accent }}>
          {guest ? "HISTORY BIN" : "MY PLAYLISTS"}
        </span>
        {guest
          ? albums.length > 0 && (
              <span className="font-mono text-[9px] tracking-[0.16em] text-white/35">×{albums.length}</span>
            )
          : playlistsState === "ready" && (
              <span className="font-mono text-[9px] tracking-[0.16em] text-white/35">{playlists.length} 个歌单</span>
            )}
      </div>
      <span id="history-title" className="relative mt-1.5 block shrink-0 text-lg font-light tracking-wide text-white/95">
        {guest ? "历史列表" : "你的歌单"}
      </span>

      {guest ? (
        <>
          {shown.length === 0 ? (
            <p className="relative mt-3 text-[11px] font-light leading-relaxed text-white/40">
              暂时空着。每次换听新专辑，上一张会自动归档到这里。
            </p>
          ) : (
            <>
              <div
                ref={wallRef}
                onMouseEnter={() => setHover(true)}
                onMouseLeave={() => setHover(false)}
                onFocusCapture={() => setHover(true)}
                onBlurCapture={() =>
                  window.setTimeout(() => {
                    if (!wallRef.current?.contains(document.activeElement)) setHover(false);
                  }, 0)
                }
                className="relative mt-4 flex h-[54px] shrink-0 items-center"
              >
                {shown.map((a, i) => (
                  <button
                    key={a.id}
                    onClick={(e) => {
                      const img = e.currentTarget.querySelector("img");
                      onOpenAlbum(a.id, img?.getBoundingClientRect());
                    }}
                    title={`${a.title} · ${a.artist}`}
                    aria-label={`打开专辑：${a.title} · ${a.artist}`}
                    className="absolute h-[54px] w-[54px] cursor-pointer overflow-hidden rounded-md shadow-[0_8px_22px_rgba(0,0,0,0.55)] ring-1 ring-white/15 transition-all duration-500 focus-visible:z-50 focus-visible:ring-2 focus-visible:ring-white hover:z-50 hover:-translate-y-1.5"
                    style={{
                      left: `calc(${i} * ${hover ? step : `min(20px, ${step})`})`,
                      transform: `rotate(${hover ? 0 : (i - (n - 1) / 2) * 4}deg)`,
                      zIndex: i,
                    }}
                  >
                    <img src={coverUrl(a)} alt={a.title} className="h-full w-full object-cover" loading="lazy" draggable={false} />
                  </button>
                ))}
              </div>
              <p className="relative mt-3 text-[10px] font-light leading-relaxed text-white/35">
                最近归档：{shown[0].artist} — {shown[0].title}
              </p>
            </>
          )}
          <div className="relative mt-auto border-t border-white/10 pt-3.5">
            <span className="block text-[8px] font-light tracking-[0.18em] text-white/30">换听自动归档</span>
            <span className="mt-1 block font-mono text-[10px] text-white/60">npm run album -- "歌手 新专辑" --ncm</span>
          </div>
        </>
      ) : (
        <>
          {(playlistsState === "loading" || playlistsState === "idle") && <SkeletonRows />}
          {(playlistsState === "auth" || playlistsState === "error") && (
            <CardMessage text={playlistsMessage} onRetry={onRetryPlaylists} />
          )}
          {playlistsState === "empty" && (
            <CardMessage text="你还没有歌单。在网易云里创建或收藏歌单后，会出现在这里。" />
          )}
          {playlistsState === "ready" && (
            <>
              {/* 封面选择器：触屏也能点（44px），超出可横向滚动 */}
              <div
                role="tablist"
                aria-label="选择歌单"
                className="relative mt-3 flex shrink-0 gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {playlists.slice(0, 12).map((p) => {
                  const active = p.id === selectedId;
                  return (
                    <button
                      key={p.id}
                      role="tab"
                      aria-selected={active}
                      aria-label={`歌单：${p.name}`}
                      title={p.name}
                      onClick={() => onSelectPlaylist(p.id)}
                      className={`relative h-11 w-11 shrink-0 cursor-pointer overflow-hidden rounded-md transition-all duration-300 focus-visible:ring-2 focus-visible:ring-white ${
                        active ? "opacity-100" : "opacity-60 hover:opacity-90"
                      }`}
                      style={{ boxShadow: active ? `0 0 0 2px ${accent}` : "0 0 0 1px rgba(255,255,255,0.15)" }}
                    >
                      {p.cover ? (
                        <img src={p.cover} alt="" className="h-full w-full object-cover" loading="lazy" draggable={false} />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center bg-white/[0.08] text-[10px] text-white/60">
                          {p.name.slice(0, 2)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="relative mt-1.5 flex shrink-0 items-baseline justify-between gap-2">
                <span className="truncate text-[10px] font-light text-white/45">
                  {selectedPlaylist?.name ?? "选择歌单"}
                </span>
                <span className="shrink-0 font-mono text-[9px] text-white/30">
                  {(selectedPlaylist?.trackCount || trackCount) > 0
                    ? `${selectedPlaylist?.trackCount || trackCount} 首`
                    : ""}
                  {truncated ? " · 已载入前 1000" : ""}
                </span>
              </div>

              {tracksState === "loading" && <SkeletonRows />}
              {(tracksState === "auth" || tracksState === "error") && (
                <CardMessage text={tracksMessage} onRetry={onRetryTracks} />
              )}
              {tracksState === "empty" && <CardMessage text="这个歌单还没有歌曲。" />}
              {tracksState === "ready" && (
                <ol className="relative mt-1 min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {tracks.slice(0, 3).map((t, i) => {
                    const key = `${t.id}:${i}`;
                    const isCur = playingKey === key;
                    return (
                      <li key={key}>
                        <button
                          onClick={(e) => onPlayTrack(t, e.currentTarget.getBoundingClientRect())}
                          aria-current={isCur ? "true" : undefined}
                          className={`flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-md px-1 text-left transition-colors duration-200 hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-white/70 ${
                            isCur ? "text-white" : "text-white/70"
                          }`}
                        >
                          <span className="min-w-0 flex-1 truncate text-[12px] font-light">{t.name}</span>
                          <span className="max-w-[40%] shrink-0 truncate text-[10px] font-light text-white/35">
                            {t.artists.map((a) => a.name).join(" / ")}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </>
          )}
          <div className="relative mt-auto border-t border-white/10 pt-3">
            <span className="block text-[8px] font-light tracking-[0.18em] text-white/30">来自你的网易云歌单</span>
            <span className="mt-1 block truncate text-[10px] text-white/55">
              {selectedPlaylist ? `${selectedPlaylist.name} · 点封面切换` : "点封面切换"}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function SkeletonRows({ n = 3 }: { n?: number }) {
  return (
    <div className="relative mt-3 space-y-2" aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="h-9 animate-pulse rounded-md bg-white/[0.05]" />
      ))}
    </div>
  );
}

function CardMessage({ text, onRetry }: { text?: string; onRetry?: () => void }) {
  return (
    <div className="relative mt-4 flex flex-1 flex-col items-start justify-center gap-3">
      <p className="text-[11px] font-light leading-relaxed text-white/40">{text ?? "歌单加载失败"}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="cursor-pointer rounded-full border border-white/15 bg-white/[0.06] px-4 py-1 text-[10px] font-light tracking-[0.18em] text-white/70 transition-colors hover:bg-white/[0.12] hover:text-white"
        >
          重试
        </button>
      )}
    </div>
  );
}
