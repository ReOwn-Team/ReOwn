import { piiHash } from '../lib/crypto.js';
import { audit } from '../lib/audit.js';
import { conflict } from '../lib/errors.js';
import { rescore } from './scoring.js';

function mockProvider(type) {
  return { ok: true, ref: `mock-${type}-${Date.now()}` };
}

export async function verify(db, { userId, type, data, ip }) {
  let docValue = null;
  if (type === 'cccd') docValue = data.number;
  if (type === 'bank') docValue = `${data.bankCode}:${data.accountNumber}`;
  if (type === 'student') docValue = `${data.school}:${data.studentId}`.toLowerCase();
  const docHash = docValue ? piiHash(type, docValue) : null;

  if (docHash) {
    const taken = (await db.query(
      "SELECT user_id FROM verifications WHERE type=$1 AND doc_hash=$2 AND status='verified' AND user_id<>$3", [type, docHash, userId])).rows[0];
    if (taken) {
      await audit(db, { actorId: userId, action: 'verify.duplicate_doc', entity: 'verification', entityId: type, ip });
      throw conflict('Không xác thực được giấy tờ này. Nếu bạn cho rằng có nhầm lẫn, hãy liên hệ bộ phận hỗ trợ.');
    }
  }
  const res = mockProvider(type);
  const last4 = docValue ? String(type === 'bank' ? data.accountNumber : type === 'cccd' ? data.number : data.studentId).slice(-4) : null;
  await db.query(
    `INSERT INTO verifications (user_id, type, status, doc_hash, doc_last4, provider_ref, verified_at)
     VALUES ($1,$2,$3,$4,$5,$6, now())
     ON CONFLICT (user_id, type) DO UPDATE SET status=EXCLUDED.status, doc_hash=EXCLUDED.doc_hash,
       doc_last4=EXCLUDED.doc_last4, provider_ref=EXCLUDED.provider_ref, verified_at=EXCLUDED.verified_at`,
    [userId, type, res.ok ? 'verified' : 'rejected', docHash, last4, res.ref]);
  if (type === 'student' && data.school) await db.query('UPDATE users SET school=$2 WHERE id=$1', [userId, data.school]);
  await audit(db, { actorId: userId, action: 'verify.' + type, entity: 'verification', entityId: type, meta: { last4 }, ip });
  await rescore(db, [userId], 'verify.' + type);
  return { type, status: res.ok ? 'verified' : 'rejected', last4 };
}
