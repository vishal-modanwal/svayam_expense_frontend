export type UserRole = 'user' | 'admin';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  mobile?: string;
  role?: UserRole;
  mobile_no?: string;
  /** When false or 0, account cannot add expenses until enabled. Omitted = active (backward compatible). */
  is_active?: boolean | number;
  /** Optional string from API, e.g. active | inactive | suspended */
  status?: string;
  /**
   * Activity flag from profile API (e.g. active | inactive).
   * When inactive, user dashboard shows inactive state and blocks adding expenses.
   */
  activity_status?: string;
  /** Some APIs use camelCase instead of snake_case. */
  activityStatus?: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface Category {
  id: number;
  name: string;
  description?: string;
  created_at?: string;
}

export interface Expense {
  id: number;
  title: string;
  category_id: number;
  category_name?: string;
  amount: number;
  payment_method: string;
  vendor?: string;
  description?: string;
  expense_date: string;
  expense_type: 'standard' | 'extra';
  user_id?: number;
  user_name?: string;
  user_role?: UserRole;
  user?: {
    id?: number;
    name?: string;
    email?: string;
    role?: UserRole;
  };
  category?: {
    id?: number;
    name?: string;
  };
  /** Receipt file URL from API (absolute or path under uploads). */
  receipt_url?: string | null;
}

/** Row shape for the shared expense mat-table (maps from `Expense`). */
export interface ExpenseTableRow {
  id: number;
  title: string;
  amount: number;
  category: string;
  expense_date: string;
  payment_method: string;
  notes: string | null;
  vendor: string | null;
  receipt_url: string | null;
}

/** Admin “all expenses” mat-table row. */
export interface AdminExpenseTableRow {
  id: number;
  title: string;
  user: string;
  category: string;
  date: string;
  amount: number;
}

export interface PaginatedExpenses {
  status: string;
  data: Expense[];
  pagination: {
    totalItems: number;
    currentPage: number;
    totalPages: number;
    /** When the API returns page size, the dashboard syncs the items-per-page control. */
    itemsPerPage?: number;
  };
}

export interface ApiMessage {
  message?: string;
  error?: string;
  status?: string;
}
