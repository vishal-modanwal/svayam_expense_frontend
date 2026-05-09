import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { TableMetaResponse } from '../models/table-meta.models';
import { environment } from 'src/environments/environment';

@Injectable({ providedIn: 'root' })
export class MetaService {
  private readonly api = environment.apiBaseUrl;

  constructor(private readonly http: HttpClient) {}

  /** Admin only — DB users table shape (id, name, email, …). */
  getTableUsers(): Observable<TableMetaResponse> {
    return this.http.get<TableMetaResponse>(`${this.api}/meta/tables/users`);
  }

  /** Logged-in user — columns aligned with expense list APIs. */
  getTableExpenses(): Observable<TableMetaResponse> {
    return this.http.get<TableMetaResponse>(`${this.api}/meta/tables/expenses`);
  }

  /** Admin only — columns aligned with GET /api/admin/budget-details rows. */
  getTableBudgets(): Observable<TableMetaResponse> {
    return this.http.get<TableMetaResponse>(`${this.api}/meta/tables/budgets`);
  }
}
