/**
 * 生成「旅途影像」的封面（3:4，四格拼贴）——这一组已从站点撤下，脚本只作恢复用：
 * 先把 backup/影像/ 挪回 public/影像/，再跑 node scripts/build-covers.mjs。
 * 《深空行者》的封面（cover-spacetraveler.webp）不在这个脚本里生成，也不是 build-boss-art.mjs 出的：
 * 它是当时手工做出来的，生成脚本没有入库——要重做只能照着卡片 3:4 的比例重新裁一张。
 * 只依赖 sharp。
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const pub = path.join(root, "public");
const outDir = path.join(pub, "作品");
await mkdir(outDir, { recursive: true });

const W = 900;
const H = 1200;
const halfW = W / 2;
const halfH = H / 2;

const tiles = [
  { file: "影像/因斯布鲁克 (1).webp", left: 0, top: 0 },
  { file: "影像/米兰 (1).webp", left: halfW, top: 0 },
  { file: "影像/多洛米蒂 (1).webp", left: 0, top: halfH },
  { file: "影像/柏林3.webp", left: halfW, top: halfH },
];

const layers = [];
for (const t of tiles) {
  const buf = await sharp(path.join(pub, t.file))
    .resize(halfW, halfH, { fit: "cover", position: "attention" })
    .modulate({ saturation: 1.02 })
    .toBuffer();
  layers.push({ input: buf, left: t.left, top: t.top });
}

const veil = Buffer.from(
  `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0.35" stop-color="#07080d" stop-opacity="0"/>
        <stop offset="0.78" stop-color="#07080d" stop-opacity="0.42"/>
        <stop offset="1" stop-color="#07080d" stop-opacity="0.78"/>
      </linearGradient>
      <linearGradient id="a" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#ff7a4d" stop-opacity="0.16"/>
        <stop offset="0.5" stop-color="#ff7a4d" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    <rect width="${W}" height="${H}" fill="url(#a)"/>
  </svg>`
);

await sharp({
  create: { width: W, height: H, channels: 3, background: "#07080d" },
})
  .composite([...layers, { input: veil, left: 0, top: 0 }])
  .webp({ quality: 86, effort: 5 })
  .toFile(path.join(outDir, "cover-travel.webp"));

console.log("wrote public/作品/cover-travel.webp");
