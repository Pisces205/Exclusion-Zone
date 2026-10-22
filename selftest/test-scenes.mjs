/**
 * 三个板块场景（黄矮星 / 中子星 / 双星）的架构自检（零外部依赖）
 * 运行：
 *   npx esbuild src/universe/sections.ts src/universe/glsl.ts \
 *     --bundle --format=esm --outdir=dist-selftest
 *   node selftest/test-scenes.mjs
 */
import {
  createSectionScene,
  hasSectionScene,
} from "../dist-selftest/sections.js";
import { frag } from "../dist-selftest/glsl.js";

const failures = [];
const SCENE_IDS = ["sun", "neutron-star", "binary"];

/* ------------------------------------------------------------------ 环境模拟 */

function makeGL() {
  const calls = [];
  const sources = [];
  const gl = {
    VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632,
    LINK_STATUS: 35714,
    COMPILE_STATUS: 35713,
    TRIANGLES: 4,
    FLOAT: 5126,
    ARRAY_BUFFER: 34962,
    STATIC_DRAW: 35044,
    createShader: (type) => ({ type }),
    shaderSource: (shader, src) => sources.push(src),
    compileShader: () => {},
    getShaderParameter: () => true,
    getShaderInfoLog: () => "",
    deleteShader: () => {},
    createProgram: () => ({ id: "prog" }),
    attachShader: () => {},
    linkProgram: () => {},
    getProgramParameter: () => true,
    getProgramInfoLog: () => "",
    deleteProgram: () => {},
    getUniformLocation: (_p, name) => ({ name }),
    getAttribLocation: () => 0,
    createVertexArray: () => ({ id: "vao" }),
    deleteVertexArray: () => {},
    bindVertexArray: () => {},
    createBuffer: () => ({ id: "vbo" }),
    deleteBuffer: () => {},
    bindBuffer: () => {},
    bufferData: () => {},
    enableVertexAttribArray: () => {},
    vertexAttribPointer: () => {},
    viewport: (x, y, w, h) => calls.push(`viewport:${w}x${h}`),
    useProgram: () => {},
    uniform1f: (loc, val) => calls.push(`u1f:${loc.name}=${val}`),
    uniform2f: (loc, a, b) => calls.push(`u2f:${loc.name}=${a},${b}`),
    drawArrays: () => calls.push("draw"),
  };
  return { gl, calls, sources };
}

const windowListeners = {};
let documentListeners = 0;
let canvasListeners = 0;
let rafCb = null;
let rafScheduled = 0;

globalThis.window = {
  innerWidth: 1440,
  innerHeight: 900,
  devicePixelRatio: 1,
  matchMedia: () => ({ matches: false }),
  addEventListener: (k, f) => {
    (windowListeners[k] ||= []).push(f);
  },
  removeEventListener: (k, f) => {
    const arr = windowListeners[k] || [];
    windowListeners[k] = arr.filter((x) => x !== f);
  },
};
globalThis.document = {
  hidden: false,
  addEventListener: () => {
    documentListeners++;
  },
  removeEventListener: () => {
    documentListeners--;
  },
};
globalThis.requestAnimationFrame = (cb) => {
  rafCb = cb;
  rafScheduled++;
  return rafScheduled;
};
globalThis.cancelAnimationFrame = () => {
  rafCb = null;
};

function makeCanvas(withGL = true) {
  const { gl, calls, sources } = makeGL();
  const canvas = {
    width: 1440,
    height: 900,
    getContext: (type) => (withGL && type === "webgl2" ? gl : null),
    getBoundingClientRect: () => ({ width: 1440, height: 900 }),
    addEventListener: () => {
      canvasListeners++;
    },
    removeEventListener: () => {
      canvasListeners--;
    },
  };
  return { canvas, calls, sources };
}

function listenerCount() {
  return (
    Object.values(windowListeners).reduce((n, arr) => n + arr.length, 0) +
    documentListeners +
    canvasListeners
  );
}

function advance(frames, stepMs = 16.6, start = 0) {
  for (let i = 0; i < frames; i++) {
    if (!rafCb) break;
    const cb = rafCb;
    cb(start + (i + 1) * stepMs);
  }
}

/* ------------------------------------------------------------------ 注册表 */

if (!SCENE_IDS.every((id) => hasSectionScene(id))) {
  failures.push("注册表缺少 sun / neutron-star / binary");
}
for (const id of ["blue-giant", "red-giant", "nope"]) {
  if (hasSectionScene(id)) failures.push(`${id} 不应注册为板块场景`);
}
{
  const { canvas } = makeCanvas();
  if (createSectionScene("nope", canvas) !== null) {
    failures.push("未知 id 应返回 null");
  }
}

/* ------------------------------------------------------------------ 无 WebGL2 降级 */

for (const id of SCENE_IDS) {
  const { canvas } = makeCanvas(false);
  const before = listenerCount();
  const scene = createSectionScene(id, canvas);
  if (!scene) {
    failures.push(`${id} 在无 WebGL2 时应返回场景对象（supported=false），而不是 null`);
    continue;
  }
  if (scene.supported !== false) failures.push(`${id} 无 WebGL2 时 supported 应为 false`);
  if (listenerCount() !== before) failures.push(`${id} 无 WebGL2 时不应注册事件监听`);
  scene.destroy();
  scene.destroy();
}

