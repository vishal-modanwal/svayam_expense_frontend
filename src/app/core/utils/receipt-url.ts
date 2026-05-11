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

/**
 * GET /api/expense/my-expenses — each row has `receipt_path` (filename or null).
 * Join: `{API_BASE}/uploads/{receipt_path}` (e.g. `http://localhost:5000/api/uploads/receipt-abc.pdf`).
 */
export function buildReceiptUrlFromReceiptPath(
  receiptPath: string | null | undefined,
  apiBaseUrl: string
): string | null {
  if (receiptPath == null) {
    return null;
  }
  const raw = String(receiptPath).trim();
  if (raw === '' || /^null$/i.test(raw)) {
    return null;
  }
  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }
  const base = (apiBaseUrl || '').replace(/\/$/, '');
  if (!base) {
    const name0 = raw.replace(/^\/+/, '').replace(/\\/g, '/');
    const tail = name0
      .split('/')
      .filter((s) => s && s !== '.' && s !== '..')
      .map((seg) => encodeReceiptPathSegment(seg))
      .join('/');
    return tail ? `${RECEIPTS_PUBLIC_PREFIX}/${tail}` : null;
  }
  const name = raw.replace(/^\/+/, '').replace(/\\/g, '/');
  const safe = name
    .split('/')
    .filter((s) => s && s !== '.' && s !== '..')
    .map((seg) => encodeReceiptPathSegment(seg))
    .join('/');
  if (!safe) {
    return null;
  }
  return `${base}/uploads/${safe}`;
}

/** Encode only when needed; avoid double-encoding already-safe `%HH` segments from APIs. */
function encodeReceiptPathSegment(seg: string): string {
  if (/^[a-zA-Z0-9._-]+$/.test(seg)) {
    return seg;
  }
  try {
    return encodeURIComponent(decodeURIComponent(seg));
  } catch {
    return encodeURIComponent(seg);
  }
}

/** Reads receipt path/url from API row shapes (flat or nested `receipt`). Prefer `receipt_path` in new APIs. */
export function pickExpenseRowReceiptRaw(row: Record<string, unknown>): string | null {
  const asStr = (v: unknown): string | null => {
    if (v == null) {
      return null;
    }
    const s = String(v).trim();
    return s === '' ? null : s;
  };
  for (const k of [
    'receipt_path',
    'receiptPath',
    'receipt_url',
    'receiptUrl',
    'attachment_url',
    'attachmentUrl',
    'file_url',
    'fileUrl',
    'receipt_file',
    'receiptFile'
  ]) {
    const hit = asStr(row[k]);
    if (hit) {
      return hit;
    }
  }
  const r = row['receipt'];
  if (typeof r === 'string') {
    return asStr(r);
  }
  if (r && typeof r === 'object') {
    const o = r as Record<string, unknown>;
    const nested = asStr(o['url'] ?? o['path'] ?? o['file_url'] ?? o['fileUrl'] ?? o['receipt_url'] ?? o['receiptUrl']);
    if (nested) {
      return nested;
    }
  }
  for (const key of Object.keys(row)) {
    if (!/(receipt|attachment|upload|invoice)/i.test(key)) {
      continue;
    }
    if (/has_?receipt|receipt_?count|receiptid$/i.test(key)) {
      continue;
    }
    const hit = asStr(row[key]);
    if (!hit || hit.length > 2048) {
      continue;
    }
    if (
      /^https?:\/\//i.test(hit) ||
      hit.startsWith('/') ||
      /\.(pdf|png|jfif|jpe?g|gif|webp|heif|heic|bmp)(\?|$)/i.test(hit)
    ) {
      return hit;
    }
  }
  return null;
}

function isAbsoluteHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim());
}

