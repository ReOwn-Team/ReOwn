const TARGET = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'api' ? 'http://localhost:4000' : '');
export const API_ENABLED = !!TARGET;
export const API_URL = TARGET === 'same-origin' ? '' : TARGET.replace(/\/$/, '');

let accessToken = null;
let refreshing = null;

class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || `Lỗi ${status}`);
    this.status = status;
    this.code = body?.error?.code;
    this.details = body?.error?.details;
  }
}

async function raw(path, { method = 'GET', body, blob, headers = {} } = {}) {
  const res = await fetch(API_URL + '/api' + path, {
    method,
    credentials: 'include',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(blob ? { 'Content-Type': blob.type } : {}),
      'X-ReOwn-Client': 'web',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    body: blob || (body !== undefined ? JSON.stringify(body) : undefined),
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const setAccessToken = (t) => { accessToken = t; };

export async function refreshSession() {
  if (!refreshing) {
    refreshing = raw('/auth/refresh', { method: 'POST' })
      .then((r) => { accessToken = r.accessToken; return r.user; })
      .catch(() => { accessToken = null; return null; })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

export async function api(path, opts) {
  try {
    return await raw(path, opts);
  } catch (e) {
    if (e.status === 401 && !path.startsWith('/auth/')) {
      const u = await refreshSession();
      if (u) return raw(path, opts);
    }
    throw e;
  }
}

export const uploadImage = (blob) => api('/uploads/images', { method: 'POST', blob });

export const imageSrc = (u) => (u && u.startsWith('/api/') ? API_URL + u : u);

export async function requestOtp(phone) {
  return raw('/auth/otp/request', { method: 'POST', body: { phone } });
}

export async function verifyOtp(phone, code) {
  const r = await raw('/auth/otp/verify', { method: 'POST', body: { phone, code } });
  accessToken = r.accessToken;
  return { user: r.user, created: !!r.created };
}

export async function logout() {
  await raw('/auth/logout', { method: 'POST' }).catch(() => {});
  accessToken = null;
}

export const newIdempotencyKey = () => (crypto.randomUUID?.() || String(Date.now()) + Math.random().toString(36).slice(2)).replace(/[^A-Za-z0-9_-]/g, '');
