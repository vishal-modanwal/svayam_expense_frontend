import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiMessage, PaginatedBudgetDetails } from '../models/app.models';
import { UsersDetailsResponse } from '../models/table-meta.models';
import { environment } from 'src/environments/environment';

/** Query for paginated admin budget list (`GET /admin/budget-details`). Align param names with backend. */
export interface AdminBudgetDetailsFilter {
  page?: number;
  limit?: number;
  /** Server-side sort field (snake_case typical for this API). */
  sortBy?: string;
  order?: 'ASC' | 'DESC';
  /** Category name substring search when supported by the API. */
  search?: string;
}

/**
 * Query for `GET /api/admin/users-details` when the backend supports server-side
 * pagination, search, sort, and active/inactive filtering (same naming style as budget-details).
 */
export interface AdminUsersDetailsFilter {
  page?: number;
  limit?: number;
  sortBy?: string;
  order?: 'ASC' | 'DESC';
  /** Substring match on name / email / phone (backend defines which columns). */
  search?: string;
  /** `1` = active users only, `0` = inactive only. */
  is_active?: 0 | 1;
}

/**
 * One pending account-activation row from `GET /api/admin/activation-requests`.
 * Extra keys from the API are ignored.
 */
export interface UserActivationRequestDto {
  id?: number;
  request_id?: number;
  requestId?: number;
  user_id?: number;
  userId?: number;
  name?: string;
  user_name?: string;
  full_name?: string;
  username?: string;
  email?: string;
}

/** Query for `GET /api/admin/notifications` (admin JWT via `AuthInterceptor`). */
export interface AdminNotificationsFilter {
  limit?: number;
  offset?: number;
  is_read?: boolean;
  user_id?: number;
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly api = environment.apiBaseUrl;

  constructor(private readonly http: HttpClient) {}

  getTotalSummary(): Observable<any> {
    return this.http.get<any>(`${this.api}/admin/total-summary`);
  }

  /**
   * Budget list. Omit `filter` for the legacy “full list” response (charts / summaries).
   * Pass `filter` for server-driven page, sort, and category search when the backend supports it.
   */
  getBudgetDetails(filter?: AdminBudgetDetailsFilter): Observable<PaginatedBudgetDetails> {
    const url = `${this.api}/admin/budget-details`;
    if (!filter) {
      return this.http.get<PaginatedBudgetDetails>(url);
    }
    return this.http.get<PaginatedBudgetDetails>(url, { params: this.toParams(filter) });
  }

  /**
   * Admin user list with embedded `columns` / `column_count` — prefer this over
   * `MetaService.getTableUsers()` for the admin users screen unless you need strict DB-only columns.
   *
   * Omit `filter` for a legacy full-list payload (e.g. expense toolbar counts when no cache).
   * Pass `filter` for server-driven page, sort, search, and `is_active` (align with backend).
   */
  getUsersDetails(filter?: AdminUsersDetailsFilter): Observable<UsersDetailsResponse> {
    const url = `${this.api}/admin/users-details`;
    if (!filter) {
      return this.http.get<UsersDetailsResponse>(url);
    }
    return this.http.get<UsersDetailsResponse>(url, { params: this.toParams(filter) });
  }

  toggleUserStatus(userId: number): Observable<ApiMessage> {
    return this.http.patch<ApiMessage>(`${this.api}/admin/toggle/${userId}`, {});
  }

  createCategoryWithBudget(payload: {
    name: string;
    description?: string;
    month: number;
    year: number;
    allocated_amount: number;
    currency?: string;
  }): Observable<ApiMessage> {
    return this.http.post<ApiMessage>(`${this.api}/admin/CategoryBudget`, payload);
  }

  /**
   * Update an existing category budget row. Path must match backend (`CategoryBudget` id).
   */
  updateCategoryBudget(
    id: number,
    payload: {
      name: string;
      description?: string;
      month: number;
      year: number;
      allocated_amount: number;
      currency?: string;
    }
  ): Observable<ApiMessage> {
    return this.http.patch<ApiMessage>(`${this.api}/admin/CategoryBudget/${id}`, payload);
  }

  /** Delete a category budget row by id (same id as list/update). */
  deleteCategoryBudget(id: number): Observable<ApiMessage> {
    return this.http.delete<ApiMessage>(`${this.api}/admin/CategoryBudget/${id}`);
  }

  /**
   * Inactive users asking to be re-activated. Expected: `GET /api/admin/activation-requests`
   * with `{ status, data: UserActivationRequestDto[] }` or `{ requests: [...] }`.
   */
  getActivationRequests(): Observable<{ status?: string; data?: UserActivationRequestDto[]; requests?: UserActivationRequestDto[] }> {
    return this.http.get<{ status?: string; data?: UserActivationRequestDto[]; requests?: UserActivationRequestDto[] }>(
      `${this.api}/admin/activation-requests`
    );
  }

  /** Approve one request. Expected: `POST /api/admin/activation-requests/:id/approve` */
  approveActivationRequest(requestId: number): Observable<ApiMessage> {
    return this.http.post<ApiMessage>(`${this.api}/admin/activation-requests/${requestId}/approve`, {});
  }

  /** Decline one request. Expected: `POST /api/admin/activation-requests/:id/deny` */
  denyActivationRequest(requestId: number): Observable<ApiMessage> {
    return this.http.post<ApiMessage>(`${this.api}/admin/activation-requests/${requestId}/deny`, {});
  }

  /**
   * Admin notification inbox. Examples:
   * `?limit=20&offset=0`, `?is_read=false`, `?user_id=5`.
   */
  getAdminNotifications(filter?: AdminNotificationsFilter): Observable<unknown> {
    const url = `${this.api}/admin/notifications`;
    if (!filter) {
      return this.http.get<unknown>(url);
    }
    return this.http.get<unknown>(url, { params: this.toParams(filter) });
  }

  /** Unread-only count for sidebar badge — `GET /api/admin/notifications/unread-count`. */
  getAdminNotificationsUnreadCount(): Observable<{ unread_count?: number }> {
    return this.http.get<{ unread_count?: number }>(`${this.api}/admin/notifications/unread-count`);
  }

  /** Mark all admin notifications read after inbox is opened — `PATCH /api/admin/notifications/read-all`. */
  markAllAdminNotificationsRead(): Observable<ApiMessage> {
    return this.http.patch<ApiMessage>(`${this.api}/admin/notifications/read-all`, {});
  }

  private toParams(source: object): HttpParams {
    let params = new HttpParams();
    Object.entries(source as Record<string, unknown>).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        params = params.set(key, String(value));
      }
    });
    return params;
  }
}
