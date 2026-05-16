import {
  Component,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  Output,
  SimpleChanges
} from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Category, Expense } from 'src/app/core/models/app.models';
import { ExpenseService } from 'src/app/core/services/expense.service';
import { ToastService } from 'src/app/core/services/toast.service';
import { I18nService } from 'src/app/core/services/i18n.service';
import { environment } from 'src/environments/environment';
import { buildReceiptUrlFromReceiptPath } from 'src/app/core/utils/receipt-url';
import { coalesceExpenseNotesFromApi } from 'src/app/core/utils/expense-notes.util';
import { applyScanFieldsToForm } from 'src/app/core/utils/scan-receipt-response.util';
import { readHttpErrorMessage } from 'src/app/core/utils/http-error.utils';
import { finalize } from 'rxjs';

@Component({
  selector: 'app-expense-form-modal',
  templateUrl: './expense-form-modal.component.html',
  styleUrls: ['./expense-form-modal.component.css']
})
export class ExpenseFormModalComponent implements OnChanges {
  @Input() categories: Category[] = [];
  @Input() expense: Expense | null = null;
  /** Admin dashboard: new expense is created with `expense_type: extra` (same POST as standard). */
  @Input() createAsExtra = false;

  @Output() dismiss = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  submitted = false;
  /** True while add/update API is in flight — blocks double submit and shows saving label. */
  submitting = false;
  scanning = false;
  scanStatusLabel = '';
  scanned = false;
  /** True when last POST /expense/scan-receipt failed; receipt file is kept for retry / save. */
  scanFailed = false;

  /** Receipt file sent with create/update as multipart field `receipt`. Held until save or clear. */
  receiptFile: File | null = null;
  receiptFileLabel: string | null = null;

  /** Last API error on submit (e.g. budget missing); cleared on new submit or close. */
  submitError: string | null = null;

