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

  // Pill parameters (capsule in the middle)
  const pillW = 24;
  const pillH = 12;
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
      let dist = 999;
      if (x < center1X) {
        dist = Math.hypot(x - center1X, y - centerY);
      } else if (x > center2X) {
        dist = Math.hypot(x - center2X, y - centerY);
      } else {
        dist = Math.abs(y - centerY);
      }

      if (dist <= pillRadius) {
        // Inside capsule
        // Check if inside camera punch-hole dot
        const dotDist = Math.hypot(x - (center2X - 2), y - centerY);
        if (dotDist <= 1.8) {
          // Dark camera lens
          rawData[pixelOffset] = 15;
          rawData[pixelOffset + 1] = 23;
          rawData[pixelOffset + 2] = 42;
          rawData[pixelOffset + 3] = 255;
        } else if (dist >= pillRadius - 1.2) {
          // Crisp border/glow
          rawData[pixelOffset] = 255;
          rawData[pixelOffset + 1] = 255;
          rawData[pixelOffset + 2] = 255;
          rawData[pixelOffset + 3] = 230;
        } else {
          // Sleek dark pill body
          rawData[pixelOffset] = 30;
          rawData[pixelOffset + 1] = 30;
          rawData[pixelOffset + 2] = 36;
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

const outPath = path.join(__dirname, '..', 'electron', 'tray-icon.png');
const pngBuffer = createPillPng(32, 32);
fs.writeFileSync(outPath, pngBuffer);
console.log('Generated tray icon at:', outPath, `(${pngBuffer.length} bytes)`);
