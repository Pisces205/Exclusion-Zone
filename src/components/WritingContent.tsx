import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { site, type StarDef } from "../data/site";
import { writings, writingPageCount, type Writing } from "../data/writings";
import { assetURL } from "../utils/assetURL";

interface Props {
  star: StarDef;
  onBack: () => void;
}

function pdfURL(writing: Writing) {
  return assetURL(`文字/${writing.file}`);
}

/**
 * 「文字」板块：三份文档作品。
 * 点击卡片在站内阅读器里打开 PDF；小屏 / 触屏设备交给系统阅读器，
 * 避免 iframe 只显示首页或被浏览器直接下载。
 */
export default function WritingContent({ star, onBack }: Props) {
  const [active, setActive] = useState<Writing | null>(null);
  const closeReader = useCallback(() => setActive(null), []);

  return (
    <>
      {/* 底部留出 6rem 给音乐胶囊，内容不会滚到胶囊下面 */}
      <div className="relative z-20 flex h-[calc(100%_-_6rem)] flex-col overflow-y-auto overscroll-contain px-[7vw] pb-7 pt-7 [scrollbar-width:none] sm:pb-9 sm:pt-9 [&::-webkit-scrollbar]:hidden">
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
            {star.tagline}。
          </p>

          <div className="anim-fade-up delay-4 mt-10 grid gap-px overflow-hidden rounded-2xl border border-white/15 lg:grid-cols-3">
            {writings.map((writing) => (
              <button
                key={writing.id}
                type="button"
                onClick={() => setActive(writing)}
                aria-haspopup="dialog"
                aria-label={`阅读《${writing.title}》`}
                className="group relative flex min-h-[15.5rem] flex-col overflow-hidden bg-[#0b0803]/75 p-6 text-left transition-colors duration-500 hover:bg-[#0b0803]/90 focus-visible:bg-[#0b0803]/90 focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-4 sm:p-7"
                style={{ outlineColor: writing.accent }}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="flex items-baseline gap-2.5">
                    <span className="font-mono text-[9px] leading-none tracking-[0.06em] text-white/25">
                      {writing.index}
                    </span>
                    <span
                      className="text-[10px] font-light uppercase tracking-[0.26em]"
                      style={{ color: writing.accent }}
                    >
                      {writing.category}
                    </span>
                  </span>
                  <span className="font-mono text-[9px] tracking-[0.14em] text-white/30">
                    PDF · {writing.pages}P
                  </span>
                </span>

                <span className="mt-6 block text-[20px] font-light leading-snug tracking-wide text-white/90 transition-colors duration-300 group-hover:text-white">
                  {writing.title}
                </span>
                <span className="mt-2 block text-[9px] font-light uppercase leading-relaxed tracking-[0.22em] text-white/35">
                  {writing.titleEn}
                </span>
                <span className="mt-4 block max-w-[34rem] text-[12.5px] font-light leading-[1.7] text-white/55">
                  {writing.description}
                </span>

                <span className="mt-auto flex items-end justify-between gap-4 pt-7">
                  <span
                    aria-hidden="true"
                    className="block h-px w-10 opacity-70 transition-all duration-500 group-hover:w-16"
                    style={{ background: writing.accent }}
                  />
                  <span className="flex items-center gap-2 text-[10px] font-light uppercase tracking-[0.24em] text-white/40 transition-colors duration-300 group-hover:text-white/85">
                    阅读
                    <span aria-hidden="true" className="text-[12px] leading-none">
                      ↗
                    </span>
                  </span>
                </span>
              </button>
            ))}
          </div>

          <p className="anim-fade-in delay-5 mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-light uppercase tracking-[0.24em] text-white/30">
            <span>{writings.length} 份文档</span>
            <span aria-hidden="true" className="h-px w-4 bg-white/20" />
            <span>共 {writingPageCount} 页</span>
            <span aria-hidden="true" className="h-px w-4 bg-white/20" />
            <span>点击卡片开始阅读</span>
          </p>
        </main>

        <footer className="anim-fade-in delay-5 flex flex-wrap items-center justify-between gap-3 text-[10px] font-light uppercase tracking-[0.28em] text-white/25">
          <span>{site.footer}</span>
          <span>视界之内 · 无需返回信号</span>
        </footer>
      </div>

      {active && <PdfReader writing={active} onClose={closeReader} />}
    </>
  );
}

/** 站内 PDF 阅读器：桌面端用浏览器自带阅读器，小屏 / 触屏设备直接交给系统。 */
function PdfReader({ writing, onClose }: { writing: Writing; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const url = pdfURL(writing);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      // 焦点锁在阅读器里：新窗口链接 ↔ 关闭按钮
      const root = dialogRef.current;
      if (!root) return;
      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")
      ).filter((el) => el.getClientRects().length > 0);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-reader-title"
      className="fixed inset-0 z-[90] flex flex-col bg-[#05060c]/95"
    >
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 px-4 py-3 sm:px-6 sm:py-4">
        <div className="min-w-0">
          <p
            className="truncate text-[9px] font-light uppercase tracking-[0.28em]"
            style={{ color: writing.accent }}
          >
            <span className="hidden sm:inline">{writing.category} · </span>
            {writing.pages} PAGES · {writing.size}
          </p>
          <h2
            id="pdf-reader-title"
            className="mt-1.5 truncate text-sm font-light tracking-wide text-white/90 sm:text-base"
          >
            {writing.title}
          </h2>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3.5 py-2 text-[10px] font-light uppercase tracking-[0.2em] text-white/70 transition-colors duration-300 hover:border-white/30 hover:bg-white/10 hover:text-white sm:px-4"
          >
            <span className="hidden sm:inline">新窗口打开</span>
            <span className="sm:hidden">新窗口</span>
            <span aria-hidden="true" className="text-[12px] leading-none">
              ↗
            </span>
          </a>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="关闭阅读器"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3.5 py-2 text-[10px] font-light uppercase tracking-[0.2em] text-white/70 transition-colors duration-300 hover:border-white/30 hover:bg-white/10 hover:text-white sm:px-4"
          >
            <span className="hidden sm:inline">关闭</span>
            <span aria-hidden="true" className="text-sm leading-none">
              ×
            </span>
          </button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 bg-[#3a3a3a]">
        <div className="pointer-events-none absolute inset-0 hidden items-center justify-center text-[10px] font-light uppercase tracking-[0.3em] text-white/30 sm:pointer-fine:flex">
          正在载入文档…
        </div>
        <iframe
          key={writing.id}
          src={`${url}#view=FitH`}
          title={`${writing.title} · PDF`}
          tabIndex={-1}
          className="relative hidden h-full w-full border-0 bg-[#3a3a3a] sm:pointer-fine:block"
        />

        <div className="flex h-full flex-col items-center justify-center gap-5 px-8 text-center sm:pointer-fine:hidden">
          <p
            className="text-[10px] font-light uppercase tracking-[0.3em]"
            style={{ color: writing.accent }}
          >
            {writing.pages} PAGES · {writing.size}
          </p>
          <p className="max-w-[18rem] text-sm font-light leading-relaxed text-white/55">
            在新窗口中用系统阅读器打开 PDF，阅读体验更好。
          </p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-[11px] font-light uppercase tracking-[0.24em] text-[#08070f] transition-transform duration-300 active:scale-95"
            style={{ background: writing.accent }}
          >
            打开 PDF
            <span aria-hidden="true" className="text-[13px] leading-none">
              ↗
            </span>
          </a>
        </div>
      </div>
    </div>,
    document.body
  );
}
