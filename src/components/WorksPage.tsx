import { useEffect, useRef, useState } from "react";
import { RedGiantScene } from "../universe/redgiant";
import { createSectionScene, type SectionScene } from "../universe/sections";
import { site, type StarDef } from "../data/site";
import { assetURL } from "../utils/assetURL";
import { lifeWorks, works, type WorkItem } from "../data/works";

interface Props {
  star: StarDef;
  onBack: () => void;
}

/* ---------- 可调常数（沿用作品页的 iOS 手感与堆叠露边比例） ---------- */
const G = {
  /** 卡片切换时长 ms */
  cardDur: 750,
  /** 切换缓动（Apple 面板曲线，对应 iOS 默认 spring 的近似） */
  cardEase: "cubic-bezier(0.32, 0.72, 0, 1)",
  /** 下层两张卡各露出的水平边距（相对卡宽） */
  peekX: 0.085,
  /** 下层卡下沉的垂直偏移（相对卡高） */
  peekY: 0.14,
  /** 上层 / 下层卡缩放 */
  topScale: 1.0,
  backScale: 0.965,
  /** 切换防抖阈值 ms */
  swipeLockMs: 750,
};

/** 入场总时长：着色器与内容淡入共用同一常数，确保同步 */
const G_CARD_ENTRANCE = 1800;

/** DEV 用 ?fallback=1 强制走纯 CSS 背景，验证 WebGL 不可用时的作品页 */
const FORCE_FALLBACK =
  import.meta.env.DEV &&
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).has("fallback");

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function easeOutQuint(t: number) {
  return 1 - Math.pow(1 - t, 5);
}

