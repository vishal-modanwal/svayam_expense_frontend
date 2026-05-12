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
import { AdminExpenseTableRow } from 'src/app/core/models/app.models';

export type AdminExpenseTableViewMode = 'table' | 'card';

@Component({
  selector: 'app-admin-expense-data-table',
  templateUrl: './admin-expense-data-table.component.html',
  styleUrls: ['./admin-expense-data-table.component.css']
})
export class AdminExpenseDataTableComponent implements OnInit, OnDestroy {
  @Input() dataSource = new MatTableDataSource<AdminExpenseTableRow>([]);
  @Input() displayedColumns: string[] = ['title', 'user', 'category', 'date', 'amount'];
  @Input() totalRecords = 0;
  @Input() pageSize = 10;
  @Input() pageIndex = 0;
  @Input() pageSizeOptions: number[] = [5, 10, 20, 50];
  @Input() loading = false;
  /** localStorage key suffix — keep stable so view choice is persisted across reloads. */
  @Input() storageKey = 'admin-expense-table';

  @Output() pageChange = new EventEmitter<PageEvent>();
  @Output() editExpense = new EventEmitter<AdminExpenseTableRow>();

  viewMode: AdminExpenseTableViewMode = 'table';
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

  onViewModeChange(mode: AdminExpenseTableViewMode | null): void {
    if (!mode) {
      return;
    }
    this.setViewMode(mode, true);
  }

  private setViewMode(mode: AdminExpenseTableViewMode, userPicked: boolean): void {
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

  private readStoredViewMode(): AdminExpenseTableViewMode | null {
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

  private writeStoredViewMode(mode: AdminExpenseTableViewMode): void {
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

  trackByRow(_: number, row: AdminExpenseTableRow): string | number {
    return (row as unknown as { id?: number | string; expense_id?: number | string }).id
      ?? (row as unknown as { expense_id?: number | string }).expense_id
      ?? row.title
      ?? _;
  }

  showColumn(key: string): boolean {
    return this.displayedColumns.includes(key);
  }
}
