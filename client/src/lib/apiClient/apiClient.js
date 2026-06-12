// @ts-check
export class ApiError extends Error {
  constructor(code, message, status, details) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function parse(res) {
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error ?? {};
    throw new ApiError(
      e.code ?? 'INTERNAL',
      e.message ?? 'Something went wrong.',
      res.status,
      e.details,
    );
  }
  return data;
}

async function request(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return parse(res);
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  patch: (path, body) => request('PATCH', path, body),
  /** Multipart POST. No Content-Type header — the browser sets the boundary. */
  upload: async (path, formData) => parse(await fetch(`/api${path}`, { method: 'POST', body: formData })),
};
