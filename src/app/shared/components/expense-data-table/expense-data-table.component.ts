import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output
} from '@angular/core';
import { PageEvent } from '@angular/material/paginator';
import { MatTableDataSource } from '@angular/material/table';
import { ExpenseTableRow } from 'src/app/core/models/app.models';
import { environment } from 'src/environments/environment';
import { buildReceiptUrlFromReceiptPath } from 'src/app/core/utils/receipt-url';

export type ExpenseTableViewMode = 'table' | 'card';

@Component({
  selector: 'app-expense-data-table',
  templateUrl: './expense-data-table.component.html',
  styleUrls: ['./expense-data-table.component.css']
})
export class ExpenseDataTableComponent implements OnInit, OnDestroy {
  @Input() dataSource = new MatTableDataSource<ExpenseTableRow>([]);
  @Input() displayedColumns: string[] = [
    'title',
    'amount',
    'category',
    'date',
    'payment',
    'notes',
    'update',
    'delete',
    'receipt',
    'vendor'
  ];
  @Input() totalRecords = 0;
  @Input() pageSize = 5;
  @Input() pageIndex = 0;
  @Input() pageSizeOptions: number[] = [5, 10, 20];
  /** localStorage key suffix — keep stable so user's table/card choice is persisted across reloads. */
  @Input() storageKey = 'user-expense-table';

  @Output() pageChange = new EventEmitter<PageEvent>();
  @Output() viewNotes = new EventEmitter<ExpenseTableRow>();
  @Output() edit = new EventEmitter<ExpenseTableRow>();
  @Output() delete = new EventEmitter<ExpenseTableRow>();

  /** Default: card view on phones, table on desktops; persisted in localStorage once user picks. */
  viewMode: ExpenseTableViewMode = 'table';
  private viewModeUserPicked = false;
  private mobileMql?: MediaQueryList;
  private readonly mobileMqlListener: (ev: MediaQueryListEvent) => void = (ev) => {
    if (this.viewModeUserPicked) {
      return;
    }
    this.setViewMode(ev.matches ? 'card' : 'table', false);
  };

  constructor(private readonly cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    const stored = this.readStoredViewMode();
    if (stored) {
      this.viewMode = stored;
      this.viewModeUserPicked = true;
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
  }

  ngOnDestroy(): void {
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
  }

  onViewModeChange(mode: ExpenseTableViewMode | null): void {
    if (!mode) {
      return;
    }
    this.setViewMode(mode, true);
  }

  private setViewMode(mode: ExpenseTableViewMode, userPicked: boolean): void {
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

  private readStoredViewMode(): ExpenseTableViewMode | null {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return null;
      }
      const raw = window.localStorage.getItem(`dt-view:${this.storageKey}`);
      return raw === 'table' || raw === 'card' ? raw : null;
    } catch {
      return null;
    }
  }

  private writeStoredViewMode(mode: ExpenseTableViewMode): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return;
      }
      window.localStorage.setItem(`dt-view:${this.storageKey}`, mode);
    } catch {
      /* localStorage may be blocked — silently ignore. */
    }
  }

  onPage(e: PageEvent): void {
    this.pageChange.emit(e);
  }

  /** View link from `receipt_path` only (`{apiBase}/uploads/...`). */
  receiptHref(row: ExpenseTableRow): string | null {
    return buildReceiptUrlFromReceiptPath(row.receipt_path ?? null, environment.apiBaseUrl);
  }

  trackByRow(_: number, row: ExpenseTableRow): string | number {
    return (row as unknown as { id?: number | string; expense_id?: number | string }).id
      ?? (row as unknown as { expense_id?: number | string }).expense_id
      ?? row.title
      ?? _;
  }

  /** True if any of the three action columns is currently shown. */
  hasAnyActionColumn(): boolean {
    return ['notes', 'update', 'delete', 'receipt'].some((k) => this.displayedColumns.includes(k));
  }

  showColumn(key: string): boolean {
    return this.displayedColumns.includes(key);
  }
}
