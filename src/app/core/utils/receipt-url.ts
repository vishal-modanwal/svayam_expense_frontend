/**
 * Public URL prefix where multer/static serve receipt files (Express: `app.use('/uploads', ...)`).
 */
export const RECEIPTS_PUBLIC_PREFIX = '/uploads';

/**
 * Builds a browser URL for a stored receipt.
 *
 * - API may return absolute URL, `/uploads/...`, `uploads/...`, or a bare filename.
 * - `uploadsOrigin` is the server **origin only** (e.g. `http://localhost:5000` or `` for same host / dev proxy).
 *   Do not pass an origin that already ends with `/uploads` or paths will double.
 */
export function resolveReceiptPublicUrl(
  receiptUrl: string | null | undefined,
  uploadsOrigin: string
): string | null {
  if (receiptUrl == null) {
    return null;
  }
  const raw = String(receiptUrl).trim();
  if (raw === '') {
    return null;
  }
  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  let path = raw.startsWith('/') ? raw : `/${raw}`;
  const lower = path.toLowerCase();
  if (lower.startsWith(`${RECEIPTS_PUBLIC_PREFIX}/`) || lower === RECEIPTS_PUBLIC_PREFIX) {
    // already /uploads/...
  } else if (!path.includes('/') || /^\/[^/]+$/.test(path)) {
    const name = path.replace(/^\//, '');
    path = `${RECEIPTS_PUBLIC_PREFIX}/${name}`;
  }

  const origin = (uploadsOrigin || '').replace(/\/$/, '');
  if (!origin) {
    return path;
  }
  return `${origin}${path}`;
}
