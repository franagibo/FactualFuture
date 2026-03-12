/**
 * Resize header.png to 2560px width for 1440p (2560×1440) gaming.
 * Keeps aspect ratio; uses lanczos3 for quality.
 */
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const srcPath = path.join(root, 'src', 'assets', 'UI', 'header', 'header.png');
const outPath = path.join(root, 'src', 'assets', 'UI', 'header', 'header-1440p.png');

const TARGET_WIDTH = 2560;

const image = sharp(srcPath);
const meta = await image.metadata();
const { width, height } = meta;
if (!width || !height) throw new Error('Could not read image dimensions');
const targetHeight = Math.round((height / width) * TARGET_WIDTH);

await sharp(srcPath)
  .resize(TARGET_WIDTH, targetHeight, { kernel: sharp.kernel.lanczos3 })
  .png({ effort: 6 })
  .toFile(outPath);

console.log(`Created ${TARGET_WIDTH}×${targetHeight} header at ${path.relative(root, outPath)}`);
