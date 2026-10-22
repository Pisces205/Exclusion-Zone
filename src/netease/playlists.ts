/**
 * 登录用户歌单的数据钩子。
 *
 * 状态机显式区分 idle/loading/ready/empty/error/auth：
 * 「私密歌单」「cookie 过期」「网络故障」「真的没有歌单」不能用同一个空态糊过去。
 * 每个请求都带 AbortController，切歌单/退出登录时旧响应不会覆盖新选择。
 */
import { useCallback, useEffect, useState } from "react";
import {
  playlistTracks,
  userPlaylists,
  type NcmPlaylistBrief,
  type NcmPlaylistSong,
} from "./api";
import type { Session } from "./session";

export type LoadState = "idle" | "loading" | "ready" | "empty" | "error" | "auth";

const AUTH_CODES = new Set([301, -460, 8821]);

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export interface PlaylistsData {
  state: LoadState;
  data: NcmPlaylistBrief[];
  more: boolean;
  message?: string;
  retry: () => void;
}

export function useUserPlaylists(session: Session): PlaylistsData {
  const [state, setState] = useState<LoadState>("idle");
  const [data, setData] = useState<NcmPlaylistBrief[]>([]);
  const [more, setMore] = useState(false);
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [nonce, setNonce] = useState(0);
  const retry = useCallback(() => setNonce((n) => n + 1), []);

  const userId = session.status === "user" ? session.userId : null;

  useEffect(() => {
    if (userId == null) {
      setState("idle");
      setData([]);
      setMore(false);
      setMessage(undefined);
      return;
    }
    const ctrl = new AbortController();
    let alive = true;
    setState((s) => (s === "ready" ? s : "loading"));
    void (async () => {
      try {
        const r = await userPlaylists(userId, 100, ctrl.signal);
        if (!alive) return;
        if (AUTH_CODES.has(r.code) || r.code === 400) {
          setState("auth");
          setData([]);
          setMessage(r.code === 400 ? "账号信息异常，请重新登录" : "登录状态已过期，请重新扫码");
          return;
        }
        if (r.code !== 200) {
          setState("error");
          setMessage("歌单加载失败（网易云返回 " + r.code + "）");
          return;
        }
        setData(r.playlist);
        setMore(r.more);
        setState(r.playlist.length ? "ready" : "empty");
        setMessage(undefined);
      } catch (err) {
        if (!alive || isAbort(err)) return;
        setState("error");
        setMessage("歌单加载失败，请检查网络后重试");
      }
    })();
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [userId, nonce]);

  return { state, data, more, message, retry };
}

export interface TracksData {
  state: LoadState;
  data: NcmPlaylistSong[];
  songCount: number;
  truncated: boolean;
  message?: string;
  retry: () => void;
}

export function usePlaylistTracks(
  playlistId: number | null,
  limit: number,
  enabled: boolean,
): TracksData {
  const [state, setState] = useState<LoadState>("idle");
  const [data, setData] = useState<NcmPlaylistSong[]>([]);
  const [songCount, setSongCount] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [nonce, setNonce] = useState(0);
  const retry = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled || playlistId == null) {
      setState("idle");
      setData([]);
      setSongCount(0);
      setTruncated(false);
      setMessage(undefined);
      return;
    }
    const ctrl = new AbortController();
    let alive = true;
    setState("loading");
    setData([]);
    setMessage(undefined);
    void (async () => {
      try {
        const r = await playlistTracks(playlistId, limit, ctrl.signal);
        if (!alive) return;
        if (AUTH_CODES.has(r.code)) {
          setState("auth");
          setMessage("登录状态已过期，请重新扫码");
          return;
        }
        if (r.code !== 200) {
          setState("error");
          setMessage(
            r.code === 404
              ? "歌单不可访问（私密 / 已删除 / 无权限）"
              : `歌单加载失败（网易云返回 ${r.code}）`,
          );
          return;
        }
        setData(r.songs);
        setSongCount(r.songCount);
        setTruncated(r.truncated);
        setState(r.songs.length ? "ready" : "empty");
      } catch (err) {
        if (!alive || isAbort(err)) return;
        setState("error");
        setMessage("歌单加载失败，请检查网络后重试");
      }
    })();
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [playlistId, limit, enabled, nonce]);

  return { state, data, songCount, truncated, message, retry };
}
