import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function roundedRectSdf(nx, ny, halfW, halfH, radius) {
  const qx = Math.abs(nx - 0.5) - (halfW - radius);
  const qy = Math.abs(ny - 0.5) - (halfH - radius);
  const outDist = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inDist = Math.min(Math.max(qx, qy), 0);
  return outDist + inDist - radius;
}

function rotatedEllipseDist(nx, ny, cx, cy, rx, ry, angleRad) {
  const dx = nx - cx;
  const dy = ny - cy;
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  const lx = dx * cosA + dy * sinA;
  const ly = -dx * sinA + dy * cosA;
  return Math.hypot(lx / rx, ly / ry);
}

/**
 * Samples the blue squircle bot logo at normalized coordinates (nx, ny) in [0, 1].
 */
function sampleBotLogoPixel(nx, ny, pixelSize) {
  // 1. Squircle outer mask (full-bleed rounded square)
  const cornerRadius = 0.225;
  const sdf = roundedRectSdf(nx, ny, 0.492, 0.492, cornerRadius);
  const aaWidth = 1.25 / pixelSize;
  const maskAlpha = 1 - smoothstep(-aaWidth, aaWidth, sdf);
  if (maskAlpha <= 0.001) {
    return [0, 0, 0, 0];
  }

  // 2. Top sky-blue background gradient
  let r = lerp(6, 0, clamp(ny * 1.4, 0, 1));
  let g = lerp(158, 126, clamp(ny * 1.4, 0, 1));
  let b = lerp(255, 246, clamp(ny * 1.4, 0, 1));

  // 3. White & cyan-blue glowing bot dome
  const domeCx = 0.505;
  const domeCy = 0.765;
  const domeRx = 0.578;
  const domeRy = 0.495;
  const domeDist = Math.hypot((nx - domeCx) / domeRx, (ny - domeCy) / domeRy);

  // Subtle darker azure rim shadow right above the dome curve (especially toward left/right edges)
  if (domeDist >= 0.98 && domeDist <= 1.07) {
    const edgeWeight = smoothstep(0.15, 0.48, Math.abs(nx - 0.5));
    const band = 1 - Math.abs(domeDist - 1.015) / 0.055;
    const shadowStrength = clamp(band, 0, 1) * edgeWeight * 0.28;
    r = lerp(r, 0, shadowStrength);
    g = lerp(g, 92, shadowStrength);
    b = lerp(b, 212, shadowStrength);
  }

  const domeEdgeAa = 1.6 / pixelSize;
  const domeMask = 1 - smoothstep(1 - domeEdgeAa, 1 + domeEdgeAa, domeDist);

  if (domeMask > 0.001) {
    // Inner cyan-blue radial glow inside the white dome
    const glowCx = 0.512;
    const glowCy = 0.655;
    const glowRx = 0.445;
    const glowRy = 0.365;
    const glowDist = Math.hypot((nx - glowCx) / glowRx, (ny - glowCy) / glowRy);

    const radialWhiteMix = clamp(smoothstep(0.22, 0.96, glowDist), 0, 1);

    // Outer dome rim is crisp white at top/sides and soft icy-cyan (#d8f1ff) along the bottom squircle edge
    const bottomTint = smoothstep(0.65, 0.99, ny);
    const rimR = lerp(255, 206, bottomTint);
    const rimG = lerp(255, 238, bottomTint);
    const rimB = 255;

    // Center of glow is vibrant cyan-azure (#0498ff), blending smoothly to the dome rim
    let dr = lerp(4, rimR, radialWhiteMix);
    let dg = lerp(152, rimG, radialWhiteMix);
    let db = lerp(255, rimB, radialWhiteMix);

    // 4. Two cute tilted oval eyes inside the dome
    const eyeAngle = -0.14; // ~ -8 degrees
    const eye1Cx = 0.432;
    const eye1Cy = 0.585;
    const eye1Rx = 0.082;
    const eye1Ry = 0.110;

    const eye2Cx = 0.632;
    const eye2Cy = 0.545;
    const eye2Rx = 0.080;
    const eye2Ry = 0.106;

    // Subtle soft blue drop-shadow beneath each eye
    const sh1Dist = rotatedEllipseDist(nx, ny, eye1Cx - 0.007, eye1Cy + 0.015, eye1Rx * 1.08, eye1Ry * 1.08, eyeAngle);
    const sh2Dist = rotatedEllipseDist(nx, ny, eye2Cx - 0.007, eye2Cy + 0.015, eye2Rx * 1.08, eye2Ry * 1.08, eyeAngle);
    const shDist = Math.min(sh1Dist, sh2Dist);
    if (shDist < 1.25) {
      const shStrength = (1 - smoothstep(0.75, 1.25, shDist)) * 0.26;
      dr = lerp(dr, 0, shStrength);
      dg = lerp(dg, 112, shStrength);
      db = lerp(db, 218, shStrength);
    }

    // Eye shapes with anti-aliased edges and soft icy-white inner shading
    const e1Dist = rotatedEllipseDist(nx, ny, eye1Cx, eye1Cy, eye1Rx, eye1Ry, eyeAngle);
    const e2Dist = rotatedEllipseDist(nx, ny, eye2Cx, eye2Cy, eye2Rx, eye2Ry, eyeAngle);

    const eyeAa = 1.8 / (pixelSize * 0.09);
    const e1Mask = 1 - smoothstep(1 - eyeAa, 1 + eyeAa, e1Dist);
    if (e1Mask > 0.001) {
      const shadeT = clamp(((nx - eye1Cx) / eye1Rx + (ny - eye1Cy) / eye1Ry + 1.4) / 2.8, 0, 1);
      const er = lerp(250, 200, shadeT);
      const eg = lerp(254, 238, shadeT);
      const eb = 255;
      dr = lerp(dr, er, e1Mask);
      dg = lerp(dg, eg, e1Mask);
      db = lerp(db, eb, e1Mask);
    }

    const e2Mask = 1 - smoothstep(1 - eyeAa, 1 + eyeAa, e2Dist);
    if (e2Mask > 0.001) {
      const shadeT = clamp(((nx - eye2Cx) / eye2Rx + (ny - eye2Cy) / eye2Ry + 1.4) / 2.8, 0, 1);
      const er = lerp(250, 200, shadeT);
      const eg = lerp(254, 238, shadeT);
      const eb = 255;
      dr = lerp(dr, er, e2Mask);
      dg = lerp(dg, eg, e2Mask);
      db = lerp(db, eb, e2Mask);
    }

    r = lerp(r, dr, domeMask);
    g = lerp(g, dg, domeMask);
    b = lerp(b, db, domeMask);
  }

  return [
    Math.round(clamp(r, 0, 255)),
    Math.round(clamp(g, 0, 255)),
    Math.round(clamp(b, 0, 255)),
    Math.round(clamp(maskAlpha * 255, 0, 255)),
  ];
}