/* ------------------------------------------------------------------ 每支场景的相位、构图与生命周期 */

const EXPECTED_PHASES = {
  sun: [],
  "neutron-star": ["u_beam"],
  binary: ["u_orbit", "u_flow"],
};

for (const id of SCENE_IDS) {
  rafCb = null;
  rafScheduled = 0;
  const { canvas, calls, sources } = makeCanvas();
  const scene = createSectionScene(id, canvas);

  if (!scene || scene.supported !== true) {
    failures.push(`${id} 在有 WebGL2 时 supported 应为 true`);
    continue;
  }

  // 着色器：首行必须是 #version 300 es，且括号配平
  for (const src of sources) {
    const first = src.split("\n")[0];
    if (first.trim() !== "#version 300 es") {
      failures.push(`${id} 着色器首行不是 #version 300 es：${first}`);
    }
    const open = (src.match(/\{/g) || []).length;
    const close = (src.match(/\}/g) || []).length;
    if (open !== close) failures.push(`${id} 着色器花括号不配平（${open} / ${close}）`);
  }
  if (sources.length !== 2) failures.push(`${id} 应编译 2 个着色器，实际 ${sources.length}`);
  if (!sources.some((s) => s.includes("precision highp float;"))) {
    failures.push(`${id} 缺少 precision 声明`);
  }

  // 构造完成后会注册监听并启动循环
  if (rafScheduled !== 1) failures.push(`${id} 启动时应只调度一次 rAF，实际 ${rafScheduled}`);
  if (scene.stats.frames !== 0) failures.push(`${id} 首帧之前不应绘制`);

  advance(200);

  if (scene.stats.frames < 150) {
    failures.push(`${id} 200 帧模拟只绘制了 ${scene.stats.frames} 次`);
  }

  // 相位在 JS 积分，必须 wrap 到 [0, 2π) 且持续变化
  for (const name of EXPECTED_PHASES[id]) {
    const values = calls
      .filter((c) => c.startsWith(`u1f:${name}=`))
      .map((c) => Number(c.split("=")[1]));
    if (values.length < 100) {
      failures.push(`${id} ${name} 未逐帧更新`);
      continue;
    }
    if (new Set(values).size < 2) failures.push(`${id} ${name} 始终不变`);
    if (values.some((v) => !(v >= 0 && v < 6.2832))) {
      failures.push(`${id} ${name} 未 wrap 到 [0, 2π)`);
    }
  }

  // intro 淡入应在 ~1.8s 后到 1
  const intros = calls
    .filter((c) => c.startsWith("u1f:u_intro="))
    .map((c) => Number(c.split("=")[1]));
  if (intros.length) {
    if (Math.abs(intros[0] - 0) > 0.5) failures.push(`${id} intro 起始值应接近 0`);
    if (intros[intros.length - 1] < 0.999) failures.push(`${id} intro 未淡入到 1`);
  } else {
    failures.push(`${id} 未上传 u_intro`);
  }

  // resize 监听存在，销毁后全部移除
  const beforeDestroy = listenerCount();
  if (beforeDestroy === 0) failures.push(`${id} 未注册任何监听`);
  scene.destroy();
  if (listenerCount() !== 0) failures.push(`${id} 销毁后仍有 ${listenerCount()} 个监听`);
  if (scene.stats) {
    const frames = scene.stats.frames;
    rafCb?.(10_000);
    if (scene.stats.frames !== frames) failures.push(`${id} 销毁后仍会绘制`);
  }
}

/* ------------------------------------------------------------------ reduced-motion 静帧 */

for (const id of SCENE_IDS) {
  rafCb = null;
  rafScheduled = 0;
  const { canvas, calls } = makeCanvas();
  const scene = createSectionScene(id, canvas, { reducedMotion: true });

  if (!scene || !scene.supported) {
    failures.push(`${id} reduced-motion 下应可用`);
    continue;
  }
  if (rafScheduled !== 0) failures.push(`${id} reduced-motion 下不应启动 rAF`);
  if (scene.stats.frames < 1) failures.push(`${id} reduced-motion 下应至少出一帧静帧`);

  const tValues = calls
    .filter((c) => c.startsWith("u1f:u_time="))
    .map((c) => Number(c.split("=")[1]));
  if (!tValues.every((v) => v === 6)) {
    failures.push(`${id} reduced-motion 的 u_time 应固定为 staticTime=6`);
  }

  const before = scene.stats.frames;
  scene.debugDraw?.(3);
  if (scene.stats.frames !== before + 1) {
    failures.push(`${id} debugDraw 应恰好增加一次绘制`);
  }
  scene.destroy();
}

/* ------------------------------------------------------------------ 组装器 */

{
  const src = frag("void main() { fragColor = vec4(1.0); }");
  if (src.split("\n")[0] !== "#version 300 es") failures.push("frag() 首行不是 #version 300 es");
  if (!src.includes("precision highp float;")) failures.push("frag() 缺少 precision");
  const open = (src.match(/\{/g) || []).length;
  const close = (src.match(/\}/g) || []).length;
  if (open !== close) failures.push("frag() 花括号不配平");
}

if (failures.length) {
  console.log("\n发现问题:");
  for (const f of failures) console.log("  ✗ " + f);
  process.exit(1);
}
console.log("三个板块场景自检全部通过");
