import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createPillPng(width = 32, height = 32) {
  // Raw RGBA buffer
  // width * 4 bytes per row + 1 filter byte per row
  const rowLength = 1 + width * 4;
  const rawData = Buffer.alloc(rowLength * height, 0);

  // Scale pill proportionally to requested width/height
  const scale = width / 32;
  const pillW = Math.round(24 * scale);
  const pillH = Math.round(12 * scale);
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
    rawData[rowOffset] = 0; // Filter type 0 (None)

    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;

      // Distance from capsule
      let dist = 9999;
      if (x < center1X) {
        dist = Math.hypot(x - center1X, y - centerY);
      } else if (x > center2X) {
        dist = Math.hypot(x - center2X, y - centerY);
      } else {
        dist = Math.abs(y - centerY);
      }

      if (dist <= pillRadius) {
        // Inside capsule
        const dotDist = Math.hypot(x - (center2X - 2 * scale), y - centerY);
        if (dotDist <= 1.8 * scale) {
          // Dark camera lens
          rawData[pixelOffset] = 15;
          rawData[pixelOffset + 1] = 23;
          rawData[pixelOffset + 2] = 42;
          rawData[pixelOffset + 3] = 255;
        } else if (dist >= pillRadius - Math.max(1.2, 1.1 * scale)) {
          // Crisp border/glow
          rawData[pixelOffset] = 255;
          rawData[pixelOffset + 1] = 255;
          rawData[pixelOffset + 2] = 255;
          rawData[pixelOffset + 3] = 230;
        } else {
          // Sleek dark pill body
          rawData[pixelOffset] = 18;
          rawData[pixelOffset + 1] = 18;
          rawData[pixelOffset + 2] = 22;
          rawData[pixelOffset + 3] = 255;
        }
      }
    }
  }

  // Compress IDAT
  const compressedData = zlib.deflateSync(rawData);

  // CRC32 helper
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

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR Chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8 bits per channel
  ihdrData[9] = 6; // RGBA color type
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdrChunk = createChunk('IHDR', ihdrData);

  // IDAT Chunk
  const idatChunk = createChunk('IDAT', compressedData);

  // IEND Chunk
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createIcoFromPngBuffers(entries) {
  const count = entries.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type 1 = ICO
  header.writeUInt16LE(count, 4);

  const dirEntries = [];
  let dataOffset = 6 + count * 16;

  for (const { width, height, png } of entries) {
    const dir = Buffer.alloc(16);
    dir.writeUInt8(width >= 256 ? 0 : width, 0);
    dir.writeUInt8(height >= 256 ? 0 : height, 1);
    dir.writeUInt8(0, 2); // palette
    dir.writeUInt8(0, 3); // reserved
    dir.writeUInt16LE(1, 4); // color planes
    dir.writeUInt16LE(32, 6); // bits per pixel
    dir.writeUInt32LE(png.length, 8);
    dir.writeUInt32LE(dataOffset, 12);
    dirEntries.push(dir);
    dataOffset += png.length;
  }

  return Buffer.concat([header, ...dirEntries, ...entries.map((e) => e.png)]);
}

const outPath = path.join(__dirname, '..', 'electron', 'tray-icon.png');
const png32 = createPillPng(32, 32);
const png128 = createPillPng(128, 128);
const png256 = createPillPng(256, 256);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, png32);

const tauriIconsDir = path.join(__dirname, '..', 'src-tauri', 'icons');
fs.mkdirSync(tauriIconsDir, { recursive: true });
fs.writeFileSync(path.join(tauriIconsDir, '32x32.png'), png32);
fs.writeFileSync(path.join(tauriIconsDir, '128x128.png'), png128);
fs.writeFileSync(path.join(tauriIconsDir, '128x128@2x.png'), png256);
fs.writeFileSync(path.join(tauriIconsDir, 'icon.png'), png256);

const icoBuffer = createIcoFromPngBuffers([
  { width: 32, height: 32, png: png32 },
  { width: 256, height: 256, png: png256 },
]);
fs.writeFileSync(path.join(tauriIconsDir, 'icon.ico'), icoBuffer);

console.log('Generated Electron & Tauri 2.0 icons at:', tauriIconsDir);

