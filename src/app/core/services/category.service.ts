import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiMessage, Category } from '../models/app.models';
import { filterCategoriesForExpensePicker } from '../utils/category-picker.utils';
import { environment } from 'src/environments/environment';

@Injectable({ providedIn: 'root' })
export class CategoryService {
  private readonly api = environment.apiBaseUrl;

  constructor(private readonly http: HttpClient) {}

  getAll(): Observable<{ status: string; data: Category[] }> {
    return this.http.get<{ status: string; data: Category[] }>(`${this.api}/category`).pipe(
        map((res) => ({
          ...res,
          data: filterCategoriesForExpensePicker(res.data ?? [])
        }))
      );
  }

  getById(id: number): Observable<{ status: string; data: Category }> {
    return this.http.get<{ status: string; data: Category }>(`${this.api}/category/${id}`);
  }

  // Backend intentionally uses POST for update.
  updateCategory(id: number, payload: { name: string; description?: string }): Observable<ApiMessage> {
    return this.http.post<ApiMessage>(`${this.api}/category/${id}`, payload);
  }

  deleteCategory(id: number): Observable<ApiMessage> {
    return this.http.delete<ApiMessage>(`${this.api}/category/${id}`);
  }
}
