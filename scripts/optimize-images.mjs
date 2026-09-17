import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const inputDir = path.resolve("src/assets/BG");
const outDir = path.resolve("src/assets/BG/compressed");
const thumbDir = path.resolve("src/assets/BG/thumbs");

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });

const files = fs.readdirSync(inputDir).filter((f) => {
  const ext = path.extname(f).toLowerCase();
  return (ext === ".jpg" || ext === ".jpeg" || ext === ".webp" || ext === ".png") &&
    !fs.statSync(path.join(inputDir, f)).isDirectory();
});

console.log(`Processing ${files.length} images...`);

for (const file of files) {
  const baseName = path.parse(file).name;
  const inputPath = path.join(inputDir, file);
  const outPath = path.join(outDir, `${baseName}.webp`);
  const thumbPath = path.join(thumbDir, `${baseName}.webp`);

  const initialBytes = fs.statSync(inputPath).size;

  // 1. High-quality wallpaper (max 2560px, WebP quality 80)
  await sharp(inputPath)
    .resize({ width: 2560, height: 1600, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80, effort: 6 })
    .toFile(outPath);

  const compressedBytes = fs.statSync(outPath).size;

  // 2. Lightweight thumbnail for modal preview cards (width 360px, WebP quality 75)
  await sharp(inputPath)
    .resize({ width: 360, height: 225, fit: "cover" })
    .webp({ quality: 75, effort: 6 })
    .toFile(thumbPath);

  const thumbBytes = fs.statSync(thumbPath).size;

  const reduction = (((initialBytes - compressedBytes) / initialBytes) * 100).toFixed(1);
  console.log(
    `${file.padEnd(26)} | Original: ${(initialBytes / 1024).toFixed(0).padStart(5)} KB | ` +
    `WebP: ${(compressedBytes / 1024).toFixed(0).padStart(4)} KB (${reduction}% saved) | ` +
    `Thumb: ${(thumbBytes / 1024).toFixed(0).padStart(2)} KB`
  );
}

console.log("Done!");