export function createBotLogoPng(width = 32, height = 32) {
  const rowLength = 1 + width * 4;
  const rawData = Buffer.alloc(rowLength * height, 0);

  // 2x2 supersampling for crisp anti-aliased curves
  const subOffsets = [0.25, 0.75];

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowLength;
    rawData[rowOffset] = 0; // Filter type 0 (None)

    for (let x = 0; x < width; x++) {
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let sumA = 0;

      for (const oy of subOffsets) {
        for (const ox of subOffsets) {
          const nx = (x + ox) / width;
          const ny = (y + oy) / height;
          const [pr, pg, pb, pa] = sampleBotLogoPixel(nx, ny, width);
          sumR += pr * pa;
          sumG += pg * pa;
          sumB += pb * pa;
          sumA += pa;
        }
      }

      const pixelOffset = rowOffset + 1 + x * 4;
      const avgA = Math.round(sumA / 4);
      if (avgA > 0) {
        rawData[pixelOffset] = Math.round(sumR / sumA);
        rawData[pixelOffset + 1] = Math.round(sumG / sumA);
        rawData[pixelOffset + 2] = Math.round(sumB / sumA);
        rawData[pixelOffset + 3] = avgA;
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

export function createIcoFromPngBuffers(entries) {
  const count = entries.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const dirEntries = [];
  let dataOffset = 6 + count * 16;

  for (const { width, height, png } of entries) {
    const dir = Buffer.alloc(16);
    dir.writeUInt8(width >= 256 ? 0 : width, 0);
    dir.writeUInt8(height >= 256 ? 0 : height, 1);
    dir.writeUInt8(0, 2);
    dir.writeUInt8(0, 3);
    dir.writeUInt16LE(1, 4);
    dir.writeUInt16LE(32, 6);
    dir.writeUInt32LE(png.length, 8);
    dir.writeUInt32LE(dataOffset, 12);
    dirEntries.push(dir);
    dataOffset += png.length;
  }

  return Buffer.concat([header, ...dirEntries, ...entries.map((e) => e.png)]);
}

const outPath = path.join(__dirname, '..', 'electron', 'tray-icon.png');
const publicIconPath = path.join(__dirname, '..', 'public', 'icon.png');
const png32 = createBotLogoPng(32, 32);
const png128 = createBotLogoPng(128, 128);
const png256 = createBotLogoPng(256, 256);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, png32);

fs.mkdirSync(path.dirname(publicIconPath), { recursive: true });
fs.writeFileSync(publicIconPath, png256);

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

console.log('Generated Electron, Public & Tauri 2.0 Bot Logo icons at:', tauriIconsDir);
