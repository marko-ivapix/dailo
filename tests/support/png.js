// Minimal PNG reader for tests: 8-bit, non-interlaced RGB (color type 2) or RGBA (6) images,
// which is what tools/generate-icons.py writes. Returns { width, height, channels, pixel(x, y) }.
const fs = require('node:fs');
const zlib = require('node:zlib');

function readPng(file) {
  const data = fs.readFileSync(file);
  if (!data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error(`${file}: not a PNG`);
  let offset = 8; let header = null; const idat = [];
  while (offset < data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.toString('ascii', offset + 4, offset + 8);
    const body = data.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') header = { width: body.readUInt32BE(0), height: body.readUInt32BE(4), depth: body[8], colorType: body[9], interlace: body[12] };
    if (type === 'IDAT') idat.push(body);
    offset += length + 12;
  }
  if (!header || header.depth !== 8 || ![2, 6].includes(header.colorType) || header.interlace) throw new Error(`${file}: unsupported PNG layout`);
  const channels = header.colorType === 6 ? 4 : 3;
  const stride = header.width * channels;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(stride * header.height);
  for (let y = 0; y < header.height; y += 1) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x += 1) {
      const value = raw[y * (stride + 1) + 1 + x];
      const left = x >= channels ? pixels[y * stride + x - channels] : 0;
      const up = y ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = y && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = (left + up) >> 1;
      else if (filter === 4) {
        const estimate = left + up - upLeft;
        const [a, b, c] = [Math.abs(estimate - left), Math.abs(estimate - up), Math.abs(estimate - upLeft)];
        predictor = a <= b && a <= c ? left : b <= c ? up : upLeft;
      }
      pixels[y * stride + x] = (value + predictor) & 255;
    }
  }
  const pixel = (x, y) => [...pixels.subarray(y * stride + x * channels, y * stride + x * channels + channels)];
  return { width: header.width, height: header.height, channels, pixel };
}

module.exports = { readPng };
