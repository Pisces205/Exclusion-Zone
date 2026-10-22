import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  contact,
  contactChannels,
  site,
  type ContactChannelId,
  type StarDef,
} from "../data/site";
import { withAlpha } from "../utils/color";

interface Props {
  star: StarDef;
  onBack: () => void;
}

const COPY_LABEL = { idle: "复制", done: "已复制", manual: "已选中" } as const;

/** 面板与账号节点的 id 都按入口 id 生成，两个入口共用同一套面板 */
const panelId = (id: ContactChannelId) => `about-${id}-panel`;
const handleId = (id: ContactChannelId) => `about-${id}-handle`;

/**
 * 「联系」板块 = 联系我 / 关于我。
 * 版面沿用参考图那种居中、克制的排布（身份行 → 细横线 → 引语 → 圆形入口），
 * 但换成站内语言：星体色做强调、等宽小字做标注、分隔线两端淡出。
 * 邮箱和微信都没有可跳转的协议，点开就在页面上把账号亮出来，并给一个复制按钮（见 site.ts）。
 */
export default function AboutContent({ star, onBack }: Props) {
  /** 同时只展开一个入口；点另一个等于把上一个收起来 */
  const [openId, setOpenId] = useState<ContactChannelId | null>(null);
  /** idle 还没点；done 已经写进剪贴板；manual 剪贴板被拒，只能把账号选中让访客自己复制 */
  const [copyState, setCopyState] = useState<"idle" | "done" | "manual">("idle");
  const copyTimer = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  /** 当前展开的入口（带上自己的 id，省得到处再判一次 null） */
  const open = openId ? { id: openId, ...contactChannels[openId] } : null;

  const clearCopyTimer = useCallback(() => {
    if (copyTimer.current !== null) {
      window.clearTimeout(copyTimer.current);
      copyTimer.current = null;
    }
  }, []);

  useEffect(() => clearCopyTimer, [clearCopyTimer]);

  /** 矮窗口下面板会长在折叠线以下（内容区高 = 视口 − 6rem），展开时把它带进可视区 */
  useEffect(() => {
    if (openId) panelRef.current?.scrollIntoView({ block: "nearest" });
  }, [openId]);

  /**
   * manual 态靠的是「账号已经被选中」这件事本身。选区一没（收起面板会把 handle 的 span 一起卸载，
   * 或访客在别处点了一下把选区清掉），「已选中」就成了假话，所以选区一散就退回 idle。
   */
  useEffect(() => {
    if (copyState !== "manual" || !open) return;
    const onSelectionChange = () => {
      if (!String(window.getSelection()).includes(open.handle)) setCopyState("idle");
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [copyState, open]);

  /**
   * 点入口：收起 / 展开 / 换个入口展开。三种情况都要把复制态、计时器和选区清干净——
   * 否则重新展开会带着上一个入口过期的「已选中」回来。
   */
  const toggleChannel = useCallback(
    (id: ContactChannelId) => {
      clearCopyTimer();
      setCopyState("idle");
      window.getSelection()?.removeAllRanges();
      setOpenId((cur) => (cur === id ? null : id));
    },
    [clearCopyTimer]
  );

  const copyHandle = useCallback(
    async (id: ContactChannelId) => {
      let copied = true;
      try {
        await navigator.clipboard.writeText(contactChannels[id].handle);
      } catch {
        /* 剪贴板被策略挡住（非安全上下文、权限被拒）时退回选中文本，至少还能手动复制；
           这时不能报「已复制」——剪贴板里其实还是旧内容 */
        copied = false;
        const node = document.getElementById(handleId(id));
        if (node) {
          const range = document.createRange();
          range.selectNodeContents(node);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
        }
      }
      setCopyState(copied ? "done" : "manual");
      clearCopyTimer();
      copyTimer.current = window.setTimeout(() => setCopyState("idle"), 2200);
    },
    [clearCopyTimer]
  );

  return (
    /* 底部留出 6rem 给音乐胶囊，内容不会滚到胶囊下面 */
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

      <main className="flex flex-1 flex-col items-center justify-center py-10 text-center">
        <p
          className="anim-fade-up delay-1 text-[11px] font-light uppercase tracking-[0.44em]"
          style={{ color: star.color }}
        >
          {star.sectionEn} · {star.nameEn}
        </p>

        <h1 className="anim-fade-up delay-2 mt-6 text-[16vw] font-thin leading-[0.9] tracking-[-0.04em] text-white/95 sm:text-[9vw] lg:text-[6.5vw]">
          {star.section}
        </h1>

        <p className="anim-fade-up delay-3 mt-5 text-[13px] font-light uppercase tracking-[0.34em] text-white/80 sm:text-[15px] sm:tracking-[0.42em]">
          {contact.role}
        </p>

        {/* 细横线：两端淡出，中间是这颗星的颜色 */}
        <span
          aria-hidden="true"
          className="anim-fade-in delay-3 mt-8 block h-px w-[11rem] sm:w-[15rem]"
          style={{
            background: `linear-gradient(90deg, transparent, ${withAlpha(star.color, 0.5)} 50%, transparent)`,
          }}
        />

        <p className="anim-fade-up delay-4 mt-8 max-w-[28rem] text-[13px] font-light leading-[1.9] text-white/50 sm:text-sm">
          <span
            aria-hidden="true"
            className="mr-1.5 text-[11px]"
            style={{ color: star.color, opacity: 0.7, verticalAlign: "0.14em" }}
          >
            ❝
          </span>
          {contact.quote}
          <span
            aria-hidden="true"
            className="ml-1.5 text-[11px]"
            style={{ color: star.color, opacity: 0.7, verticalAlign: "0.14em" }}
          >
            ❞
          </span>
        </p>

        <div className="anim-fade-up delay-5 mt-11 flex items-start justify-center gap-5 sm:gap-9">
          <Channel
            label={contact.github.label}
            href={contact.github.href}
            accent={star.color}
            icon={<GitHubIcon />}
          />
          <Channel
            label={contact.email.label}
            accent={star.color}
            expanded={openId === "email"}
            panelId={panelId("email")}
            tag={contact.email.tag}
            onClick={() => toggleChannel("email")}
            icon={<MailIcon />}
          />
          <Channel
            label={contact.wechat.label}
            accent={star.color}
            expanded={openId === "wechat"}
            panelId={panelId("wechat")}
            tag={contact.wechat.tag}
            onClick={() => toggleChannel("wechat")}
            icon={<WeChatIcon />}
          />
        </div>

        {open && (
          <div
            /* 换入口时重挂一次，让面板的入场动画跟着重放 */
            key={open.id}
            ref={panelRef}
            id={panelId(open.id)}
            className="anim-caption-in mt-7 flex items-center gap-3 rounded-full border border-white/15 bg-[#04070b]/70 py-2 pl-4 pr-2 backdrop-blur-sm sm:gap-4 sm:pl-5"
          >
            <span className="text-[9.5px] font-light uppercase tracking-[0.28em] text-white/35">
              {open.tag}
            </span>
            <span
              id={handleId(open.id)}
              /* 根节点是 select-none（防止拖拽时误选到画布上的字），这里单独放开，
                 否则剪贴板被策略挡住时的「选中文本」兜底会被浏览器直接忽略 */
              className="select-text text-[13px] font-light tracking-[0.1em] text-white/90 sm:text-sm"
            >
              {open.handle}
            </span>
            <button
              type="button"
              onClick={() => copyHandle(open.id)}
              aria-live="polite"
              className="rounded-full border border-white/15 px-3 py-1 text-[9.5px] font-light uppercase tracking-[0.22em] text-white/55 transition-colors duration-300 hover:border-white/35 hover:text-white"
            >
              {COPY_LABEL[copyState]}
            </button>
          </div>
        )}
      </main>

      <footer className="anim-fade-in delay-6 flex flex-wrap items-center justify-between gap-3 text-[10px] font-light uppercase tracking-[0.28em] text-white/25">
        <span>{site.footer}</span>
        <span>视界之内 · 无需返回信号</span>
      </footer>
    </div>
  );
}

/** 圆形入口：有 href 就走链接（站外），否则是就地展开的按钮。 */
function Channel({
  label,
  icon,
  href,
  onClick,
  expanded,
  panelId: panel,
  tag,
  accent,
}: {
  label: string;
  icon: ReactNode;
  href?: string;
  onClick?: () => void;
  /** 只有就地展开的按钮用：同时决定高亮、aria-expanded 与可访问名 */
  expanded?: boolean;
  /** 展开面板的 id；收起时不留指向不存在节点的 IDREF，所以只在展开时挂上去 */
  panelId?: string;
  /** 可访问名里的宾语：展开微信号 / 展开邮箱地址 */
  tag?: string;
  accent: string;
}) {
  const shell =
    "group flex w-[4.25rem] shrink-0 cursor-pointer flex-col items-center gap-2.5 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4";
  const disc =
    "flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/[0.03] text-white/70 transition-all duration-500 group-hover:border-white/35 group-hover:bg-white/[0.08] group-hover:text-white";
  const activeStyle = expanded
    ? { borderColor: withAlpha(accent, 0.65), backgroundColor: withAlpha(accent, 0.16), color: accent }
    : undefined;

  const body = (
    <>
      <span className={disc} style={activeStyle}>
        {icon}
      </span>
      <span className="text-[9.5px] font-light uppercase tracking-[0.24em] text-white/35 transition-colors duration-300 group-hover:text-white/70">
        {label}
      </span>
    </>
  );

  if (href) {
    const external = href.startsWith("http");
    return (
      <a
        href={href}
        className={shell}
        style={{ outlineColor: accent }}
        aria-label={`${label} · ${href}`}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {body}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={shell}
      style={{ outlineColor: accent }}
      aria-expanded={expanded}
      aria-controls={expanded ? panel : undefined}
      aria-label={`${label} · ${expanded ? "收起" : "展开"}${tag}`}
    >
      {body}
    </button>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[18px] w-[18px]" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49v-1.72c-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.34 1.12 2.91.86.09-.67.35-1.12.63-1.38-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.11-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05a9.4 9.4 0 0 1 5 0c1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.35 4.79-4.58 5.05.36.32.68.94.68 1.9v2.81c0 .27.18.6.69.49A10.06 10.06 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-[19px] w-[19px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2.6" y="4.9" width="18.8" height="14.2" rx="2.8" />
      <path d="m3.5 7.6 7.4 5.3a2 2 0 0 0 2.2 0l7.4-5.3" />
    </svg>
  );
}

/** 微信：两只气泡 + 四个点，用 evenodd 把点挖成孔，纯单色也能认出来。 */
function WeChatIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-[19px] w-[19px]"
      fill="currentColor"
      fillRule="evenodd"
      clipRule="evenodd"
    >
      <path d="M9.1 3.1C5.1 3.1 1.9 5.9 1.9 9.3c0 1.9 1 3.6 2.6 4.8l-.7 2.2 2.5-1.2c.85.23 1.73.35 2.62.35h.55a6.9 6.9 0 0 1-.17-1.55c0-3.1 2.9-5.6 6.5-5.6h.65C15.9 5.2 12.85 3.1 9.1 3.1ZM5.9 6.65a1.05 1.05 0 1 1 0 2.1 1.05 1.05 0 0 1 0-2.1Zm6.4 0a1.05 1.05 0 1 1 0 2.1 1.05 1.05 0 0 1 0-2.1Z" />
      <path d="M15.9 8.85c-3.3 0-6 2.3-6 5.1 0 2.8 2.7 5.1 6 5.1.72 0 1.42-.11 2.06-.32l2.14 1.02-.55-1.77a4.9 4.9 0 0 0 2.35-4.03c0-2.8-2.7-5.1-6-5.1Zm-2.1 3.2a.95.95 0 1 1 0 1.9.95.95 0 0 1 0-1.9Zm4.3 0a.95.95 0 1 1 0 1.9.95.95 0 0 1 0-1.9Z" />
    </svg>
  );
}