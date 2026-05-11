import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  ViewChild
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl, SafeUrl } from '@angular/platform-browser';
import { FormControl } from '@angular/forms';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort, Sort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { Observable, Subject, Subscription, merge } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil, tap } from 'rxjs/operators';
<<<<<<< hindi
import { I18nService } from 'src/app/core/services/i18n.service';
import { DynamicTableColumn, DynamicTableQuery, DynamicTableViewConfig } from './dynamic-data-table.models';
import { resolveReceiptPublicUrl } from 'src/app/core/utils/receipt-url';
=======
import { DynamicTableCellControl, DynamicTableColumn, DynamicTableQuery, DynamicTableViewConfig } from './dynamic-data-table.models';
import { expenseRowReceiptHref, normalizeReceiptHttpUrl } from 'src/app/core/utils/receipt-url';
import { ToastService } from 'src/app/core/services/toast.service';
>>>>>>> master
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-dynamic-data-table',
  templateUrl: './dynamic-data-table.component.html',
  styleUrls: ['./dynamic-data-table.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DynamicDataTableComponent implements OnChanges, OnDestroy, OnInit {
  @Input() config: DynamicTableViewConfig | null = null;
  @Input() rows: Record<string, unknown>[] = [];
  @Input() totalCount = 0;
  @Input() loading = false;
  @Input() sortState: Sort | null = null;
  /** When true, rows are shown in full (no paginator UI). Use for small client-only tables. */
  @Input() hidePaginator = false;
  /** Zero-based page index — sync from parent after filter/search resets so the paginator stays aligned. */
  @Input() pageIndex = 0;
  /**
   * Flush inside parent card: no inner mat-card chrome, “modern-table” spacing and category pills
   * (used on user dashboard to match the reference expense table).
   */
  @Input() embedded = false;
  @Output() readonly queryChange = new EventEmitter<DynamicTableQuery>();
  @Output() readonly adminExpenseEdit = new EventEmitter<Record<string, unknown>>();
  @Output() readonly adminExpenseDelete = new EventEmitter<Record<string, unknown>>();
  @Output() readonly adminBudgetDescription = new EventEmitter<Record<string, unknown>>();
  @Output() readonly adminBudgetEdit = new EventEmitter<Record<string, unknown>>();
  @Output() readonly adminBudgetDelete = new EventEmitter<Record<string, unknown>>();
  @Output() readonly userExpenseAction = new EventEmitter<{
    action: 'notes' | 'edit' | 'delete';
    row: Record<string, unknown>;
  }>();

  @ViewChild(MatPaginator)
  set paginator(p: MatPaginator | undefined) {
    if (!p && this._paginator) {
      this.clearInteractionSubscription();
    }
    this._paginator = p;
    if (this._paginator && !this.hidePaginator) {
      const next = Math.max(0, this.pageIndex ?? 0);
      if (this._paginator.pageIndex !== next) {
        this._paginator.pageIndex = next;
      }
    }
    this.attemptWireAndBootstrap();
  }
  get paginator(): MatPaginator | undefined {
    return this._paginator;
  }

  @ViewChild(MatSort)
  set sort(s: MatSort | undefined) {
    if (!s && this._sort) {
      this.clearInteractionSubscription();
    }
    this._sort = s;
    this.attemptWireAndBootstrap();
  }
  get sort(): MatSort | undefined {
    return this._sort;
  }

  readonly filterControl = new FormControl('');
  readonly dataSource = new MatTableDataSource<Record<string, unknown>>([]);

  displayedColumnKeys: string[] = [];

  /** Inline receipt preview (View) — direct URL on `<img>` / `<iframe>` (see spec). */
  receiptModalOpen = false;
  receiptModalHasFile = false;
  /** Normalized URL for modal, toolbar “new tab”, and download link. */
  receiptModalDirectUrl: string | null = null;
  receiptPreviewImageUrl: SafeUrl | null = null;
  receiptPreviewFrameUrl: SafeResourceUrl | null = null;

  private _paginator?: MatPaginator;
  private _sort?: MatSort;
  private readonly destroy$ = new Subject<void>();
  private interactionsWired = false;
  private interactionSub?: Subscription;

  constructor(
    private readonly cdr: ChangeDetectorRef,
    private readonly sanitizer: DomSanitizer,
<<<<<<< hindi
    private readonly i18n: I18nService
=======
    private readonly toast: ToastService
>>>>>>> master
  ) {}

  ngOnInit(): void {
    this.i18n.onLanguageChange.pipe(takeUntil(this.destroy$)).subscribe(() => this.cdr.markForCheck());
  }

  get columns(): DynamicTableColumn[] {
    return this.config?.columns ?? [];
  }

  get showFilter(): boolean {
    return this.config?.showFilter !== false;
  }

  get pageSizeOptions(): number[] {
    return this.config?.pagination.pageSizeOptions ?? [5, 10, 25];
  }

  get filterPlaceholder(): string {
    return this.config?.filterPlaceholder ?? 'Search…';
  }

  get showTableHead(): boolean {
    return !!(this.config?.title || this.showFilter);
  }

  /**
   * `cellControl` is sometimes missing on receipt columns after meta merges — fall back by `key`
   * so View/Download buttons still render (otherwise `ngSwitch` hits default and shows plain text).
   */
  effectiveCellSwitch(col: DynamicTableColumn): DynamicTableCellControl | '__plain__' {
    if (col.cellControl) {
      return col.cellControl;
    }
    if (col.key === '_receipt') {
      return 'adminExpenseReceipt';
    }
    if (col.key === '_download') {
      return 'expenseReceiptDownload';
    }
    return '__plain__';
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['config']) {
      if (this.config?.columns?.length) {
        this.displayedColumnKeys = this.config.columns.map((c) => c.key);
      } else {
        this.displayedColumnKeys = [];
      }
    }
    if (changes['rows'] || changes['config']) {
      this.dataSource.data = this.rows ?? [];
    }
    if (changes['sortState'] && this._sort && this.sortState) {
      this._sort.active = this.sortState.active;
      this._sort.direction = this.sortState.direction;
    }
    if (this._paginator && changes['totalCount']) {
      this._paginator.length = this.totalCount;
    }
    if (this._paginator && changes['pageIndex'] && !this.hidePaginator) {
      const next = Math.max(0, this.pageIndex ?? 0);
      if (this._paginator.pageIndex !== next) {
        this._paginator.pageIndex = next;
      }
    }
    if (
      changes['config'] &&
      this.config?.columns?.length &&
      (this.hidePaginator || this._paginator) &&
      !changes['config'].firstChange
    ) {
      if (!this.hidePaginator) {
        this.applyConfigToPaginator();
      }
      if (this.interactionsWired) {
        this.emitQuery();
      }
    }
    this.cdr.markForCheck();
    this.attemptWireAndBootstrap();
  }

  ngOnDestroy(): void {
    this.clearInteractionSubscription();
    this.destroy$.next();
    this.destroy$.complete();
  }

  formatCell(row: Record<string, unknown>, col: DynamicTableColumn): string {
    const v = row[col.key];
    if (v === null || v === undefined || v === '') {
      return '—';
    }
    if (typeof v === 'boolean') {
      return v ? this.i18n.instant('table.yes') : this.i18n.instant('table.no');
    }
    const fmt = col.valueFormat;
    if (fmt === 'inr') {
      const n = Number(v);
      if (!Number.isFinite(n)) {
        return String(v);
      }
      return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (fmt === 'shortDate' && typeof v === 'string') {
      const raw = v.substring(0, 10);
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
      if (m) {
        return `${m[3]}-${m[2]}-${m[1]}`;
      }
    }
    return String(v);
  }

  receiptHref(row: Record<string, unknown>): string | null {
    return expenseRowReceiptHref(row, environment.uploadsOrigin, environment.apiBaseUrl);
  }

  /** Same-origin friendly URL for `<a href>` / `<img src>` (proxy when dev :4200 + API :5000). */
  receiptDirectAbs(row: Record<string, unknown>): string | null {
    const h = this.receiptHref(row);
    return h ? normalizeReceiptHttpUrl(h, environment.apiBaseUrl) : null;
  }

  openReceiptModal(row: Record<string, unknown>, ev?: Event): void {
    ev?.stopPropagation();
    ev?.preventDefault();
    this.receiptPreviewImageUrl = null;
    this.receiptPreviewFrameUrl = null;

    const href = this.receiptHref(row);
    if (!href) {
      this.toast.info('No receipt file on this row — check API sends a path field (e.g. receipt_path).');
      this.cdr.detectChanges();
      return;
    }
    const url = normalizeReceiptHttpUrl(href, environment.apiBaseUrl);
    this.receiptModalDirectUrl = url;
    this.receiptModalOpen = true;
    this.receiptModalHasFile = true;

    if (this.isLikelyImageReceiptUrl(url)) {
      this.receiptPreviewImageUrl = this.sanitizer.bypassSecurityTrustUrl(url);
      this.receiptPreviewFrameUrl = null;
    } else if (this.isLikelyPdfReceiptUrl(url)) {
      this.receiptPreviewImageUrl = null;
      this.receiptPreviewFrameUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
    } else {
      this.receiptPreviewImageUrl = null;
      this.receiptPreviewFrameUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
    }
    this.cdr.detectChanges();
  }

  openReceiptInNewTab(ev?: Event): void {
    ev?.stopPropagation();
    const u = this.receiptModalDirectUrl;
    if (u) {
      window.open(u, '_blank', 'noopener,noreferrer');
    }
  }

  get receiptModalDownloadName(): string {
    return this.receiptModalDirectUrl
      ? this.receiptDownloadFilenameFromHref(this.receiptModalDirectUrl)
      : 'receipt';
  }

  closeReceiptModal(): void {
    this.receiptModalOpen = false;
    this.receiptModalHasFile = false;
    this.receiptModalDirectUrl = null;
    this.receiptPreviewImageUrl = null;
    this.receiptPreviewFrameUrl = null;
    this.cdr.detectChanges();
  }

  private isLikelyImageReceiptUrl(href: string): boolean {
    try {
      const u = new URL(href, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
      return /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif)(\?.*)?$/i.test(u.pathname);
    } catch {
      return /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif)(\?|$)/i.test(href);
    }
  }

  private isLikelyPdfReceiptUrl(href: string): boolean {
    try {
      const u = new URL(href, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
      return /\.pdf(\?.*)?$/i.test(u.pathname);
    } catch {
      return /\.pdf(\?|$)/i.test(href);
    }
  }

  receiptDownloadFilename(row: Record<string, unknown>): string {
    const href = this.receiptDirectAbs(row);
    if (!href) {
      return 'receipt';
    }
    return this.receiptDownloadFilenameFromHref(href);
  }

  private receiptDownloadFilenameFromHref(href: string): string {
    try {
      const u = new URL(href, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
      const seg = u.pathname.split('/').filter(Boolean).pop();
      if (seg) {
        return seg;
      }
    } catch {
      /* fall through */
    }
    const tail = href.split(/[/?#]/).filter(Boolean).pop();
    return tail && tail.includes('.') ? tail : 'receipt';
  }

  onAdminExpenseEditClick(row: Record<string, unknown>): void {
    this.adminExpenseEdit.emit(row);
  }

  onAdminExpenseDeleteClick(row: Record<string, unknown>): void {
    this.adminExpenseDelete.emit(row);
  }

  onAdminBudgetDescriptionClick(row: Record<string, unknown>, ev?: Event): void {
    ev?.stopPropagation();
    this.adminBudgetDescription.emit(row);
    this.cdr.markForCheck();
  }

  onAdminBudgetEditClick(row: Record<string, unknown>, ev?: Event): void {
    ev?.stopPropagation();
    this.adminBudgetEdit.emit(row);
    this.cdr.markForCheck();
  }

  onAdminBudgetDeleteClick(row: Record<string, unknown>, ev?: Event): void {
    ev?.stopPropagation();
    this.adminBudgetDelete.emit(row);
    this.cdr.markForCheck();
  }

  onUserExpenseAction(action: 'notes' | 'edit' | 'delete', row: Record<string, unknown>): void {
    this.userExpenseAction.emit({ action, row });
  }

  isSortable(col: DynamicTableColumn): boolean {
    if (col.cellControl) {
      return false;
    }
    return col.sortable !== false;
  }

  trackByKey(_: number, col: DynamicTableColumn): string {
    return col.key;
  }

  private clearInteractionSubscription(): void {
    this.interactionSub?.unsubscribe();
    this.interactionSub = undefined;
    this.interactionsWired = false;
  }

  private attemptWireAndBootstrap(): void {
    if (!this.config?.columns?.length || !this._sort) {
      return;
    }
    if (!this.hidePaginator && !this._paginator) {
      return;
    }
    this.applySortStateFromInput();
    if (!this.interactionsWired) {
      this.interactionsWired = true;
      if (!this.hidePaginator) {
        this.applyConfigToPaginator();
      }

      const sort$ = this._sort.sortChange.pipe(
        tap(() => {
          if (this._paginator) {
            this._paginator.pageIndex = 0;
          }
        })
      );
      const filter$ = this.filterControl.valueChanges.pipe(
        debounceTime(300),
        distinctUntilChanged(),
        tap(() => {
          if (this._paginator) {
            this._paginator.pageIndex = 0;
          }
        })
      );
      const streams: Observable<unknown>[] = [sort$, filter$];
      if (!this.hidePaginator && this._paginator) {
        streams.push(this._paginator.page);
      }
      this.interactionSub = merge(...streams)
        .pipe(takeUntil(this.destroy$))
        .subscribe(() => this.emitQuery());

      this.emitQuery();
    }
  }

  private applySortStateFromInput(): void {
    if (this._sort && this.sortState?.active) {
      this._sort.active = this.sortState.active;
      this._sort.direction = this.sortState.direction;
    }
  }

  private applyConfigToPaginator(): void {
    const p = this.config?.pagination;
    if (!this._paginator || !p) {
      return;
    }
    this._paginator.pageSize = p.defaultPageSize;
    this._paginator.pageIndex = 0;
    this._paginator.length = this.totalCount;
  }

  private emitQuery(): void {
    if (!this.config?.columns?.length || !this._sort) {
      return;
    }
    let pageIndex = 0;
    let pageSize = Math.max(1, this.totalCount || this.rows?.length || 0);
    if (!this.hidePaginator && this._paginator) {
      pageIndex = this._paginator.pageIndex;
      pageSize = this._paginator.pageSize;
    }
    const sortActive = this._sort.active ? this._sort.active : null;
    const sortDirection = (this._sort.direction ?? '') as DynamicTableQuery['sortDirection'];

    this.queryChange.emit({
      pageIndex,
      pageSize,
      sortActive,
      sortDirection,
      filter: (this.filterControl.value || '').trim()
    });
    this.cdr.markForCheck();
  }
}
