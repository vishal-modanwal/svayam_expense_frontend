import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiMessage, AuthUser } from '../models/app.models';
import { AuthService } from './auth.service';
import { environment } from 'src/environments/environment';

function readRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
}

/** Keys merged from any depth (avoids copying root `status: success` without user context). */
const PROFILE_DEEP_EXPLICIT_KEYS: readonly string[] = [
  'is_active',
  'isActive',
  'active',
  'enabled',
  'activity_status',
  'activityStatus',
  'user_activity_status',
  'userActivityStatus',
  'account_status',
  'accountStatus',
  'activation_status',
  'activationStatus',
  'user_status',
  'userStatus',
  'user_state',
  'userState',
  'activity',
  'can_add_expense',
  'canAddExpense',
  'user_active',
  'userActive',
  'is_user_active',
  'isUserActive',
  'active_user',
  'activeUser'
];

function pickProfileSignals(rec: Record<string, unknown>): Partial<AuthUser> {
  const out: Record<string, unknown> = {};
  for (const k of PROFILE_DEEP_EXPLICIT_KEYS) {
    const v = rec[k];
    if (v !== undefined && v !== null && v !== '') {
      out[k] = v;
    }
  }
  const looksLikeUserRow =
    rec['id'] != null || rec['email'] != null || rec['user_id'] != null || rec['name'] != null;
  if (looksLikeUserRow) {
    const st = rec['status'];
    if (st !== undefined && st !== null && st !== '') {
      out['status'] = st;
    }
  }
  return out as Partial<AuthUser>;
}

function hasProfileSignalSlice(rec: Record<string, unknown>): boolean {
  return Object.keys(pickProfileSignals(rec)).length > 0;
}

/** Walk nested JSON so flags like `data.account.is_active` are not missed. Deeper nodes win. */
function deepExtractProfileSignals(raw: unknown, depth = 0): Partial<AuthUser> {
  if (raw == null || depth > 14) {
    return {};
  }
  if (Array.isArray(raw)) {
    return raw.reduce<Partial<AuthUser>>((acc, el) => ({ ...acc, ...deepExtractProfileSignals(el, depth + 1) }), {});
  }
  const rec = readRecord(raw);
  if (!rec) {
    return {};
  }
  let fromChildren: Partial<AuthUser> = {};
  for (const v of Object.values(rec)) {
    fromChildren = { ...fromChildren, ...deepExtractProfileSignals(v, depth + 1) };
  }
  const here = hasProfileSignalSlice(rec) ? pickProfileSignals(rec) : {};
  return { ...here, ...fromChildren };
}

/** True when this object likely carries user / account flags from /profile. */
function looksLikeUserPayload(r: Record<string, unknown>): boolean {
  return (
    r['id'] != null ||
    r['user_id'] != null ||
    r['email'] != null ||
    r['name'] != null ||
    r['is_active'] != null ||
    r['isActive'] != null ||
    r['active'] != null ||
    r['enabled'] != null ||
    r['activity_status'] != null ||
    r['activityStatus'] != null ||
    r['status'] != null ||
    r['can_add_expense'] != null ||
    r['canAddExpense'] != null
  );
}

/**
 * Normalizes common backend envelopes so flags like `is_active` / `activity_status` are not lost.
 * Supports: `{ user }`, `{ data: { user } }`, `{ data: { ...partial user } }`, flat `{ ...user fields }`.
 */
function extractProfileUserPayload(raw: unknown): Partial<AuthUser> | null {
  const o = readRecord(raw);
  if (!o) {
    return null;
  }
  const data = readRecord(o['data']);
  const candidates: Record<string, unknown>[] = [];
  const push = (r: Record<string, unknown> | null | undefined) => {
    if (r && looksLikeUserPayload(r)) {
      candidates.push(r);
    }
  };
  push(o);
  push(data);
  push(readRecord(o['user']));
  push(readRecord(o['result']));
  push(readRecord(o['profile']));
  push(readRecord(o['payload']));
  if (data) {
    push(readRecord(data['user']));
  }
  if (!candidates.length) {
    return null;
  }
  const merged = candidates.reduce<Record<string, unknown>>((acc, cur) => ({ ...acc, ...cur }), {});
  return merged as unknown as Partial<AuthUser>;
}

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly api = environment.apiBaseUrl;

  constructor(
    private readonly http: HttpClient,
    private readonly authService: AuthService
  ) {}

  getMe(): Observable<{ user: AuthUser }> {
    return this.http.get<unknown>(`${this.api}/profile`).pipe(
      map((raw) => {
        const shallow = extractProfileUserPayload(raw) ?? {};
        const deep = deepExtractProfileSignals(raw);
        const patch = { ...shallow, ...deep } as Partial<AuthUser>;
        const current = this.authService.getCurrentUser();
        const user = (current || Object.keys(patch).length
          ? ({ ...(current || {}), ...patch } as AuthUser)
          : ({} as AuthUser)) as AuthUser;
        return { user };
      })
    );
  }

  updateProfile(payload: { name?: string; mobile_no?: string }): Observable<ApiMessage> {
    return this.http.put<ApiMessage>(`${this.api}/profile/update`, payload);
  }

  forgotPassword(email: string): Observable<ApiMessage> {
    return this.http.post<ApiMessage>(`${this.api}/profile/forgetPassword`, { email });
  }

  resetPassword(payload: { email: string; otp: string; password: string }): Observable<ApiMessage> {
    return this.http.post<ApiMessage>(`${this.api}/profile/resetPassword`, payload);
  }
}