/** 给 #rrggbb 追加透明度，生成 8 位 hex。 */
function withAlpha(hex: string, alpha: number) {
  const a = Math.round(clamp01(alpha) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}

/* ===================== 主页面 ===================== */

export default function WorksPage({ star, onBack }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [unsupported, setUnsupported] = useState(FORCE_FALLBACK);
  /** 入场完成度 0→1（由远及近），驱动内容淡入 */
  const [p, setP] = useState(0);

  /* ---------- 背景场景 + 入场驱动：红巨星入口用红巨星，双星入口用双星 ---------- */
  useEffect(() => {
    if (FORCE_FALLBACK) {
      setP(1);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;

    /** DOM 内容淡入：与场景入场共用 1.8s */
    const runEntrance = () => {
      let raf = 0;
      const start = performance.now();
      const tick = (now: number) => {
        const e = easeOutQuint(clamp01((now - start) / G_CARD_ENTRANCE));
        setP(e);
        if (e < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    };

    /* 双星入口 = 「生活」，背景换成它自己的双星场景；卡片列表也换成 lifeWorks */
    if (star.id === "binary") {
      let made: SectionScene | null = null;
      try {
        made = createSectionScene("binary", canvas);
      } catch {
        made = null;
      }
      if (!made || !made.supported) {
        made?.destroy();
        setUnsupported(true);
        setP(1);
        return;
      }
      const scene = made;
      if (import.meta.env.DEV) {
        (window as unknown as { __sectionScene?: SectionScene }).__sectionScene = scene;
      }
      const cleanupScene = () => {
        scene.destroy();
        if (import.meta.env.DEV) {
          delete (window as unknown as { __sectionScene?: SectionScene }).__sectionScene;
        }
      };
      /* 页面处于隐藏态时场景循环不跑帧：手动出一张完整构图的静帧 */
      if (document.hidden) {
        setP(1);
        scene.debugDraw?.(3);
        return cleanupScene;
      }
      const stopEntrance = runEntrance();
      return () => {
        stopEntrance();
        cleanupScene();
      };
    }

    let scene: RedGiantScene;
    try {
      scene = new RedGiantScene(canvas);
    } catch {
      setUnsupported(true);
      setP(1);
      return;
    }
    if (import.meta.env.DEV) {
      (window as unknown as { __rgScene?: RedGiantScene }).__rgScene = scene;
    }

    if (!scene.supported) {
      scene.destroy();
      setUnsupported(true);
      setP(1);
      return;
    }

    scene.startEntrance();
    const cleanupScene = () => {
      scene.destroy();
      if (import.meta.env.DEV) {
        delete (window as unknown as { __rgScene?: RedGiantScene }).__rgScene;
      }
    };
    /* 若直接以 ?dev= 进入且页面处于隐藏态，入场循环无法跑帧：把 DOM 遮罩与着色器定格到入场完成态，
       保证截图能看到成品构图。正常运行（可见态）不走这里，动画照常播放。 */
    if (document.hidden) {
      setP(1);
      scene.debugDraw(1, 2.5, 0.9, 1);
      return cleanupScene;
    }

    const stopEntrance = runEntrance();
    return () => {
      stopEntrance();
      cleanupScene();
    };
  }, [star.id]);

  const chromeOpacity = clamp01((p - 0.3) / 0.7);
  const interactive = chromeOpacity > 0.85;
  /* 双星入口（生活）用自己的那份卡片列表，红巨星入口（作品）用「作品」那 7 张 */
  const items = star.id === "binary" ? lifeWorks : works;

  return (
    <div
      className="fixed inset-0 select-none overflow-hidden text-white"
      style={{ background: star.pageBg }}
    >
      {!unsupported && (
        <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full" />
      )}
      {unsupported && <FallbackBackdrop color={star.color} />}

      {/* 移动端可读性遮罩：作品页在窄屏上会横跨整幅画面；中下部是卡片与右侧文案，暗场压得更重 */}
      <div className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.62)_0%,rgba(0,0,0,0.16)_24%,rgba(0,0,0,0.10)_40%,rgba(0,0,0,0.42)_64%,rgba(0,0,0,0.82)_100%)] xl:hidden" />
      {/* 桌面端左下标题压在红巨星最亮的弧光上，压一层无边界径向暗场保证「Selected Works / 作品 / 一句话」可读 */}
      <div
        className="pointer-events-none absolute inset-0 z-10 hidden xl:block"
        style={{
          background:
            "radial-gradient(44% 50% at 8% 90%, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.36) 38%, rgba(0,0,0,0.08) 64%, transparent 80%)",
        }}
      />

      {/* 顶栏 */}
      <header
        className="absolute left-[5vw] right-[5vw] top-6 z-30 flex items-center justify-between gap-3 sm:top-8"
        style={{ opacity: chromeOpacity, pointerEvents: interactive ? "auto" : "none" }}
      >
        <GlassPill className="min-w-0 px-4 py-2" accent={star.color}>
          <span className="hidden text-[11px] font-light uppercase tracking-[0.42em] text-white/60 sm:inline">
            {site.nameLatin}
          </span>
          <span className="mx-3 hidden h-3 w-px bg-white/20 sm:inline-block" />
          <span
            className="truncate text-[10px] font-light uppercase tracking-[0.32em]"
            style={{ color: star.color }}
          >
            {star.sectionEn}
            <span className="hidden sm:inline"> · {star.nameEn}</span>
          </span>
        </GlassPill>

        <GlassButton onClick={onBack} className="px-3 py-2 sm:px-4" accent={star.color}>
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: star.color }}
          />
          <span className="ml-2 text-[10px] font-light tracking-[0.24em] text-white/70 sm:ml-3 sm:text-[11px]">
            <span className="hidden sm:inline">返回宇宙</span>
            <span className="sm:hidden">返回</span>
          </span>
        </GlassButton>
      </header>

      <div
        className="absolute inset-0 z-20"
        style={{ opacity: chromeOpacity, pointerEvents: interactive ? "auto" : "none" }}
      >
        {/* 桌面端左侧标题（沉在红巨星弧光之下） */}
        <div className="pointer-events-none absolute bottom-[9vh] left-[5vw] hidden max-w-[30vw] xl:block">
          <TitleBlock star={star} />
        </div>

        <WorksStage items={items} star={star} />
      </div>
    </div>
  );
}

/* ===================== 标题块 ===================== */

function TitleBlock({ star }: { star: StarDef }) {
  return (
    <>
      <p
        className="text-[10px] font-light uppercase tracking-[0.44em]"
        style={{ color: star.color }}
      >
        Selected Works
      </p>
      <h1 className="mt-2 text-[42px] font-thin leading-[1.05] tracking-[-0.02em] text-white/95 sm:text-[64px]">
        {star.section}
      </h1>
      <p className="mt-3 text-[11px] font-light leading-relaxed text-white/40">{star.tagline}</p>
    </>
  );
}

/* ===================== 翻卡主体 ===================== */

/**
 * 作品页就是眼前这一叠卡：没有封面层，进来直接翻。
 * 版式照原来那版影像页还原（卡片 min(46vh,400px)、故事 mt-6、附注 mt-4、页码 mt-8），
 * 差别只在于每张卡可以带自己的站外链接——链接行始终占位，免得翻到没链接的卡时下面整排跳动。
 */
