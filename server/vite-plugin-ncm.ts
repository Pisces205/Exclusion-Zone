/**
 * 本地 dev / preview 的 /api 中间件：把同源网易云代理挂进 Vite，
 * 这样 `npm run dev` 一个命令就能扫码登录、试听，不需要另起进程。
 * 线上由 functions/api/[[path]].ts 接管同一份 handler。
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { handleNcm } from "./ncm";

interface MiddlewareHost {
  use(path: string, fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void): void;
}

function toRequest(req: IncomingMessage): Request {
  // 挂载在 /api 下，connect 已经把前缀剥掉；这里补回去
  const url = new URL(`/api${req.url ?? "/"}`, `http://${req.headers.host ?? "localhost"}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(key, value);
    else if (Array.isArray(value)) headers.set(key, value.join(","));
  }
  return new Request(url, { method: req.method ?? "GET", headers });
}

function mount(middlewares: MiddlewareHost) {
  middlewares.use("/api", (req, res, next) => {
    if (req.method !== "GET" && req.method !== "POST") {
      next();
      return;
    }
    void (async () => {
      try {
        const response = await handleNcm(toRequest(req));
        res.statusCode = response.status;
        response.headers.forEach((value, key) => res.setHeader(key, value));
        res.end(Buffer.from(await response.arrayBuffer()));
      } catch {
        res.statusCode = 502;
        res.setHeader("content-type", "application/json; charset=utf-8");
        res.setHeader("cache-control", "no-store");
        res.end(JSON.stringify({ code: -1, message: "proxy failed" }));
      }
    })();
  });
}

export default function ncmApiPlugin(): Plugin {
  return {
    name: "rainburst:ncm-api",
    configureServer(server) {
      mount(server.middlewares as MiddlewareHost);
    },
    configurePreviewServer(server) {
      mount(server.middlewares as MiddlewareHost);
    },
  };
}