/** Strip leading `/` and optional `uploads/` so value is safe for `{api}/uploads/{value}`. */
function stripUploadsPrefixPath(s: string): string {
  let t = s.trim().replace(/^\/+/, '').replace(/\\/g, '/');
  if (/^uploads\//i.test(t)) {
    t = t.replace(/^uploads\//i, '');
  }
  return t;
}

/**
 * Storage path for list rows (filename / relative key under uploads).
 * Tries canonical `receipt_path` plus common API aliases; skips values that look like full `http(s)` URLs.
 */
export function listRowReceiptPath(row: Record<string, unknown>): string | null {
  const asStr = (v: unknown): string | null => {
    if (v == null) {
      return null;
    }
    const s = String(v).trim();
    return s === '' || /^null$/i.test(s) ? null : s;
  };

  const takePathLike = (raw: string | null): string | null => {
    if (!raw) {
      return null;
    }
    if (isAbsoluteHttpUrl(raw)) {
      return null;
    }
    return stripUploadsPrefixPath(raw);
  };

  const flatKeys = [
    'receipt_path',
    'receiptPath',
    'ReceiptPath',
    'receipt_file',
    'receiptFile',
    'attachment',
    'attachment_path',
    'attachmentPath',
    'file',
    'file_name',
    'fileName',
    'filename',
    'invoice_path',
    'invoicePath'
  ];
  for (const k of flatKeys) {
    const v = takePathLike(asStr(row[k]));
    if (v) {
      return v;
    }
  }

  // Misnamed: some APIs put a filename in `receipt_url` (not a full URL).
  for (const k of ['receipt_url', 'receiptUrl', 'ReceiptUrl']) {
    const v = takePathLike(asStr(row[k]));
    if (v) {
      return v;
    }
  }

  const rec = row['receipt'];
  if (typeof rec === 'string') {
    const v = takePathLike(asStr(rec));
    if (v) {
      return v;
    }
  }
  if (rec && typeof rec === 'object') {
    const o = rec as Record<string, unknown>;
    const nested = takePathLike(asStr(o['path'] ?? o['receipt_path'] ?? o['filename'] ?? o['file']));
    if (nested) {
      return nested;
    }
  }

  return null;
}

/**
 * List/table View & Download: `listRowReceiptPath` → `{apiBase}/uploads/...`.
 * Full `http(s)` URLs are not built here (only path/filename fields).
 */
export function expenseRowReceiptHref(
  row: Record<string, unknown>,
  uploadsOrigin: string,
  apiBaseUrl?: string
): string | null {
  const rp = listRowReceiptPath(row);
  if (!rp) {
    return null;
  }

  const base = (apiBaseUrl || '').replace(/\/$/, '');
  const built = buildReceiptUrlFromReceiptPath(rp, base);
  if (!built) {
    return null;
  }
  if (/^https?:\/\//i.test(built)) {
    return built;
  }
  const origin = (uploadsOrigin || '').replace(/\/$/, '');
  return origin ? `${origin}${built.startsWith('/') ? built : `/${built}`}` : built;
}

/**
 * When the SPA runs on a different origin than the API (e.g. `ng serve` :4200, API :5000),
 * rewrite `http://api-origin/uploads/...` to `/uploads/...` so `HttpClient` stays same-origin,
 * the dev proxy can forward `/uploads`, and `Authorization` is sent.
 */
export function normalizeReceiptHttpUrl(href: string, apiBaseUrl: string): string {
  const base = (apiBaseUrl || '').replace(/\/$/, '');
  if (!/^https?:\/\//i.test(base)) {
    return href;
  }
  let apiOrigin: string;
  try {
    apiOrigin = new URL(base).origin;
  } catch {
    return href;
  }
  try {
    const loc = typeof window !== 'undefined' ? window.location.origin : '';
    const u = new URL(href, loc || 'http://localhost');
    // Any absolute URL on the API host → path-only (e.g. ng serve :4200 + proxy `/api` → `/api/uploads/...`).
    if (u.origin === apiOrigin) {
      return `${u.pathname}${u.search}${u.hash}`;
    }
  } catch {
    return href;
  }
  return href;
}
