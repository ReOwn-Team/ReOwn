import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { query, tx } from '../db/pool.js';
import { config } from '../config.js';
import { ah, badRequest } from '../lib/errors.js';
import { parse, uuid } from '../lib/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadLimiter } from '../lib/limits.js';
import { saveUpload, readImage, evidenceTokenOk } from '../services/images.js';
import { notFound } from '../lib/errors.js';

export const uploads = Router();
uploads.post('/images', requireAuth, uploadLimiter,
  express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '6mb' }),
  ah(async (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw badRequest('Gửi file ảnh JPEG, PNG hoặc WebP trong thân request');
    const out = await tx((db) => saveUpload(db, req.user.id, req.body));
    res.status(201).json(out);
  }));

export const images = Router();
const readLimiter = rateLimit({ windowMs: 60_000, limit: config.isTest ? 10_000 : 1500, standardHeaders: 'draft-7', legacyHeaders: false });
images.get('/:id', readLimiter, ah(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const img = await readImage({ query }, id);
  // Ảnh bằng chứng: không có chữ ký hợp lệ thì trả 404 như ảnh không tồn tại (không lộ việc ảnh có thật).
  if (img.dispute_id && !evidenceTokenOk(id, req.query.exp, req.query.sig)) throw notFound('Không tìm thấy ảnh');
  const etag = `"${img.sha256}"`;
  res.set({
    'Content-Type': 'image/webp',
    'Cache-Control': img.dispute_id ? 'private, max-age=3600' : 'public, max-age=86400',
    'Referrer-Policy': 'no-referrer',
    ETag: etag,
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  });
  if (req.get('If-None-Match') === etag) return res.status(304).end();
  res.send(img.bytes);
}));