function WorksStage({ items, star }: { items: WorkItem[]; star: StarDef }) {
  /* items 是模块级常量：真被清空了就整块不挂载——mod() 会变成除以 0（NaN），
     cur 取到 undefined 时渲染直接抛错，整棵 React 树会卸载成一块没有返回入口的黑屏。
     两份列表现在都非空（作品 7 / 生活 13），这条守卫只在有人把数组改空时兜底。 */
  if (!items.length) return null;
  return <WorksDeck items={items} star={star} />;
}

function WorksDeck({ items, star }: { items: WorkItem[]; star: StarDef }) {
  const total = items.length;
  const mod = (n: number) => ((n % total) + total) % total;

  const [topIdx, setTopIdx] = useState(0);
  const busyUntil = useRef(0);
  const cur = items[mod(topIdx)];

  const go = (dir: 1 | -1) => {
    const now = performance.now();
    if (now < busyUntil.current || total < 2) return;
    busyUntil.current = now + G.swipeLockMs;
    setTopIdx((i) => mod(i + dir));
  };

  /* ---------- 键盘左右键 ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  return (
    <main className="absolute inset-y-0 right-[5vw] left-[5vw] flex flex-col items-center gap-4 overflow-x-hidden overflow-y-auto overscroll-contain pb-36 pt-16 [scrollbar-width:none] sm:gap-6 xl:left-[32vw] xl:flex-row xl:justify-center xl:overflow-visible xl:pb-0 xl:pt-0 [&::-webkit-scrollbar]:hidden">
      <StackStage items={items} topIdx={topIdx} mod={mod} go={go} accent={star.color} />

      <div className="flex w-full min-w-0 max-w-[420px] flex-col items-start text-left xl:max-w-[400px]">
        <p className="font-mono text-[11px] tracking-[0.3em] text-white/30">
          {String(mod(topIdx) + 1).padStart(2, "0")}{" "}
          <span className="text-white/15">/ {String(total).padStart(2, "0")}</span>
        </p>
        <h2
          key={`title-${topIdx}`}
          className="anim-fade-up mt-2 text-[34px] font-thin leading-[1.05] tracking-[-0.02em] text-white/95 sm:text-[46px]"
        >
          {cur.title}
        </h2>
        <p
          key={`titleEn-${topIdx}`}
          className="anim-fade-up delay-1 mt-1 text-[10px] font-light uppercase tracking-[0.34em]"
          style={{ color: star.color }}
        >
          {cur.titleEn}
        </p>
        <p
          key={`story-${topIdx}`}
          className="anim-fade-up delay-2 mt-4 max-w-[24rem] text-[14px] font-light leading-relaxed text-white/55 sm:mt-5 xl:mt-6"
        >
          {cur.story}
        </p>
        <p
          key={`meta-${topIdx}`}
          className="anim-fade-up delay-3 mt-3 font-mono text-[10px] leading-relaxed tracking-[0.04em] text-white/25 xl:mt-4"
        >
          {cur.date && <span>{cur.date} · </span>}
          {cur.meta}
        </p>

        {/* 链接行一直占着高度，卡片带不带链接都不影响下面页码的位置 */}
        <div className="mt-4 flex min-h-9 items-center sm:mt-5">
          {cur.href && (
            <a
              key={`link-${topIdx}`}
              href={cur.href}
              target="_blank"
              rel="noopener noreferrer"
              className="anim-fade-up delay-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-[10px] font-light tracking-[0.24em] transition-all duration-300 hover:brightness-125"
              style={{ ...glassStyle(star.color), color: star.color }}
            >
              {cur.hrefLabel ?? "打开链接"}
              <span aria-hidden="true" className="text-[12px]">↗</span>
            </a>
          )}
        </div>

        {/* 页码：卡片很多时收细，几十张也不会挤成一团 */}
        <div className="mt-4 flex w-full flex-wrap items-center justify-start gap-1.5 sm:mt-6 xl:mt-8">
          {items.map((it, i) => (
            <span
              key={it.id}
              className="h-1 rounded-full transition-[width,background-color] duration-500"
              style={{
                width: i === mod(topIdx) ? (total > 16 ? 12 : 18) : total > 16 ? 3 : 6,
                background: i === mod(topIdx) ? star.color : "rgba(255,255,255,0.18)",
              }}
            />
          ))}
        </div>
        <p className="mt-2 text-[10px] font-light tracking-[0.28em] text-white/20 sm:mt-3">
          <span className="hidden sm:inline">← → 切换 · 也可以直接拖动卡片</span>
          <span className="sm:hidden">左右滑动</span>
        </p>
      </div>
    </main>
  );
}

/* ===================== 卡片堆叠舞台 ===================== */

