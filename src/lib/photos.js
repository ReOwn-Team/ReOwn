import { imageSrc } from '../api/client.js';

export const coverSrc = (name) => `${import.meta.env.BASE_URL}img/products/${name}`;

/** Mọi ảnh thật của một món (ảnh tải lên, hoặc ảnh bìa mẫu) — rỗng nếu chỉ có hình minh hoạ. */
export function photoSrcs(product) {
  if (product.images?.length) return product.images.map(imageSrc);
  return product.cover ? [coverSrc(product.cover)] : [];
}
