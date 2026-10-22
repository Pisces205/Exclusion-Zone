/**
 * 板块背景的公共 WebGL2 外壳。
 * 只给 yellowdwarf / neutronstar / binary 三支新场景复用；blackhole 与 redgiant 保持原样。
 *
 * 负责：上下文与着色器、全屏三角形、uniform 缓存、自适应分辨率、可见性暂停、
 * reduced-motion 静帧、60fps 上限、销毁。场景只需要在 onFrame 里上传 uniform。
 */

import { VERT_UV } from "./glsl";

export interface FrameInfo {
  /** performance.now() */
  now: number;
  /** 秒；reduced-motion 时为 0 */
  dt: number;
  /** 场景时间（秒）；reduced-motion 时固定为 staticTime */
  t: number;
  width: number;
  height: number;
  aspect: number;
  /** 当前渲染分辨率档位 0..1 */
  quality: number;
  reducedMotion: boolean;
}

export interface FullscreenGLOptions {
  /** 组装好的 fragment shader（含 #version） */
  frag: string;
  /** 需要缓存的 uniform 名 */
  uniformNames: string[];
  /** devicePixelRatio 上限，默认 1.25 */
  dprCap?: number;
  /** 自适应分辨率阶梯，默认 [1, .85, .7, .55] */
  scales?: number[];
  /** 渲染帧率上限，默认 60 */
  maxFps?: number;
  /** 像素总量上限，默认 2.8M，护住 4K */
  maxPixels?: number;
  /** reduced-motion 时冻结到的时间戳（秒），默认 6 */
  staticTime?: number;
  /** 初始档位；默认粗指针从 .85 起 */
  startScale?: number;
  /** 测试用：覆盖系统 reduced-motion 设置 */
  reducedMotion?: boolean;
}

const DEFAULT_SCALES = [1, 0.85, 0.7, 0.55];
const DEFAULT_DPR_CAP = 1.25;
const DEFAULT_MAX_PIXELS = 2_800_000;
const DEFAULT_MAX_FPS = 60;
const DEFAULT_STATIC_TIME = 6;

