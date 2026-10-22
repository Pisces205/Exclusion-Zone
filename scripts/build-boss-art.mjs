/**
 * 把方形 Boss 原画加工成 3:4 卡片图：完整保留方图，上下用近黑底色补边，
 * 避免卡片的 object-cover 裁掉原画两侧的 HUD / 炮塔。
 * 用法：node scripts/build-boss-art.mjs "D:/Game/SpaceTraveler/art/boss/Boss1原画.png" "D:/Game/SpaceTraveler/art/boss/Boss2原画.png"
 * 输出：public/作品/SpaceTraveler/<原文件名>.webp
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const inputs = process.argv.slice(2);
if (!inputs.length) {
  console.error("usage: node scripts/build-boss-art.mjs <source.png> [...more]");
  process.exit(1);
}

const root = path.resolve(import.meta.dirname, "..");
const outDir = path.join(root, "public", "作品", "SpaceTraveler");
await mkdir(outDir, { recursive: true });

const W = 1080;
const H = 1440;
const artTop = (H - W) / 2;

for (const input of inputs) {
  const name = path.basename(input, path.extname(input));
  /* 原画的 alpha 不可信：Boss1 的 HUD / 读数只存在于 RGB 里，alpha 接近 0，
     直接 resize + 合成会把它们整片抹掉。分两步先落成无 alpha 的 PNG，
     再缩放，绕开 libvips 在 resize 时对 alpha 的预乘。 */
  const flat = await sharp(input).removeAlpha().png().toBuffer();
  const art = await sharp(flat)
    .resize(W, W, { fit: "cover" })
    .modulate({ brightness: 1.02 })
    .toBuffer();

  const out = path.join(outDir, `${name}.webp`);
  await sharp({
    create: { width: W, height: H, channels: 3, background: "#08070f" },
  })
    .composite([{ input: art, left: 0, top: artTop }])
    .webp({ quality: 84, effort: 5, smartSubsample: true })
    .toFile(out);
  console.log(`wrote ${path.relative(root, out)}`);
}
