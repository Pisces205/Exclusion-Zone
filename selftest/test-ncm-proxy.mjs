/**
 * /api 同源网易云代理的自检（不联网：所有上游请求都用 mock fetch 接管）。
 *
 *   npx esbuild server/ncm.ts --bundle --format=esm --outfile=dist-selftest/ncm.js
 *   node selftest/test-ncm-proxy.mjs
 *
 * 覆盖：路由白名单、参数校验、专辑字段归一、http→https、二维码生成、
 *       Set-Cookie 提取、cookie 只进 header 不进上游 URL、上游异常返回 502。
 */

import assert from "node:assert/strict";
import nodeCrypto from "node:crypto";
import { handleNcm } from "../dist-selftest/ncm.js";

const realFetch = globalThis.fetch;
let calls = [];
let routes = new Map();

/* 用假 crypto 截获 weapi 的明文（第一层 AES 的输入就是 JSON），
   这样测试能验证真正发出去的 type/key，而不是只看到密文。 */
const captured = [];
const importedKeys = [];
function installFakeCrypto() {
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: {
      getRandomValues(bytes) {
        for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 37 + 11) % 256;
        return bytes;
      },
      subtle: {
        async importKey(_format, keyData) {
          importedKeys.push(new TextDecoder().decode(keyData));
          return { key: new TextDecoder().decode(keyData) };
        },
        async encrypt(_algorithm, _key, data) {
          captured.push(new TextDecoder().decode(data));
          return new Uint8Array(16);
        },
      },
    },
  });
}
installFakeCrypto();

function mock(handler) {
  calls = [];
  routes = new Map();
  captured.length = 0;
  importedKeys.length = 0;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), headers: init.headers ?? {}, body: init.body ? String(init.body) : "" });
    const hit = handler ? handler(String(url), init) : null;
    if (hit instanceof Response) return hit;
    throw new Error(`unexpected upstream: ${url}`);
  };
}

