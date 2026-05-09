import { Component, ViewChild } from '@angular/core';
import { AbstractControl, FormBuilder, ValidationErrors, Validators } from '@angular/forms';
import { MatStepper } from '@angular/material/stepper';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/core/services/auth.service';
import { ToastService } from 'src/app/core/services/toast.service';

function passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password')?.value;
  const confirmPassword = control.get('confirm_password')?.value;
  if (!confirmPassword) {
    return null;
  }
  return password === confirmPassword ? null : { passwordMismatch: true };
}

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrls: ['../login/login.component.css', './register.component.css']
})
export class RegisterComponent {
  @ViewChild(MatStepper) private stepper?: MatStepper;

  readonly emailForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]]
  });

  readonly otpForm = this.fb.group({
    otp: ['', [Validators.required, Validators.minLength(4), Validators.maxLength(6)]]
  });

  readonly profileForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    mobile_no: ['', [Validators.required, Validators.pattern(/^[0-9]{10}$/)]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    confirm_password: ['', [Validators.required]]
  }, { validators: [passwordMatchValidator] });

  emailVerified = false;
  private otpVerifyInProgress = false;

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
      next: (res) => {
        this.emailVerified = false;
        this.otpForm.reset();
        this.toastService.success(res.message || 'OTP sent');
        this.stepper?.next();
      },
      error: (err) => this.toastService.error(err?.error?.message || 'OTP send failed')
    });
  }

  verifyOtp(): void {
    if (this.otpForm.invalid || this.emailForm.invalid) {
      this.otpForm.markAllAsTouched();
      return;
    }
    if (this.otpVerifyInProgress) {
      return;
    }
    this.otpVerifyInProgress = true;
    this.authService
      .verifyEmailOtp(this.emailForm.value.email as string, this.otpForm.value.otp as string)
      .subscribe({
        next: (res) => {
          this.otpVerifyInProgress = false;
          this.emailVerified = !!res.verified;
          if (this.emailVerified) {
            this.toastService.success(res.message || 'Email verified');
            this.stepper?.next();
          } else {
            this.toastService.error(res.message || 'Invalid OTP');
          }
        },
        error: (err) => {
          this.otpVerifyInProgress = false;
          this.toastService.error(err?.error?.message || 'OTP verification failed');
        }
      });
  }

  onOtpInput(): void {
    const otpValue = (this.otpForm.value.otp || '').toString().trim();
    if (otpValue.length === 6 && !this.emailVerified) {
      this.verifyOtp();
    }
  }

  register(): void {
    if (this.profileForm.invalid || !this.emailVerified) {
      this.profileForm.markAllAsTouched();
      if (this.profileForm.hasError('passwordMismatch')) {
        this.toastService.error('Password and confirm password must match');
      }
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
