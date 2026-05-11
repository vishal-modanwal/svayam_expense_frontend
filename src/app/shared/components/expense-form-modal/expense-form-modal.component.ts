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
import { ReceiptOcrService } from 'src/app/core/services/receipt-ocr.service';
import { ToastService } from 'src/app/core/services/toast.service';
import { environment } from 'src/environments/environment';
import { buildReceiptUrlFromReceiptPath } from 'src/app/core/utils/receipt-url';
import { parseReceiptTextHints } from 'src/app/core/utils/receipt-ocr-parser';
import { readHttpErrorMessage } from 'src/app/core/utils/http-error.utils';

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
  scanning = false;
  scanStatusLabel = '';
  scanned = false;

  /** Receipt file sent with create/update as multipart field `receipt`. */
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
    private readonly receiptOcrService: ReceiptOcrService,
    private readonly toastService: ToastService,
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
   * the scanned receipt and OCR-filled fields while the user is still in the modal.
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
    this.submitted = false;
    this.submitError = null;
    this.scanning = false;
    this.scanStatusLabel = '';
    this.scanned = false;
    this.clearReceiptFile();
    this.resetFormValues();
    this.dismiss.emit();
  }

  /**
   * One control: image → OCR + attach file for save; PDF → attach only (no OCR).
   * Same multipart `receipt` on create/update.
   */
  onReceiptPickChange(event: Event): void {
    const file = this.readFileFromEvent(event);
    if (!file) {
      return;
    }
    if (this.isLikelyReceiptImage(file)) {
      void this.runReceiptScanOcr(file);
      return;
    }
    if (this.isLikelyPdfReceipt(file)) {
      this.ngZone.run(() => {
        this.scanning = false;
        this.scanStatusLabel = '';
        this.scanned = false;
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

  submit(): void {
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

    request$.subscribe({
      next: (res) => {
        this.submitError = null;
        this.toastService.success(res.message || (id ? 'Expense updated' : 'Expense created'));
        this.saved.emit();
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

  private async runReceiptScanOcr(file: File): Promise<void> {
    this.ngZone.run(() => {
      this.scanned = false;
      this.receiptFile = null;
      this.receiptFileLabel = null;
      this.scanning = true;
      this.scanStatusLabel = 'Reading receipt (OCR)…';
    });

    let ocrHadText = false;
    try {
      const text = await this.receiptOcrService.recognizeReceiptImage(file);
      this.ngZone.run(() => {
        if (text) {
          ocrHadText = true;
          const hints = parseReceiptTextHints(text);
          this.mergeReceiptHints(hints);
          const desc = (this.form.get('description')?.value || '').trim();
          if (!desc) {
            this.form.patchValue({ description: text.slice(0, 500) });
          }
        }
      });
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : String(err);
      this.ngZone.run(() => {
        this.toastService.info(
          detail
            ? `OCR failed (${detail.slice(0, 100)}). Receipt will still attach on save if you continue.`
            : 'OCR could not read this image; receipt can still upload on save.'
        );
      });
    }

    this.ngZone.run(() => {
      this.setReceiptFile(file);
      if (ocrHadText) {
        this.toastService.info('Check title, amount, and date — receipt uploads when you create or update.');
      }
      this.scanning = false;
      this.scanStatusLabel = '';
      this.scanned = true;
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

  private mergeReceiptHints(hints: {
    title?: string;
    amount?: number;
    vendor?: string;
    expense_date?: string;
    description?: string;
  }): void {
    if (hints.title != null && String(hints.title).trim() !== '') {
      const cur = (this.form.get('title')?.value || '').trim();
      if (!cur) {
        this.form.patchValue({ title: String(hints.title).slice(0, 120) });
      }
    }
    if (hints.vendor != null && String(hints.vendor).trim() !== '') {
      const cur = (this.form.get('vendor')?.value || '').trim();
      if (!cur) {
        this.form.patchValue({ vendor: String(hints.vendor).slice(0, 120) });
      }
    }
    if (hints.amount != null && Number(hints.amount) > 0) {
      const cur = Number(this.form.get('amount')?.value);
      if (!cur || cur === 0) {
        this.form.patchValue({ amount: hints.amount });
      }
    }
    if (hints.expense_date) {
      const cur = (this.form.get('expense_date')?.value || '').trim();
      if (!cur) {
        const raw = String(hints.expense_date);
        const d = raw.includes('T') ? raw.substring(0, 10) : raw;
        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
          this.form.patchValue({ expense_date: d });
        }
      }
    }
    if (hints.description != null && String(hints.description).trim() !== '') {
      const cur = (this.form.get('description')?.value || '').trim();
      if (!cur) {
        this.form.patchValue({ description: String(hints.description).slice(0, 500) });
      }
    }
  }

  private applyExpenseInput(): void {
    this.submitted = false;
    this.submitError = null;
    this.scanning = false;
    this.scanStatusLabel = '';
    this.scanned = false;
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
        description: e.description || '',
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
  }
}
