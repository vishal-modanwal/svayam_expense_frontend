import { Component } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/core/services/auth.service';
import { ToastService } from 'src/app/core/services/toast.service';

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrls: ['../login/login.component.css', './register.component.css']
})
export class RegisterComponent {
  readonly emailForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]]
  });

  readonly otpForm = this.fb.group({
    otp: ['', [Validators.required, Validators.minLength(4), Validators.maxLength(6)]]
  });

  readonly profileForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    mobile_no: ['', [Validators.required, Validators.pattern(/^[0-9]{10}$/)]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  emailVerified = false;

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly toastService: ToastService,
    private readonly router: Router
  ) {}

  sendOtp(): void {
    if (this.emailForm.invalid) {
      this.emailForm.markAllAsTouched();
      return;
    }
    this.authService.sendEmailOtp(this.emailForm.value.email as string).subscribe({
      next: (res) => this.toastService.success(res.message || 'OTP sent'),
      error: (err) => this.toastService.error(err?.error?.message || 'OTP send failed')
    });
  }

  verifyOtp(): void {
    if (this.otpForm.invalid || this.emailForm.invalid) {
      this.otpForm.markAllAsTouched();
      return;
    }
    this.authService
      .verifyEmailOtp(this.emailForm.value.email as string, this.otpForm.value.otp as string)
      .subscribe({
        next: (res) => {
          this.emailVerified = !!res.verified;
          if (this.emailVerified) {
            this.toastService.success(res.message || 'Email verified');
          } else {
            this.toastService.error(res.message || 'Invalid OTP');
          }
        },
        error: (err) => this.toastService.error(err?.error?.message || 'OTP verification failed')
      });
  }

  register(): void {
    if (this.profileForm.invalid || !this.emailVerified) {
      this.profileForm.markAllAsTouched();
      if (!this.emailVerified) {
        this.toastService.error('Verify email OTP first');
      }
      return;
    }
    this.authService
      .register({
        name: this.profileForm.value.name as string,
        email: this.emailForm.value.email as string,
        mobile_no: this.profileForm.value.mobile_no as string,
        password: this.profileForm.value.password as string
      })
      .subscribe({
        next: (res) => {
          this.toastService.success(res.message || 'Registration successful');
          this.router.navigate(['/login']);
        },
        error: (err) => this.toastService.error(err?.error?.message || err?.error?.error || 'Registration failed')
      });
  }
}
