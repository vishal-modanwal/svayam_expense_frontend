import {
  DynamicTableCellControl,
  DynamicTableColumn,
  DynamicTablePaginationConfig,
  DynamicTableViewConfig
} from 'src/app/shared/components/dynamic-data-table/dynamic-data-table.models';
import { TableMetaColumn, TableMetaResponse } from '../models/table-meta.models';

const SORTABLE_EXPENSE_KEYS = new Set(['amount', 'expense_date', 'title', 'created_at']);

/** Admin org expense table — edit control (fixed column set). */
export const ADMIN_EXPENSE_ACTIONS_COLUMN: DynamicTableColumn = {
  key: '_edit',
  label: 'Edit',
  sortable: false,
  cellControl: 'adminExpenseEdit'
};

export const ADMIN_EXPENSE_RECEIPT_COLUMN: DynamicTableColumn = {
  key: '_receipt',
  label: 'Receipt',
  sortable: false,
  cellControl: 'adminExpenseReceipt'
};

export const EXPENSE_DETAILS_COLUMN: DynamicTableColumn = {
  key: '_details',
  label: 'Details',
  sortable: false,
  cellControl: 'expenseDetails'
};

export const ADMIN_EXPENSE_DELETE_COLUMN: DynamicTableColumn = {
  key: '_delete',
  label: 'Delete',
  sortable: false,
  cellControl: 'adminExpenseDelete'
};

export const USER_EXPENSE_VIEW_NOTES_COLUMN: DynamicTableColumn = {
  key: 'description',
  label: 'Notes',
  sortable: false,
  cellControl: 'userExpenseViewNotes'
};

export const USER_EXPENSE_UPDATE_COLUMN: DynamicTableColumn = {
  key: '_update',
  label: 'Edit',
  sortable: false,
  cellControl: 'userExpenseEdit'
};

export const USER_EXPENSE_DELETE_COLUMN: DynamicTableColumn = {
  key: '_delete',
  label: 'Delete',
  sortable: false,
  cellControl: 'userExpenseDelete'
};

export const USER_EXPENSE_RECEIPT_COLUMN: DynamicTableColumn = {
  key: '_receipt',
  label: 'Receipt',
  sortable: false,
  cellControl: 'userExpenseReceipt'
};

/** @deprecated Download is rendered inside `_receipt` column; kept for legacy imports only. */
export const EXPENSE_RECEIPT_DOWNLOAD_COLUMN: DynamicTableColumn = {
  key: '_download',
  label: 'Download',
  sortable: false,
  cellControl: 'expenseReceiptDownload'
};

/** Width + alignment for user/admin expense tables (shared `dynamic-data-table`). */
const EXPENSE_COLUMN_LAYOUT: Partial<Record<string, Pick<DynamicTableColumn, 'minWidth' | 'maxWidth' | 'cellAlign'>>> = {
  title: { minWidth: '11rem', cellAlign: 'start' },
  category_name: { minWidth: '8.5rem', cellAlign: 'start' },
  amount: { minWidth: '7.25rem', cellAlign: 'start' },
  payment_method: { minWidth: '6rem', cellAlign: 'center' },
  expense_date: { minWidth: '7rem', cellAlign: 'center' },
  vendor: { minWidth: '9rem', cellAlign: 'start' },
  user_name: { minWidth: '9rem', cellAlign: 'start' },
  description: { minWidth: '3.75rem', maxWidth: '4.5rem', cellAlign: 'center' },
  _details: { minWidth: '3.75rem', maxWidth: '4.25rem', cellAlign: 'center' },
  _receipt: { minWidth: '5.75rem', maxWidth: '5.75rem', cellAlign: 'center' },
  _delete: { minWidth: '3.75rem', maxWidth: '4.25rem', cellAlign: 'center' },
  _update: { minWidth: '3.75rem', maxWidth: '4.25rem', cellAlign: 'center' }
};

function applyColumnLayout(
  columns: DynamicTableColumn[],
  layoutMap: Partial<Record<string, Pick<DynamicTableColumn, 'minWidth' | 'maxWidth' | 'cellAlign'>>>
): DynamicTableColumn[] {
  return columns.map((c) => {
    const layout = layoutMap[c.key];
    return layout ? { ...c, ...layout } : { ...c };
  });
}

function applyExpenseColumnLayout(columns: DynamicTableColumn[]): DynamicTableColumn[] {
  return applyColumnLayout(columns, EXPENSE_COLUMN_LAYOUT);
}

