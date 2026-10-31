import { describe, it, expect } from 'vitest';
import { normText, searchProducts, matchScore } from './search.js';
import { PRODUCTS } from '../apps/web/src/data/mock.js';

const top = (q) => searchProducts(q, PRODUCTS).map((x) => x.product.title);

describe('Tìm kiếm không dấu & chịu gõ sai', () => {
  it('chuẩn hoá tiếng Việt', () => {
    expect(normText('Đèn học CHỐNG cận!')).toBe('den hoc chong can');
  });
  it('gõ không dấu', () => {
    expect(top('den hoc')[0]).toMatch(/^Đèn học/);
    expect(top('noi com dien')[0]).toMatch(/^Nồi cơm điện/);
  });
  it('gõ sai chính tả / gõ dở', () => {
    expect(top('thinkpat')[0]).toMatch(/ThinkPad/);
    expect(top('macbok')[0]).toMatch(/MacBook/);
    expect(top('tai nge sony')[0]).toMatch(/Tai nghe Sony/);
    expect(top('iphon')[0]).toMatch(/iPhone/);
  });
  it('khớp tiêu đề xếp trên khớp mô tả; không trả kết quả vô nghĩa', () => {
    expect(matchScore('sony', 'Tai nghe Sony', '')).toBeGreaterThan(matchScore('sony', 'Loa JBL', 'đẹp hơn loa sony'));
    expect(top('xyz abc')).toEqual([]);
    expect(top('quat')).toEqual([expect.stringMatching(/^Quạt/)]);
  });
});
