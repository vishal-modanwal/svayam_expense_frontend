import { Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable({ providedIn: 'root' })
export class ToastService {
  constructor(private readonly snackBar: MatSnackBar) {}

  success(message: string): void {
    this.snackBar.open(message, 'Close', { duration: 3000, panelClass: ['toast-success'] });
  }

  error(message: string): void {
    this.snackBar.open(message, 'Close', { duration: 4000, panelClass: ['toast-error'] });
  }

  info(message: string): void {
    this.snackBar.open(message, 'Close', { duration: 2500, panelClass: ['toast-info'] });
  }
}
