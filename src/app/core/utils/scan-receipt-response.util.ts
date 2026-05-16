import { FormGroup } from '@angular/forms';
import { Category } from '../models/app.models';

function readObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function getStr(fields: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const k of keys) {
    const v = fields[k];
    if (v != null && String(v).trim() !== '') {
      return String(v).trim();
    }
  }
  return null;
}

function getNum(fields: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const k of keys) {
    const v = fields[k];
    if (v == null) {
      continue;
    }
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
    if (!Number.isNaN(n) && n > 0) {
      return n;
    }
  }
  return null;
}

/**
 * Collects scalar + one-level nested user fields from typical API envelopes.
 */
export function extractSuggestedFields(raw: unknown): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  const takeScalars = (r: Record<string, unknown> | null) => {
    if (!r) {
      return;
    }
    for (const [k, v] of Object.entries(r)) {
      if (v === null || v === undefined) {
        continue;
      }
      if (typeof v === 'object' && !Array.isArray(v)) {
        continue;
      }
      merged[k] = v;
    }
  };
  const walk = (node: unknown) => {
    const r = readObj(node);
    if (!r) {
      return;
    }
    takeScalars(r);
    const cat = readObj(r['category']);
    if (cat) {
      if (cat['id'] != null && merged['category_id'] == null) {
        merged['category_id'] = cat['id'];
      }
      if (cat['name'] != null && merged['category_name'] == null) {
        merged['category_name'] = cat['name'];
      }
    }
    for (const key of ['data', 'result', 'suggested', 'fields', 'payload', 'expense'] as const) {
      const inner = readObj(r[key]);
      if (inner) {
        walk(inner);
      }
    }
  };
  walk(raw);
  return merged;
}

const PAYMENT_OPTIONS = ['Cash', 'UPI', 'Card', 'Net Banking', 'Others'] as const;

function normalizePaymentMethod(raw: string): string | null {
  const t = raw.trim().toLowerCase();
  for (const opt of PAYMENT_OPTIONS) {
    if (opt.toLowerCase() === t) {
      return opt;
    }
  }
  if (t.includes('upi')) {
    return 'UPI';
  }
  if (t.includes('card')) {
    return 'Card';
  }
  if (t.includes('cash')) {
    return 'Cash';
  }
  if (t.includes('net') || t.includes('bank')) {
    return 'Net Banking';
  }
  return null;
}

function normalizeScanDate(s: string): string | null {
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) {
    return t.substring(0, 10);
  }
  const m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const dd = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    const yyyy = m[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

function resolveCategoryId(fields: Record<string, unknown>, categories: Category[]): number | null {
  const idVal = fields['category_id'] ?? fields['categoryId'];
  if (idVal != null) {
    const n = Number(idVal);
    if (!Number.isNaN(n) && n > 0) {
      return n;
    }
  }
  const name = getStr(fields, ['category_name', 'category', 'categoryName']);
  if (!name || !categories?.length) {
    return null;
  }
  const lower = name.toLowerCase();
  const match = categories.find((c) => (c.name || '').toLowerCase() === lower);
  return match?.id ?? null;
}

/**
 * Merges scan API suggestions into the form when the matching control is empty (or amount is 0).
 * Returns how many controls were updated.
 */
export function applyScanFieldsToForm(
  raw: unknown,
  form: FormGroup,
  categories: Category[]
): { applied: number } {
  const fields = extractSuggestedFields(raw);
  let applied = 0;

  const title = getStr(fields, ['title', 'merchant', 'vendor_name', 'store', 'payee', 'bill_title']);
  if (title) {
    const cur = (form.get('title')?.value || '').trim();
    if (!cur) {
      form.patchValue({ title: title.slice(0, 200) });
      applied++;
    }
  }

  const vendor = getStr(fields, ['vendor', 'merchant', 'vendor_name', 'store_name', 'shop_name']);
  if (vendor) {
    const cur = (form.get('vendor')?.value || '').trim();
    if (!cur) {
      form.patchValue({ vendor: vendor.slice(0, 200) });
      applied++;
    }
  }

  const amount = getNum(fields, ['amount', 'total', 'grand_total', 'amount_total', 'payable']);
  if (amount != null) {
    const cur = Number(form.get('amount')?.value);
    if (!cur || cur === 0) {
      form.patchValue({ amount });
      applied++;
    }
  }

  const dateStr = getStr(fields, ['expense_date', 'date', 'transaction_date', 'bill_date', 'invoice_date']);
  if (dateStr) {
    const cur = (form.get('expense_date')?.value || '').trim();
    if (!cur) {
      const normalized = normalizeScanDate(dateStr);
      if (normalized) {
        form.patchValue({ expense_date: normalized });
        applied++;
      }
    }
  }

  const desc = getStr(fields, ['description', 'notes', 'memo', 'remarks']);
  if (desc) {
    const cur = (form.get('description')?.value || '').trim();
    if (!cur) {
      form.patchValue({ description: desc.slice(0, 2000) });
      applied++;
    }
  }

  const payment = getStr(fields, ['payment_method', 'payment_mode', 'payment_type', 'payment']);
  if (payment) {
    const normalized = normalizePaymentMethod(payment);
    if (normalized) {
      form.patchValue({ payment_method: normalized });
      applied++;
    }
  }

  const curr = getStr(fields, ['currency']);
  if (curr && /^INR|USD$/i.test(curr)) {
    form.patchValue({ currency: curr.toUpperCase() });
    applied++;
  }

  const catId = resolveCategoryId(fields, categories);
  if (catId != null) {
    const cur = form.get('category_id')?.value;
    if (cur == null || cur === '') {
      form.patchValue({ category_id: catId });
      applied++;
    }
  }

  return { applied };
}
