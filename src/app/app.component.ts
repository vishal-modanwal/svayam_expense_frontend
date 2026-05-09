import { Component } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'SvayamExpense';

  showNavbar = true;
  showFooter = true;

  constructor(private readonly router: Router) {
    this.updateNavbarVisibility(this.router.url);
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.updateNavbarVisibility((event as NavigationEnd).urlAfterRedirects);
      });
  }

  private updateNavbarVisibility(url: string): void {
    this.showNavbar = !url.startsWith('/admin');
    this.showFooter = !url.startsWith('/admin');
  }
}
