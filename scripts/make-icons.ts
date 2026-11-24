/**
 * Writes the icon files in public/ from the SVGs in brand/. Run with `npm run icons`.
 *   favicon.svg            copy of brand/favicon.svg (switches colours with prefers-color-scheme)
 *   favicon.ico            16, 32 and 48 px, light-scheme colours on a transparent background
 *   apple-touch-icon.png   180 px, square: iOS rounds the corners itself and shows transparency as black
 *   icon-192.png, icon-512.png   web manifest icons, rounded square on a transparent background
 */
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium, type Browser } from '@playwright/test';

const TEAL = '#0E6E68';

async function png(browser: Browser, svg: string, size: number, background = 'transparent'): Promise<Buffer> {
  const page = await browser.newPage({ viewport: { width: size, height: size }, colorScheme: 'light' });
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  await page.setContent(
    `<style>html,body{margin:0;background:${background}}img{display:block;width:${size}px;height:${size}px}</style><img src="${src}">`,
  );
  await page.waitForFunction(() => document.querySelector('img')!.complete);
  const shot = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
  return shot;
}

/** An .ico file whose images are stored as PNG (read by every browser that still asks for /favicon.ico). */
function ico(images: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const dir = Buffer.alloc(16 * images.length);
  let offset = header.length + dir.length;
  images.forEach(({ size, data }, i) => {
    const at = 16 * i;
    dir.writeUInt8(size, at);
    dir.writeUInt8(size, at + 1);
    dir.writeUInt16LE(1, at + 4);
    dir.writeUInt16LE(32, at + 6);
    dir.writeUInt32LE(data.length, at + 8);
    dir.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([header, dir, ...images.map(i => i.data)]);
}

const favicon = readFileSync('brand/favicon.svg', 'utf8');
const appIcon = readFileSync('brand/app-icon.svg', 'utf8');

const browser = await chromium.launch();
try {
  copyFileSync('brand/favicon.svg', 'public/favicon.svg');
  const sizes = [16, 32, 48];
  const images = await Promise.all(sizes.map(async size => ({ size, data: await png(browser, favicon, size) })));
  writeFileSync('public/favicon.ico', ico(images));
  writeFileSync('public/apple-touch-icon.png', await png(browser, appIcon, 180, TEAL));
  writeFileSync('public/icon-192.png', await png(browser, appIcon, 192));
  writeFileSync('public/icon-512.png', await png(browser, appIcon, 512));
} finally {
  await browser.close();
}
