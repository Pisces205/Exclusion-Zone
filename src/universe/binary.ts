/**
 * BinaryScene —— 「作品」板块 / 双星系统。
 *
 * 画面语言：两颗不等大的恒星绕质心运行，一条向质心弯的质量转移丝连接它们；
 * 四极螺旋引力波从质心向外扩散；背景点阵被合并势阱拉弯——「不是存在引力就能诞生链接」。
 * 与黑洞吸积盘刻意拉开：没有盘、没有透镜、天体体积很小，只有轨道、丝与波纹。
 *
 * 技术：2D 解析轨道 + 6 点贝塞尔丝流 + fwidth 带限的螺旋波，单 pass。
 */

import { FullscreenGL, type FrameInfo } from "./glbase";
import { frag } from "./glsl";
import type { SectionScene, SectionSceneOptions } from "./sections";

const FRAG_BODY = /* glsl */ `
uniform vec2 u_res;
uniform float u_time;
uniform float u_intro;
uniform float u_quality;
uniform float u_orbit;
uniform float u_flow;

/* 柔光球：有可辨的球缘（smoothstep 收边），核心一个小高光，外面只留一圈很窄的晕 */
vec3 starBody(vec2 q, float R, vec3 hot, vec3 mid, float gain) {
  float s = length(q) / R;
  float disk = 1.0 - smoothstep(0.90, 1.0, s);
  float core = exp(-s * s * 3.4);
  float pin = exp(-s * s * 60.0);
  float rim = smoothstep(0.58, 0.97, s) * disk;
  float halo = exp(-max(s - 0.98, 0.0) * 6.0) * (1.0 - disk);
  vec3 body = mix(mid, hot, core);
  return (body * (disk * 0.85 + core * 1.05) + hot * pin * 0.7 + mid * rim * 0.28) * gain
       + mid * halo * 0.10;
}

void main() {
  float aspect = u_res.x / max(u_res.y, 1.0);
  vec2 p = vec2(v_uv.x * aspect, v_uv.y);
  float px = 2.0 / max(u_res.y, 1.0);
  float t = u_time;

  vec3 bg = vec3(0.027, 0.020, 0.051);       // #07050d
  vec3 violet = vec3(0.843, 0.761, 1.0);     // #d7c2ff
  vec3 white = vec3(0.957, 0.929, 1.0);      // #f4edff
  vec3 deep = vec3(0.725, 0.651, 1.0);       // #b9a6ff

  /* 质心：桌面右侧，竖屏上移收拢 */
  float compact = 1.0 - smoothstep(0.70, 0.95, aspect);
  vec2 B = mix(vec2(0.66 * aspect, 0.36), vec2(0.52 * aspect, 0.56), compact);

  /* 轨道：y 压扁 0.55，质量比 1 : 0.62（半径反比） */
  vec2 dir = vec2(cos(u_orbit), sin(u_orbit) * 0.55);
  vec2 P1 = B + dir * 0.115;
  vec2 P2 = B - dir * 0.185;
  float R1 = 0.080;
  float R2 = 0.052;

  float sep = length(P1 - P2);
  float backDim = mix(0.55, 1.0, smoothstep(0.14, 0.34, sep));
  float z = sin(u_orbit);

  vec3 cA = starBody(p - P1, R1, white, violet, 1.35);
  vec3 cB = starBody(p - P2, R2, mix(white, violet, 0.5), deep, 1.10) * backDim;
  float covA = 1.0 - smoothstep(R1 * 0.72, R1, length(p - P1));
  float covB = 1.0 - smoothstep(R2 * 0.72, R2, length(p - P2));
  float starCov = max(covA, covB);

  vec3 stars;
  if (z > 0.0) stars = cB * (1.0 - covA * 0.92) + cA;
  else stars = cA * (1.0 - covB * 0.92) + cB;

  /* 质量转移丝：向质心弯的二次贝塞尔，10 点采样；细芯 + 软晕 + 沿弧流动的珠 */
  vec2 perp = vec2(-dir.y, dir.x);
  vec2 ctrl = B + perp * 0.06;
  float bridge = 0.0;
  for (int i = 0; i < 10; i++) {
    float u = (float(i) + 0.5) / 10.0;
    vec2 pt = (1.0 - u) * (1.0 - u) * P1
            + 2.0 * (1.0 - u) * u * ctrl
            + u * u * P2;
    float dd = length(p - pt);
    float w = mix(0.024, 0.009, u);
    float bead = 0.72 + 0.28 * sin(u * 18.0 - u_flow * 3.0);
    float core = exp(-dd * dd / (w * w));
    float soft = exp(-dd * dd / (9.0 * w * w));
    bridge += (core + soft * 0.30) * mix(1.0, 0.5, u) * bead;
  }
  bridge += exp(-dot(p - P2, p - P2) / 0.0009) * 0.45;

  /* 四极引力波：双螺旋臂，fwidth 带限后向内淡出 */
  vec2 rq = p - B;
  float rr = length(rq) + 1e-4;
  float th = atan(rq.y, rq.x);
  float phase = 5.0 * log(rr + 0.18) - 2.0 * th - t * 0.35;
  float band = 1.0 - smoothstep(0.6, 1.5, fwidth(phase));
  float wave = 0.5 + 0.5 * sin(phase);
  float ripples = wave * band * exp(-rr * 1.0) * 0.22;
  if (u_quality <= 0.80) ripples *= 0.6;

  /* 被势阱拉弯的点阵 */
  vec2 toB = B - p;
  float rb = length(toB) + 1e-4;
  float pull = 0.075 * exp(-rb * 2.2);
  vec2 warped = p + (toB / rb) * pull;
  float cell = 30.0 * (2.0 / max(u_res.y, 1.0));
  vec2 gc = (floor(warped / cell) + 0.5) * cell;
  float gd = length(warped - gc);
  float dots = 1.0 - smoothstep(0.7 * px, 2.2 * px, gd);
  float near = smoothstep(0.85, 0.10, rb);
  float dotGain = (0.085 + 0.075 * near) * (1.0 - starCov);

  vec3 col = bg;
  col += stars;
  col += violet * bridge * 1.30;
  col += violet * ripples * 0.60;
  col += violet * dots * dotGain;

  col = mix(bg, col, u_intro);
  col = aces(col);
  col *= 1.0 - 0.10 * dot(v_uv, v_uv);
  col += dither(gl_FragCoord.xy);
  fragColor = vec4(col, 1.0);
}
`;

const UNIFORMS = ["u_res", "u_time", "u_intro", "u_quality", "u_orbit", "u_flow"];

export class BinaryScene implements SectionScene {
  readonly supported: boolean;
  private readonly r: FullscreenGL;
  private intro = 0;
  /** 轨道相位与丝流相位在 JS 积分，避免帧率变化时跳变 */
  private orbit = 0.9;
  private flow = 0.3;

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
    this.orbit = (this.orbit + f.dt * (Math.PI * 2 / 20)) % (Math.PI * 2);
    this.flow = (this.flow + f.dt * 0.9) % (Math.PI * 2);
    gl.uniform2f(this.r.u.u_res, f.width, f.height);
    gl.uniform1f(this.r.u.u_time, f.t);
    gl.uniform1f(this.r.u.u_intro, this.intro);
    gl.uniform1f(this.r.u.u_quality, f.quality);
    gl.uniform1f(this.r.u.u_orbit, this.orbit);
    gl.uniform1f(this.r.u.u_flow, this.flow);
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
