import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { query, tx } from '../db/pool.js';
import { config } from '../config.js';
import { ah, badRequest } from '../lib/errors.js';
import { parse, uuid } from '../lib/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadLimiter } from '../lib/limits.js';
import { saveUpload, readImage } from '../services/images.js';

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
  const img = await readImage({ query }, parse(uuid, req.params.id));
  const etag = `"${img.sha256}"`;
  res.set({
    'Content-Type': 'image/webp',
    'Cache-Control': 'public, max-age=86400',
    ETag: etag,
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  });
  if (req.get('If-None-Match') === etag) return res.status(304).end();
  res.send(img.bytes);
}));
