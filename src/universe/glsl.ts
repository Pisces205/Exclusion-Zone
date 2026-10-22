/**
 * 三个板块背景共用的 GLSL 片段与组装器。
 * - 只被 yellowdwarf / neutronstar / binary 使用；blackhole 与 redgiant 保持自成一体，
 *   避免动到已经调好的画面。
 * - frag() 负责把 `#version 300 es` 放在第一行，shader 片段本身不要重复声明版本。
 */

export const GLSL_COMMON = /* glsl */ `
uint uhash(uint n) {
  n = (n ^ 61u) ^ (n >> 16u);
  n = n * 9u;
  n = n ^ (n >> 4u);
  n = n * 0x27d4eb2du;
  n = n ^ (n >> 15u);
  return n;
}

float hash2i(ivec2 p) {
  uint h = uhash(uint(p.x) + uhash(uint(p.y) + 0x9e3779b9u));
  return float(h & 0x00ffffffu) * (1.0 / 16777216.0);
}

float hash3i(ivec3 p) {
  uint h = uhash(uint(p.x) + uhash(uint(p.y) + uhash(uint(p.z) + 0x9e3779b9u)));
  return float(h & 0x00ffffffu) * (1.0 / 16777216.0);
}

float noise2D(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash2i(ivec2(i));
  float b = hash2i(ivec2(i) + ivec2(1, 0));
  float c = hash2i(ivec2(i) + ivec2(0, 1));
  float d = hash2i(ivec2(i) + ivec2(1, 1));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float noise3D(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = hash3i(ivec3(i));
  float n100 = hash3i(ivec3(i) + ivec3(1, 0, 0));
  float n010 = hash3i(ivec3(i) + ivec3(0, 1, 0));
  float n110 = hash3i(ivec3(i) + ivec3(1, 1, 0));
  float n001 = hash3i(ivec3(i) + ivec3(0, 0, 1));
  float n101 = hash3i(ivec3(i) + ivec3(1, 0, 1));
  float n011 = hash3i(ivec3(i) + ivec3(0, 1, 1));
  float n111 = hash3i(ivec3(i) + ivec3(1, 1, 1));
  return mix(
    mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
    mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
    u.z
  );
}

/** 3 octave，输出约 0..1 */
float fbm2D(vec2 p) {
  float a = 0.55;
  float s = 0.0;
  mat2 r = mat2(0.80, 0.60, -0.60, 0.80);
  for (int i = 0; i < 3; i++) {
    s += a * noise2D(p);
    p = r * p * 2.03 + vec2(11.3, 7.1);
    a *= 0.5;
  }
  return s / 0.9625;
}

float fbm3D(vec3 p) {
  float a = 0.55;
  float s = 0.0;
  mat3 r = mat3(
    0.80, 0.36, -0.48,
    -0.60, 0.80, 0.00,
    0.00, -0.48, 0.88
  );
  for (int i = 0; i < 3; i++) {
    s += a * noise3D(p);
    p = r * p * 2.03 + vec3(11.3, 7.1, 3.9);
    a *= 0.5;
  }
  return s / 0.9625;
}

/** 像素足迹过大时把噪声淡到均值，防摩尔纹 */
float lodFade(float x) {
  return 1.0 - smoothstep(0.5, 1.7, x);
}

vec3 aces(vec3 c) {
  return clamp((c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14), 0.0, 1.0);
}

float dither(vec2 fc) {
  return (hash2i(ivec2(fc)) - 0.5) * (1.0 / 255.0);
}

/** 圆形覆盖：d 到圆心距离，r 半径，px 像素尺寸 */
float covDisc(float d, float r, float px) {
  return 1.0 - smoothstep(r - px, r + px, d);
}

/** 距离场转线宽：dist 到线距离，widthPx 目标线宽（像素），px 像素尺寸 */
float lineAA(float dist, float widthPx, float px) {
  return 1.0 - smoothstep(0.0, max(widthPx * 0.5, 1.0) * px, dist);
}
`;

export const VERT_UV = /* glsl */ `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

/** 组装完整 fragment shader；body 里不要再写 #version */
export function frag(body: string): string {
  return `#version 300 es
precision highp float;
precision highp int;
in vec2 v_uv;
out vec4 fragColor;
${GLSL_COMMON}
${body}`;
}
