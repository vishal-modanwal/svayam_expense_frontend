import { Component, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { AuthService } from 'src/app/core/services/auth.service';
import { ProfileService } from 'src/app/core/services/profile.service';
import { ToastService } from 'src/app/core/services/toast.service';
import { I18nService } from 'src/app/core/services/i18n.service';
import { mergeStoredProfileWithUser } from 'src/app/core/utils/stored-user-profile';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css']
})
export class ProfileComponent implements OnInit {
  readonly editForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    mobile_no: ['', [Validators.required, Validators.pattern(/^[0-9]{10}$/)]]
  });

  userName = '';
  userEmail = '';
  userMobile = '';
  userRole: 'user' | 'admin' | '' = '';

  profileLoading = true;
  isEditOpen = false;
  saving = false;

  constructor(
    private readonly fb: FormBuilder,
    private readonly profileService: ProfileService,
    private readonly authService: AuthService,
    private readonly toastService: ToastService,
    private readonly i18n: I18nService
  ) {}

  ngOnInit(): void {
    this.loadProfile();
  }

  get initials(): string {
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

  roleLabel(): string {
    if (this.userRole === 'admin') {
      return this.i18n.instant('profile.roleAdmin');
    }
    return this.i18n.instant('profile.roleUser');
  }

  openEditModal(): void {
    this.editForm.patchValue({
      name: this.userName,
      mobile_no: (this.userMobile || '').replace(/\D/g, '').slice(0, 10)
    });
    this.editForm.markAsUntouched();
    this.isEditOpen = true;
  }

  closeEditModal(): void {
    if (this.saving) {
      return;
    }
    this.isEditOpen = false;
  }

  loadProfile(): void {
    this.profileLoading = true;
    this.profileService.getMe().subscribe({
      next: (res) => {
        const u = res.user;
        this.userEmail = u.email ?? '';
        this.userName = u.name ?? '';
        this.userMobile = (u.mobile_no || u.mobile || '').trim();
        this.userRole = (u.role as 'user' | 'admin') || this.authService.getRole() || 'user';
        mergeStoredProfileWithUser(u, this.authService);
        this.profileLoading = false;
      },
      error: (err) => {
        this.profileLoading = false;
        this.toastService.error(err?.error?.message || 'Failed to load profile');
      }
    });
  }

  submitEdit(): void {
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }
    this.saving = true;
    const v = this.editForm.getRawValue() as { name: string; mobile_no: string };
    this.profileService.updateProfile({ name: v.name, mobile_no: v.mobile_no }).subscribe({
      next: (res) => {
        this.saving = false;
        this.toastService.success(res.message || this.i18n.instant('profile.updateProfile'));
        this.isEditOpen = false;
        this.loadProfile();
      },
      error: (err) => {
        this.saving = false;
        this.toastService.error(err?.error?.message || 'Profile update failed');
      }
    });
  }
}
