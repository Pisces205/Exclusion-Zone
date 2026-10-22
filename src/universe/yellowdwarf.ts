/**
 * YellowDwarfScene —— 「文字」板块 / 黄矮星。
 *
 * 画面语言：右侧被视口裁切的过曝日冕。没有可辨识的光球表面、没有硬边和颗粒，
 * 只有暖金泛光、缓慢旋转的体积光束、漂移的尘埃带，以及下半屏被热扰动折射的细横纹。
 * 与红巨星的「居中球体近景」镜像：光源在右、构图靠雾和光束，而不是恒星表面。
 *
 * 技术：纯 2D 屏幕空间解析合成，单 pass，无光线步进、无 FBO。
 * 动效：9.2s 呼吸（与 site.ts 的 pulsePeriod 对齐），无突发事件。
 */

import { FullscreenGL, type FrameInfo } from "./glbase";
import { frag } from "./glsl";
import type { SectionScene, SectionSceneOptions } from "./sections";

const FRAG_BODY = /* glsl */ `
uniform vec2 u_res;
uniform float u_time;
uniform float u_intro;
uniform float u_quality;

const float TAU = 6.28318530718;

void main() {
  float aspect = u_res.x / max(u_res.y, 1.0);
  vec2 p = vec2(v_uv.x * aspect, v_uv.y);
  float t = u_time;

  vec3 bg = vec3(0.043, 0.031, 0.012);       // #0b0803
  vec3 hot = vec3(1.0, 0.965, 0.886);        // #fff6e2
  vec3 warm = vec3(1.0, 0.808, 0.490);       // #ffce7d

  /* 光源：桌面在右缘内，竖屏推到右缘外，只留一抹弧光 */
  float compact = 1.0 - smoothstep(0.70, 0.95, aspect);
  vec2 L = mix(vec2(0.84 * aspect, 0.34), vec2(aspect + 0.10, 0.68), compact);
  float R = mix(0.48, 0.40, compact);

  vec2 q = p - L;
  float d = length(q);
  vec2 dir = q / max(d, 1e-4);

  float haze = fbm2D(p * 1.25 + vec2(t * 0.008, -t * 0.004));
  float dust = fbm2D(p * 2.10 - vec2(t * 0.006, t * 0.010));

  /* 过曝的柔光球：边缘靠雾带吃掉，不做硬轮廓 */
  float ball = 1.0 - smoothstep(R * 0.42, R * 1.06, d);
  float veil = smoothstep(0.34, 0.72, haze + 0.18 * (dust - 0.5));
  float body = ball * (0.78 + 0.22 * dust)
             * (1.0 - 0.45 * veil * smoothstep(R * 0.30, R, d));

  float ramp = smoothstep(0.0, R, d);
  vec3 sun = mix(hot, warm, ramp * ramp) * body;

  /* 近远两层泛光 + 全屏暖雾 */
  float breathe = 0.92 + 0.08 * sin(t * TAU / 9.2);
  vec3 glow = warm * (exp(-d * 3.2) * 0.85 + exp(-d * 0.85) * 0.18) * breathe;
  vec3 ambient = warm * 0.012 * (0.55 + 0.45 * haze);

  /* 体积光束：角向周期 18 次，保证 ±π 处无缝 */
  float ang = atan(dir.y, dir.x);
  float rayNoise = fbm2D(dir * 2.6 + vec2(t * 0.01, 0.0));
  float streak = 0.5 + 0.5 * sin(ang * 18.0 + rayNoise * 9.0);
  streak = pow(streak, 3.0);
  float rayFall = exp(-max(d - R * 0.35, 0.0) * 1.35);
  vec3 rays = vec3(1.0, 0.78, 0.46) * streak * (1.0 - body) * rayFall * 0.26;

  /* 下半屏的细横纹：纸张 / 大气层理，被热扰动轻微弯折 */
  float lineY = p.y * 42.0
              + 1.6 * sin(p.x * 1.7 + t * 0.50)
              + 2.4 * (fbm2D(vec2(p.x * 0.9, t * 0.06)) - 0.5);
  float striae = pow(0.5 + 0.5 * sin(lineY), 14.0);
  float lower = smoothstep(0.35, -0.85, p.y);
  float shimmer = 0.55 + 0.45 * sin(t * 1.25 + p.x * 3.0);
  vec3 lines = vec3(1.0, 0.76, 0.45) * striae * lower * shimmer * 0.085;

  vec3 col = bg + ambient + sun * 1.75 * breathe + glow + rays;
  if (u_quality > 0.80) col += lines;

  col = mix(bg, col, u_intro);
  col = aces(col);
  col *= 1.0 - 0.12 * dot(v_uv, v_uv);
  col += dither(gl_FragCoord.xy);
  fragColor = vec4(col, 1.0);
}
`;

const UNIFORMS = ["u_res", "u_time", "u_intro", "u_quality"];

export class YellowDwarfScene implements SectionScene {
  readonly supported: boolean;
  private readonly r: FullscreenGL;
  private intro = 0;

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
    gl.uniform2f(this.r.u.u_res, f.width, f.height);
    gl.uniform1f(this.r.u.u_time, f.t);
    gl.uniform1f(this.r.u.u_intro, this.intro);
    gl.uniform1f(this.r.u.u_quality, f.quality);
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
