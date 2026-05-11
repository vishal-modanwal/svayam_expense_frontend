import { HttpErrorResponse } from '@angular/common/http';

/** Reads `message` / `error` from typical JSON error bodies (e.g. `{ status, message }`). */
export function readHttpErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof HttpErrorResponse) {
    const e = err.error;
    if (typeof e === 'string' && e.trim()) {
      return e.trim();
    }
    if (e && typeof e === 'object') {
      const o = e as Record<string, unknown>;
      const m = o['message'];
      if (typeof m === 'string' && m.trim()) {
        return m.trim();
      }
      const er = o['error'];
      if (typeof er === 'string' && er.trim()) {
        return er.trim();
      }
    }
    if (err.message?.trim()) {
      return err.message.trim();
    }
  }
  if (err instanceof Error && err.message?.trim()) {
    return err.message.trim();
  }
  return fallback;
}
