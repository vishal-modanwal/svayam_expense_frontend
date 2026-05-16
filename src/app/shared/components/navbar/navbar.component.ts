import { ChangeDetectorRef, Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { MatMenuTrigger } from '@angular/material/menu';
import { filter, Subscription } from 'rxjs';
import { AuthService } from 'src/app/core/services/auth.service';
import { ProfileService } from 'src/app/core/services/profile.service';
import { mergeStoredProfileWithUser } from 'src/app/core/utils/stored-user-profile';
import { I18nService } from 'src/app/core/services/i18n.service';

const THEME_STORAGE_KEY = 'appTheme';
const LEGACY_THEME_KEY = 'dashboardTheme';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.css']
})
export class NavbarComponent implements OnInit, OnDestroy {
  @ViewChild('mobileNavMenuTrigger') private mobileNavMenuTrigger?: MatMenuTrigger;
  @ViewChild('desktopProfileMenuTrigger') private desktopProfileMenuTrigger?: MatMenuTrigger;

  isDarkTheme = false;
  userName = '';
  userEmail = '';
  userMobile = '';

  private userSub?: Subscription;
  private routerSub?: Subscription;
  private langSub?: Subscription;

  constructor(
    private readonly router: Router,
    private readonly auth: AuthService,
    private readonly profile: ProfileService,
    private readonly cdr: ChangeDetectorRef,
    readonly i18n: I18nService
  ) {}

  ngOnInit(): void {
    const saved = localStorage.getItem(THEME_STORAGE_KEY) || localStorage.getItem(LEGACY_THEME_KEY);
    this.isDarkTheme = saved === 'dark';
    this.applyThemeClass();
    this.hydrateProfileFromStorage();
    this.loadUserForNav();
    this.userSub = this.auth.user$.subscribe(() => {
      this.hydrateProfileFromStorage();
      this.cdr.detectChanges();
    });
    this.routerSub = this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)).subscribe(() => {
      this.loadUserForNav();
      this.cdr.detectChanges();
    });
    this.langSub = this.i18n.onLanguageChange.subscribe(() => this.cdr.detectChanges());
  }

  ngOnDestroy(): void {
    this.userSub?.unsubscribe();
    this.routerSub?.unsubscribe();
    this.langSub?.unsubscribe();
  }

  get userInitials(): string {
    const n = (this.userName || '').trim();
    if (!n) {
      return '?';
    }
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }
    return n.charAt(0).toUpperCase();
  }

  isAdmin(): boolean {
    return this.auth.isLoggedIn() && this.auth.getRole() === 'admin';
  }

  /** Primary app area after sign-in: admin → /admin, else → /dashboard. Guests use /dashboard (guard → login). */
  dashboardRouterLink(): string {
    if (!this.auth.isLoggedIn()) {
      return '/dashboard';
    }
    return this.auth.getRole() === 'admin' ? '/admin/expenses' : '/dashboard';
  }

  dashboardLabel(): string {
    return this.auth.isLoggedIn() && this.auth.getRole() === 'admin'
      ? this.i18n.instant('nav.admin')
      : this.i18n.instant('nav.dashboard');
  }

  setLang(lang: 'en' | 'hi'): void {
    this.i18n.use(lang);
  }

  toggleTheme(): void {
    this.isDarkTheme = !this.isDarkTheme;
    localStorage.setItem(THEME_STORAGE_KEY, this.isDarkTheme ? 'dark' : 'light');
    this.applyThemeClass();
  }

  closeMobileNav(): void {
    queueMicrotask(() => this.mobileNavMenuTrigger?.closeMenu());
  }

  private applyThemeClass(): void {
    if (typeof document === 'undefined') {
      return;
    }
    document.body.classList.toggle('dark-theme', this.isDarkTheme);
  }

  isLoggedIn(): boolean {
    return this.auth.isLoggedIn();
  }

  showLoginNav(): boolean {
    if (this.isLoggedIn()) {
      return false;
    }
    return this.isLandingRoute();
  }

  showProfileMenu(): boolean {
    return this.isLoggedIn();
  }

  showDashboardNavLink(): boolean {
    if (!this.isLoggedIn()) {
      return this.isLandingRoute();
    }
    if (this.isAdmin()) {
      return this.isLandingRoute() || !this.isOnAdminAppRoute();
    }
    return !this.isOnUserDashboardRoute();
  }

  /** Logged-in employee on `/dashboard` — hide duplicate "Dashboard" nav entry. */
  private isOnUserDashboardRoute(): boolean {
    return this.normalizedPath() === '/dashboard';
  }

  /** Logged-in admin on any `/admin/...` route — hide duplicate "Admin" nav entry. */
  private isOnAdminAppRoute(): boolean {
    return this.normalizedPath().startsWith('/admin');
  }

  /** Optional extra CTA on marketing home (not on login/register). */
  showRegisterNav(): boolean {
    if (this.isLoggedIn()) {
      return false;
    }
    return this.isLandingRoute();
  }

  logout(): void {
    this.userName = '';
    this.userEmail = '';
    this.userMobile = '';
    this.auth.logout(true);
    this.closeMobileNav();
  }

  goToProfilePage(): void {
    this.navigateFromMenu('/profile');
  }

  private navigateFromMenu(url: string): void {
    const go = (): void => {
      void this.router.navigateByUrl(url);
    };
    let navigated = false;
    const safeGo = (): void => {
      if (navigated) {
        return;
      }
      navigated = true;
      go();
    };
    const trig =
      this.desktopProfileMenuTrigger?.menuOpen
        ? this.desktopProfileMenuTrigger
        : this.mobileNavMenuTrigger?.menuOpen
          ? this.mobileNavMenuTrigger
          : undefined;
    if (trig) {
      const sub = trig.menuClosed.subscribe(() => {
        sub.unsubscribe();
        safeGo();
      });
      window.setTimeout(() => {
        sub.unsubscribe();
        safeGo();
      }, 280);
      return;
    }
    window.setTimeout(safeGo, 0);
  }

  private normalizedPath(): string {
    let p = this.router.url.split('?')[0].split('#')[0];
    if (p.length > 1 && p.endsWith('/')) {
      p = p.slice(0, -1);
    }
    return p || '/';
  }

  private isLandingRoute(): boolean {
    const p = this.normalizedPath();
    return p === '/' || p === '/landing';
  }

  private hydrateProfileFromStorage(): void {
    const u = this.auth.getCurrentUser();
    if (!u) {
      this.userName = '';
      this.userEmail = '';
      this.userMobile = '';
      return;
    }
    this.userName = u.name ?? '';
    this.userEmail = u.email ?? '';
    this.userMobile = (u.mobile_no || u.mobile || '').trim();
  }

  private loadUserForNav(): void {
    if (!this.isLoggedIn()) {
      return;
    }
    this.profile.getMe().subscribe({
      next: (res) => {
        const u = res?.user;
        if (u) {
          this.userName = u.name ?? '';
          this.userEmail = u.email ?? '';
          this.userMobile = (u.mobile_no || u.mobile || '').trim();
          mergeStoredProfileWithUser(u, this.auth);
        }
      },
      error: () => this.hydrateProfileFromStorage()
    });
  }
}
