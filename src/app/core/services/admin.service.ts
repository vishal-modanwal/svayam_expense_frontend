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
   */
  getUsersDetails(): Observable<UsersDetailsResponse> {
    return this.http.get<UsersDetailsResponse>(`${this.api}/admin/users-details`);
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
