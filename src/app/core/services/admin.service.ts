import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiMessage } from '../models/app.models';
import { UsersDetailsResponse } from '../models/table-meta.models';
import { environment } from 'src/environments/environment';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly api = environment.apiBaseUrl;

  constructor(private readonly http: HttpClient) {}

  getTotalSummary(): Observable<any> {
    return this.http.get<any>(`${this.api}/admin/total-summary`);
  }

  getBudgetDetails(): Observable<any> {
    return this.http.get<any>(`${this.api}/admin/budget-details`);
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
}