/** Admin budget overview table — alignment + widths (table view). */
const BUDGET_COLUMN_LAYOUT: Partial<Record<string, Pick<DynamicTableColumn, 'minWidth' | 'maxWidth' | 'cellAlign'>>> = {
  category: { minWidth: '8rem', cellAlign: 'start' },
  description_action: { minWidth: '3.75rem', maxWidth: '4.25rem', cellAlign: 'center' },
  month: { minWidth: '4.5rem', cellAlign: 'center' },
  year: { minWidth: '4.25rem', cellAlign: 'center' },
  amount: { minWidth: '7rem', cellAlign: 'end' },
  spent: { minWidth: '7rem', cellAlign: 'end' },
  remaining: { minWidth: '7rem', cellAlign: 'end' },
  usage_pct: { minWidth: '5rem', cellAlign: 'center' },
  standard_txn_count: { minWidth: '5.5rem', cellAlign: 'center' },
  actionBudgetEdit: { minWidth: '3.75rem', maxWidth: '4.25rem', cellAlign: 'center' },
  actionBudgetDelete: { minWidth: '3.75rem', maxWidth: '4.25rem', cellAlign: 'center' }
};

function pickMetaColumnLabel(meta: TableMetaResponse, keys: string[]): string | undefined {
  for (const k of keys) {
    const hit = meta.columns?.find((m) => m.key.toLowerCase() === k.toLowerCase());
    const t = hit?.label?.trim();
    if (t) {
      return t;
    }
  }
  return undefined;
}

function userExpenseLabelKeys(columnKey: string): string[] {
  switch (columnKey) {
    case 'category_name':
      return ['category_name', 'category'];
    case 'expense_date':
      return ['expense_date', 'date'];
    case 'payment_method':
      return ['payment_method', 'payment'];
    case 'description':
      return ['description', 'notes', 'note'];
    case '_update':
      return ['_update', 'update'];
    case '_delete':
      return ['_delete', 'delete'];
    case '_receipt':
      return ['_receipt', 'receipt', 'receipt_path', 'receiptPath', 'receipt_url'];
    case '_details':
      return ['_details', 'details'];
    default:
      return [columnKey];
  }
}

function stripExpenseDownloadColumn(columns: DynamicTableColumn[]): DynamicTableColumn[] {
  return columns.filter((c) => c.key !== '_download' && c.key !== 'description');
}

/**
 * User expense table: … Receipt (view + download), Vendor.
 * API meta may only override display labels for matching keys.
 */
function cloneUserExpenseDashboardColumns(meta?: TableMetaResponse | null): DynamicTableColumn[] {
  const columns: DynamicTableColumn[] = [
    { key: 'title', label: 'Title', sortable: true },
    { key: 'amount', label: 'Amount', sortable: true, valueFormat: 'inr' },
    { key: 'category_name', label: 'Category', sortable: false },
    { key: 'expense_date', label: 'Date', sortable: true, valueFormat: 'shortDate' },
    { key: 'payment_method', label: 'Payment', sortable: false },
    { key: '_update', label: 'Update', sortable: false, cellControl: 'userExpenseEdit' },
    { ...EXPENSE_DETAILS_COLUMN },
    { ...USER_EXPENSE_DELETE_COLUMN },
    { ...USER_EXPENSE_RECEIPT_COLUMN },
    { key: 'vendor', label: 'Vendor', sortable: false }
  ];
  const labeled = !meta?.columns?.length
    ? columns.map((c) => ({ ...c }))
    : columns.map((c) => {
        const lo = pickMetaColumnLabel(meta, userExpenseLabelKeys(c.key));
        return lo ? { ...c, label: lo } : { ...c };
      });
  return applyExpenseColumnLayout(stripExpenseDownloadColumn(labeled));
}

/** User “Recent expenses” table: fixed columns only (no extra fields from meta). */
export function buildUserExpenseViewConfigFromTableMeta(
  meta: TableMetaResponse,
  pagination: DynamicTablePaginationConfig
): DynamicTableViewConfig {
  return {
    columns: cloneUserExpenseDashboardColumns(meta),
    pagination,
    showFilter: false
  };
}

function inferInrFormat(key: string): 'inr' | undefined {
  if (key === 'amount') {
    return 'inr';
  }
  if (/spent|limit|allocated|budget|price|total|cost/i.test(key)) {
    return 'inr';
  }
  return undefined;
}

function inferShortDate(key: string): 'shortDate' | undefined {
  if (/date|at$/i.test(key)) {
    return 'shortDate';
  }
  return undefined;
}

