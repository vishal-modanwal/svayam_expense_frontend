import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiMessage, AuthUser } from '../models/app.models';
import { environment } from 'src/environments/environment';

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly api = environment.apiBaseUrl;

  constructor(private readonly http: HttpClient) {}

  getMe(): Observable<{ user: AuthUser }> {
    return this.http.get<{ user: AuthUser }>(`${this.api}/profile`);
  }

  updateProfile(payload: { name?: string; mobile_no?: string }): Observable<ApiMessage> {
    return this.http.put<ApiMessage>(`${this.api}/profile/update`, payload);
  }

  forgotPassword(email: string): Observable<ApiMessage> {
    return this.http.post<ApiMessage>(`${this.api}/profile/forgetPassword`, { email });
  }

  resetPassword(payload: { email: string; otp: string; password: string }): Observable<ApiMessage> {
    return this.http.post<ApiMessage>(`${this.api}/profile/resetPassword`, payload);
  }
}
