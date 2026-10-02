export class ApiError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}
let accessGeneration = 0;
const accessListeners = new Set();
export function onAccessFailure(listener) { accessListeners.add(listener); return () => accessListeners.delete(listener); }
function accessFailure(error) {
  if (error.status === 401 || ['APPLICATION_ACCESS_DENIED','APPLICATION_ACCESS_UNAVAILABLE'].includes(error.code)) {
    accessGeneration++;
    for (const listener of accessListeners) listener(error);
  }
  return error;
}
export async function api(path, options = {}) {
  const generation = accessGeneration;
  let response;
  try {
    response = await fetch(`/api/${path}`, {
      credentials: 'same-origin', cache: 'no-store', ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...(options.body === undefined ? {} : { body: options.body instanceof Blob ? options.body : JSON.stringify(options.body) }),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('Unable to connect. Check your connection and try again.', 0);
  }
  if (response.redirected || !response.headers.get('content-type')?.includes('application/json')) throw accessFailure(new ApiError('Your sign-in has expired. Sign in again to continue.', 401, 'AUTHENTICATION_REQUIRED'));
  const data = await response.json();
  if (!response.ok) throw accessFailure(new ApiError(data.error || 'Something went wrong. Please try again.', response.status, data.code));
  if (generation !== accessGeneration) throw new DOMException('Previous session response ignored.', 'AbortError');
  return data;
}
