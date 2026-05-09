/** Optional non-text cells (emit events from `DynamicDataTableComponent`). */
export type DynamicTableCellControl =
  | 'adminExpenseEdit'
  | 'adminExpenseReceipt'
  | 'adminExpenseDelete'
  | 'userExpenseActions'
  | 'userExpenseViewNotes'
  | 'userExpenseEdit'
  | 'userExpenseDelete'
  | 'userExpenseReceipt';

/** Column definition — typically one object per API column. */
export interface DynamicTableColumn {
  /** Property key on each row object (must match server field names you map into rows). */
  key: string;
  label: string;
  /** Default true when omitted. */
  sortable?: boolean;
  /** e.g. '8rem' — helps horizontal scroll on small screens. */
  minWidth?: string;
  /** Cell value presentation for plain text cells. */
  valueFormat?: 'plain' | 'inr' | 'shortDate';
  /** When set, `cellText` is not used; template renders controls instead. */
  cellControl?: DynamicTableCellControl;
}

export interface DynamicTablePaginationConfig {
  /** e.g. [5, 10, 25] — shown in paginator dropdown. */
  pageSizeOptions: number[];
  defaultPageSize: number;
}

/** Shape your API can return; map into this before binding to the table. */
export interface DynamicTableViewConfig {
  /** Optional heading above the table. */
  title?: string;
  columns: DynamicTableColumn[];
  pagination: DynamicTablePaginationConfig;
  /** Search hint; default set in component. */
  filterPlaceholder?: string;
  /** Default true. */
  showFilter?: boolean;
}

/** Emitted whenever page, sort, or (debounced) filter changes — use for server requests. */
export interface DynamicTableQuery {
  pageIndex: number;
  pageSize: number;
  sortActive: string | null;
  sortDirection: 'asc' | 'desc' | '';
  filter: string;
}