function jsonResponse(body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

async function call(path) {
  const res = await handleNcm(new Request(`http://localhost${path}`));
  const text = await res.text();
  return { status: res.status, body: JSON.parse(text) };
}

let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

/* ---------------- search ---------------- */

await test("search 转成网易云搜索端点并原样返回专辑列表", async () => {
  mock(() =>
    jsonResponse({ result: { albums: [{ id: 126677649, name: "劳动之余" }] } }),
  );
  const { status, body } = await call("/api/search?keywords=%E5%8A%B3%E5%8A%A8%E4%B9%8B%E4%BD%99&type=10&limit=3");
  assert.equal(status, 200);
  assert.equal(body.result.albums[0].name, "劳动之余");
  assert.equal(calls.length, 1);
  const url = new URL(calls[0].url);
  assert.equal(url.pathname, "/api/search/get/web");
  assert.equal(url.searchParams.get("s"), "劳动之余");
  assert.equal(url.searchParams.get("type"), "10");
  assert.equal(url.searchParams.get("limit"), "3");
  assert.equal(url.searchParams.get("csrf_token"), "");
  // 不伪造 X-Real-IP / X-Forwarded-For：固定 IP 会被网易云判 406「操作频繁」
  assert.equal(calls[0].headers["X-Real-IP"], undefined);
  assert.equal(calls[0].headers["X-Forwarded-For"], undefined);
});

await test("search 缺关键词直接 400，不打上游", async () => {
  mock(() => {
    throw new Error("should not call");
  });
  const { status, body } = await call("/api/search?keywords=");
  assert.equal(status, 400);
  assert.equal(body.code, 400);
  assert.equal(calls.length, 0);
});

/* ---------------- album ---------------- */

await test("album 归一 artists/duration 并补 artistId", async () => {
  mock((url) => {
    if (url.includes("/api/album/")) {
      return jsonResponse({
        code: 200,
        album: {
          id: 126677649,
          name: "劳动之余",
          artist: { id: 12711, name: "声音玩具" },
          songs: [{ id: 1840927022, name: "爱是昂贵的", ar: [{ id: 12711 }], dt: 398000 }],
        },
      });
    }
    throw new Error("unexpected");
  });
  const { status, body } = await call("/api/album?id=126677649");
  assert.equal(status, 200);
  assert.equal(body.code, 200);
  assert.equal(body.album.artistId, 12711);
  assert.equal(body.songs.length, 1);
  assert.deepEqual(body.songs[0].artists, [{ id: 12711 }]);
  assert.equal(body.songs[0].duration, 398000);
});

await test("album 旧端点风控时退回 /api/v1/album", async () => {
  mock((url) => {
    if (url.includes("/api/album/")) return jsonResponse({ code: -462, message: "risk" });
    if (url.includes("/api/v1/album/"))
      return jsonResponse({
        code: 200,
        songs: [{ id: 1, name: "v1", ar: [], dt: 1000 }],
        album: { id: 1, name: "v1 album", artist: { id: 2 }, songs: [] },
      });
    throw new Error("unexpected");
  });
  const { body } = await call("/api/album?id=1");
  assert.equal(body.album.name, "v1 album");
  assert.equal(body.songs[0].duration, 1000);
  assert.equal(calls.length, 2);
});

await test("album id 非法直接 400", async () => {
  mock(() => {
    throw new Error("should not call");
  });
  const { status } = await call("/api/album?id=../../admin");
  assert.equal(status, 400);
  assert.equal(calls.length, 0);
});

/* ---------------- song url ---------------- */

await test("song/url/v1 批量取链并把 http 改成 https", async () => {
  mock(() =>
    jsonResponse({
      code: 200,
      data: [
        { id: 1, url: "http://m701.music.126.net/a.mp3", code: 200 },
        { id: 2, url: "", code: 200 },
      ],
    }),
  );
  const { status, body } = await call("/api/song/url/v1?id=1,2&level=exhigh");
  assert.equal(status, 200);
  assert.equal(body.data[0].url, "https://m701.music.126.net/a.mp3");
  assert.equal(body.data[1].url, null);
  const url = new URL(calls[0].url);
  assert.equal(url.pathname, "/api/song/enhance/player/url");
  assert.equal(url.searchParams.get("ids"), "[1,2]");
  assert.equal(url.searchParams.get("br"), "320000");
});

await test("song/url/v1 过滤非法 id，只把合法 id 发上游", async () => {
  mock(() => jsonResponse({ code: 200, data: [] }));
  const { status } = await call("/api/song/url/v1?id=1,abc,-2&level=exhigh");
  assert.equal(status, 200);
  assert.equal(new URL(calls[0].url).searchParams.get("ids"), "[1]");
});

/* ---------------- QR 登录 ---------------- */

await test("qr/key 走 weapi、type=1，并返回扫码会话 cookie", async () => {
  mock(() =>
    jsonResponse(
      { code: 200, unikey: "key-123" },
      { "set-cookie": "NMTID=abc123; Path=/; Max-Age=1296000" },
    ),
  );
  const { body } = await call("/api/login/qr/key");
  assert.equal(body.unikey, "key-123");
  assert.equal(body.data.unikey, "key-123");
  // 会话 cookie：种子身份 + 网易云下发的 NMTID，轮询时要带回去
  assert.match(body.cookie, /NMTID=abc123/);
  assert.match(body.cookie, /_ntes_nuid=[0-9a-f]{32}/);
  assert.match(body.cookie, /WNMCID=/);
  // 设备号与 chainId 必须成套：二维码与轮询头用的是同一个 chainId
  assert.match(body.cookie, /sDeviceId=YD-[A-Za-z0-9]{32}/);
  const sDeviceId = /sDeviceId=(YD-[A-Za-z0-9]{32})/.exec(body.cookie)[1];
  assert.match(body.chainId, /^v1_.+_web_login_\d+$/);
  assert.equal(body.chainId, `v1_${sDeviceId}_web_login_${body.chainId.split("_").pop()}`);

  const url = new URL(calls[0].url);
  assert.equal(url.pathname, "/weapi/login/qrcode/unikey");
  const form = new URLSearchParams(calls[0].body);
  assert.equal(form.get("encSecKey")?.length, 256);
  // 裸 RSA：明文是反序后的 16 位密钥字符串（不是原始随机字节），用 Node 的 RSA 交叉验证
  const secret = importedKeys[1];
  const pem = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDgtQn2JZ34ZC28NWYpAUd98iZ37BUrX/aKzmFbt7clFSs6sXqHauqKWqdtLkF2KexO40H1YTX8z2lSgBBOAxLsvaklV8k4cBFK9snQXE9/DDaFt6Rr7iVZMldczhC0JNgTz+SHXT6CBHuX3e9SdB1Ua44oncaTWz7OBGLbCiK45wIDAQAB
-----END PUBLIC KEY-----`;
  const expected = nodeCrypto
    .publicEncrypt(
      { key: pem, padding: nodeCrypto.constants.RSA_NO_PADDING },
      Buffer.concat([Buffer.alloc(112), Buffer.from([...secret].reverse().join(""))]),
    )
    .toString("hex");
  assert.equal(form.get("encSecKey"), expected);
  // 官方网页登录框用的是 type=1；用 3 时手机扫码不会进入已扫码状态
  // noCheckToken 是官方 getUuid 的原始入参
  assert.equal(JSON.parse(captured[0]).type, 1);
  assert.equal(JSON.parse(captured[0]).noCheckToken, true);
  assert.match(calls[0].headers.Cookie, /_ntes_nuid=/);
  assert.match(calls[0].headers.Cookie, /sDeviceId=YD-/);
});

await test("qr/key 限流时把 406 与原始提示透传，unikey 为空", async () => {
  mock(() => jsonResponse({ code: 406, message: "操作频繁，请稍候再试" }));
  const { status, body } = await call("/api/login/qr/key");
  assert.equal(status, 200);
  assert.equal(body.code, 406);
  assert.equal(body.unikey, "");
  assert.match(body.message, /操作频繁/);
});

await test("qr/create 生成带 chainId 的官方 scanlogin 二维码", async () => {
  mock(() => {
    throw new Error("should not call");
  });
  const chainId = "v1_YD-abcDEF0123456789_web_login_1700000000000";
  const { body } = await call(
    `/api/login/qr/create?key=key-123&chainId=${encodeURIComponent(chainId)}&qrimg=1`,
  );
  // 官方登录框的二维码内容：chainId 必须在里面，手机确认时回传
  assert.equal(
    body.data.qrurl,
    `https://music.163.com/st/platform/scanlogin?codekey=key-123&chainId=${chainId}&hdw_device=web&hdw_appid=web&hitExp=1`,
  );
  assert.match(body.data.qrimg, /^data:image\/gif;base64,[A-Za-z0-9+/=]+$/);
  assert.equal(calls.length, 0);
});

