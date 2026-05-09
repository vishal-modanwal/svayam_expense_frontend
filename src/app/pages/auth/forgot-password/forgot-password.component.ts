import { Component, ViewChild } from '@angular/core';
import { AbstractControl, FormBuilder, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatStepper } from '@angular/material/stepper';
import { AuthService } from 'src/app/core/services/auth.service';
import { ProfileService } from 'src/app/core/services/profile.service';
import { ToastService } from 'src/app/core/services/toast.service';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.component.html',
  styleUrls: ['../login/login.component.css', './forgot-password.component.css']
})
export class ForgotPasswordComponent {
  @ViewChild('stepper') private stepper?: MatStepper;

  readonly emailForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]]
  });

  readonly otpForm = this.fb.group({
    otp: ['', [Validators.required, Validators.minLength(4), Validators.maxLength(6)]]
  });

  readonly passwordForm = this.fb.group(
    {
      new_password: ['', [Validators.required, Validators.minLength(6)]],
      confirm_password: ['', [Validators.required]]
    },
    { validators: ForgotPasswordComponent.passwordsMatch }
  );

  otpSent = false;
  otpVerified = false;

  loadingSend = false;
  loadingVerify = false;
  loadingReset = false;

  emailSubmitted = false;
  otpSubmitted = false;
  passwordSubmitted = false;

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly profileService: ProfileService,
    private readonly toastService: ToastService,
    private readonly router: Router
  ) {}

  private static passwordsMatch(group: AbstractControl): ValidationErrors | null {
    const p = group.get('new_password')?.value as string | undefined;
    const c = group.get('confirm_password')?.value as string | undefined;
    if (p == null || c == null || p === '' || c === '') {
      return null;
    }
    return p === c ? null : { mismatch: true };
  }

  get ef() {
    return this.emailForm.controls;
  }

  get of() {
    return this.otpForm.controls;
  }

  get pf() {
    return this.passwordForm.controls;
  }

  private goNextStep(): void {
    queueMicrotask(() => this.stepper?.next());
  }

  /** Step 1 → POST /api/profile/forgetPassword */
  sendOtp(): void {
    this.emailSubmitted = true;
    if (this.emailForm.invalid) {
      this.emailForm.markAllAsTouched();
      return;
    }
    this.loadingSend = true;
    this.profileService.forgotPassword(this.emailForm.value.email as string).subscribe({
      next: (res) => {
        this.loadingSend = false;
        this.otpSent = true;
        this.otpVerified = false;
        this.otpForm.reset();
        this.toastService.info(res.message || 'OTP sent to email');
        this.goNextStep();
      },
      error: (err) => {
        this.loadingSend = false;
        this.toastService.error(err?.error?.message || 'Could not send OTP');
      }
    });
  }

  /** Step 2 → POST /api/auth/verifyEmailOtp */
  verifyOtp(): void {
    this.otpSubmitted = true;
    if (this.otpForm.invalid || this.emailForm.invalid) {
      this.otpForm.markAllAsTouched();
      this.emailForm.markAllAsTouched();
      return;
    }
    this.loadingVerify = true;
    const email = this.emailForm.value.email as string;
    const otp = this.otpForm.value.otp as string;
    this.authService.verifyEmailOtp(email, otp).subscribe({
      next: (res) => {
        this.loadingVerify = false;
        if (res.verified) {
          this.otpVerified = true;
          this.toastService.success(res.message || 'OTP verified');
          this.goNextStep();
        } else {
          this.toastService.error(res.message || 'Invalid OTP');
        }
      },
      error: (err) => {
        this.loadingVerify = false;
        this.toastService.error(err?.error?.message || 'OTP verification failed');
      }
    });
  }

  /** Step 3 → POST /api/profile/resetPassword */
  resetPassword(): void {
    this.passwordSubmitted = true;
    if (this.passwordForm.invalid || !this.otpVerified) {
      this.passwordForm.markAllAsTouched();
      if (!this.otpVerified) {
        this.toastService.error('Verify OTP first');
      }
      return;
    }
    this.loadingReset = true;
    const email = this.emailForm.value.email as string;
    const otp = this.otpForm.value.otp as string;
    const password = this.passwordForm.value.new_password as string;
    this.profileService.resetPassword({ email, otp, password }).subscribe({
      next: (res) => {
        this.loadingReset = false;
        this.toastService.success(res.message || 'Password updated');
        this.router.navigate(['/login']);
      },
      error: (err) => {
        this.loadingReset = false;
        this.toastService.error(err?.error?.message || err?.error?.error || 'Password reset failed');
      }
    });
  }
}