export function tableMetaColumnsToDynamicColumns(cols: TableMetaColumn[] | undefined | null): DynamicTableColumn[] {
  if (!cols?.length) {
    return [];
  }
  return cols.map((c) => {
    const inr = inferInrFormat(c.key);
    const sd = inr ? undefined : inferShortDate(c.key);
    return {
      key: c.key,
      label: c.label || c.key,
      sortable: SORTABLE_EXPENSE_KEYS.has(c.key),
      valueFormat: inr ?? sd
    };
  });
}

export function buildViewConfigFromTableMeta(
  meta: TableMetaResponse,
  pagination: DynamicTablePaginationConfig,
  extraColumns: DynamicTableColumn[] = [],
  options?: { titleOverride?: string | null; showFilter?: boolean; omitTitle?: boolean }
): DynamicTableViewConfig {
  const baseCols = tableMetaColumnsToDynamicColumns(meta.columns);
  const columns = [...baseCols, ...extraColumns];
  const title =
    options?.omitTitle === true
      ? undefined
      : options?.titleOverride !== undefined && options?.titleOverride !== null
        ? options.titleOverride || undefined
        : meta.table_label || meta.table || undefined;
  return {
    ...(title ? { title } : {}),
    columns,
    pagination,
    showFilter: options?.showFilter ?? false
  };
}

/** Build config from embedded `columns` (e.g. GET /admin/users-details) without table envelope. */
export function buildViewConfigFromEmbeddedColumns(
  columns: TableMetaColumn[] | undefined | null,
  pagination: DynamicTablePaginationConfig,
  title: string,
  options?: { showFilter?: boolean }
): DynamicTableViewConfig | null {
  if (!columns?.length) {
    return null;
  }
  return {
    title,
    columns: tableMetaColumnsToDynamicColumns(columns),
    pagination,
    showFilter: options?.showFilter ?? false
  };
}

/** Normalised column keys that represent “active / inactive” in users-details payloads. */
const EMPLOYEE_ACTIVE_COLUMN_KEYS = new Set([
  'is_active',
  'isactive',
  'active',
  'user_active',
  'is_user_active',
  'status',
  'enabled',
  'user_status',
  'account_status',
  'activation_status',
  /** Plain-text activity from API (duplicate of toggle column). */
  'activity_status',
  'activitystatus',
  'user_activity_status',
  'useractivitystatus',
  'activity_state',
  'activitystate',
  /** Some APIs use a spaced key or label-derived key for the text column. */
  'activity status'
]);

/**
 * Admin employees list: drop API columns that only mirror active/inactive (`is_active`, `status`,
 * etc.) so they are not shown twice; append a single `_employee_active` toggle (reads the same row fields).
 */
export function withEmployeeUsersTableEnhancements(
  config: DynamicTableViewConfig | null,
  activeToggleColumnLabel?: string
): DynamicTableViewConfig | null {
  if (!config?.columns?.length) {
    return config;
  }
  const label = (activeToggleColumnLabel || 'Activity').trim() || 'Activity';
  const columns = config.columns
    .filter((c) => !EMPLOYEE_ACTIVE_COLUMN_KEYS.has(c.key.trim().toLowerCase()))
    .map((c) => ({ ...c, sortable: false }));
  const finalColumns = [
    ...columns,
    {
      key: '_employee_active',
      label,
      sortable: false,
      minWidth: '8.5rem',
      cellControl: 'employeeActiveToggle' as DynamicTableCellControl
    }
  ];
  return {
    ...config,
    columns: finalColumns,
    showFilter: false
  };
}

function adminExpenseLabelKeys(columnKey: string): string[] {
  switch (columnKey) {
    case 'user_name':
      return ['user_name', 'user'];
    case 'category_name':
      return ['category_name', 'category'];
    case 'expense_date':
      return ['expense_date', 'date'];
    case 'payment_method':
      return ['payment_method', 'payment'];
    case '_receipt':
      return ['_receipt', 'receipt', 'receipt_path', 'receiptPath', 'receipt_url'];
    case '_details':
      return ['_details', 'details'];
    case '_edit':
      return ['_edit', 'update'];
    case '_delete':
      return ['_delete', 'delete'];
    default:
      return [columnKey];
  }
}

/**
 * Admin “All expenses” table: … Receipt (view + download), … Delete.
 * Fixed columns; API meta may only override labels for matching keys.
 */