function StackStage({
  items,
  topIdx,
  mod,
  go,
  accent,
}: {
  items: WorkItem[];
  topIdx: number;
  mod: (n: number) => number;
  go: (dir: 1 | -1) => void;
  accent: string;
}) {
  /* 只认「发起翻卡的那根指针」：拖动起点记的是 pointerId + 起点坐标，
     否则第二根手指或鼠标右键一按下就会顶替起点，最后由「最先抬起的那根手指」决定翻哪边。
     翻卡还要求横向位移确实是主导方向——卡片是 touchAction:pan-y，纵向为主的滑动该留给页面滚动 */
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  /** 卡片少于 5 张时收缩槽位，避免 mod 回绕后重复取到同一张卡（React key 冲突） */
  const dirs =
    items.length >= 5
      ? [-2, -1, 0, 1, 2]
      : items.length >= 3
        ? [-1, 0, 1]
        : items.length === 2
          ? [-1, 0]
          : [0];

  const onPointerDown = (e: React.PointerEvent) => {
    if (!e.isPrimary || e.button !== 0) return;
    if (drag.current) return;
    if ((e.target as HTMLElement).closest("button")) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
  };
  const onPointerCancel = (e: React.PointerEvent) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  };

  return (
    <div className="relative shrink-0 px-3 py-4 sm:px-12 sm:py-8 xl:py-14">
      <div
        /* 桌面端卡片尺寸沿用原版影像页：min(46vh,400px)，比卡包那版大一圈 */
        className="relative mx-auto aspect-[3/4] w-[min(58vw,260px)] sm:w-[min(52vw,300px)] md:w-[min(40vh,360px)] xl:w-[min(46vh,400px)]"
        style={{ touchAction: "pan-y" }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {/* 5 个持久节点，靠 delta 决定槽位；delta=±2 的进出位无动画 */}
        {dirs.map((d) => {
          const it = items[mod(topIdx + d)];
          const st = cardTransform(d);
          return (
            <div
              key={it.id}
              className="absolute inset-0 origin-center"
              style={{
                transform: st.transform,
                opacity: st.opacity,
                willChange: "transform",
                zIndex: d === 0 ? 30 : d === 1 || d === -1 ? 20 : 10,
                transition:
                  Math.abs(d) >= 2
                    ? "none"
                    : `transform ${G.cardDur}ms ${G.cardEase}, opacity ${G.cardDur * 0.7}ms ease`,
                filter: d === 0 ? "none" : "saturate(0.72) brightness(0.82)",
                pointerEvents: d === 0 ? "auto" : "none",
              }}
            >
              <CardFace item={it} top={d === 0} accent={accent} />
            </div>
          );
        })}

        <GlassArrow side="left" onClick={() => go(-1)} />
        <GlassArrow side="right" onClick={() => go(1)} />
      </div>
    </div>
  );
}

/** delta → 槽位 transform */
function cardTransform(d: number): { transform: string; opacity: number } {
  if (d === 0) {
    return {
      transform: `translate(0px, 0px) scale(${G.topScale})`,
      opacity: 1,
    };
  }
  const dx = (d < 0 ? -1 : 1) * G.peekX * 100;
  const dy = G.peekY * 100;
  if (Math.abs(d) === 1) {
    return {
      transform: `translate(${dx}%, ${dy}%) scale(${G.backScale}) rotate(${d < 0 ? -3 : 3}deg)`,
      opacity: 1,
    };
  }
  /* 侧幕外进出位（d=±2）：肉眼不可见，仅给新卡一个无动画的落位 */
  const outX = G.peekX * 100 + (d > 0 ? 40 : -40);
  return {
    transform: `translate(${outX}%, ${dy}%) scale(${G.backScale * 0.96}) rotate(${d < 0 ? -3 : 3}deg)`,
    opacity: 0,
  };
}

/* ===================== 单张卡片 ===================== */

