import { useCallback, useRef, useState } from "react";
import CosmosView from "./components/CosmosView";
import SectionPage from "./components/SectionPage";
import SceneSectionPage from "./components/SceneSectionPage";
import BlueGiantPage from "./components/BlueGiantPage";
import WorksPage from "./components/WorksPage";
import WritingContent from "./components/WritingContent";
import AboutContent from "./components/AboutContent";
import MusicCapsule from "./components/MusicCapsule";
import { music } from "./audio/music";
import type { Cosmos, CaptureInfo } from "./universe/engine";
import { hasSectionScene } from "./universe/sections";
import { stars, type StarDef } from "./data/site";

type Enter = { mode: "intro" | "return"; color: string };

/** 仅 DEV：URL 加 ?dev=<恒星id> 直达对应板块页（用于后台 rAF 冻结环境下的截图验证，生产构建不含此路径） */
const devSection: StarDef | null =
  import.meta.env.DEV && typeof window !== "undefined"
    ? (stars.find((s) => s.id === new URLSearchParams(window.location.search).get("dev")) ?? null)
    : null;

export default function App() {
  const engineRef = useRef<Cosmos | null>(null);
  const [view, setView] = useState<"cosmos" | "section">(devSection ? "section" : "cosmos");
  const [enter, setEnter] = useState<Enter>({ mode: "intro", color: "#05060c" });
  const [section, setSection] = useState<StarDef | null>(devSection);
  /** 每次回到宇宙都重建一次引擎，保证入场动画从干净状态开始 */
  const [epoch, setEpoch] = useState(0);

  const swallowDone = useCallback((def: StarDef) => {
    setSection(def);
    setView("section");
    /** 进入「音乐」板块 → 切换板块专属曲；其余板块保持 ambient */
    music.switchMode(def.id === "blue-giant" ? "dedicated" : "ambient");
  }, []);

  /** 板块页 → 宇宙：反向吞噬（色膜从中心被撑开，点阵涟漪回来） */
  const backToCosmos = useCallback(() => {
    music.switchMode("ambient");
    setEnter({ mode: "return", color: section?.pageBg ?? "#05060c" });
    setView("cosmos");
    setEpoch((e) => e + 1);
  }, [section]);

  const noop = useCallback((_info: CaptureInfo | null) => {}, []);

  const onBlueGiant = view === "section" && section?.id === "blue-giant";
  /** 「作品」由红巨星承载；双星系统是同一张翻卡页的「生活」入口，读的是它自己那份列表 */
  const onWorks =
    view === "section" && (section?.id === "red-giant" || section?.id === "binary");
  /** 「文字」由黄矮星承载，内容层换成文档卡片 */
  const onWriting = view === "section" && section?.id === "sun";
  /** 「联系」由中子星承载，内容层是联系我 / 关于我 */
  const onAbout = view === "section" && section?.id === "neutron-star";
  const onSceneSection =
    view === "section" && !!section && !onWorks && hasSectionScene(section.id);
  /** 底下每帧都有 WebGL 画布的页面：胶囊改用纯 blur，避免 backdrop 重采样拖帧 */
  const onWebglSection = onWorks || onSceneSection;
  /** 内容层自带底部留白的页面：胶囊贴着底部放 */
  const onTightContent = onWriting || onAbout;

  return (
    <>
      {view === "section" && section ? (
        /** 蓝巨星走黑洞电影页，红巨星（作品）/ 双星（生活）共用翻卡页，黄矮星（文档）/中子星（联系）走各自的场景页 */
        onBlueGiant ? (
          <BlueGiantPage star={section} onBack={backToCosmos} />
        ) : onWorks ? (
          <WorksPage star={section} onBack={backToCosmos} />
        ) : onSceneSection ? (
          <SceneSectionPage
            star={section}
            onBack={backToCosmos}
            content={
              onWriting ? (
                <WritingContent star={section} onBack={backToCosmos} />
              ) : onAbout ? (
                <AboutContent star={section} onBack={backToCosmos} />
              ) : undefined
            }
          />
        ) : (
          <SectionPage star={section} onBack={backToCosmos} />
        )
      ) : (
        <CosmosView
          key={epoch}
          engineRef={engineRef}
          enterMode={enter.mode}
          enterColor={enter.color}
          onCapture={noop}
          onSwallowStart={() => {}}
          onSwallowDone={swallowDone}
        />
      )}
      {/* 胶囊常驻；蓝巨星页底部有卡片行，挪到顶部居中；作品页底下每帧有 WebGL 画布，玻璃降级为纯 blur 保帧率 */}
      <MusicCapsule
        position={onBlueGiant ? "top" : onTightContent ? "bottom-tight" : "bottom"}
        glass={onWebglSection ? "plain" : "liquid"}
        engineRef={engineRef}
      />
    </>
  );
}
