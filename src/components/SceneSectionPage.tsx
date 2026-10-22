import { useEffect, useRef, useState, type ReactNode } from "react";
import type { StarDef } from "../data/site";
import { createSectionScene, type SectionScene } from "../universe/sections";
import { withAlpha } from "../utils/color";
import SectionContent from "./SectionContent";
import SectionPage from "./SectionPage";

interface Props {
  star: StarDef;
  onBack: () => void;
  /** 板块自己的内容层；不传时用公共的占位卡片 */
  content?: ReactNode;
}

/** 每页的可读性遮罩：左侧 / 底部线性压暗（0..1），外加可选的中央椭圆暗池（给居中排版的页用） */
interface Scrim {
  left: number;
  mid: number;
  bottom?: number;
  /** 内容居中时，在文字背后补一团柔和的暗，避免正文压在脉冲星光束上 */
  focus?: { x: number; y: number; rx: number; ry: number; alpha: number };
}

const SCRIM: Record<string, Scrim> = {
  sun: { left: 0.72, mid: 0.46, bottom: 0.55 },
  "neutron-star": {
    left: 0.58,
    mid: 0.34,
    focus: { x: 0.5, y: 0.44, rx: 0.3, ry: 0.46, alpha: 0.42 },
  },
  binary: { left: 0.70, mid: 0.44, bottom: 0.50 },
};

/** DEV 用 ?fallback=1 强制走静态页，验证 WebGL 不可用时的回退 */
const FORCE_FALLBACK =
  import.meta.env.DEV &&
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).has("fallback");

/**
 * 实时 WebGL 背景的板块页：画布在最底层，z-10 是可读性遮罩，z-20 是文字层
 * （默认公共内容，也可由板块注入专属内容）。场景不支持 WebGL2 时回退到 SectionPage。
 */
export default function SceneSectionPage({ star, onBack, content }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<SectionScene | null>(null);
  const [unsupported, setUnsupported] = useState(FORCE_FALLBACK);

  useEffect(() => {
    if (FORCE_FALLBACK) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scene = createSectionScene(star.id, canvas);
    if (!scene) {
      setUnsupported(true);
      return;
    }
    sceneRef.current = scene;

    if (import.meta.env.DEV) {
      (window as unknown as { __sectionScene?: SectionScene }).__sectionScene = scene;
    }

    if (!scene.supported) {
      setUnsupported(true);
      scene.destroy();
      sceneRef.current = null;
      return;
    }

    /** 无头 / 后台标签页里 rAF 不跑，先手动出一帧完整构图 */
    if (document.hidden) scene.debugDraw?.(3);

    return () => {
      scene.destroy();
      sceneRef.current = null;
      if (import.meta.env.DEV) {
        delete (window as unknown as { __sectionScene?: SectionScene }).__sectionScene;
      }
    };
  }, [star.id]);

  if (unsupported) return <SectionPage star={star} onBack={onBack} content={content} />;

  const scrim = SCRIM[star.id] ?? { left: 0.62, mid: 0.38 };

  return (
    <div
      className="fixed inset-0 select-none overflow-hidden"
      style={{ background: star.pageBg }}
      key={star.id}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
      />

      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background: `linear-gradient(90deg, ${withAlpha(star.pageBg, scrim.left)} 0%, ${withAlpha(
            star.pageBg,
            scrim.mid
          )} 36%, transparent 74%)`,
        }}
      />
      {scrim.bottom !== undefined && (
        <div
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            background: `linear-gradient(0deg, ${withAlpha(star.pageBg, scrim.bottom)} 0%, transparent 56%)`,
          }}
        />
      )}
      {scrim.focus && (
        <div
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            background: `radial-gradient(ellipse ${scrim.focus.rx * 100}% ${scrim.focus.ry * 100}% at ${
              scrim.focus.x * 100
            }% ${scrim.focus.y * 100}%, ${withAlpha(star.pageBg, scrim.focus.alpha)} 0%, ${withAlpha(
              star.pageBg,
              scrim.focus.alpha * 0.45
            )} 52%, transparent 100%)`,
          }}
        />
      )}

      {content ?? <SectionContent star={star} onBack={onBack} veiled />}
    </div>
  );
}
