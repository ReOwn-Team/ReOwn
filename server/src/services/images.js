import crypto from 'node:crypto';
import sharp from 'sharp';
import { lockUser } from './ledger.js';
import { unprocessable, notFound } from '../lib/errors.js';

const MAX_IMAGES_PER_LISTING = 3;
const MAX_PENDING_PER_USER = 9;
const MAX_SIDE = 1280;
const MAX_INPUT_PIXELS = 40_000_000;

sharp.cache(false);

function sniff(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

async function processImage(buf) {
  if (!sniff(buf)) throw unprocessable('Chỉ nhận ảnh JPEG, PNG hoặc WebP');
  try {
    const { data, info } = await sharp(buf, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error', animated: false })
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    if (info.width < 200 || info.height < 200) throw unprocessable('Ảnh quá nhỏ (tối thiểu 200×200)');
    return { data, width: info.width, height: info.height, sha256: crypto.createHash('sha256').update(data).digest('hex') };
  } catch (e) {
    if (e.status) throw e;
    throw unprocessable('Không đọc được ảnh — file hỏng hoặc quá lớn');
  }
}

const imageUrl = (id) => `/api/images/${id}`;

export async function saveUpload(db, ownerId, buf) {
  await lockUser(db, ownerId);
  const pending = (await db.query(
    'SELECT COUNT(*)::int AS c FROM listing_images WHERE owner_id=$1 AND listing_id IS NULL AND dispute_id IS NULL', [ownerId])).rows[0].c;
  if (pending >= MAX_PENDING_PER_USER) throw unprocessable('Bạn có quá nhiều ảnh chưa dùng — hãy đăng tin hoặc đợi ảnh cũ tự xoá sau 1 ngày');
  const img = await processImage(buf);
  const row = (await db.query(
    `INSERT INTO listing_images (owner_id, mime, bytes, width, height, sha256)
     VALUES ($1,'image/webp',$2,$3,$4,$5) RETURNING id, width, height`,
    [ownerId, img.data, img.width, img.height, img.sha256])).rows[0];
  return { id: row.id, url: imageUrl(row.id), width: row.width, height: row.height };
}

export async function attachImages(db, { listingId, ownerId, ids = [] }) {
  const unique = [...new Set(ids)];
  if (unique.length !== ids.length) throw unprocessable('Danh sách ảnh bị trùng');
  if (unique.length > MAX_IMAGES_PER_LISTING) throw unprocessable(`Mỗi tin tối đa ${MAX_IMAGES_PER_LISTING} ảnh`);
  if (!unique.length) return [];
  const own = (await db.query(
    'SELECT id FROM listing_images WHERE id = ANY($1::uuid[]) AND owner_id=$2 AND listing_id IS NULL AND dispute_id IS NULL FOR UPDATE',
    [unique, ownerId])).rows;
  if (own.length !== unique.length) throw unprocessable('Ảnh không hợp lệ hoặc đã được dùng cho tin khác');
  for (let i = 0; i < unique.length; i++) {
    await db.query('UPDATE listing_images SET listing_id=$2, position=$3 WHERE id=$1', [unique[i], listingId, i]);
  }
  return unique.map(imageUrl);
}

export async function setListingImages(db, { listingId, ownerId, ids }) {
  const unique = [...new Set(ids)];
  if (unique.length !== ids.length) throw unprocessable('Danh sách ảnh bị trùng');
  if (unique.length > MAX_IMAGES_PER_LISTING) throw unprocessable(`Mỗi tin tối đa ${MAX_IMAGES_PER_LISTING} ảnh`);
  const ok = (await db.query(
    `SELECT id FROM listing_images WHERE id = ANY($1::uuid[]) AND owner_id=$2
        AND (listing_id=$3 OR (listing_id IS NULL AND dispute_id IS NULL)) FOR UPDATE`, [unique, ownerId, listingId])).rows;
  if (ok.length !== unique.length) throw unprocessable('Ảnh không hợp lệ hoặc đã được dùng cho tin khác');
  await db.query('DELETE FROM listing_images WHERE listing_id=$1 AND NOT (id = ANY($2::uuid[]))', [listingId, unique]);
  await db.query('UPDATE listing_images SET listing_id=NULL, position=NULL WHERE listing_id=$1', [listingId]);
  for (let i = 0; i < unique.length; i++) {
    await db.query('UPDATE listing_images SET listing_id=$2, position=$3 WHERE id=$1', [unique[i], listingId, i]);
  }
  return unique.map(imageUrl);
}

export async function imagesFor(db, listingIds) {
  if (!listingIds.length) return {};
  const rows = (await db.query(
    'SELECT id, listing_id FROM listing_images WHERE listing_id = ANY($1::uuid[]) ORDER BY listing_id, position', [listingIds])).rows;
  const out = {};
  for (const r of rows) (out[r.listing_id] ||= []).push(imageUrl(r.id));
  return out;
}

export async function readImage(db, id) {
  const r = (await db.query(
    `SELECT i.bytes, i.sha256 FROM listing_images i LEFT JOIN listings l ON l.id = i.listing_id
      WHERE i.id=$1 AND (l.status <> 'hidden' OR i.dispute_id IS NOT NULL)`, [id])).rows[0];
  if (!r) throw notFound('Không tìm thấy ảnh');
  return r;
}

export const MAX_EVIDENCE = 3;

/** Ảnh bằng chứng khi khiếu nại: người mua tải lên trước (như ảnh tin đăng) rồi gắn vào tranh chấp. */
export async function attachEvidence(db, { disputeId, ownerId, ids = [] }) {
  const unique = [...new Set(ids)];
  if (!unique.length) return [];
  if (unique.length > MAX_EVIDENCE) throw unprocessable(`Tối đa ${MAX_EVIDENCE} ảnh bằng chứng`);
  const r = await db.query(
    `UPDATE listing_images SET dispute_id=$2 WHERE id = ANY($1::uuid[]) AND owner_id=$3
        AND listing_id IS NULL AND dispute_id IS NULL`, [unique, disputeId, ownerId]);
  if (r.rowCount !== unique.length) throw unprocessable('Ảnh bằng chứng không hợp lệ hoặc đã được dùng');
  return unique.map(imageUrl);
}

export async function evidenceFor(db, disputeIds) {
  if (!disputeIds.length) return {};
  const rows = (await db.query(
    'SELECT id, dispute_id, owner_id FROM listing_images WHERE dispute_id = ANY($1::uuid[]) ORDER BY created_at', [disputeIds])).rows;
  const out = {};
  for (const r of rows) (out[r.dispute_id] ||= []).push({ url: imageUrl(r.id), ownerId: r.owner_id });
  return out;
}
