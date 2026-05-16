/** Column metadata from GET /api/meta/tables/* or embedded in admin list APIs. */
export interface TableMetaColumn {
  key: string;
  label: string;
  db_column?: string;
}

/** Standard envelope for GET /api/meta/tables/{users|expenses|budgets}. */
export interface TableMetaResponse {
  status?: string;
  table?: string;
  table_label?: string;
  column_count?: number;
  columns: TableMetaColumn[];
}

/** GET /api/admin/users-details — prefer embedded columns + data over /meta/tables/users. */
export interface UsersDetailsResponse {
  status?: string;
  data?: Record<string, unknown>[];
  columns?: TableMetaColumn[];
  column_count?: number;
  /** Present when the list is paginated server-side (same shape as budget-details). */
  pagination?: {
    totalItems?: number;
    total_records?: number;
    currentPage?: number;
    totalPages?: number;
    itemsPerPage?: number;
  };
  /** Optional aggregate counts when the backend includes them on the list response. */
  summary?: {
    total_users?: number;
    active_users?: number;
    inactive_users?: number;
  };
}
