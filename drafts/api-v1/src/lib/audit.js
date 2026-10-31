export async function audit(db, { actorId, action, entity, entityId, meta = {}, ip }) {
  await db.query(
    'INSERT INTO audit_logs (actor_id, action, entity, entity_id, meta, ip) VALUES ($1,$2,$3,$4,$5,$6)',
    [actorId || null, action, entity, entityId ? String(entityId) : null, JSON.stringify(meta), ip || null],
  );
}
