export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export const badRequest = (msg, details) => new AppError(400, 'bad_request', msg, details);
export const unauthorized = (msg = 'Bạn cần đăng nhập') => new AppError(401, 'unauthorized', msg);
export const forbidden = (msg = 'Bạn không có quyền thực hiện thao tác này') => new AppError(403, 'forbidden', msg);
export const notFound = (msg = 'Không tìm thấy') => new AppError(404, 'not_found', msg);
export const conflict = (msg, details) => new AppError(409, 'conflict', msg, details);
export const unprocessable = (msg, details) => new AppError(422, 'unprocessable', msg, details);
export const tooMany = (msg) => new AppError(429, 'too_many_requests', msg);

export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
