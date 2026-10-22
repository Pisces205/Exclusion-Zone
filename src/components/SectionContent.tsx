import { site, type StarDef } from "../data/site";

interface Props {
  star: StarDef;
  onBack: () => void;
  /** 背景为实时 WebGL 画布时，卡片换成更实的底色，保证文字对比度 */
  veiled?: boolean;
}

const placeholders = [
  { k: "01", t: "正在建造中", d: "这一颗恒星下面藏着的东西还没被观测清楚。" },
  { k: "02", t: "内容占位", d: "作品、文章、音频、影像都会由黑洞吐回到这个页面。" },
  { k: "03", t: "结构占位", d: "网格会沿用主界面的点阵语言，保持克制与呼吸感。" },
];

/** 板块页的公共文字层：header / 标题 / tagline / 三张卡片 / footer */
export default function SectionContent({ star, onBack, veiled = false }: Props) {
  return (
    <div className="relative z-20 flex h-full flex-col overflow-y-auto overscroll-contain px-[7vw] py-7 sm:py-9">
      <header className="anim-fade-in flex items-center justify-between">
        <span className="text-[11px] font-light uppercase tracking-[0.4em] text-white/45">
          {site.nameLatin}
        </span>
        <button
          onClick={onBack}
          className="group flex items-center gap-3 text-[11px] font-light uppercase tracking-[0.3em] text-white/45 transition-colors duration-300 hover:text-white"
        >
          <span className="inline-block h-[5px] w-[5px] rounded-full bg-white/50 transition-transform duration-500 group-hover:scale-150" />
          返回宇宙
        </button>
      </header>

      <main className="flex flex-1 flex-col justify-center py-10">
        <p
          className="anim-fade-up delay-1 text-[11px] font-light uppercase tracking-[0.44em]"
          style={{ color: star.color }}
        >
          {star.sectionEn} · {star.nameEn}
        </p>
        <h1 className="anim-fade-up delay-2 mt-6 text-[16vw] font-thin leading-[0.9] tracking-[-0.04em] text-white/95 sm:text-[9vw] lg:text-[7vw]">
          {star.section}
        </h1>
        <p className="anim-fade-up delay-3 mt-6 max-w-[26rem] text-sm font-light leading-relaxed text-white/50 sm:text-base">
          {star.tagline}。这颗 {star.name} 已经落进视界，从这里开始是这个板块。
        </p>

        <div
          className={`anim-fade-up delay-4 mt-12 grid gap-px overflow-hidden rounded-2xl border sm:grid-cols-3 ${
            veiled ? "border-white/15" : "border-white/10"
          }`}
        >
          {placeholders.map((p) => (
            <div
              key={p.k}
              className={`flex flex-col p-6 transition-colors duration-500 ${
                veiled ? "bg-black/25 hover:bg-black/35" : "bg-white/[0.02] hover:bg-white/[0.05]"
              }`}
            >
              <span className="text-[10px] font-light tracking-[0.3em] text-white/30">
                {p.k}
              </span>
              <h3 className="mt-3 text-base font-light tracking-wide text-white/85">{p.t}</h3>
              <p className="mt-2 text-[12px] font-light leading-relaxed text-white/40">{p.d}</p>
              <span className="mt-auto pt-5">
                <span
                  className="block h-px w-10 opacity-70"
                  style={{ background: star.color }}
                />
              </span>
            </div>
          ))}
        </div>
      </main>

      <footer className="anim-fade-in delay-5 flex flex-wrap items-center justify-between gap-3 text-[10px] font-light uppercase tracking-[0.28em] text-white/25">
        <span>{site.footer}</span>
        <span>视界之内 · 无需返回信号</span>
      </footer>
    </div>
  );
}
