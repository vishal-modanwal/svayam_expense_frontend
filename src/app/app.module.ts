import { APP_INITIALIZER, NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HTTP_INTERCEPTORS, HttpClientModule } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatOptionModule } from '@angular/material/core';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatStepperModule } from '@angular/material/stepper';
import { MatTableModule } from '@angular/material/table';
import { MatSortModule } from '@angular/material/sort';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatBadgeModule } from '@angular/material/badge';
import { LottieModule } from 'ngx-lottie';
import player from 'lottie-web';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { NavbarComponent } from './shared/components/navbar/navbar.component';
import { FooterComponent } from './shared/components/footer/footer.component';
import { LoaderOverlayComponent } from './shared/components/loader-overlay/loader-overlay.component';
import { LandingComponent } from './pages/landing/landing.component';
import { ForgotPasswordComponent } from './pages/auth/forgot-password/forgot-password.component';
import { LoginComponent } from './pages/auth/login/login.component';
import { RegisterComponent } from './pages/auth/register/register.component';
import { UserDashboardComponent } from './pages/user-dashboard/user-dashboard.component';
import { AdminDashboardComponent } from './pages/admin-dashboard/admin-dashboard.component';
import { SidebarComponent } from './pages/admin-dashboard/sidebar/sidebar.component';
import { ProfileComponent } from './pages/profile/profile.component';
import { AuthInterceptor } from './core/interceptors/auth.interceptor';
import { DynamicDataTableComponent } from './shared/components/dynamic-data-table/dynamic-data-table.component';
import { ExpenseFormModalComponent } from './shared/components/expense-form-modal/expense-form-modal.component';
import { ExpenseDataTableComponent } from './shared/components/expense-data-table/expense-data-table.component';
import { AdminExpenseDataTableComponent } from './shared/components/admin-expense-data-table/admin-expense-data-table.component';
import { TranslatePipe } from './shared/pipes/translate.pipe';
import { I18nService } from './core/services/i18n.service';

export function lottiePlayerFactory(): typeof player {
  return player;
}

export function initAppI18n(i18n: I18nService): () => Promise<void> {
  return () => i18n.init();
}

@NgModule({
  declarations: [
    AppComponent,
    NavbarComponent,
    FooterComponent,
    LoaderOverlayComponent,
    LandingComponent,
    LoginComponent,
    ForgotPasswordComponent,
    RegisterComponent,
    UserDashboardComponent,
    AdminDashboardComponent,
    SidebarComponent,
    ProfileComponent,
    DynamicDataTableComponent,
    ExpenseFormModalComponent,
    ExpenseDataTableComponent,
    AdminExpenseDataTableComponent,
    TranslatePipe
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    HttpClientModule,
    FormsModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatDividerModule,
    MatCardModule,
    MatInputModule,
    MatFormFieldModule,
    MatOptionModule,
    MatSelectModule,
    MatSnackBarModule,
    MatStepperModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatBadgeModule,
    LottieModule.forRoot({ player: lottiePlayerFactory })
  ],
  providers: [
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor,
      multi: true
    },
    {
      provide: APP_INITIALIZER,
      useFactory: initAppI18n,
      deps: [I18nService],
      multi: true
    }
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
