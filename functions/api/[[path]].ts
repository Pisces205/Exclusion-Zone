/**
 * Cloudflare Pages Function：把 /api/* 交给 server/ncm.ts 的同源代理。
 * 站点与音乐接口同域，无需 CORS，也不需要额外的服务器或域名。
 */

import { handleNcm } from "../../server/ncm";

interface PagesContext {
  request: Request;
}

export function onRequest(context: PagesContext): Promise<Response> {
  return handleNcm(context.request);
}