await test("qr/create 没有 chainId 时退回旧版短链", async () => {
  mock(() => {
    throw new Error("should not call");
  });
  const { body } = await call("/api/login/qr/create?key=key-123");
  assert.equal(body.data.qrurl, "http://music.163.com/login?codekey=key-123");
  assert.equal(calls.length, 0);
});

await test("qr/check 803 合并 MUSIC_U，并保留整段扫码会话", async () => {
  mock(() => {
    const headers = new Headers();
    headers.append("set-cookie", "MUSIC_U=abc123; Path=/; HttpOnly; Max-Age=1296000");
    headers.append("set-cookie", "__csrf=def456; Path=/; Max-Age=1296000");
    headers.append("set-cookie", "NMTID=expired; Path=/; Max-Age=0");
    return new Response(JSON.stringify({ code: 803, message: "授权登陆成功" }), {
      status: 200,
      headers,
    });
  });
  const session = "NMTID=keepme; _ntes_nuid=abcd1234";
  const chainId = "v1_YD-abcDEF0123456789_web_login_1700000000000";
  const { body } = await call(
    `/api/login/qr/check?key=key-123&chainId=${encodeURIComponent(chainId)}&cookie=${encodeURIComponent(session)}`,
  );
  assert.equal(body.code, 803);
  assert.match(body.cookie, /NMTID=keepme/);
  assert.match(body.cookie, /MUSIC_U=abc123/);
  assert.match(body.cookie, /__csrf=def456/);
  assert.ok(!body.cookie.includes("NMTID=expired"), "Max-Age=0 的 cookie 不应带回");

  const url = new URL(calls[0].url);
  assert.equal(url.pathname, "/weapi/login/qrcode/client/login");
  const payload = JSON.parse(captured[0]);
  assert.equal(payload.key, "key-123");
  assert.equal(payload.type, 1);
  assert.equal(payload.noCheckToken, true);
  assert.equal(payload.ydDeviceToken, "");
  // 官方 poll 的头部；chainId 必须与二维码里的一致，否则手机确认后是 8821
  assert.equal(calls[0].headers["x-login-chain-id"], chainId);
  assert.equal(calls[0].headers["X-loginMethod"], "QrCode");
  assert.equal(calls[0].headers["x-os"], "web");
  assert.equal(calls[0].headers["X-channelSource"], "undefined");
  assert.match(calls[0].headers.Cookie, /NMTID=keepme/);
  assert.ok(!calls[0].url.includes("keepme"), "cookie 只进 header，不进上游 URL");
});

await test("qr/check 803 且上游把 cookie 放在 JSON 里时也能取到", async () => {
  mock(() => jsonResponse({ code: 803, message: "授权登陆成功", cookie: "MUSIC_U=json123; __csrf=json456" }));
  const { body } = await call("/api/login/qr/check?key=key-123");
  assert.equal(body.code, 803);
  assert.match(body.cookie, /MUSIC_U=json123/);
});

