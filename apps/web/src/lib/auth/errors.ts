export class AuthError extends Error {
  constructor(
    message: string,
    readonly status = 0,
    readonly fields: Record<string, string> = {},
    readonly retryAfter = 0,
  ) {
    super(message);
    this.name = "AuthError";
  }
}
export function authError(
  status: number,
  body?: unknown,
  operation?: string,
  retryAfter?: string | null,
): AuthError {
  const fields: Record<string, string> = {};
  if (
    body &&
    typeof body === "object" &&
    "errors" in body &&
    Array.isArray(body.errors)
  ) {
    const labels: Record<string, string> = {
      displayName: "Nhập tên từ 1 đến 100 ký tự.",
      email: "Nhập email hợp lệ, tối đa 254 ký tự.",
      phone: "Dùng số điện thoại quốc tế, ví dụ +84901234567.",
      password: "Mật khẩu đăng ký cần từ 12 đến 128 ký tự.",
      identifier: "Nhập email hoặc số điện thoại quốc tế hợp lệ.",
    };
    for (const item of body.errors)
      if (item && typeof item.field === "string" && labels[item.field])
        fields[item.field] = labels[item.field];
  }
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    ["HCAPTCHA_INVALID", "HCAPTCHA_UNAVAILABLE"].includes(String(body.error))
  )
    return new AuthError(
      body.error === "HCAPTCHA_INVALID"
        ? "Xác minh hCaptcha không hợp lệ hoặc đã hết hạn. Vui lòng thử lại."
        : "Chưa thể xác minh hCaptcha. Kiểm tra kết nối và thử lại.",
      status,
    );
  const messages: Record<number, string> = {
    400: "Thông tin chưa hợp lệ. Kiểm tra lại các trường đã nhập.",
    401: operation?.startsWith("otp-")
      ? "Mã không đúng, đã hết hạn hoặc đã được dùng. Kiểm tra lại hoặc yêu cầu mã mới."
      : operation === "login"
        ? "Email, số điện thoại hoặc mật khẩu không đúng."
        : "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
    403: operation
      ? "API từ chối origin của website. Kiểm tra CLIENT_ORIGIN và cấu hình cookie của backend."
      : "Bạn không có quyền thực hiện yêu cầu này.",
    409: "Không thể đăng ký bằng thông tin này. Email hoặc số điện thoại có thể đã được sử dụng.",
    429: "Bạn đã thử quá nhiều lần. Vui lòng chờ một lúc rồi thử lại.",
  };
  return new AuthError(
    messages[status] ??
      "Máy chủ chưa xử lý được yêu cầu. Vui lòng thử lại sau.",
    status,
    fields,
    status === 429 ? Math.max(1, Math.min(3600, Number(retryAfter) || 60)) : 0,
  );
}
export function errorMessage(error: unknown) {
  return error instanceof AuthError
    ? error.message
    : "Không thể kết nối API. Kiểm tra kết nối và thử lại.";
}
