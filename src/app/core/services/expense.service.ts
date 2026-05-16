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
  /** Text search on my-expenses list (title / vendor / etc.) — sent as `search` query param when non-empty. */
  search?: string;
  /** When supported by the API, restricts the list to standard (employee) vs extra (admin) expenses. */
  expense_type?: 'standard' | 'extra';
  /**
   * Admin dashboard list slice for `GET /admin/dashboard-expenses`:
   * `users` (active employees), `users-inactive`, `admins`, `admins-extra`.
   */
  view?: 'users' | 'users-inactive' | 'admins' | 'admins-extra';
}

interface AdminDashboardExpenseFilter {
  view: 'users' | 'users-inactive' | 'admins' | 'admins-extra';
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
   * POST /api/expense/scan-receipt — multipart with field `receipt` only.
   * Does not create an expense; server may discard the temp file after responding.
   */
  scanReceipt(receiptFile: File): Observable<unknown> {
    const fd = new FormData();
    this.appendReceiptFile(fd, receiptFile);
    return this.http.post<unknown>(`${this.api}/expense/scan-receipt`, fd);
  }

  /**
   * POST /api/expense — JSON or multipart/form-data.
   * Body: title, category_id, amount, payment_method (Cash | Card | UPI | Net Banking | Others),
   * optional vendor, description, expense_date; optional expense_type (omit for standard; `extra` admin-only).
   * File field name when multipart: `receipt`. Standard expenses: budget check may return 400.
   */
  addExpense(payload: Partial<Expense>, receiptFile?: File | null): Observable<ApiMessage> {
    const url = `${this.api}/expense`;
    if (receiptFile) {
      const fd = new FormData();
      this.appendExpenseMultipartFields(fd, payload);
      this.appendReceiptFile(fd, receiptFile);
      return this.http.post<ApiMessage>(url, fd);
    }
    return this.http.post<ApiMessage>(url, payload);
  }

  /**
   * GET /expense/my-expenses — sends `page`, `limit`, optional `category_id`, `sortBy`, `order`,
   * and optional `search` (non-empty) for server-side list filtering.
   */
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
    view?: 'users' | 'users-inactive' | 'admins' | 'admins-extra'
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
   * PUT /api/expense/:id — same fields as create except expense_date is not applied (backend limitation).
   * Optional new receipt via multipart field `receipt`. Owner or admin.
   */
  updateExpense(id: number, payload: Partial<Expense>, receiptFile?: File | null): Observable<ApiMessage> {
    if (receiptFile) {
      const fd = new FormData();
      this.appendExpenseMultipartFields(fd, payload);
      this.appendReceiptFile(fd, receiptFile);
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

  /**
   * Only known scalar expense fields — avoids stray keys / nested objects breaking multer parsers.
   */
  private appendExpenseMultipartFields(fd: FormData, payload: Partial<Expense>): void {
    const keys = [
      'title',
      'category_id',
      'amount',
      'payment_method',
      'vendor',
      'description',
      'expense_date',
      'expense_type'
    ] as const;
    const rec = payload as Record<string, unknown>;
    for (const key of keys) {
      const value = rec[key];
      if (value === null || value === undefined || value === '') {
        continue;
      }
      if (typeof value === 'object') {
        continue;
      }
      fd.append(key, String(value));
    }
  }

  private appendReceiptFile(fd: FormData, receiptFile: File): void {
    const filename = receiptFile.name?.trim() ? receiptFile.name.trim() : 'receipt';
    fd.append('receipt', receiptFile, filename);
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
