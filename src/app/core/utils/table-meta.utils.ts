import {
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

/** Receipt file download (icon column); shared by user and admin expense tables. */
export const EXPENSE_RECEIPT_DOWNLOAD_COLUMN: DynamicTableColumn = {
  key: '_download',
  label: 'Download',
  sortable: false,
  cellControl: 'expenseReceiptDownload'
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
      return ['_receipt', 'receipt', 'receipt_url'];
    default:
      return [columnKey];
  }
}

/**
 * User expense table: Title, Amount, Category, Date, Payment, Notes, Update, Delete, Receipt, Vendor (fixed set).
 * API meta may only override display labels for matching keys.
 */
function cloneUserExpenseDashboardColumns(meta?: TableMetaResponse | null): DynamicTableColumn[] {
  const columns: DynamicTableColumn[] = [
    { key: 'title', label: 'Title', sortable: true },
    { key: 'amount', label: 'Amount', sortable: true, valueFormat: 'inr' },
    { key: 'category_name', label: 'Category', sortable: false },
    { key: 'expense_date', label: 'Date', sortable: true, valueFormat: 'shortDate' },
    { key: 'payment_method', label: 'Payment', sortable: false },
    { ...USER_EXPENSE_VIEW_NOTES_COLUMN },
    { key: '_update', label: 'Update', sortable: false, cellControl: 'userExpenseEdit' },
    { ...USER_EXPENSE_DELETE_COLUMN },
    { ...USER_EXPENSE_RECEIPT_COLUMN },
    { key: 'vendor', label: 'Vendor', sortable: false },
    { ...EXPENSE_RECEIPT_DOWNLOAD_COLUMN }
  ];
  if (!meta?.columns?.length) {
    return columns.map((c) => ({ ...c }));
  }
  return columns.map((c) => {
    const lo = pickMetaColumnLabel(meta, userExpenseLabelKeys(c.key));
    return lo ? { ...c, label: lo } : { ...c };
  });
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
      return ['_receipt', 'receipt', 'receipt_url'];
    case '_edit':
      return ['_edit', 'update'];
    case '_delete':
      return ['_delete', 'delete'];
    case '_download':
      return ['_download', 'download'];
    default:
      return [columnKey];
  }
}

/**
 * Admin “All expenses” table: Title, Category, Amount, Pay method, Receipt, Employee name, Vendor, Expense date, Delete, Download.
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
    { ...ADMIN_EXPENSE_DELETE_COLUMN },
    { ...EXPENSE_RECEIPT_DOWNLOAD_COLUMN }
  ];
  if (!meta?.columns?.length) {
    return columns.map((c) => ({ ...c }));
  }
  return columns.map((c) => {
    const lo = pickMetaColumnLabel(meta, adminExpenseLabelKeys(c.key));
    return lo ? { ...c, label: lo } : { ...c };
  });
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
    showFilter: false
  });
}

export function buildFallbackExpenseMetaConfig(pagination: DynamicTablePaginationConfig): DynamicTableViewConfig {
  return clampAdminExpenseApiSortColumns({
    columns: cloneAdminExpenseDashboardColumns(null),
    pagination,
    showFilter: false
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
    columns,
    pagination,
    showFilter: false
  };
}

