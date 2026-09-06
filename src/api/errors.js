export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function stringField(value, label, max, required = true) {
  if (!required && value === undefined) return '';
  if (typeof value !== 'string' || (required && !value.trim()) || value.trim().length > max) {
    throw new HttpError(400, `${label} must be ${required ? '1–' : 'at most '}${max} characters.`);
  }
  return value.trim();
}

export async function bodyJson(request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'Send JSON data.');
  }
  // Bound the actual streamed body, not just the untrusted Content-Length header.
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'A JSON object is required.');
  const chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 65536) {
      await reader.cancel();
      throw new HttpError(413, 'This request is too large.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let body;
  try { body = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new HttpError(400, 'Invalid JSON.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'A JSON object is required.');
  return body;
}
