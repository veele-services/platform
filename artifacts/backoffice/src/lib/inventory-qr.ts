const QR_VERSION = 5;
const QR_SIZE = 17 + QR_VERSION * 4;
const QR_DATA_CODEWORDS = 108;
const QR_ECC_CODEWORDS = 26;
const QR_MAX_BYTES = 106;
const QR_MASK = 0;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function appendBits(bits: boolean[], value: number, length: number) {
  for (let index = length - 1; index >= 0; index -= 1) {
    bits.push(((value >>> index) & 1) !== 0);
  }
}

function gfMultiply(left: number, right: number): number {
  let result = 0;
  let x = left;
  let y = right;
  while (y > 0) {
    if ((y & 1) !== 0) result ^= x;
    x <<= 1;
    if ((x & 0x100) !== 0) x ^= 0x11D;
    y >>>= 1;
  }
  return result;
}

function reedSolomonDivisor(degree: number): number[] {
  let result = [1];
  let root = 1;
  for (let index = 0; index < degree; index += 1) {
    const next = Array<number>(result.length + 1).fill(0);
    for (let coefficient = 0; coefficient < result.length; coefficient += 1) {
      next[coefficient] ^= result[coefficient];
      next[coefficient + 1] ^= gfMultiply(result[coefficient], root);
    }
    result = next;
    root = gfMultiply(root, 2);
  }
  return result.slice(1);
}

function reedSolomonRemainder(data: number[], degree: number): number[] {
  const divisor = reedSolomonDivisor(degree);
  const result = Array<number>(degree).fill(0);
  for (const value of data) {
    const factor = value ^ result.shift()!;
    result.push(0);
    for (let index = 0; index < divisor.length; index += 1) {
      result[index] ^= gfMultiply(divisor[index], factor);
    }
  }
  return result;
}

function makeCodewords(value: string): number[] {
  const bytes = Array.from(new TextEncoder().encode(value));
  if (bytes.length > QR_MAX_BYTES) {
    throw new Error(`QR-scan URL is te lang (${bytes.length}/${QR_MAX_BYTES} bytes). Configureer een kortere personeels-PWA URL.`);
  }

  const bits: boolean[] = [];
  appendBits(bits, 0b0100, 4); // byte mode
  appendBits(bits, bytes.length, 8);
  for (const byte of bytes) appendBits(bits, byte, 8);

  const capacityBits = QR_DATA_CODEWORDS * 8;
  appendBits(bits, 0, Math.min(4, capacityBits - bits.length));
  while (bits.length % 8 !== 0) bits.push(false);

  const data: number[] = [];
  for (let offset = 0; offset < bits.length; offset += 8) {
    let byte = 0;
    for (let bit = 0; bit < 8; bit += 1) {
      byte = (byte << 1) | (bits[offset + bit] ? 1 : 0);
    }
    data.push(byte);
  }

  for (let pad = 0; data.length < QR_DATA_CODEWORDS; pad += 1) {
    data.push(pad % 2 === 0 ? 0xEC : 0x11);
  }

  return [...data, ...reedSolomonRemainder(data, QR_ECC_CODEWORDS)];
}

function getFormatBits(mask: number): number {
  const errorCorrectionLevelLow = 1;
  const data = (errorCorrectionLevelLow << 3) | mask;
  let remainder = data << 10;
  for (let bit = 14; bit >= 10; bit -= 1) {
    if (((remainder >>> bit) & 1) !== 0) {
      remainder ^= 0x537 << (bit - 10);
    }
  }
  return ((data << 10) | remainder) ^ 0x5412;
}

function getBit(value: number, index: number): boolean {
  return ((value >>> index) & 1) !== 0;
}

function shouldMask(x: number, y: number): boolean {
  return ((x + y) % 2) === 0;
}