await test("qr/check 8821 风控码与提示原样透传", async () => {
  mock(() => jsonResponse({ code: 8821, message: "请切换其他登录方式或升级新版本再试" }));
  const { body } = await call("/api/login/qr/check?key=key-123");
  assert.equal(body.code, 8821);
  assert.match(body.message, /切换其他登录方式/);
});

await test("qr/check 801 也回传最新会话 cookie", async () => {
  mock(() => jsonResponse({ code: 801, message: "等待扫码" }));
  const session = "NMTID=keepme; _ntes_nuid=abcd1234";
  const { body } = await call(`/api/login/qr/check?key=key-123&cookie=${encodeURIComponent(session)}`);
  assert.equal(body.code, 801);
  assert.match(body.cookie, /NMTID=keepme/);
  assert.ok(!body.cookie.includes("MUSIC_U="));
});

/* ---------------- 账号与 cookie ---------------- */

await test("cookie 只进上游 header，不进上游 URL", async () => {
  mock(() => jsonResponse({ code: 200, profile: { nickname: "n" } }));
  const { body } = await call("/api/user/account?cookie=" + encodeURIComponent("MUSIC_U=abc; __csrf=def"));
  assert.equal(body.profile.nickname, "n");
  assert.equal(calls[0].headers.Cookie, "MUSIC_U=abc; __csrf=def");
  assert.ok(!calls[0].url.includes("MUSIC_U"), "cookie 不应出现在上游 URL");
});

await test("没有 cookie 时 account 直接返回空，不请求上游", async () => {
  mock(() => {
    throw new Error("should not call");
  });
  const { body } = await call("/api/user/account");
  assert.equal(body.profile, null);
  assert.equal(calls.length, 0);
});

await test("cookie 头优先于 query（登录态不再拼进 URL）", async () => {
  mock(() => jsonResponse({ code: 200, profile: { nickname: "n" } }));
  const res = await handleNcm(
    new Request("http://localhost/api/user/account?cookie=QUERY", {
      headers: { "x-ncm-cookie": "MUSIC_U=header" },
    }),
  );
  const body = await res.json();
  assert.equal(body.profile.nickname, "n");
  assert.equal(calls[0].headers.Cookie, "MUSIC_U=header");
  assert.ok(!calls[0].url.includes("MUSIC_U"));
});

/* ---------------- 登录用户歌单 ---------------- */

await test("user/playlist 透传 uid/limit/offset 并裁剪歌单字段", async () => {
  mock(() =>
    jsonResponse({
      code: 200,
      more: true,
      playlist: [
        {
          id: 501,
          name: "我喜欢的音乐",
          coverImgUrl: "http://p1.music.126.net/a.jpg",
          trackCount: 287,
          specialType: 5,
          creator: { userId: 42, nickname: "不该透传的整个对象" },
          tracks: null,
        },
      ],
    }),
  );
  const { status, body } = await call(
    "/api/user/playlist?uid=42&limit=9999&offset=-5&cookie=" + encodeURIComponent("MUSIC_U=abc"),
  );
  assert.equal(status, 200);
  assert.equal(body.code, 200);
  assert.equal(body.more, true);
  const u = new URL(calls[0].url);
  assert.equal(u.pathname, "/api/user/playlist");
  assert.equal(u.searchParams.get("uid"), "42");
  // 上限 200、下限 0
  assert.equal(u.searchParams.get("limit"), "200");
  assert.equal(u.searchParams.get("offset"), "0");
  assert.equal(calls[0].headers.Cookie, "MUSIC_U=abc");
  assert.ok(!calls[0].url.includes("MUSIC_U"), "cookie 只进 header");
  assert.equal(body.playlist[0].cover, "https://p1.music.126.net/a.jpg");
  assert.equal(body.playlist[0].creatorId, 42);
  assert.equal(body.playlist[0].creator, undefined);
  assert.equal(body.playlist[0].tracks, undefined);
});

await test("user/playlist 无 cookie 直接返回 301，不打上游", async () => {
  mock(() => {
    throw new Error("should not call");
  });
  const { status, body } = await call("/api/user/playlist?uid=42");
  assert.equal(status, 200);
  assert.equal(body.code, 301);
  assert.deepEqual(body.playlist, []);
  assert.equal(calls.length, 0);
});

