import type { ReactNode } from "react";
import type { StarDef } from "../data/site";
import SectionContent from "./SectionContent";

interface Props {
  star: StarDef;
  onBack: () => void;
  /** 有专属内容层时替换默认的占位卡片 */
  content?: ReactNode;
}

/** 静态背景：两团星色辉光 + 点阵余韵。WebGL 不可用时也由它兜底。 */
export function SectionBackdrop({ star }: { star: StarDef }) {
  return (
    <>
      {/* 该板块自己的光 */}
      <div
        className="anim-fade-in pointer-events-none absolute -left-[20vw] -top-[30vh] h-[90vh] w-[90vh] rounded-full opacity-40 blur-[10px]"
        style={{
          background: `radial-gradient(circle, ${star.color}22 0%, transparent 65%)`,
        }}
      />
      <div
        className="anim-fade-in pointer-events-none absolute -bottom-[30vh] -right-[15vw] h-[80vh] w-[80vh] rounded-full opacity-30"
        style={{
          background: `radial-gradient(circle, ${star.color}18 0%, transparent 70%)`,
        }}
      />
      {/* 点阵余韵 */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.14]"
        style={{
          backgroundImage: `radial-gradient(${star.color}55 1px, transparent 1px)`,
          backgroundSize: "26px 26px",
        }}
      />
    </>
  );
}

/** 通用 / 兜底板块页：纯 CSS 背景。WebGL 场景不支持时也走这里 */
export default function SectionPage({ star, onBack, content }: Props) {
  return (
    <div
      className="fixed inset-0 overflow-hidden"
      style={{ background: star.pageBg }}
      key={star.id}
    >
      <SectionBackdrop star={star} />
      {content ?? <SectionContent star={star} onBack={onBack} />}
    </div>
  );
}