function createQrMatrix(value: string): boolean[][] {
  const modules = Array.from({ length: QR_SIZE }, () => Array<boolean>(QR_SIZE).fill(false));
  const isFunction = Array.from({ length: QR_SIZE }, () => Array<boolean>(QR_SIZE).fill(false));

  function setFunction(x: number, y: number, dark: boolean) {
    if (x < 0 || y < 0 || x >= QR_SIZE || y >= QR_SIZE) return;
    modules[y][x] = dark;
    isFunction[y][x] = true;
  }

  function setData(x: number, y: number, dark: boolean) {
    modules[y][x] = dark;
  }

  function addFinder(left: number, top: number) {
    for (let dy = -1; dy <= 7; dy += 1) {
      for (let dx = -1; dx <= 7; dx += 1) {
        const x = left + dx;
        const y = top + dy;
        const inFinder = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
        const border = dx === 0 || dx === 6 || dy === 0 || dy === 6;
        const center = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
        setFunction(x, y, inFinder && (border || center));
      }
    }
  }

  function addAlignment(centerX: number, centerY: number) {
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        setFunction(centerX + dx, centerY + dy, distance !== 1);
      }
    }
  }

  addFinder(0, 0);
  addFinder(QR_SIZE - 7, 0);
  addFinder(0, QR_SIZE - 7);
  addAlignment(30, 30);

  for (let index = 8; index < QR_SIZE - 8; index += 1) {
    const dark = index % 2 === 0;
    setFunction(6, index, dark);
    setFunction(index, 6, dark);
  }

  setFunction(8, QR_VERSION * 4 + 9, true);

  for (let index = 0; index < 8; index += 1) {
    setFunction(8, index, false);
    setFunction(index, 8, false);
    setFunction(QR_SIZE - 1 - index, 8, false);
    setFunction(8, QR_SIZE - 1 - index, false);
  }
  setFunction(8, 8, false);

  const codewords = makeCodewords(value);
  let bitIndex = 0;
  for (let right = QR_SIZE - 1; right >= 1; right -= 2) {
    if (right === 6) right -= 1;
    for (let vertical = 0; vertical < QR_SIZE; vertical += 1) {
      const upward = ((right + 1) & 2) === 0;
      const y = upward ? QR_SIZE - 1 - vertical : vertical;
      for (let column = 0; column < 2; column += 1) {
        const x = right - column;
        if (isFunction[y][x]) continue;
        const byte = codewords[Math.floor(bitIndex / 8)] ?? 0;
        let dark = ((byte >>> (7 - (bitIndex % 8))) & 1) !== 0;
        if (shouldMask(x, y)) dark = !dark;
        setData(x, y, dark);
        bitIndex += 1;
      }
    }
  }

  const formatBits = getFormatBits(QR_MASK);
  for (let index = 0; index <= 5; index += 1) setFunction(8, index, getBit(formatBits, index));
  setFunction(8, 7, getBit(formatBits, 6));
  setFunction(8, 8, getBit(formatBits, 7));
  setFunction(7, 8, getBit(formatBits, 8));
  for (let index = 9; index < 15; index += 1) setFunction(14 - index, 8, getBit(formatBits, index));
  for (let index = 0; index < 8; index += 1) setFunction(QR_SIZE - 1 - index, 8, getBit(formatBits, index));
  for (let index = 8; index < 15; index += 1) setFunction(8, QR_SIZE - 15 + index, getBit(formatBits, index));
  setFunction(8, QR_SIZE - 8, true);

  return modules;
}

export function buildInventoryScanUrl(qrToken: string, requestOrigin: string | null): string {
  const configuredBase = process.env.NEXT_PUBLIC_PERSONNEL_PWA_URL
    ?? process.env.NEXT_PUBLIC_PERSONNEL_APP_URL
    ?? process.env.NEXT_PUBLIC_APP_URL
    ?? requestOrigin;
  const base = configuredBase?.replace(/\/$/, "");
  const path = `/i/${encodeURIComponent(qrToken)}`;
  return base ? `${base}${path}` : path;
}

export function renderInventoryQrSvg(value: string, label = "Inventaris QR-code"): string {
  const matrix = createQrMatrix(value);
  const quietZone = 4;
  const moduleSize = 8;
  const size = (matrix.length + quietZone * 2) * moduleSize;
  const rects: string[] = [];

  matrix.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (!dark) return;
      rects.push(`<rect x="${(x + quietZone) * moduleSize}" y="${(y + quietZone) * moduleSize}" width="${moduleSize}" height="${moduleSize}"/>`);
    });
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="${escapeXml(label)}"><rect width="100%" height="100%" fill="#fff"/><g fill="#081D3A">${rects.join("")}</g></svg>`;
}
