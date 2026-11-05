export type ImageType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif';

export interface ImageInfo {
  mimeType: ImageType;
  extension: 'jpg' | 'png' | 'webp' | 'avif';
  width: number | null;
  height: number | null;
}

/**
 * Identifies an uploaded image from its bytes (never from the file name or the declared type) and
 * reads its dimensions. Only raster formats are accepted: SVG can carry scripts.
 */
export function inspectImage(data: Uint8Array): ImageInfo | null {
  const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (buf.length < 16) return null;

  if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') {
    if (buf.toString('ascii', 12, 16) !== 'IHDR' || buf.length < 24) return null;
    return {
      mimeType: 'image/png',
      extension: 'png',
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20),
    };
  }

  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    const size = jpegSize(buf);
    return {
      mimeType: 'image/jpeg',
      extension: 'jpg',
      width: size?.width ?? null,
      height: size?.height ?? null,
    };
  }

  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const size = webpSize(buf);
    return {
      mimeType: 'image/webp',
      extension: 'webp',
      width: size?.width ?? null,
      height: size?.height ?? null,
    };
  }

  if (
    buf.toString('ascii', 4, 8) === 'ftyp' &&
    ['avif', 'avis'].includes(buf.toString('ascii', 8, 12))
  ) {
    return { mimeType: 'image/avif', extension: 'avif', width: null, height: null };
  }
  return null;
}

function jpegSize(buf: Buffer): { width: number; height: number } | null {
  let offset = 2;
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) return null;
    const marker = buf[offset + 1]!;
    // Start-of-frame markers carry the dimensions (excluding DHT, JPG and DAC).
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    offset += 2 + buf.readUInt16BE(offset + 2);
  }
  return null;
}

function webpSize(buf: Buffer): { width: number; height: number } | null {
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8 ' && buf.length >= 30)
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  if (chunk === 'VP8L' && buf.length >= 25) {
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X' && buf.length >= 30)
    return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
  return null;
}
