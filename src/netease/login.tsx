import { useCallback, useEffect, useRef, useState } from "react";
import { ncmConfigured, setCookie } from "./config";
import { qrKey, qrCreate, qrCheck, account } from "./api";

interface Props {
  /** 登录成功（cookie 已存）→ 父组件刷新账号并继续播放 */
  onSuccess: () => void;
  onClose: () => void;
}

type Phase = "loading" | "scan" | "scanned" | "expired" | "failed";

const GENERIC_FAILURE = "登录服务连不上（地址不对 / 跨域被拒 / 服务未启动）";

/** qrKey() 会带上网易云的限流提示；网络/跨域错误没有 message，用通用文案 */
function failureText(err: unknown): string {
  const message = err instanceof Error ? err.message : "";
  return message && message !== "Failed to fetch" ? message : GENERIC_FAILURE;
}

/** 网易云扫码登录弹窗：拿 key → 生成二维码（服务端出图）→ 2s 轮询扫码状态 */
export default function LoginModal({ onSuccess, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [qrImg, setQrImg] = useState<string>("");
  const [msg, setMsg] = useState("");
  /** 每次 start 递增；旧的异步链在 await 之后发现 token 变了就自行退出 */
  const runRef = useRef(0);
  const pollRef = useRef(0);
  /**
   * 父组件（专辑播放页）会随音频 timeupdate 以 ~4Hz 重渲染，并每次新建内联回调。
   * 若把 onSuccess 放进 start 的依赖，父组件每渲染一次就会换一张二维码——
   * 这正是「弹窗不停闪码」的根因。用 ref 保存最新回调，start 保持身份稳定。
   */
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const start = useCallback(async () => {
    const run = ++runRef.current;
    window.clearTimeout(pollRef.current);
    setPhase("loading");
    setQrImg("");
    setMsg("");
    if (!ncmConfigured()) {
      setPhase("failed");
      setMsg("播放服务还没部署——把 API 地址填进 src/netease/config.ts 后再试");
      return;
    }
    try {
      const { key, chainId, cookie: initialJar } = await qrKey();
      if (run !== runRef.current) return;
      // 这次扫码的匿名会话（NMTID 等）；每次轮询都要把最新值带回去
      let jar = initialJar;
      // chainId 同时进二维码和轮询头：少了它，手机确认后会撞上 8821 风控
      const { qrImg: img, qrUrl } = await qrCreate(key, chainId);
      if (run !== runRef.current) return;
      if (!img && !qrUrl) throw new Error("no-url");
      // 服务端 qrimg 是现成的 dataURL；没有则无法本地绘制（提示换端）
      if (!img) {
        setPhase("failed");
        setMsg("服务端未返回二维码图，请检查 api-enhanced 版本");
        return;
      }
      setQrImg(img);
      setPhase("scan");
      const startedAt = Date.now();
      const poll = async () => {
        if (run !== runRef.current) return;
        try {
          // 用本次 run 捕获的 key，避免旧轮询链读到别的二维码的 key
          const r = await qrCheck(key, chainId, jar);
          if (run !== runRef.current) return;
          if (r.cookie) jar = r.cookie;
          if (r.code === 803) {
            if (!/MUSIC_U=/.test(r.cookie)) {
              setQrImg("");
              setPhase("failed");
              setMsg("手机已确认，但网易云没有返回登录态，请重试");
              return;
            }
            setCookie(r.cookie);
            // 登录态落库到可查询账号之间可能有短暂延迟，最多校验三次
            let ok = false;
            for (let i = 0; i < 3; i++) {
              const acc = await account();
              if (run !== runRef.current) return;
              if (acc.ok) {
                ok = true;
                break;
              }
              await new Promise((resolve) => window.setTimeout(resolve, 700));
              if (run !== runRef.current) return;
            }
            if (ok) {
              onSuccessRef.current();
              return;
            }
            setQrImg("");
            setPhase("failed");
            setMsg("登录态已保存，但账号校验没通过，请重试");
            return;
          }
          if (r.code === 802) setPhase("scanned");
          else if (r.code === 800) {
            setPhase("expired");
            return;
          } else if (r.code !== 801) {
            // 8821 = 网易云风控（官方登录框遇到它也会直接停止轮询）
            setQrImg("");
            setPhase("failed");
            setMsg(
              r.code === 8821
                ? "网易云拦下了这次登录（8821 环境风险）——等几分钟再试，或换一个网络（如手机热点）后重试"
                : `登录没有完成（网易云返回 ${r.code}），请重试`,
            );
            return;
          }
          // 过期以上游 800 为准；这里只做一个兜底的超时，避免无限轮询
          if (Date.now() - startedAt > 5 * 60_000) {
            setPhase("expired");
            return;
          }
        } catch (err) {
          if (run !== runRef.current) return;
          setQrImg("");
          setPhase("failed");
          setMsg(failureText(err));
          return;
        }
        if (run !== runRef.current) return;
        pollRef.current = window.setTimeout(() => void poll(), 2000);
      };
      pollRef.current = window.setTimeout(() => void poll(), 2000);
    } catch (err) {
      if (run !== runRef.current) return;
      setPhase("failed");
      setMsg(failureText(err));
    }
  }, []);

  useEffect(() => {
    // 推迟一拍再启动：StrictMode 的 setup→cleanup→setup 会先清掉这个定时器，
    // 开发模式下也不会重复申请二维码 key；真实卸载同样取消。
    const timer = window.setTimeout(() => {
      void start();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      runRef.current += 1;
      window.clearTimeout(pollRef.current);
    };
  }, [start]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, []);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
      <button aria-label="关闭" className="absolute inset-0 cursor-default bg-black/55 backdrop-blur-sm" onClick={onClose} />
      <div className="anim-caption-in relative w-full max-w-[340px] rounded-2xl border border-white/12 bg-[#161009]/95 p-6 text-center shadow-[0_30px_90px_rgba(0,0,0,0.7)]">
        <p className="text-[15px] font-light tracking-[0.18em] text-white/90">登录后即可播放</p>
        <p className="mt-1.5 text-[11px] font-light leading-relaxed text-white/45">
          用你本人的网易云音乐 App 扫码，音乐通过你自己的账号播放，本站不保存任何账号信息
        </p>
        <div className="mx-auto mt-5 flex h-[216px] w-[216px] items-center justify-center overflow-hidden rounded-xl bg-[#f6efe4]">
          {qrImg ? (
            <img src={qrImg} alt="网易云登录二维码" className="h-full w-full" />
          ) : (
            <span className="px-6 text-[12px] leading-relaxed text-black/50">
              {phase === "loading" ? "二维码生成中…" : phase === "failed" ? msg : phase === "expired" ? "已过期" : "准备中…"}
            </span>
          )}
        </div>
        <p className="mt-4 h-4 text-[11px] font-light tracking-[0.14em] text-white/55">
          {phase === "scan" && "等待扫码 · 网易云 App 扫一扫"}
          {phase === "scanned" && "已扫码 · 请在手机上点确认"}
          {phase === "expired" && "二维码已过期"}
        </p>
        <div className="mt-4 flex justify-center gap-3">
          {(phase === "expired" || phase === "failed") && (
            <button onClick={() => void start()} className="cursor-pointer rounded-full border border-white/15 bg-white/[0.07] px-5 py-1.5 text-[11px] font-light tracking-[0.22em] text-white/85 transition-colors duration-300 hover:bg-white/[0.14]">
              {phase === "failed" ? "重试" : "换一张"}
            </button>
          )}
          <button onClick={onClose} className="cursor-pointer rounded-full border border-white/10 px-5 py-1.5 text-[11px] font-light tracking-[0.22em] text-white/50 transition-colors duration-300 hover:text-white">
            先不登录
          </button>
        </div>
      </div>
    </div>
  );
}
