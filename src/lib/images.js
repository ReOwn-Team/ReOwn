export const MAX_IMAGES = 3;
const MAX_INPUT_BYTES = 25 * 1024 * 1024;

async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally { URL.revokeObjectURL(url); }
}

const toBlob = (canvas, type, q) => new Promise((res) => canvas.toBlob(res, type, q));

export async function compressImage(file, { maxSide = 1280, quality = 0.82 } = {}) {
  if (!file.type.startsWith('image/')) throw new Error(`"${file.name}" không phải ảnh`);
  if (file.size > MAX_INPUT_BYTES) throw new Error(`"${file.name}" quá lớn (tối đa 25 MB)`);
  let src;
  try { src = await decode(file); } catch { throw new Error(`Không đọc được "${file.name}" — hãy chọn ảnh JPEG, PNG hoặc WebP`); }
  const w0 = src.width, h0 = src.height;
  if (Math.min(w0, h0) < 200) throw new Error(`"${file.name}" quá nhỏ (tối thiểu 200×200)`);
  const k = Math.min(1, maxSide / Math.max(w0, h0));
  const width = Math.round(w0 * k), height = Math.round(h0 * k);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(src, 0, 0, width, height);
  src.close?.();
  let blob = await toBlob(canvas, 'image/webp', quality);
  if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', quality);
  if (!blob) throw new Error('Trình duyệt không nén được ảnh này');
  return { blob, width, height };
}

export const blobToDataUrl = (blob) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = () => rej(r.error);
  r.readAsDataURL(blob);
});
