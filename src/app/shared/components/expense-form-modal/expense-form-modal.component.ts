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
import { resolveReceiptPublicUrl } from 'src/app/core/utils/receipt-url';
import { parseReceiptTextHints } from 'src/app/core/utils/receipt-ocr-parser';

@Component({
  selector: 'app-expense-form-modal',
  templateUrl: './expense-form-modal.component.html',
  styleUrls: ['./expense-form-modal.component.css']
})
export class ExpenseFormModalComponent implements OnChanges {
  @Input() categories: Category[] = [];
  @Input() expense: Expense | null = null;

  @Output() dismiss = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  submitted = false;
  scanning = false;
  scanStatusLabel = '';
  scanned = false;

  /** Receipt file sent with create/update as multipart field `receipt`. */
  receiptFile: File | null = null;
  receiptFileLabel: string | null = null;

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

  /** Link for an expense that already has `receipt_url` on the server. */
  get receiptPreviewHref(): string | null {
    return resolveReceiptPublicUrl(this.expense?.receipt_url, environment.uploadsOrigin);
  }

  /**
   * Only reset when the **expense** record changes (add vs edit or different id).
   * Do not tie to `categories`: when categories load/refresh, resetting would clear
   * the scanned receipt and OCR-filled fields while the user is still in the modal.
   */
  ngOnChanges(changes: SimpleChanges): void {
    const expCh = changes['expense'];
    if (!expCh) {
      return;
    }
    const prev = expCh.previousValue as Expense | null | undefined;
    const curr = expCh.currentValue as Expense | null | undefined;
    const prevId = prev?.id ?? null;
    const currId = curr?.id ?? null;
    if (expCh.firstChange || prevId !== currId) {
      this.applyExpenseInput();
    }
  }

  close(): void {
    this.submitted = false;
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
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const v = this.form.getRawValue();
    const payload: Partial<Expense> = {
      title: v.title,
      category_id: v.category_id!,
      amount: Number(v.amount),
      payment_method: v.payment_method,
      vendor: v.vendor?.trim() || undefined,
      description: v.description?.trim() || undefined,
      expense_date: v.expense_date,
      expense_type: (v.expense_type as Expense['expense_type']) || 'standard'
    };

    const id = v.id;
    const file = this.receiptFile;
    const request$ = id
      ? this.expenseService.updateExpense(id, payload, file)
      : this.expenseService.addExpense({ ...payload, expense_type: 'standard' }, file);

    request$.subscribe({
      next: (res) => {
        this.toastService.success(res.message || (id ? 'Expense updated' : 'Expense created'));
        this.saved.emit();
        this.close();
      },
      error: (err) =>
        this.toastService.error(err?.error?.message || err?.error?.error || 'Expense action failed')
    });
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
    this.scanning = false;
    this.scanStatusLabel = '';
    this.scanned = false;
    this.clearReceiptFile();
    const e = this.expense;
    if (e) {
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
      this.resetFormValues();
    }
  }

  private resetFormValues(): void {
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