  readonly form = this.fb.group({
    id: [null as number | null],
    title: ['', [Validators.required, Validators.minLength(3)]],
    category_id: [null as number | null, [Validators.required]],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    payment_method: ['UPI', [Validators.required]],
    vendor: [''],
    description: [''],
    expense_date: ['', [Validators.required]],
    expense_type: ['standard'],
    currency: ['INR']
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly expenseService: ExpenseService,
    private readonly toastService: ToastService,
    private readonly i18n: I18nService,
    private readonly ngZone: NgZone
  ) {}

  get f() {
    return this.form.controls;
  }

  /** mat-option value vs reactive form value (API may send string ids). */
  compareCategoryId(a: number | string | null, b: number | string | null): boolean {
    if (a == null || b == null) {
      return a === b;
    }
    return Number(a) === Number(b);
  }

  /** Saved receipt: list/detail contract uses `receipt_path` only → `{apiBase}/uploads/...`. */
  get receiptPreviewHref(): string | null {
    const e = this.expense;
    if (!e) {
      return null;
    }
    return buildReceiptUrlFromReceiptPath(e.receipt_path, environment.apiBaseUrl);
  }

  /**
   * Only reset when the **expense** record changes (add vs edit or different id).
   * Do not tie to `categories`: when categories load/refresh, resetting would clear
   * the scanned receipt and filled fields while the user is still in the modal.
   */
  ngOnChanges(changes: SimpleChanges): void {
    const expCh = changes['expense'];
    const extraCh = changes['createAsExtra'];
    if (!expCh && !extraCh) {
      return;
    }
    const prev = expCh?.previousValue as Expense | null | undefined;
    const curr = expCh?.currentValue as Expense | null | undefined;
    const prevId = prev?.id ?? null;
    const currId = curr?.id ?? null;
    const expenseChanged =
      !!expCh && (expCh.firstChange || prevId !== currId);
    const extraChanged =
      !!extraCh &&
      (extraCh.firstChange || extraCh.previousValue !== extraCh.currentValue);
    if (expenseChanged || extraChanged) {
      this.applyExpenseInput();
    }
  }

  close(): void {
    if (this.submitting) {
      return;
    }
    this.submitted = false;
    this.submitting = false;
    this.submitError = null;
    this.scanning = false;
    this.scanStatusLabel = '';
    this.scanned = false;
    this.scanFailed = false;
    this.clearReceiptFile();
    this.resetFormValues();
    this.dismiss.emit();
  }

  /**
   * Image → retain file, POST scan-receipt for auto-fill (file stays client-side for save).
   * PDF → attach only (no scan endpoint).
   */
  onReceiptPickChange(event: Event): void {
    const file = this.readFileFromEvent(event);
    if (!file) {
      return;
    }
    if (this.isLikelyReceiptImage(file)) {
      this.ngZone.run(() => {
        this.scanFailed = false;
        this.scanned = false;
        this.setReceiptFile(file);
      });
      this.runReceiptBackendScan(file);
      return;
    }
    if (this.isLikelyPdfReceipt(file)) {
      this.ngZone.run(() => {
        this.scanning = false;
        this.scanStatusLabel = '';
        this.scanned = false;
        this.scanFailed = false;
        this.setReceiptFile(file);
      });
      return;
    }
    this.ngZone.run(() => {
      this.toastService.info('Use a receipt image (JPG, PNG, HEIC…) or a PDF file.');
    });
  }

  clearPendingReceipt(): void {
    this.clearReceiptFile();
  }

  /** Retry POST /expense/scan-receipt with the same retained file (e.g. after a transient error). */
  retryReceiptScan(): void {
    if (!this.receiptFile || !this.isLikelyReceiptImage(this.receiptFile) || this.scanning) {
      return;
    }
    this.runReceiptBackendScan(this.receiptFile);
  }

  canRetryReceiptScan(): boolean {
    return !!this.receiptFile && this.isLikelyReceiptImage(this.receiptFile) && this.scanFailed && !this.scanning;
  }

  submit(): void {
    if (this.submitting) {
      return;
    }
    this.submitted = true;
    this.submitError = null;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const v = this.form.getRawValue();
    const id = v.id;
    const file = this.receiptFile;

    const common: Partial<Expense> = {
      title: v.title,
      category_id: v.category_id!,
      amount: Number(v.amount),
      payment_method: v.payment_method,
      vendor: v.vendor?.trim() || undefined,
      description: v.description?.trim() || undefined
    };
    if (v.expense_type === 'extra' || (this.createAsExtra && !id)) {
      common.expense_type = 'extra';
    }

    const request$ = id
      ? this.expenseService.updateExpense(id, { ...common }, file)
      : this.expenseService.addExpense({ ...common, expense_date: v.expense_date }, file);

    this.submitting = true;
    request$
      .pipe(
        finalize(() => {
          this.submitting = false;
        })
      )
      .subscribe({
        next: (res) => {
          this.submitError = null;
          this.toastService.success(res.message || (id ? 'Expense updated' : 'Expense created'));
          this.saved.emit();
          this.submitting = false;
          this.close();
        },
        error: (err) => {
          const msg = readHttpErrorMessage(err, 'Expense action failed');
          this.submitError = msg;
          this.toastService.error(msg);
        }
      });
  }

  /** True when server rejected create/update for missing category budget (typical 400 copy). */
  isBudgetMissingSubmitError(): boolean {
    const s = (this.submitError || '').toLowerCase();
    return /budget/.test(s) && (/not found|create|pehle|missing|na ho|nahi/i.test(s) || /budget record/i.test(s));
  }

  /**
   * POST /api/expense/scan-receipt — server suggests fields then discards the upload;
   * `receiptFile` remains on the client for create/update multipart.
   */
  private runReceiptBackendScan(file: File): void {
    this.ngZone.run(() => {
      this.scanFailed = false;
      this.scanning = true;
      this.scanStatusLabel = this.i18n.instant('expenseForm.scanningReceipt');
    });

    this.expenseService.scanReceipt(file).subscribe({
      next: (raw) => {
        this.ngZone.run(() => {
          const { applied } = applyScanFieldsToForm(raw, this.form, this.categories);
          if (applied > 0) {
            this.toastService.success(this.i18n.instant('expenseForm.scanPrefillDone'));
          } else {
            this.toastService.info(this.i18n.instant('expenseForm.scanPrefillPartial'));
          }
          this.scanned = true;
          this.scanning = false;
          this.scanStatusLabel = '';
          this.scanFailed = false;
        });
      },
      error: (err) => {
        this.ngZone.run(() => {
          const msg = readHttpErrorMessage(err, this.i18n.instant('expenseForm.scanFailed'));
          this.toastService.error(msg);
          this.scanning = false;
          this.scanStatusLabel = '';
          this.scanFailed = true;
          this.scanned = false;
        });
      }
    });
  }

  /** Some devices leave `file.type` empty; HEIC/HEIF still often starts with `image/`. */
  private isLikelyReceiptImage(file: File): boolean {
    if (file.type.startsWith('image/')) {
      return true;
    }
    const n = file.name.toLowerCase();
    return /\.(jpe?g|png|gif|webp|bmp|heic|heif)$/i.test(n);
  }

  private isLikelyPdfReceipt(file: File): boolean {
    if (file.type === 'application/pdf') {
      return true;
    }
    return /\.pdf$/i.test(file.name);
  }

  private applyExpenseInput(): void {
    this.submitted = false;
    this.submitError = null;
    this.scanning = false;
    this.scanStatusLabel = '';
    this.scanned = false;
    this.scanFailed = false;
    this.clearReceiptFile();
    const e = this.expense;
    const dateCtl = this.form.get('expense_date');
    if (e) {
      dateCtl?.disable({ emitEvent: false });
      this.form.get('expense_type')?.enable({ emitEvent: false });
      this.form.patchValue({
        id: e.id,
        title: e.title,
        category_id: e.category_id,
        amount: Number(e.amount),
        payment_method: e.payment_method || 'UPI',
        vendor: e.vendor || '',
        description: coalesceExpenseNotesFromApi(e as unknown as Record<string, unknown>) || e.description || '',
        expense_date: e.expense_date ? e.expense_date.substring(0, 10) : '',
        expense_type: e.expense_type || 'standard',
        currency: 'INR'
      });
    } else {
      dateCtl?.enable({ emitEvent: false });
      this.resetFormValues();
      const typeCtl = this.form.get('expense_type');
      typeCtl?.enable({ emitEvent: false });
      if (this.createAsExtra) {
        typeCtl?.setValue('extra');
        typeCtl?.disable({ emitEvent: false });
      }
    }
  }

  private resetFormValues(): void {
    this.form.get('expense_date')?.enable({ emitEvent: false });
    this.form.get('expense_type')?.enable({ emitEvent: false });
    this.form.reset({
      id: null,
      title: '',
      category_id: null,
      amount: 0,
      payment_method: 'UPI',
      vendor: '',
      description: '',
      expense_date: this.todayIso(),
      expense_type: 'standard',
      currency: 'INR'
    });
  }

  private todayIso(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private readFileFromEvent(event: Event): File | null {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    return file;
  }

  private setReceiptFile(file: File): void {
    this.receiptFile = file;
    this.receiptFileLabel = file.name;
  }

  private clearReceiptFile(): void {
    this.receiptFile = null;
    this.receiptFileLabel = null;
    this.scanned = false;
    this.scanFailed = false;
  }
}
