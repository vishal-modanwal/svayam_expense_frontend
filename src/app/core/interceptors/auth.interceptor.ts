import { HttpErrorResponse, HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, finalize, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { LoaderService } from '../services/loader.service';
import { ToastService } from '../services/toast.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(
    private readonly authService: AuthService,
    private readonly loaderService: LoaderService,
    private readonly toastService: ToastService
  ) {}

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    if (this.isStaticAssetRequest(req)) {
      return next.handle(req);
    }
    const skipLoader = this.skipGlobalLoaderForRequest(req);
    if (!skipLoader) {
      this.loaderService.show();
    }
    const token = this.authService.getToken();
    const request = token
      ? req.clone({
          setHeaders: {
            Authorization: `Bearer ${token}`
          }
        })
      : req;

    return next.handle(request).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status === 401 && this.authService.isLoggedIn()) {
          this.toastService.error('Session expired. Please login again.');
          this.authService.logout(true);
        } else if (error.status === 403) {
          this.toastService.error('Access denied for this action.');
        }
        return throwError(() => error);
      }),
      finalize(() => {
        if (!skipLoader) {
          this.loaderService.hide();
        }
      })
    );
  }

  /** Receipt scan prefill only — modal shows inline state; keep full-screen loader for real saves. */
  private skipGlobalLoaderForRequest(req: HttpRequest<unknown>): boolean {
    return req.method === 'POST' && req.url.includes('/expense/scan-receipt');
  }

  private isStaticAssetRequest(req: HttpRequest<unknown>): boolean {
    const u = req.url;
    return u.includes('/assets/') || u.startsWith('assets/');
  }
}