await test("user/playlist uid 非法或超长直接 400", async () => {
  mock(() => {
    throw new Error("should not call");
  });
  const bad = await call("/api/user/playlist?uid=abc&cookie=MUSIC_U%3Dx");
  assert.equal(bad.status, 400);
  const tooLong = await call(`/api/user/playlist?uid=${"1".repeat(21)}&cookie=MUSIC_U%3Dx`);
  assert.equal(tooLong.status, 400);
  assert.equal(calls.length, 0);
});

await test("playlist/track/all 走 v6 detail，归一 ar/dt 并裁掉原始字段", async () => {
  mock(() =>
    jsonResponse({
      code: 200,
      playlist: {
        id: 9,
        name: "歌单",
        coverImgUrl: "http://p1.music.126.net/c.jpg",
        trackCount: 5,
        tracks: [
          {
            id: 1,
            name: "第一首",
            ar: [{ id: 2, name: "歌手" }],
            dt: 1000,
            fee: 1,
            al: { id: 3, name: "专辑", picUrl: "http://p1.music.126.net/al.jpg" },
            privilege: { id: 1, fee: 1 },
            mv: 999,
          },
        ],
        trackIds: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }],
      },
      privileges: [{ id: 1 }],
    }),
  );
  const { status, body } = await call("/api/playlist/track/all?id=9&limit=50&cookie=MUSIC_U%3Dabc");
  assert.equal(status, 200);
  assert.equal(body.code, 200);
  const u = new URL(calls[0].url);
  assert.equal(u.pathname, "/api/v6/playlist/detail");
  assert.equal(u.searchParams.get("id"), "9");
  assert.equal(u.searchParams.get("n"), "50");
  assert.equal(calls[0].headers.Cookie, "MUSIC_U=abc");
  assert.equal(body.songs[0].name, "第一首");
  assert.deepEqual(body.songs[0].artists, [{ id: 2, name: "歌手" }]);
  assert.equal(body.songs[0].duration, 1000);
  assert.equal(body.songs[0].album.picUrl, "https://p1.music.126.net/al.jpg");
  // 原始字段必须裁掉，否则 1000 首会上 MB
  assert.equal(body.songs[0].ar, undefined);
  assert.equal(body.songs[0].privilege, undefined);
  assert.equal(body.songs[0].mv, undefined);
  assert.equal(body.privileges, undefined);
  // tracks 只有 1 条、trackIds 5 条 → 明确告诉前端被截断
  assert.equal(body.songCount, 5);
  assert.equal(body.truncated, true);
  assert.equal(body.playlist.cover, "https://p1.music.126.net/c.jpg");
});

await test("playlist/track/all 私密/不存在时透传 code，不抛 502", async () => {
  mock(() => jsonResponse({ code: 404, msg: "歌单不存在" }));
  const { status, body } = await call("/api/playlist/track/all?id=9");
  assert.equal(status, 200);
  assert.equal(body.code, 404);
  assert.equal(body.playlist, null);
  assert.equal(body.songs.length, 0);
  assert.equal(body.truncated, false);
  assert.match(body.message, /歌单不存在/);
});

await test("playlist/track/all 被重定向到登录页时返回 301 而不是 502", async () => {
  mock(() => new Response("<html>login</html>", { status: 302 }));
  const { status, body } = await call("/api/playlist/track/all?id=9");
  assert.equal(status, 200);
  assert.equal(body.code, 301);
  assert.equal(body.playlist, null);
});

await test("playlist/track/all id 非法或 offset>0 直接 400", async () => {
  mock(() => {
    throw new Error("should not call");
  });
  const badId = await call("/api/playlist/track/all?id=abc");
  assert.equal(badId.status, 400);
  const off = await call("/api/playlist/track/all?id=9&offset=10");
  assert.equal(off.status, 400);
  assert.equal(calls.length, 0);
});

/* ---------------- 边界 ---------------- */

await test("未知路由返回 404", async () => {
  mock(() => {
    throw new Error("should not call");
  });
  const { status, body } = await call("/api/whatever");
  assert.equal(status, 404);
  assert.equal(body.code, 404);
  assert.equal(calls.length, 0);
});

await test("上游异常返回 502，不泄露内部信息", async () => {
  mock(() => {
    throw new Error("boom MUSIC_U=secret");
  });
  const { status, body } = await call("/api/lyric?id=1");
  assert.equal(status, 502);
  assert.equal(body.code, -1);
  assert.ok(!JSON.stringify(body).includes("secret"));
});

globalThis.fetch = realFetch;
console.log(`\n网易云代理自检通过：${passed} 项`);