const QUAD = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function isCoarsePointer(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

export class FullscreenGL {
  readonly supported: boolean;
  gl: WebGL2RenderingContext | null = null;
  /** 逐帧在场景回调里写入 uniform，再由本类 draw() */
  readonly u: Record<string, WebGLUniformLocation | null> = {};
  onFrame: ((f: FrameInfo) => void) | null = null;
  readonly stats = { frameEMA: 0, scaleIdx: 0, frames: 0 };
  readonly reducedMotion: boolean;

  private readonly canvas: HTMLCanvasElement;
  private readonly scales: number[];
  private readonly dprCap: number;
  private readonly maxFps: number;
  private readonly maxPixels: number;
  private readonly staticTime: number;
  private readonly minFrameMs: number;

  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private rafId = 0;
  private disposed = false;
  private contextLost = false;
  private elapsed = 0;
  private lastFrame = 0;
  private lastScaleChange = 0;
  private width = 1;
  private height = 1;

  constructor(canvas: HTMLCanvasElement, opts: FullscreenGLOptions) {
    this.canvas = canvas;
    this.scales = opts.scales ?? DEFAULT_SCALES;
    this.dprCap = opts.dprCap ?? DEFAULT_DPR_CAP;
    this.maxFps = opts.maxFps ?? DEFAULT_MAX_FPS;
    this.maxPixels = opts.maxPixels ?? DEFAULT_MAX_PIXELS;
    this.staticTime = opts.staticTime ?? DEFAULT_STATIC_TIME;
    this.minFrameMs = 1000 / this.maxFps - 1;
    this.reducedMotion = opts.reducedMotion ?? prefersReducedMotion();

    const coarse = isCoarsePointer();
    this.stats.scaleIdx = Math.max(
      0,
      Math.min(this.scales.length - 1, opts.startScale ?? (coarse ? 1 : 0))
    );

    this.supported = this.initGL(opts.frag, opts.uniformNames);
    if (!this.supported) return;

    this.attach();
    this.resize();
    this.lastScaleChange = typeof performance !== "undefined" ? performance.now() : 0;
  }

  /* ------------------------------------------------------------------ 初始化 */

  private compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("Shader compile error:", gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  private initGL(fragSrc: string, uniformNames: string[]): boolean {
    const gl = this.canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      powerPreference: "high-performance",
    });
    if (!gl) return false;
    this.gl = gl;

    const vs = this.compileShader(gl, gl.VERTEX_SHADER, VERT_UV);
    const fs = this.compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
    if (!vs || !fs) {
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
      return false;
    }

    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      return false;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Program link failed:", gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return false;
    }
    this.program = program;

    for (const name of uniformNames) this.u[name] = gl.getUniformLocation(program, name);

    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    if (!vao || !vbo) {
      gl.deleteProgram(program);
      this.program = null;
      return false;
    }
    this.vao = vao;
    this.vbo = vbo;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    return true;
  }

  private attach() {
    window.addEventListener("resize", this.resize);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.canvas.addEventListener("webglcontextlost", this.onContextLost);
  }

  /* ------------------------------------------------------------------ 生命周期 */

  start() {
    if (!this.supported || this.disposed) return;
    if (this.reducedMotion) {
      this.renderOnce(this.staticTime);
      return;
    }
    if (this.rafId || (typeof document !== "undefined" && document.hidden)) return;
    this.lastFrame = 0;
    this.rafId = requestAnimationFrame(this.render);
  }

  /** 手动出一帧（无头截图 / reduced-motion 静帧） */
  renderOnce(t: number) {
    if (!this.supported || this.disposed) return;
    this.elapsed = t;
    this.emitFrame(t, 0);
    this.draw();
  }

  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    this.cancel();
    // 初始化失败时从未 attach，不能去移除不存在的监听
    if (this.supported) {
      window.removeEventListener("resize", this.resize);
      document.removeEventListener("visibilitychange", this.onVisibility);
      this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    }
    const gl = this.gl;
    if (gl) {
      if (this.vbo) gl.deleteBuffer(this.vbo);
      if (this.vao) gl.deleteVertexArray(this.vao);
      if (this.program) gl.deleteProgram(this.program);
    }
    this.vbo = null;
    this.vao = null;
    this.program = null;
    this.gl = null;
  }

  /* ------------------------------------------------------------------ 循环 */

  private cancel() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  private render = (now: number) => {
    if (this.disposed || this.contextLost) return;
    this.rafId = requestAnimationFrame(this.render);

    if (this.lastFrame === 0) {
      this.lastFrame = now;
      return;
    }
    const dtMs = now - this.lastFrame;
    if (dtMs < this.minFrameMs) return;
    this.lastFrame = now;

    const dt = Math.min(0.05, dtMs / 1000);
    this.adaptResolution(now, dtMs);
    this.elapsed += dt;
    this.emitFrame(this.elapsed, dt);
    this.draw();
  };

  private emitFrame(t: number, dt: number) {
    // uniform* 要求所属 program 处于 current 状态（首帧尤其如此）
    if (this.gl && this.program) this.gl.useProgram(this.program);
    this.onFrame?.({
      now: this.elapsed,
      dt: this.reducedMotion ? 0 : dt,
      t,
      width: this.width,
      height: this.height,
      aspect: this.width / Math.max(1, this.height),
      quality: this.scales[this.stats.scaleIdx],
      reducedMotion: this.reducedMotion,
    });
  }

  draw() {
    const gl = this.gl;
    if (!gl || !this.program || !this.vao || this.contextLost) return;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.stats.frames++;
  }

  private onVisibility = () => {
    if (this.disposed || this.reducedMotion) return;
    if (document.hidden) {
      this.cancel();
    } else {
      this.lastFrame = 0;
      this.start();
    }
  };

  private onContextLost = (e: Event) => {
    e.preventDefault();
    this.contextLost = true;
    this.cancel();
  };

  /* ------------------------------------------------------------------ 分辨率 */

  private resize = () => {
    const gl = this.gl;
    if (!gl) return;
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(320, rect.width || window.innerWidth);
    const h = Math.max(320, rect.height || window.innerHeight);

    let dpr = Math.min(this.dprCap, window.devicePixelRatio || 1) * this.scales[this.stats.scaleIdx];
    if (w * dpr * h * dpr > this.maxPixels) {
      dpr *= Math.sqrt(this.maxPixels / (w * dpr * h * dpr));
    }
    this.width = Math.max(1, Math.floor(w * dpr));
    this.height = Math.max(1, Math.floor(h * dpr));
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    gl.viewport(0, 0, this.width, this.height);

    if (this.reducedMotion && !this.disposed) this.renderOnce(this.staticTime);
  };

  /** 帧时 EMA 决定画布内部分辨率：>24ms 降档，<11ms 升档（与现有场景同阈值） */
  private adaptResolution(now: number, dtMs: number) {
    this.stats.frameEMA += (Math.min(dtMs, 100) - this.stats.frameEMA) * 0.08;
    if (now - this.lastScaleChange < 2500) return;
    const idx = this.stats.scaleIdx;
    if (this.stats.frameEMA > 24 && idx < this.scales.length - 1) {
      this.stats.scaleIdx = idx + 1;
      this.lastScaleChange = now;
      this.resize();
    } else if (this.stats.frameEMA < 11 && idx > 0 && now - this.lastScaleChange > 5000) {
      this.stats.scaleIdx = idx - 1;
      this.lastScaleChange = now;
      this.resize();
    }
  }
}
