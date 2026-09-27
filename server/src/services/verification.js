import { piiHash } from '../lib/crypto.js';
import { audit } from '../lib/audit.js';
import { conflict, AppError } from '../lib/errors.js';
import { config } from '../config.js';
import { rescore } from './scoring.js';

/**
 * Đối tác xác thực giả lập: duyệt mọi giấy tờ. Chỉ dùng ở bản demo / máy dev. Ngoài môi trường đó, xác thực CCCD, ngân hàng
 * mở trả sau và rút tiền — duyệt bừa là cho phép gian lận, nên đóng tính năng cho tới khi tích hợp đối tác eKYC thật.
 */
function mockProvider(type) {
  if (!config.devTools && !config.demoDeployment) {
    throw new AppError(503, 'provider_unavailable', 'Chưa tích hợp đối tác xác thực giấy tờ, tính năng tạm đóng');
  }
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
