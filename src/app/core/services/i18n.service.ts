import { Injectable } from '@angular/core';
import { HttpBackend, HttpClient } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import { map, tap } from 'rxjs/operators';

export type AppLang = 'en' | 'hi';

@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly storageKey = 'appLang';
  private flat: Record<string, string> = {};
  private lang: AppLang = 'en';
  private readonly languageChange = new Subject<void>();
  /** Emits after a language bundle is loaded and applied (including initial init). */
  readonly onLanguageChange = this.languageChange.asObservable();

  /** HttpClient without interceptors — avoids auth loader / tokens during APP_INITIALIZER. */
  private readonly http: HttpClient;

  constructor(httpBackend: HttpBackend) {
    this.http = new HttpClient(httpBackend);
  }

  init(): Promise<void> {
    const raw = localStorage.getItem(this.storageKey);
    const initial: AppLang = raw === 'hi' ? 'hi' : 'en';
    return new Promise((resolve) => {
      this.fetchAndApply(initial).subscribe({
        next: () => {
          this.languageChange.next();
          resolve();
        },
        error: () => {
          this.lang = initial;
          this.flat = {};
          if (typeof document !== 'undefined') {
            document.documentElement.lang = initial === 'hi' ? 'hi' : 'en';
          }
          resolve();
        }
      });
    });
  }

  use(lang: AppLang): void {
    if (lang === this.lang && Object.keys(this.flat).length > 0) {
      return;
    }
    this.fetchAndApply(lang).subscribe({
      next: () => {
        localStorage.setItem(this.storageKey, lang);
        this.languageChange.next();
      }
    });
  }

  currentLang(): AppLang {
    return this.lang;
  }

  instant(key: string, params?: Record<string, string | number>): string {
    let s = this.flat[key] ?? key;
    if (!params) {
      return s;
    }
    for (const [k, v] of Object.entries(params)) {
      s = s.split(`{{${k}}}`).join(String(v));
    }
    return s;
  }

  private fetchAndApply(lang: AppLang): Observable<void> {
    return this.http.get<Record<string, unknown>>(`assets/i18n/${lang}.json`).pipe(
      tap((data) => {
        this.flat = this.flatten(data);
        this.lang = lang;
        if (typeof document !== 'undefined') {
          document.documentElement.lang = lang === 'hi' ? 'hi' : 'en';
        }
      }),
      map(() => undefined)
    );
  }

  private flatten(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
    const out: Record<string, string> = {};
    for (const k of Object.keys(obj)) {
      const raw = obj[k];
      const path = prefix ? `${prefix}.${k}` : k;
      if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
        Object.assign(out, this.flatten(raw as Record<string, unknown>, path));
      } else if (raw !== null && raw !== undefined) {
        out[path] = String(raw);
      }
    }
    return out;
  }
}
