import { Category } from '../models/app.models';

function asRow(cat: Category): Record<string, unknown> {
  return cat as unknown as Record<string, unknown>;
}

function isTruthyDeleted(v: unknown): boolean {
  if (v === true || v === 1) {
    return true;
  }
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'deleted';
}

function hasMeaningfulDeletedAt(v: unknown): boolean {
  if (v == null) {
    return false;
  }
  const s = String(v).trim();
  return s !== '' && s.toLowerCase() !== 'null' && s.toLowerCase() !== '0000-00-00 00:00:00';
}

function inactiveStatus(v: unknown): boolean {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'deleted' || s === 'inactive' || s === 'disabled' || s === 'archived';
}

/** Treat as active when API sends explicit “off” values. */
function isExplicitlyInactive(v: unknown): boolean {
  if (v === false || v === 0) {
    return true;
  }
  const s = String(v ?? '').trim().toLowerCase();
  return s === '0' || s === 'false' || s === 'no' || s === 'off';
}

function isExplicitlyActive(v: unknown): boolean {
  if (v === true || v === 1) {
    return true;
  }
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on' || s === 'active';
}

/**
 * Categories safe to offer in expense create/edit pickers.
 * Drops rows that look deleted/inactive when the API still returns them.
 */
export function filterCategoriesForExpensePicker(list: Category[] | null | undefined): Category[] {
  if (!Array.isArray(list) || list.length === 0) {
    return [];
  }
  return list.filter((cat) => {
    const r = asRow(cat);
    if (isTruthyDeleted(r['is_deleted'])) {
      return false;
    }
    if (hasMeaningfulDeletedAt(r['deleted_at'])) {
      return false;
    }
    if (inactiveStatus(r['status'])) {
      return false;
    }
    const activeField = r['is_active'] !== undefined && r['is_active'] !== null ? r['is_active'] : r['active'];
    if (activeField !== undefined && activeField !== null && String(activeField).trim() !== '') {
      if (isExplicitlyInactive(activeField)) {
        return false;
      }
      if (isExplicitlyActive(activeField)) {
        return true;
      }
    }
    return true;
  });
}
