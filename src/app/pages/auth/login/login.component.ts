import { Component } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/core/services/auth.service';
import { ProfileService } from 'src/app/core/services/profile.service';
import { ToastService } from 'src/app/core/services/toast.service';
import { mergeStoredProfileWithUser } from 'src/app/core/utils/stored-user-profile';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent {
  readonly form = this.fb.group({
    identity: ['', [Validators.required]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  submitted = false;
  loading = false;

  get f() {
    return this.form.controls;
  }

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly profileService: ProfileService,
    private readonly toastService: ToastService,
    private readonly router: Router
  ) {}

  submit(): void {
    this.submitted = true;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const identity = this.form.value.identity?.trim() ?? '';
    const payload =
      identity.includes('@')
        ? { email: identity, password: this.form.value.password as string }
        : { mobile_no: identity, password: this.form.value.password as string };

    this.loading = true;
    this.authService.login(payload).subscribe({
      next: () => {
        this.profileService.getMe().subscribe({
          next: (profile) => {
            this.loading = false;
            mergeStoredProfileWithUser(profile.user, this.authService);
            this.toastService.success('Login successful');
            this.router.navigate([profile.user.role === 'admin' ? '/admin' : '/dashboard']);
          },
          error: () => {
            this.loading = false;
            this.toastService.success('Login successful');
            this.router.navigate(['/dashboard']);
          }
        });
      },
      error: (err) => {
        this.loading = false;
        this.toastService.error(err?.error?.message || err?.error?.error || 'Login failed');
      }
    });
  }
}
