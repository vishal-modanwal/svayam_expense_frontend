import { Component, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { AuthService } from 'src/app/core/services/auth.service';
import { ProfileService } from 'src/app/core/services/profile.service';
import { ToastService } from 'src/app/core/services/toast.service';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css']
})
export class ProfileComponent implements OnInit {
  readonly profileForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    mobile_no: ['', [Validators.required, Validators.pattern(/^[0-9]{10}$/)]]
  });

  email = '';
  role = 'user';

  constructor(
    private readonly fb: FormBuilder,
    private readonly profileService: ProfileService,
    private readonly authService: AuthService,
    private readonly toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.loadProfile();
  }

  loadProfile(): void {
    this.profileService.getMe().subscribe({
      next: (res) => {
        this.email = res.user.email;
        this.role = res.user.role || this.authService.getRole();
        this.profileForm.patchValue({
          name: res.user.name,
          mobile_no: res.user.mobile_no || res.user.mobile || ''
        });
        this.authService.syncProfile(res.user);
      },
      error: (err) => this.toastService.error(err?.error?.message || 'Failed to load profile')
    });
  }

  updateProfile(): void {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }
    this.profileService.updateProfile(this.profileForm.value as { name: string; mobile_no: string }).subscribe({
      next: (res) => {
        this.toastService.success(res.message || 'Profile updated');
        this.loadProfile();
      },
      error: (err) => this.toastService.error(err?.error?.message || 'Profile update failed')
    });
  }
}
