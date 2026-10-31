import { Router } from 'express';
import { query, tx } from '../db/pool.js';
import { ah } from '../lib/errors.js';
import { parse, z, uuid } from '../lib/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { chatLimiter } from '../lib/limits.js';
import * as chat from '../services/chat.js';

const r = Router();
r.use(requireAuth);

r.post('/', chatLimiter, ah(async (req, res) => {
  const { listingId } = parse(z.object({ listingId: uuid }).strict(), req.body);
  const c = await tx((db) => chat.openConversation(db, { listingId, buyerId: req.user.id }));
  res.status(201).json(await chat.listMessages({ query }, { conversationId: c.id, userId: req.user.id }));
}));

r.get('/', ah(async (req, res) => res.json(await chat.listConversations({ query }, req.user.id))));

r.get('/:id/messages', ah(async (req, res) => {
  const { after } = parse(z.object({ after: z.coerce.number().int().min(0).default(0) }), req.query);
  res.json(await chat.listMessages({ query }, { conversationId: parse(uuid, req.params.id), userId: req.user.id, after }));
}));

r.post('/:id/messages', chatLimiter, ah(async (req, res) => {
  const { body } = parse(z.object({ body: z.string().trim().min(1).max(chat.MAX_MESSAGE) }).strict(), req.body);
  const m = await tx((db) => chat.sendMessage(db, { conversationId: parse(uuid, req.params.id), senderId: req.user.id, body }));
  res.status(201).json(m);
}));

export default r;
