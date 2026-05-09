import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiMessage, Expense, PaginatedExpenses } from '../models/app.models';
import { environment } from 'src/environments/environment';

interface ExpenseFilter {
  page?: number;
  limit?: number;
  category_id?: number | null;
  sortBy?: 'amount' | 'expense_date' | 'created_at';
  order?: 'ASC' | 'DESC';
  /** When supported by the API, restricts the list to standard (employee) vs extra (admin) expenses. */
  expense_type?: 'standard' | 'extra';
  /** Admin dashboard audience slice. */
  view?: 'users' | 'admins' | 'admins-extra';
}

interface AdminDashboardExpenseFilter {
  view: 'users' | 'admins' | 'admins-extra';
  page?: number;
  limit?: number;
  sortBy?: 'expense_date' | 'amount' | 'created_at';
  order?: 'ASC' | 'DESC';
}

@Injectable({ providedIn: 'root' })
export class ExpenseService {
  private readonly api = environment.apiBaseUrl;

  constructor(private readonly http: HttpClient) {}

  /**
   * Creates an expense. When `receiptFile` is set, sends `multipart/form-data` with field `receipt`
   * (typical multer name); otherwise sends JSON.
   */
  addExpense(payload: Partial<Expense>, receiptFile?: File | null): Observable<ApiMessage> {
    if (receiptFile) {
      const fd = new FormData();
      this.appendExpenseFieldsToFormData(fd, payload);
      fd.append('receipt', receiptFile, receiptFile.name);
      return this.http.post<ApiMessage>(`${this.api}/expense`, fd);
    }
    return this.http.post<ApiMessage>(`${this.api}/expense`, payload);
  }

  getMyExpenses(filter: ExpenseFilter): Observable<PaginatedExpenses> {
    return this.http.get<PaginatedExpenses>(`${this.api}/expense/my-expenses`, {
      params: this.toParams(filter)
    });
  }

  getAllExpenses(filter: ExpenseFilter): Observable<PaginatedExpenses> {
    return this.http.get<PaginatedExpenses>(`${this.api}/expense/all`, {
      params: this.toParams(filter)
    });
  }

  getDashboardExpenses(filter: AdminDashboardExpenseFilter): Observable<PaginatedExpenses> {
    return this.http.get<PaginatedExpenses>(`${this.api}/admin/dashboard-expenses`, {
      params: this.toParams(filter)
    });
  }

  searchByUserName(
    search: string,
    page = 1,
    limit?: number,
    expenseType?: 'standard' | 'extra',
    view?: 'users' | 'admins' | 'admins-extra'
  ): Observable<PaginatedExpenses> {
    let params = new HttpParams().set('search', search).set('page', String(page));
    if (limit != null && limit > 0) {
      params = params.set('limit', String(limit));
    }
    if (expenseType) {
      params = params.set('expense_type', expenseType);
    }
    if (view) {
      params = params.set('view', view);
    }
    return this.http.get<PaginatedExpenses>(`${this.api}/expense/search`, { params });
  }

  /**
   * Updates an expense. When `receiptFile` is set, sends `multipart/form-data` with field `receipt`.
   */
  updateExpense(id: number, payload: Partial<Expense>, receiptFile?: File | null): Observable<ApiMessage> {
    if (receiptFile) {
      const fd = new FormData();
      this.appendExpenseFieldsToFormData(fd, payload);
      fd.append('receipt', receiptFile, receiptFile.name);
      return this.http.put<ApiMessage>(`${this.api}/expense/${id}`, fd);
    }
    return this.http.put<ApiMessage>(`${this.api}/expense/${id}`, payload);
  }

  deleteExpense(id: number): Observable<ApiMessage> {
    return this.http.delete<ApiMessage>(`${this.api}/expense/${id}`);
  }

  downloadMyPdf(query: { month?: number; year?: number; category_id?: number | null }): Observable<Blob> {
    return this.http.get(`${this.api}/expense/report/pdf`, {
      params: this.toParams(query),
      responseType: 'blob'
    });
  }

  downloadAllPdf(query: { month?: number; year?: number; category_id?: number | null }): Observable<Blob> {
    return this.http.get(`${this.api}/expense/report/pdf/all`, {
      params: this.toParams(query),
      responseType: 'blob'
    });
  }

  private appendExpenseFieldsToFormData(fd: FormData, payload: Partial<Expense>): void {
    for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
      if (value === null || value === undefined || value === '') {
        continue;
      }
      fd.append(key, String(value));
    }
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
