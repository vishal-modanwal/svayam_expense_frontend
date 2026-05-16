/**
 * GET expense list/detail may return user notes as `notes` and/or `description`.
 * Coalesce to a single string for table rows, details modal, and forms.
 */
export function coalesceExpenseNotesFromApi(source: Record<string, unknown> | null | undefined): string {
  if (!source) {
    return '';
  }
  const keys = ['notes', 'description', 'note', 'expense_notes', 'remarks', 'memo'];
  for (const key of keys) {
    const v = source[key];
    if (v !== null && v !== undefined) {
      const t = String(v).trim();
      if (t) {
        return t;
      }
    }
  }
  return '';
}

/** Ensures row/expense has both `description` and `notes` set when API sent either field. */
export function withNormalizedExpenseNotes<T extends Record<string, unknown>>(item: T): T {
  const text = coalesceExpenseNotesFromApi(item);
  if (!text) {
    return item;
  }
  return { ...item, description: text, notes: text };
}
