/**
 * NeutronStarScene —— 「联系」板块 / 中子星（脉冲星）。
 *
 * 画面语言：近黑的星图。极小的高密度核心，一束偶极「灯塔」光扫过画面；
 * 磁力线按偶极等值线 L = r / sin²θ 描成细线；每 3.1s 一次平滑脉冲，推出两道椭圆环。
 * 与黑洞的体渲染、红巨星的球面纹理、黄矮星的雾光都不同：这里是线描 / 计量语言。
 *
 * 技术：2D 极坐标解析场，单 pass。脉冲 0.32Hz，远低于光敏风险频段。
 */

import { FullscreenGL, type FrameInfo } from "./glbase";
import { frag } from "./glsl";
import type { SectionScene, SectionSceneOptions } from "./sections";

const FRAG_BODY = /* glsl */ `
uniform vec2 u_res;
uniform float u_time;
uniform float u_intro;
uniform float u_quality;
uniform float u_beam;

void main() {
  float aspect = u_res.x / max(u_res.y, 1.0);
  vec2 p = vec2(v_uv.x * aspect, v_uv.y);
  float px = 2.0 / max(u_res.y, 1.0);
  float t = u_time;

  vec3 bg = vec3(0.016, 0.027, 0.043);       // #04070b
  vec3 tint = vec3(0.749, 0.902, 1.0);       // #bfe6ff
  vec3 coreWhite = vec3(0.96, 0.99, 1.0);

  /* 核心：桌面上偏右，竖屏上移 */
  float compact = 1.0 - smoothstep(0.70, 0.95, aspect);
  vec2 C = mix(vec2(0.68 * aspect, 0.40), vec2(0.62 * aspect, 0.60), compact);
  vec2 q = p - C;
  float r = length(q);

  float age = fract(t / 3.1);
  float flash = exp(-age * 9.0);

  /* 核心与十字星芒 */
  float core = exp(-r * r / (0.00045 + px * px * 1.5));
  float pin = 1.0 - smoothstep(0.0035, 0.0035 + px * 1.6, r);
  float halo = 0.0045 / (r + 0.0045);
  float cross = (exp(-abs(q.y) / (px * 1.3)) + exp(-abs(q.x) / (px * 1.3)))
              * exp(-r * 4.0) * 0.32;

  /* 偶极光束：sinA 对称，天然得到两瓣 */
  vec2 axis = vec2(cos(u_beam), sin(u_beam));
  float ca = clamp(dot(q, axis) / max(r, 1e-4), -1.0, 1.0);
  float sinA2 = max(0.0, 1.0 - ca * ca);
  float w = 0.030 + r * 0.013;
  float beamIn = exp(-sinA2 / (w * w)) * exp(-r * 1.15);
  float w2 = w * 2.4;
  float sheath = exp(-sinA2 / (w2 * w2)) * exp(-r * 1.9) * 0.35;
  float beamGain = 0.55 + 0.45 * flash;

  /* 脉冲环：椭圆（赤道面压扁），两道错开半个脉冲 */
  float re = length(q / vec2(1.0, 0.78));
  float a1 = age;
  float rr1 = a1 * 1.9;
  float ring1 = exp(-pow((re - rr1) / (0.006 + px * 2.0), 2.0)) * (1.0 - a1) * (1.0 - a1);
  float rings = ring1;
  if (u_quality > 0.80) {
    float a2 = fract(age + 0.5);
    float rr2 = a2 * 1.9;
    float ring2 = exp(-pow((re - rr2) / (0.006 + px * 2.0), 2.0)) * (1.0 - a2) * (1.0 - a2);
    rings += ring2;
  }

  /* 磁力线：转到磁轴坐标系，画偶极等值线 */
  float cb = cos(u_beam);
  float sb = sin(u_beam);
  vec2 mq = vec2(q.x * cb + q.y * sb, -q.x * sb + q.y * cb);
  float mr = length(mq);
  float th = atan(mq.y, mq.x);
  float s2 = max(sin(th) * sin(th), 0.010);
  float Lv = mr / s2;
  float lw = max(fwidth(Lv) * 1.4, px * 1.5);
  float lines = 1.0 - smoothstep(0.0, lw, abs(Lv - 0.22));
  lines += 1.0 - smoothstep(0.0, lw, abs(Lv - 0.36));
  if (u_quality > 0.80) lines += 1.0 - smoothstep(0.0, lw, abs(Lv - 0.55));
  lines *= exp(-mr * 1.4) * smoothstep(0.03, 0.10, mr);

  /* 极稀疏星点 */
  vec2 sp = p * 70.0;
  vec2 si = floor(sp);
  vec2 sf = fract(sp) - 0.5;
  float star = exp(-dot(sf, sf) * 26.0) * step(0.991, hash2i(ivec2(si)));

  vec3 col = bg;
  col += tint * (core * 1.6 * (1.0 + 1.2 * flash) + pin * 1.2 + halo * 0.30
              + cross + beamIn * beamGain * 0.55 + sheath * 0.22
              + rings * 0.38 + lines * 0.24);
  col += coreWhite * core * 0.9;
  col += tint * star * 0.28;

  col = mix(bg, col, u_intro);
  col = aces(col);
  col *= 1.0 - 0.10 * dot(v_uv, v_uv);
  col += dither(gl_FragCoord.xy);
  fragColor = vec4(col, 1.0);
}
`;

const UNIFORMS = ["u_res", "u_time", "u_intro", "u_quality", "u_beam"];

export class NeutronStarScene implements SectionScene {
  readonly supported: boolean;
  private readonly r: FullscreenGL;
  private intro = 0;
  /** 光束方向，JS 积分避免时间跳变 */
  private beam = 0.62;

  constructor(canvas: HTMLCanvasElement, opts: SectionSceneOptions = {}) {
    this.r = new FullscreenGL(canvas, {
      frag: frag(FRAG_BODY),
      uniformNames: UNIFORMS,
      reducedMotion: opts.reducedMotion,
    });
    this.supported = this.r.supported;
    if (!this.supported) return;
    this.r.onFrame = (f: FrameInfo) => this.frame(f);
    this.r.start();
  }

  private frame(f: FrameInfo) {
    const gl = this.r.gl;
    if (!gl) return;
    this.intro = f.reducedMotion ? 1 : Math.min(1, this.intro + f.dt / 1.8);
    this.beam = (this.beam + f.dt * 0.55) % (Math.PI * 2);
    gl.uniform2f(this.r.u.u_res, f.width, f.height);
    gl.uniform1f(this.r.u.u_time, f.t);
    gl.uniform1f(this.r.u.u_intro, this.intro);
    gl.uniform1f(this.r.u.u_quality, f.quality);
    gl.uniform1f(this.r.u.u_beam, this.beam);
  }

  get stats() {
    return this.r.stats;
  }

  debugDraw(t = 3) {
    this.intro = 1;
    this.r.renderOnce(t);
  }

  destroy() {
    this.r.destroy();
  }
}
