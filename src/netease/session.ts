/**
 * 网易云登录态的唯一事实源（模块级单例，对齐 audio/music.ts 的写法）。
 *
 * 蓝巨星页（歌单卡）和播放页都要判断「是否登录」，两边各自 account() 会打架：
 * 退出登录不通知对方、网络错误被当成未登录、StrictMode 下重复请求、
 * 多标签页切换账号同步不到。统一收在这里：
 *  - status 区分 loading / guest / user / error，网络故障不会被误判成游客；
 *  - refreshSession 去重 in-flight，并用 epoch 丢弃换号/退出后才返回的旧响应；
 *  - signOut 清 cookie、递增 epoch、通知所有订阅者；
 *  - 监听 storage（多标签页）与 visibilitychange（回到前台时重新校验）。
 */
import { useSyncExternalStore } from "react";
import { getCookie, ncmConfigured, setCookie } from "./config";
import { account, type NcmAccount } from "./api";

export type Session =
  | { status: "loading" }
  | { status: "guest" }
  | { status: "error"; message: string }
  | { status: "user"; userId: number; nickname?: string; avatarUrl?: string };

const COOKIE_KEY = "rainburst.ncm-cookie";

let snap: Session = { status: "loading" };
let epoch = 0;
let inflight: Promise<void> | null = null;
let started = false;
const listeners = new Set<() => void>();

function emit() {
  for (const cb of listeners) cb();
}

function set(next: Session) {
  snap = next;
  emit();
}

export function getSession(): Session {
  return snap;
}

export function subscribeSession(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useNcmSession(): Session {
  return useSyncExternalStore(subscribeSession, getSession, getSession);
}

/** 登录弹窗 803 校验通过后调用：把刚拿到的 cookie 立刻提升为 user，不等下一次网络校验 */
export function markUser(acc: NcmAccount) {
  epoch += 1;
  if (acc.ok && acc.userId) {
    set({ status: "user", userId: acc.userId, nickname: acc.nickname, avatarUrl: acc.avatarUrl });
  } else {
    void refreshSession(true);
  }
}

export function signOut() {
  epoch += 1;
  inflight = null;
  setCookie("");
  set({ status: "guest" });
}

/** 重新校验登录态；force=true 时忽略去重（登录成功、回到前台） */
export function refreshSession(force = false): Promise<void> {
  if (!getCookie() || !ncmConfigured()) {
    inflight = null;
    set({ status: "guest" });
    return Promise.resolve();
  }
  if (inflight && !force) return inflight;
  const my = epoch;
  // 主动刷新时才回到 loading；轮询/回前台时保持已有身份，避免 UI 闪一下游客态
  if (snap.status !== "user") set({ status: "loading" });
  inflight = (async () => {
    let acc: NcmAccount;
    try {
      acc = await account();
    } catch {
      acc = { ok: false, error: true };
    }
    if (my !== epoch) return; // 期间已退出/换号，丢弃过期结果
    if (acc.ok && acc.userId) {
      set({ status: "user", userId: acc.userId, nickname: acc.nickname, avatarUrl: acc.avatarUrl });
    } else if (acc.error) {
      set({ status: "error", message: "账号校验失败，请检查网络" });
    } else {
      set({ status: "guest" });
    }
    inflight = null;
  })();
  return inflight;
}

/** 只挂一次：多标签页登录态变化 + 回到前台时重新校验 */
export function ensureSessionStarted() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("storage", (e) => {
    if (e.key === COOKIE_KEY || e.key === null) {
      epoch += 1;
      inflight = null;
      void refreshSession(true);
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && getCookie()) void refreshSession(true);
  });
  void refreshSession();
}