function CardFace({ item, top, accent }: { item: WorkItem; top: boolean; accent: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [ready, setReady] = useState(false);

  /** 视频卡：仅作为上层可见时播放，滑走暂停 */
  useEffect(() => {
    if (item.kind !== "video") return;
    const el = videoRef.current;
    if (!el) return;
    if (top) void el.play().catch(() => {});
    else el.pause();
  }, [top, item.kind, item.src]);

  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-[26px]"
      style={{
        background: `linear-gradient(150deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04) 45%, ${withAlpha(accent, 0.08)})`,
        backdropFilter: "var(--lg-filter, blur(12px)) saturate(1.3) brightness(1.04)",
        WebkitBackdropFilter: "var(--lg-filter, blur(12px)) saturate(1.3) brightness(1.04)",
        border: "1px solid rgba(255,255,255,0.14)",
        boxShadow: top
          ? "0 30px 80px rgba(2,4,10,0.55), inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -1px 0 rgba(255,255,255,0.07)"
          : "0 18px 50px rgba(2,4,10,0.4), inset 0 1px 0 rgba(255,255,255,0.14)",
        padding: top ? 9 : 7,
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-[26px] opacity-25"
        style={{
          background: `radial-gradient(120px 80px at 18% 8%, rgba(255,255,255,0.22), transparent 60%), radial-gradient(160px 120px at 86% 96%, ${withAlpha(accent, 0.18)}, transparent 72%)`,
        }}
      />
      <div className="relative h-full w-full overflow-hidden rounded-[18px] bg-white/[0.04]">
        {item.kind === "video" ? (
          <video
            ref={videoRef}
            src={assetURL(item.src)}
            poster={item.poster ? assetURL(item.poster) : undefined}
            className="h-full w-full object-cover"
            muted
            loop
            playsInline
            preload={top ? "auto" : "metadata"}
            draggable={false}
            aria-label={`${item.title} · ${item.titleEn}`}
            onContextMenu={(e) => e.preventDefault()}
          />
        ) : (
          <img
            src={assetURL(item.src)}
            alt={`${item.title} · ${item.titleEn}`}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-opacity duration-700"
            draggable={false}
            onContextMenu={(e) => e.preventDefault()}
            onLoad={() => setReady(true)}
            onError={() => setReady(true)}
            style={{ opacity: ready ? 1 : 0 }}
          />
        )}

        {item.kind === "video" && (
          <span className="pointer-events-none absolute bottom-3 right-3 rounded-full border border-white/15 bg-black/40 px-2 py-1 text-[8px] font-light tracking-[0.2em] text-white/70 backdrop-blur-sm">
            静音
          </span>
        )}

        <div className="pointer-events-none absolute inset-0 rounded-[18px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]" />
      </div>
    </div>
  );
}

/* ===================== 纯 CSS 兜底背景 ===================== */

function FallbackBackdrop({ color }: { color: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div
        className="absolute -left-[30vw] top-1/2 h-[130vh] w-[130vh] -translate-y-1/2 rounded-full opacity-60 blur-2xl"
        style={{
          background: `radial-gradient(circle at 62% 50%, ${withAlpha(color, 0.32)} 0%, ${withAlpha(
            color,
            0.1
          )} 42%, transparent 70%)`,
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.1]"
        style={{
          backgroundImage: `radial-gradient(${withAlpha(color, 0.45)} 1px, transparent 1px)`,
          backgroundSize: "26px 26px",
        }}
      />
    </div>
  );
}

/* ===================== 液态玻璃控件 ===================== */

function glassStyle(accent = "#ffffff"): React.CSSProperties {
  return {
    background: `linear-gradient(160deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03) 45%, ${withAlpha(
      accent,
      0.06
    )})`,
    backdropFilter: "var(--lg-filter, blur(16px)) saturate(1.35) brightness(1.05)",
    WebkitBackdropFilter: "var(--lg-filter, blur(16px)) saturate(1.35) brightness(1.05)",
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -1px 0 rgba(255,255,255,0.06), 0 8px 32px rgba(2,4,12,0.35)",
    border: "1px solid rgba(255,255,255,0.14)",
  };
}

function GlassPill({
  children,
  className = "",
  accent,
}: {
  children: React.ReactNode;
  className?: string;
  accent?: string;
}) {
  return (
    <span className={`flex items-center rounded-full ${className}`} style={glassStyle(accent)}>
      {children}
    </span>
  );
}

function GlassButton({
  children,
  onClick,
  className = "",
  accent,
  ariaLabel,
}: {
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
  accent?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`cursor-pointer rounded-full transition-all duration-300 hover:brightness-125 active:scale-95 ${className}`}
      style={glassStyle(accent)}
    >
      <span className="flex items-center">{children}</span>
    </button>
  );
}

function GlassArrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={side === "left" ? "上一张" : "下一张"}
      onClick={onClick}
      className="absolute top-1/2 z-40 hidden h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full transition-all duration-300 hover:brightness-125 active:scale-95 sm:flex"
      style={{
        ...glassStyle(),
        left: side === "left" ? "-50px" : undefined,
        right: side === "right" ? "-50px" : undefined,
      }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="rgba(255,255,255,0.85)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {side === "left" ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 6l6 6-6 6" />}
      </svg>
    </button>
  );
}
