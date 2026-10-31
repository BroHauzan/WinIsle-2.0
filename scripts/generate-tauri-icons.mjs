import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createPillPng(width = 32, height = 32) {
  const rowLength = 1 + width * 4;
  const rawData = Buffer.alloc(rowLength * height, 0);

  const scale = width / 32;
  const pillW = 24 * scale;
  const pillH = 12 * scale;
  const pillRadius = pillH / 2;
  const startX = (width - pillW) / 2;
  const startY = (height - pillH) / 2;
  const endX = startX + pillW;
  const endY = startY + pillH;
  const center1X = startX + pillRadius;
  const center2X = endX - pillRadius;
  const centerY = startY + pillRadius;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowLength;
    rawData[rowOffset] = 0; // Filter type 0

    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;

      let dist = 999;
      if (x < center1X) {
        dist = Math.hypot(x - center1X, y - centerY);
      } else if (x > center2X) {
        dist = Math.hypot(x - center2X, y - centerY);
      } else {
        dist = Math.abs(y - centerY);
      }

      if (dist <= pillRadius) {
        const dotDist = Math.hypot(x - (center2X - 2 * scale), y - centerY);
        if (dotDist <= 1.8 * scale) {
          rawData[pixelOffset] = 15;
          rawData[pixelOffset + 1] = 23;
          rawData[pixelOffset + 2] = 42;
          rawData[pixelOffset + 3] = 255;
        } else if (dist >= pillRadius - 1.2 * scale) {
          rawData[pixelOffset] = 255;
          rawData[pixelOffset + 1] = 255;
          rawData[pixelOffset + 2] = 255;
          rawData[pixelOffset + 3] = 230;
        } else {
          rawData[pixelOffset] = 30;
          rawData[pixelOffset + 1] = 30;
          rawData[pixelOffset + 2] = 36;
          rawData[pixelOffset + 3] = 255;
        }
      }
    }
  }

  const compressedData = zlib.deflateSync(rawData);

  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c;
  }

  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function createChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    const crc = crc32(Buffer.concat([typeBuf, data]));
    crcBuf.writeUInt32BE(crc, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6;
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdrChunk = createChunk('IHDR', ihdrData);
  const idatChunk = createChunk('IDAT', compressedData);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createIcoFromPng(pngBuffer, width, height) {
  // ICO Header: 6 bytes
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = ICO
  header.writeUInt16LE(1, 4); // 1 image

  // Directory Entry: 16 bytes
  const entry = Buffer.alloc(16);
  entry.writeUInt8(width >= 256 ? 0 : width, 0);
  entry.writeUInt8(height >= 256 ? 0 : height, 1);
  entry.writeUInt8(0, 2); // color count
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(pngBuffer.length, 8); // image size
  entry.writeUInt32LE(6 + 16, 12); // image offset

  return Buffer.concat([header, entry, pngBuffer]);
}

const iconsDir = path.join(__dirname, '..', 'src-tauri', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

const png32 = createPillPng(32, 32);
fs.writeFileSync(path.join(iconsDir, '32x32.png'), png32);

const png128 = createPillPng(128, 128);
fs.writeFileSync(path.join(iconsDir, '128x128.png'), png128);

const ico = createIcoFromPng(png32, 32, 32);
fs.writeFileSync(path.join(iconsDir, 'icon.ico'), ico);

console.log('Icons created successfully in:', iconsDir);
