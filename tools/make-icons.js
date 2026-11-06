const fs = require('fs');
const zlib = require('zlib');

function crc32(buf){
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++){
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data){
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba){
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++){
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const clamp = v => Math.max(0, Math.min(1, v));
function segDist(px, py, ax, ay, bx, by){
  const dx = bx - ax, dy = by - ay;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function roundRectSDF(x, y, w, h, r){
  const dx = Math.max(Math.abs(x - w / 2) - (w / 2 - r), 0);
  const dy = Math.max(Math.abs(y - h / 2) - (h / 2 - r), 0);
  const inside = Math.min(Math.max(Math.abs(x - w / 2) - (w / 2 - r), Math.abs(y - h / 2) - (h / 2 - r)), 0);
  return Math.hypot(dx, dy) + inside;
}

function draw(size, { maskable = false } = {}){
  const buf = Buffer.alloc(size * size * 4);
  const S = size;
  const radius = maskable ? 0 : S * 0.225;
  const stroke = S * 0.085;
  const ax = S * 0.285, ay = S * 0.525;
  const bx = S * 0.437, by = S * 0.678;
  const cx = S * 0.725, cy = S * 0.365;
  for (let y = 0; y < S; y++){
    for (let x = 0; x < S; x++){
      const px = x + 0.5, py = y + 0.5;
      const bgA = maskable ? 1 : clamp(0.5 - roundRectSDF(px, py, S, S, radius));
      const t = clamp((px / S) * 0.55 + (py / S) * 0.45);
      let r = 10 + (94 - 10) * t;
      let g = 132 + (92 - 132) * t;
      let b = 255 + (230 - 255) * t;
      // мягкий блик сверху-справа
      const gr = Math.hypot(px - S * 0.86, py - S * 0.10) / (S * 0.62);
      const gl = clamp(1 - gr) ** 2 * 0.16;
      r += (255 - r) * gl; g += (255 - g) * gl; b += (255 - b) * gl;

      const d = Math.min(segDist(px, py, ax, ay, bx, by), segDist(px, py, bx, by, cx, cy));
      const cov = clamp((stroke / 2 + 0.6) - d);
      if (cov > 0){ r += (255 - r) * cov; g += (255 - g) * cov; b += (255 - b) * cov; }

      const i = (y * S + x) * 4;
      buf[i] = Math.round(r); buf[i+1] = Math.round(g); buf[i+2] = Math.round(b);
      buf[i+3] = Math.round(bgA * 255);
    }
  }
  return png(S, S, buf);
}

const out = process.argv[2];
fs.writeFileSync(out + '/icon-180.png', draw(180));
fs.writeFileSync(out + '/icon-192.png', draw(192));
fs.writeFileSync(out + '/icon-512.png', draw(512));
fs.writeFileSync(out + '/icon-maskable-512.png', draw(512, { maskable: true }));
console.log('icons ok');
