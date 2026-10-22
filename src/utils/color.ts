/** 把 `#rrggbb` 加上透明度，得到 `#rrggbbaa`。多处以 star.pageBg / star.color 派生遮罩与高亮时用。 */
export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}