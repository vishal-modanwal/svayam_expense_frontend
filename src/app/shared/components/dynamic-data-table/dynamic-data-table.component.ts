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
import { I18nService } from 'src/app/core/services/i18n.service';
import { ToastService } from 'src/app/core/services/toast.service';
import {
  DynamicTableCellControl,
  DynamicTableColumn,
  DynamicTableQuery,
  DynamicTableViewConfig,
  DynamicTableViewMode
} from './dynamic-data-table.models';
import {
  downloadReceiptViaBlob,
  expenseRowReceiptHref,
  isReceiptDownloadCrossOrigin,
  normalizeReceiptHttpUrl
} from 'src/app/core/utils/receipt-url';
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
  /** Admin employees table: PATCH toggle user active (parent owns API + busy state). */
  @Output() readonly employeeActiveToggle = new EventEmitter<Record<string, unknown>>();
  /** Row `id` / `user_id` values currently awaiting `toggleUserStatus`. */
  @Input() employeeToggleBusyRowIds: readonly number[] = [];

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

  /**
   * Card view column slices — stable references for `*ngFor` (getters that `filter()` would
   * allocate a new array every change-detection tick and trigger dev-mode ExpressionChanged errors).
   */
  cardHeroTitleCol: DynamicTableColumn | null = null;
  cardHeroAmountCol: DynamicTableColumn | null = null;
  cardBodyFieldColumns: DynamicTableColumn[] = [];
  cardActionColumns: DynamicTableColumn[] = [];

  /** Inline receipt preview (View) — direct URL on `<img>` / `<iframe>` (see spec). */
  receiptModalOpen = false;
  receiptModalHasFile = false;
  /** Normalized URL for modal, toolbar “new tab”, and download link. */
  receiptModalDirectUrl: string | null = null;
  receiptPreviewImageUrl: SafeUrl | null = null;
  receiptPreviewFrameUrl: SafeResourceUrl | null = null;

  /** Table ⇄ Card view toggle (defaults: card on phones, table on desktops; persisted per-table in localStorage). */
  viewMode: DynamicTableViewMode = 'table';
  /** True if we should auto-track viewport size — set false once the user picks a mode manually. */
  private viewModeUserPicked = false;
  private mobileMql?: MediaQueryList;
  private readonly mobileMqlListener: (ev: MediaQueryListEvent) => void = (ev) => {
    if (this.viewModeUserPicked) {
      return;
    }
    this.setViewMode(ev.matches ? 'card' : 'table', /* userPicked */ false);
  };

  private _paginator?: MatPaginator;
  private _sort?: MatSort;
  private readonly destroy$ = new Subject<void>();
  private interactionsWired = false;
  private interactionSub?: Subscription;

  constructor(
    private readonly cdr: ChangeDetectorRef,
    private readonly sanitizer: DomSanitizer,
    private readonly i18n: I18nService,
    private readonly toast: ToastService
  ) {}

  ngOnInit(): void {
    this.i18n.onLanguageChange.pipe(takeUntil(this.destroy$)).subscribe(() => this.cdr.markForCheck());
    this.initViewMode();
  }

  get columns(): DynamicTableColumn[] {
    return this.config?.columns ?? [];
  }

  get showFilter(): boolean {
    return this.config?.showFilter !== false;
  }

  get showViewToggle(): boolean {
    return this.config?.showViewToggle !== false;
  }

  get pageSizeOptions(): number[] {
    return this.config?.pagination.pageSizeOptions ?? [5, 10, 25];
  }

  get filterPlaceholder(): string {
    return this.config?.filterPlaceholder ?? 'Search…';
  }

  get showTableHead(): boolean {
    return !!(this.config?.title || this.showFilter || this.showViewToggle);
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
    if (col.key === '_employee_active') {
      return 'employeeActiveToggle';
    }
    return '__plain__';
  }

  hasEmployeeActiveToggleColumn(): boolean {
    return !!this.config?.columns?.some((c) => c.cellControl === 'employeeActiveToggle');
  }

  employeeRowIsInactiveVisual(row: Record<string, unknown>): boolean {
    return this.hasEmployeeActiveToggleColumn() && !this.employeeRowIsActive(row);
  }

  employeeRowIsActive(row: Record<string, unknown>): boolean {
    const v =
      row['is_active'] ??
      row['isActive'] ??
      row['active'] ??
      row['user_active'] ??
      row['status'] ??
      row['enabled'] ??
      row['user_status'] ??
      row['account_status'];
    if (typeof v === 'boolean') {
      return v;
    }
    if (typeof v === 'number') {
      return v === 1;
    }
    const s = String(v ?? '').trim().toLowerCase();
    if (s === '1' || s === 'true' || s === 'active' || s === 'yes') {
      return true;
    }
    if (s === '0' || s === 'false' || s === 'inactive' || s === 'no' || s === '') {
      return false;
    }
    return false;
  }

  employeeToggleRowId(row: Record<string, unknown>): number | null {
    const raw = row['id'] ?? row['user_id'];
    const n = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  employeeToggleDisabled(row: Record<string, unknown>): boolean {
    const id = this.employeeToggleRowId(row);
    if (id == null) {
      return true;
    }
    return this.employeeToggleBusyRowIds.includes(id);
  }

  onEmployeeActiveToggleClick(row: Record<string, unknown>): void {
    if (this.employeeToggleDisabled(row)) {
      return;
    }
    this.employeeActiveToggle.emit(row);
  }

  onReceiptDownloadClick(row: Record<string, unknown>, ev: MouseEvent): void {
    const abs = this.receiptDirectAbs(row);
    if (!abs) {
      return;
    }
    if (!isReceiptDownloadCrossOrigin(abs)) {
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    const name = this.receiptDownloadFilename(row);
    void downloadReceiptViaBlob(abs, name).catch(() => {
      window.open(abs, '_blank', 'noopener,noreferrer');
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['config']) {
      if (this.config?.columns?.length) {
        this.displayedColumnKeys = this.config.columns.map((c) => c.key);
      } else {
        this.displayedColumnKeys = [];
      }
      this.refreshCardLayoutCaches();
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
    if (this.mobileMql) {
      type LegacyMql = MediaQueryList & {
        removeListener?: (cb: (ev: MediaQueryListEvent) => void) => void;
      };
      const mql = this.mobileMql as LegacyMql;
      if (typeof mql.removeEventListener === 'function') {
        mql.removeEventListener('change', this.mobileMqlListener);
      } else if (typeof mql.removeListener === 'function') {
        mql.removeListener(this.mobileMqlListener);
      }
      this.mobileMql = undefined;
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  /* ────── View mode (table ⇄ card) ────── */

  /** True for cell controls that render interactive buttons / toggles instead of plain text. */
  isActionColumn(col: DynamicTableColumn): boolean {
    return this.effectiveCellSwitch(col) !== '__plain__';
  }

  /** Recompute card column slices when `config.columns` changes. */
  private refreshCardLayoutCaches(): void {
    if (!this.config?.columns?.length) {
      this.cardHeroTitleCol = null;
      this.cardHeroAmountCol = null;
      this.cardBodyFieldColumns = [];
      this.cardActionColumns = [];
      return;
    }
    const cols = this.columns;
    const dataCols = cols.filter((c) => !this.isActionColumn(c));
    this.cardActionColumns = cols.filter((c) => this.isActionColumn(c));
    const title = dataCols.find((c) => c.key.toLowerCase() === 'title') ?? null;
    this.cardHeroTitleCol = title;
    this.cardHeroAmountCol =
      dataCols.find((c) => c.key.toLowerCase() === 'amount' && c.valueFormat === 'inr') ?? null;
    if (!title) {
      this.cardBodyFieldColumns = dataCols;
      return;
    }
    const skip = new Set<string>([title.key]);
    if (this.cardHeroAmountCol) {
      skip.add(this.cardHeroAmountCol.key);
    }
    this.cardBodyFieldColumns = dataCols.filter((c) => !skip.has(c.key));
  }

  isCategoryCardColumn(col: DynamicTableColumn): boolean {
    const k = col.key.toLowerCase();
    return k === 'category_name' || k === 'category';
  }

  trackByRowIndex(index: number, row: Record<string, unknown>): string | number {
    const id = row['id'] ?? row['user_id'] ?? row['expense_id'];
    if (typeof id === 'string' || typeof id === 'number') {
      return id;
    }
    return index;
  }

  /** User clicked the segmented control — flip view + persist. */
  onViewModeChange(mode: DynamicTableViewMode | null): void {
    if (!mode) {
      return;
    }
    this.setViewMode(mode, /* userPicked */ true);
  }

  private initViewMode(): void {
    const stored = this.readStoredViewMode();
    if (stored) {
      this.viewMode = stored;
      this.viewModeUserPicked = true;
      this.cdr.markForCheck();
      return;
    }
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    this.mobileMql = window.matchMedia('(max-width: 600px)');
    this.viewMode = this.mobileMql.matches ? 'card' : 'table';
    type LegacyMql = MediaQueryList & {
      addListener?: (cb: (ev: MediaQueryListEvent) => void) => void;
    };
    const mql = this.mobileMql as LegacyMql;
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', this.mobileMqlListener);
    } else if (typeof mql.addListener === 'function') {
      mql.addListener(this.mobileMqlListener);
    }
    this.cdr.markForCheck();
  }

  private setViewMode(mode: DynamicTableViewMode, userPicked: boolean): void {
    if (this.viewMode === mode && (!userPicked || this.viewModeUserPicked)) {
      return;
    }
    this.viewMode = mode;
    if (userPicked) {
      this.viewModeUserPicked = true;
      this.writeStoredViewMode(mode);
    }
    this.cdr.markForCheck();
  }

  private viewModeStorageKey(): string | null {
    const id = this.config?.title?.trim();
    if (!id) {
      return null;
    }
    return `dt-view:${id}`;
  }

  private readStoredViewMode(): DynamicTableViewMode | null {
    try {
      const key = this.viewModeStorageKey();
      if (!key || typeof window === 'undefined' || !window.localStorage) {
        return null;
      }
      const raw = window.localStorage.getItem(key);
      return raw === 'table' || raw === 'card' ? raw : null;
    } catch {
      return null;
    }
  }

  private writeStoredViewMode(mode: DynamicTableViewMode): void {
    try {
      const key = this.viewModeStorageKey();
      if (!key || typeof window === 'undefined' || !window.localStorage) {
        return;
      }
      window.localStorage.setItem(key, mode);
    } catch {
      /* localStorage may be blocked (private mode / quota) — silently ignore. */
    }
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
