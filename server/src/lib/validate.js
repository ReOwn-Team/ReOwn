import { z } from 'zod';
import { badRequest } from './errors.js';

export { z };

export function parse(schema, data) {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw badRequest('Dữ liệu không hợp lệ', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  return r.data;
}

export const uuid = z.string().uuid();
export const phone = z.string().regex(/^0[0-9]{9}$/, 'Số điện thoại gồm 10 số, bắt đầu bằng 0');
export const money = z.number().int().min(0).max(500_000_000);
