import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

/** Request body for POST /api/chat/message */
export interface ChatMessageRequest {
  message: string;
}

/**
 * Picks assistant text from common API shapes: `{ reply }`, `{ message }`, nested `data`, etc.
 */
export function replyTextFromChatJson(body: unknown): string {
  if (body === null || body === undefined) {
    return 'No reply from server.';
  }
  if (typeof body === 'string') {
    return body.trim() || 'No reply from server.';
  }
  if (typeof body !== 'object') {
    return String(body);
  }
  const o = body as Record<string, unknown>;
  const pick = (v: unknown): string | null => {
    if (typeof v === 'string' && v.trim()) {
      return v.trim();
    }
    return null;
  };
  for (const key of ['reply', 'response', 'answer', 'content', 'text']) {
    const s = pick(o[key]);
    if (s) {
      return s;
    }
  }
  const msg = pick(o['message']);
  if (msg) {
    return msg;
  }
  const data = o['data'];
  if (data !== undefined) {
    const nested = replyTextFromChatJson(data);
    if (nested && nested !== 'No reply from server.') {
      return nested;
    }
  }
  try {
    return JSON.stringify(body);
  } catch {
    return 'Unexpected response from chat service.';
  }
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly api = environment.apiBaseUrl;

  constructor(private readonly http: HttpClient) {}

  /** Uses global HTTP client → JWT `AuthInterceptor` on same origin as other APIs. */
  sendMessage(message: string): Observable<unknown> {
    const body: ChatMessageRequest = { message };
    return this.http.post<unknown>(`${this.api}/chat/message`, body);
  }
}