function cloneAdminExpenseDashboardColumns(meta?: TableMetaResponse | null): DynamicTableColumn[] {
  const columns: DynamicTableColumn[] = [
    { key: 'title', label: 'Title', sortable: true },
    { key: 'category_name', label: 'Category', sortable: false },
    { key: 'amount', label: 'Amount', sortable: true, valueFormat: 'inr' },
    { key: 'payment_method', label: 'Pay method', sortable: false },
    { ...ADMIN_EXPENSE_RECEIPT_COLUMN },
    { key: 'user_name', label: 'Employee name', sortable: false },
    { key: 'vendor', label: 'Vendor', sortable: false },
    { key: 'expense_date', label: 'Expense date', sortable: true, valueFormat: 'shortDate' },
    { ...EXPENSE_DETAILS_COLUMN },
    { ...ADMIN_EXPENSE_DELETE_COLUMN }
  ];
  const labeled = !meta?.columns?.length
    ? columns.map((c) => ({ ...c }))
    : columns.map((c) => {
        const lo = pickMetaColumnLabel(meta, adminExpenseLabelKeys(c.key));
        return lo ? { ...c, label: lo } : { ...c };
      });
  return applyExpenseColumnLayout(stripExpenseDownloadColumn(labeled));
}

/** Same as user expense table: only `amount` and `expense_date` are API-sortable. */
export function clampAdminExpenseApiSortColumns(config: DynamicTableViewConfig): DynamicTableViewConfig {
  const apiSortable = new Set(['amount', 'expense_date']);
  return {
    ...config,
    columns: config.columns.map((c) => {
      if (c.cellControl) {
        return c;
      }
      const sortable = apiSortable.has(c.key) && c.sortable !== false;
      return { ...c, sortable };
    })
  };
}

export function buildAdminExpenseViewConfigFromTableMeta(
  meta: TableMetaResponse,
  pagination: DynamicTablePaginationConfig
): DynamicTableViewConfig {
  return clampAdminExpenseApiSortColumns({
    columns: cloneAdminExpenseDashboardColumns(meta),
    pagination,
    showFilter: false,
    /** Table/Card toggle rendered in admin section head (next to audience chips). */
    showViewToggle: false
  });
}

export function buildFallbackExpenseMetaConfig(pagination: DynamicTablePaginationConfig): DynamicTableViewConfig {
  return clampAdminExpenseApiSortColumns({
    columns: cloneAdminExpenseDashboardColumns(null),
    pagination,
    showFilter: false,
    showViewToggle: false
  });
}

export function buildFallbackUserExpenseMetaConfig(pagination: DynamicTablePaginationConfig): DynamicTableViewConfig {
  return {
    columns: cloneUserExpenseDashboardColumns(null),
    pagination,
    showFilter: false
  };
}

/**
 * `getMyExpenses` only accepts `sortBy` amount | expense_date`. Disable mat-sort on other meta columns
 * so the table UI does not imply server sorting for unsupported keys.
 */
export function clampMyExpenseApiSortColumns(config: DynamicTableViewConfig): DynamicTableViewConfig {
  const apiSortable = new Set(['amount', 'expense_date']);
  return {
    ...config,
    columns: config.columns.map((c) => {
      if (c.cellControl) {
        return c;
      }
      const sortable = apiSortable.has(c.key) && c.sortable !== false;
      return { ...c, sortable };
    })
  };
}

/** Admin budget overview — fixed columns aligned with mapped `budgetTableRows` in `AdminDashboardComponent`. */
export function buildAdminBudgetOverviewTableConfig(pagination: DynamicTablePaginationConfig): DynamicTableViewConfig {
  const columns: DynamicTableColumn[] = [
    { key: 'category', label: 'Category', sortable: true },
    { key: 'description_action', label: 'Description', sortable: false, cellControl: 'adminBudgetDescription' },
    { key: 'month', label: 'Month', sortable: true },
    { key: 'year', label: 'Year', sortable: true },
    { key: 'amount', label: 'Amount', sortable: true, valueFormat: 'inr' },
    { key: 'spent', label: 'Spent', sortable: true, valueFormat: 'inr' },
    { key: 'remaining', label: 'Remaining', sortable: true, valueFormat: 'inr' },
    { key: 'usage_pct', label: 'Usage %', sortable: true },
    /** Same category + month/year as row — from GET /admin/budget-details when backend sends this field. */
    { key: 'standard_txn_count', label: 'Standard txns', sortable: true },
    { key: 'actionBudgetEdit', label: 'Edit', sortable: false, cellControl: 'adminBudgetEdit' },
    { key: 'actionBudgetDelete', label: 'Delete', sortable: false, cellControl: 'adminBudgetDelete' }
  ];
  return {
    columns: applyColumnLayout(columns, BUDGET_COLUMN_LAYOUT),
    pagination,
    showFilter: false,
    /** Table/Card toggle rendered in admin section head (Budget overview). */
    showViewToggle: false
  };
}

