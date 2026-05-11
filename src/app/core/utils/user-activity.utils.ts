import { AuthUser, Expense } from '../models/app.models';

const INACTIVE_TOKENS = new Set([
  'inactive',
  'disabled',
  'suspended',
  'deactivated',
  '0',
  'false',
  'no',
  'off'
]);

const ACTIVITY_KEYS = [
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
  'activity',
  'user_state',
  'userState',
  'user_active',
  'userActive',
  'active_user',
  'activeUser'
];

function readLoose(u: unknown): Record<string, unknown> | null {
  if (u && typeof u === 'object') {
    return u as Record<string, unknown>;
  }
  return null;
}

function tokenMeansInactive(v: unknown): boolean {
  if (v === false || v === 0) {
    return true;
  }
  const s = String(v ?? '')
    .toLowerCase()
    .trim();
  if (!s) {
    return false;
  }
  return INACTIVE_TOKENS.has(s);
}

function tokenMeansExplicitlyActive(v: unknown): boolean {
  if (v === true || v === 1) {
    return true;
  }
  const s = String(v ?? '')
    .toLowerCase()
    .trim();
  return s === 'active' || s === 'enabled' || s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

/**
 * Resolves `is_active` / `isActive` style flags from API (boolean, number, or string).
 * `undefined` = unknown / rely on other signals.
 */
function coalesceActiveFlag(v: unknown): boolean | undefined {
  if (v === undefined || v === null || v === '') {
    return undefined;
  }
  if (typeof v === 'boolean') {
    return v;
  }
  if (typeof v === 'number') {
    if (v === 0) {
      return false;
    }
    if (v === 1) {
      return true;
    }
    return undefined;
  }
  const s = String(v).toLowerCase().trim();
  if (['0', 'false', 'no', 'inactive', 'disabled', 'off'].includes(s)) {
    return false;
  }
  if (['1', 'true', 'yes', 'active', 'enabled', 'on'].includes(s)) {
    return true;
  }
  return undefined;
}

/**
 * True when the account should be treated as inactive (block add-expense, show inactive UI).
 */
function pick(root: Record<string, unknown>, nested: Record<string, unknown> | null, key: string): unknown {
  return root[key] ?? nested?.[key];
}

export function isUserAccountInactive(u: AuthUser | null | undefined): boolean {
  if (!u) {
    return false;
  }
  const root = readLoose(u);
  if (!root) {
    return false;
  }
  const nested = readLoose(root['user']);

  for (const k of ACTIVITY_KEYS) {
    const v = pick(root, nested, k);
    if (v === undefined || v === null || v === '') {
      continue;
    }
    if (tokenMeansExplicitlyActive(v)) {
      continue;
    }
    if (tokenMeansInactive(v)) {
      return true;
    }
    const s = String(v)
      .toLowerCase()
      .trim();
    if (/\binactive\b/.test(s) || /\bdisabled\b/.test(s) || /\bsuspended\b/.test(s) || /\bdeactivated\b/.test(s)) {
      return true;
    }
  }

  const rawIsActive =
    pick(root, nested, 'is_active') ??
    pick(root, nested, 'isActive') ??
    pick(root, nested, 'is_user_active') ??
    pick(root, nested, 'isUserActive');
  if (typeof rawIsActive === 'number' && rawIsActive >= 2) {
    return true;
  }

  const activeFlag = coalesceActiveFlag(
    rawIsActive ??
      pick(root, nested, 'active') ??
      pick(root, nested, 'enabled') ??
      pick(root, nested, 'user_active') ??
      pick(root, nested, 'userActive') ??
      pick(root, nested, 'active_user') ??
      pick(root, nested, 'activeUser')
  );
  if (activeFlag === false) {
    return true;
  }

  const canAdd = pick(root, nested, 'can_add_expense') ?? pick(root, nested, 'canAddExpense');
  if (canAdd === false || canAdd === 0) {
    return true;
  }
  if (typeof canAdd === 'string' && ['0', 'false', 'no'].includes(canAdd.toLowerCase().trim())) {
    return true;
  }

  const status = String(pick(root, nested, 'status') ?? '')
    .toLowerCase()
    .trim();
  if (status === 'inactive' || status === 'disabled' || status === 'suspended' || status === 'deactivated') {
    return true;
  }

  return false;
}

/**
 * True when the expense row’s owner looks inactive (nested `user`, then flat row flags).
 * Optional helper when an expense row embeds owner activity flags (admin list may omit them if `view` is used).
 */
export function isExpenseOwnerAccountInactive(e: Expense): boolean {
  const ex = e as Expense & Record<string, unknown>;
  const nested =
    e.user && typeof e.user === 'object' ? (e.user as Record<string, unknown>) : null;

  /** Prefer nested `user`, then flat row; skip empty string only (keep `0` / `false`). */
  const first = (...keys: string[]): unknown => {
    for (const k of keys) {
      const a = nested?.[k];
      if (a !== undefined && a !== null && a !== '') {
        return a;
      }
      const b = ex[k];
      if (b !== undefined && b !== null && b !== '') {
        return b;
      }
    }
    return undefined;
  };

  const synthetic: AuthUser = {
    id: Number(e.user_id ?? nested?.['id'] ?? 0),
    name: String(e.user_name ?? nested?.['name'] ?? ''),
    email: String(first('email', 'user_email') ?? ''),
    is_active: first('is_active', 'isActive') as boolean | number | undefined,
    activity_status: first('activity_status', 'activityStatus') as string | undefined,
    activityStatus: first('activityStatus', 'activity_status') as string | undefined,
    status: first('status') as string | undefined
  };

  return isUserAccountInactive(synthetic);
}
