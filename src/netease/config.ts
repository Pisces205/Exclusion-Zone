/**
 * 网易云 API 地址。
 *
 * 默认走站点同源的 /api：线上由 functions/api/[[path]].ts（Cloudflare Pages Function）
 * 提供，本地由 server/vite-plugin-ncm.ts 的 dev 中间件提供，两边共用 server/ncm.ts。
 * 因此不需要额外部署服务器、域名或配置 CORS。
 *
 * 如果站点不是部署在 Cloudflare Pages（没有 /api），可以：
 *   - 构建前把 NCM_BASE 改成自部署服务地址（如 "https://ncm.example.com"）；
 *   - 或临时在控制台执行 localStorage.setItem('rainburst.ncm-base', 'https://...')。
 * 离线双击 dist/index.html（file://）时不会访问 /api，登录弹窗会提示未配置。
 */

/** 同源函数；结尾不要带斜杠。自部署时改成 https://... */
export const NCM_BASE = "/api";

const OVERRIDE_KEY = "rainburst.ncm-base";

export function ncmBase(): string {
  try {
    const v = localStorage.getItem(OVERRIDE_KEY);
    if (v && /^https?:\/\//i.test(v)) return v.replace(/\/+$/, "");
  } catch {
    /* ignore */
  }
  // 单文件离线打开时没有同源后端，直接视为未配置
  if (typeof location !== "undefined" && location.protocol === "file:") return "";
  return NCM_BASE.replace(/\/+$/, "");
}

export const ncmConfigured = (): boolean => ncmBase().length > 0;

/* ---------------- 登录 cookie（MUSIC_U）本地保管 ---------------- */

const COOKIE_KEY = "rainburst.ncm-cookie";

export function getCookie(): string {
  try {
    return localStorage.getItem(COOKIE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setCookie(c: string) {
  try {
    if (c) localStorage.setItem(COOKIE_KEY, c);
    else localStorage.removeItem(COOKIE_KEY);
  } catch {
    /* ignore */
  }
}
