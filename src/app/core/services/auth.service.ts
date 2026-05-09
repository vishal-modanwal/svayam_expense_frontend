import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { AuthResponse, AuthUser, UserRole } from '../models/app.models';
import { environment } from 'src/environments/environment';

interface RegisterPayload {
  name: string;
  email: string;
  mobile_no: string;
  password: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = environment.apiBaseUrl;
  private readonly tokenKey = 'sv_token';
  private readonly userKey = 'sv_user';
  private readonly userSubject = new BehaviorSubject<AuthUser | null>(this.readUser());
  readonly user$ = this.userSubject.asObservable();

  constructor(private readonly http: HttpClient, private readonly router: Router) {}

  sendEmailOtp(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.api}/auth/sendEmailOtp`, { email });
  }

  verifyEmailOtp(email: string, otp: string): Observable<{ verified: boolean; message: string }> {
    return this.http.post<{ verified: boolean; message: string }>(`${this.api}/auth/verifyEmailOtp`, { email, otp });
  }

  register(payload: RegisterPayload): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.api}/auth/register`, payload);
  }

  login(payload: { email?: string; mobile_no?: string; password: string }): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.api}/auth/login`, payload).pipe(
      tap((response) => {
        localStorage.setItem(this.tokenKey, response.token);
        localStorage.setItem(this.userKey, JSON.stringify(response.user));
        this.userSubject.next(response.user);
      })
    );
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  getCurrentUser(): AuthUser | null {
    return this.userSubject.value;
  }

  getRole(): UserRole {
    const role = this.userSubject.value?.role;
    return role === 'admin' ? 'admin' : 'user';
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  logout(redirectToLogin = true): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
    this.userSubject.next(null);
    if (redirectToLogin) {
      this.router.navigate(['/login']);
    }
  }

  syncProfile(user: AuthUser): void {
    localStorage.setItem(this.userKey, JSON.stringify(user));
    this.userSubject.next(user);
  }

  private readUser(): AuthUser | null {
    const raw = localStorage.getItem(this.userKey);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  }
}
