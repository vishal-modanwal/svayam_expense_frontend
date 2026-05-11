import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription, finalize } from 'rxjs';
import { Sort } from '@angular/material/sort';
import { Category, Expense } from 'src/app/core/models/app.models';
import { MetaService } from 'src/app/core/services/meta.service';
import { AuthService } from 'src/app/core/services/auth.service';
import { CategoryService } from 'src/app/core/services/category.service';
import { ExpenseService } from 'src/app/core/services/expense.service';
import { ToastService } from 'src/app/core/services/toast.service';
import { ProfileService } from 'src/app/core/services/profile.service';
import { mergeStoredProfileWithUser } from 'src/app/core/utils/stored-user-profile';
import { isUserAccountInactive } from 'src/app/core/utils/user-activity.utils';
import {
  buildFallbackUserExpenseMetaConfig,
  buildUserExpenseViewConfigFromTableMeta,
  clampMyExpenseApiSortColumns
} from 'src/app/core/utils/table-meta.utils';
import { listRowReceiptPath } from 'src/app/core/utils/receipt-url';
import {
  DynamicTableQuery,
  DynamicTableViewConfig
} from 'src/app/shared/components/dynamic-data-table/dynamic-data-table.models';

@Component({
  selector: 'app-user-dashboard',
  templateUrl: './user-dashboard.component.html',
  styleUrls: ['./user-dashboard.component.css']
})
export class UserDashboardComponent implements OnInit, OnDestroy {
  userExpenseTableConfig: DynamicTableViewConfig | null = null;
  userExpenseTableRows: Record<string, unknown>[] = [];
  userExpenseSortState: Sort | null = { active: 'expense_date', direction: 'desc' };
  userExpenseLoading = false;

  categories: Category[] = [];
  expenses: Expense[] = [];
  userName = 'User';
  /** Monthly limit (static until profile/budget API exists). */
  userBudget = 5000;
  pageExpense = 0;
  page = 1;
  pageSize = 5;
  readonly pageSizeOptions = [5, 10, 20];
  totalItems = 0;
  totalPages = 1;

  sortBy: 'amount' | 'expense_date' = 'expense_date';
  order: 'ASC' | 'DESC' = 'DESC';
  selectedSort: 'latest' | 'high' | 'low' = 'latest';
  selectedCategory: number | null = null;
  selectedCategoryLabel = 'All Categories';

  /** Client-side filter on the current expense page (title / vendor), reference-style search bar. */
  expenseSearchInput = '';

  isExpenseFormModalOpen = false;
  isExpenseReportDownloading = false;
  expenseForModal: Expense | null = null;
  isAiSummaryOpen = false;
  selectedNote: string | null = null;
  selectedDeleteExpense: Expense | null = null;

  private readonly subs = new Subscription();
  private expenseSearchTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly authService: AuthService,
    private readonly categoryService: CategoryService,
    private readonly expenseService: ExpenseService,
    private readonly metaService: MetaService,
    private readonly profileService: ProfileService,
    private readonly toastService: ToastService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.hydrateUserFromSession();
    this.refreshUserFromProfile();
    this.subs.add(
      this.authService.user$.subscribe(() => {
        this.hydrateUserFromSession();
        this.cdr.detectChanges();
      })
    );
    this.bootstrapUserExpenseTableConfig();
    this.loadExpenseTableMeta();
    this.loadCategories();
    this.loadExpenses();
  }

  ngOnDestroy(): void {
    clearTimeout(this.expenseSearchTimer);
    this.subs.unsubscribe();
  }

  /** True when the user is allowed to add expenses (API may omit flag = treat as active). */
  isUserActive(): boolean {
    const u = this.authService.getCurrentUser();
    if (!u) {
      return true;
    }
    return !isUserAccountInactive(u);
  }

  private hydrateUserFromSession(): void {
    this.userName = this.authService.getCurrentUser()?.name || 'User';
  }

  private refreshUserFromProfile(): void {
    this.profileService.getProfileStatus().subscribe({
      next: (res) => {
        const u = res?.user;
        if (u) {
          mergeStoredProfileWithUser(u, this.authService);
        }
        this.hydrateUserFromSession();
        this.cdr.detectChanges();
      },
      error: (err: HttpErrorResponse) => {
        const cur = this.authService.getCurrentUser();
        const payload = err?.error;
        const rawMsg =
          typeof payload === 'string'
            ? payload
            : String(
                (payload as { message?: string })?.message ??
                  (payload as { error?: string })?.error ??
                  err?.message ??
                  ''
              );
        const msg = rawMsg.toLowerCase();
        const inactiveHint =
          /inactive|deactivated|disabled|not\s+active|account\s+is\s+not|cannot\s+add|not\s+an\s+active\s+user/.test(
            msg
          );
        if (cur && inactiveHint) {
          mergeStoredProfileWithUser(
            { ...cur, is_active: 0, activity_status: 'inactive' },
            this.authService
          );
        }
        this.hydrateUserFromSession();
        this.cdr.detectChanges();
      }
    });
  }

  get userExpense(): number {
    return this.pageExpense;
  }

  get remainsBudget(): number {
    return Math.max(0, this.userBudget - this.pageExpense);
  }

  get aiHighlights(): string[] {
    const top = [...this.expenses].sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))[0];
    const avg = this.expenses.length ? this.pageExpense / this.expenses.length : 0;
    return [
      `This page records ₹${this.pageExpense.toLocaleString('en-IN')} spend across ${this.expenses.length} entries.`,
      `Remaining against your monthly limit is ₹${this.remainsBudget.toLocaleString('en-IN')} of ₹${this.userBudget.toLocaleString('en-IN')}.`,
      top
        ? `Highest expense here is "${top.title}" at ₹${Number(top.amount || 0).toLocaleString('en-IN')}.`
        : 'No recent expenses found to generate highlights.',
      `Average per entry on this page is ₹${avg.toFixed(0)}.`
    ];
  }

  getSortLabel(): string {
    switch (this.selectedSort) {
      case 'high':
        return 'Amount: High to Low';
      case 'low':
        return 'Amount: Low to High';
      default:
        return 'Latest first';
    }
  }

  private bootstrapUserExpenseTableConfig(): void {
    const pagination = { pageSizeOptions: [...this.pageSizeOptions], defaultPageSize: this.pageSize };
    this.userExpenseTableConfig = clampMyExpenseApiSortColumns(buildFallbackUserExpenseMetaConfig(pagination));
  }

  private loadExpenseTableMeta(): void {
    const pagination = { pageSizeOptions: [...this.pageSizeOptions], defaultPageSize: this.pageSize };
    this.metaService.getTableExpenses().subscribe({
      next: (meta) => {
        if (meta?.columns?.length) {
          const cfg = buildUserExpenseViewConfigFromTableMeta(meta, pagination);
          this.userExpenseTableConfig = clampMyExpenseApiSortColumns(cfg);
        }
      },
      error: () => {
        /* keep bootstrap fallback */
      }
    });
  }

  loadCategories(): void {
    this.categoryService.getAll().subscribe({
      next: (res) => {
        const raw = res as { data?: Category[]; categories?: Category[] };
        const list = raw.data ?? raw.categories;
        this.categories = Array.isArray(list) ? list : [];
      },
      error: (err) => this.toastService.error(err?.error?.message || 'Failed to load categories')
    });
  }

  loadExpenses(): void {
    this.userExpenseLoading = true;
    const search = this.expenseSearchInput.trim();
    this.expenseService
      .getMyExpenses({
        page: this.page,
        limit: this.pageSize,
        category_id: this.selectedCategory,
        sortBy: this.sortBy,
        order: this.order,
        ...(search ? { search } : {})
      })
      .subscribe({
        next: (res) => {
          this.expenses = (res.data || []).map((item) => {
            const row = { ...item, amount: Number(item.amount) } as unknown as Record<string, unknown>;
            const rp = listRowReceiptPath(row) ?? item.receipt_path;
            return { ...item, amount: Number(item.amount), receipt_path: rp ?? item.receipt_path };
          });
          const p = res.pagination;
          this.totalPages = Math.max(1, p?.totalPages || 1);
          this.totalItems = p?.totalItems ?? p?.total_records ?? this.expenses.length;
          if (p?.itemsPerPage && this.pageSizeOptions.includes(p.itemsPerPage)) {
            this.pageSize = p.itemsPerPage;
          }
          this.rebuildUserExpenseRows();
          this.userExpenseSortState = {
            active: this.sortBy,
            direction: this.order === 'ASC' ? 'asc' : 'desc'
          };
          this.userExpenseLoading = false;
        },
        error: (err) => {
          this.userExpenseLoading = false;
          this.toastService.error(err?.error?.message || 'Failed to load expenses');
        }
      });
  }

  applySort(mode: 'latest' | 'high' | 'low'): void {
    this.selectedSort = mode;
    switch (mode) {
      case 'high':
        this.sortBy = 'amount';
        this.order = 'DESC';
        break;
      case 'low':
        this.sortBy = 'amount';
        this.order = 'ASC';
        break;
      default:
        this.sortBy = 'expense_date';
        this.order = 'DESC';
    }
    this.page = 1;
    this.userExpenseSortState = {
      active: this.sortBy,
      direction: this.order === 'ASC' ? 'asc' : 'desc'
    };
    this.loadExpenses();
  }

  onExpenseSearchInput(): void {
    clearTimeout(this.expenseSearchTimer);
    this.expenseSearchTimer = setTimeout(() => {
      this.page = 1;
      this.loadExpenses();
    }, 280);
  }

  clearExpenseSearch(): void {
    clearTimeout(this.expenseSearchTimer);
    this.expenseSearchInput = '';
    this.page = 1;
    this.loadExpenses();
  }

  /** Maps the current API page into table rows and the “Your expense” total for this page. */
  rebuildUserExpenseRows(): void {
    this.userExpenseTableRows = this.expenses.map((item) => this.expenseToFlatRow(item));
    this.pageExpense = this.expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  }

  /** Run search immediately (toolbar search submit). */
  applyExpenseSearchFromToolbar(): void {
    clearTimeout(this.expenseSearchTimer);
    this.page = 1;
    this.loadExpenses();
  }

  filterByCategory(cat: Category | null): void {
    if (!cat) {
      this.selectedCategory = null;
      this.selectedCategoryLabel = 'All Categories';
    } else {
      this.selectedCategory = cat.id;
      this.selectedCategoryLabel = cat.name;
    }
    this.page = 1;
    this.loadExpenses();
  }

  onUserExpenseDynamicQuery(q: DynamicTableQuery): void {
    this.page = q.pageIndex + 1;
    this.pageSize = q.pageSize;
    if (q.sortActive === 'amount' || q.sortActive === 'expense_date') {
      this.sortBy = q.sortActive;
      this.order = q.sortDirection === 'asc' ? 'ASC' : 'DESC';
      if (q.sortActive === 'amount') {
        this.selectedSort = q.sortDirection === 'asc' ? 'low' : 'high';
      } else {
        this.selectedSort = 'latest';
      }
    }
    this.userExpenseSortState = {
      active: this.sortBy,
      direction: this.order === 'ASC' ? 'asc' : 'desc'
    };
    this.loadExpenses();
  }

  onUserExpenseAction(ev: { action: 'notes' | 'edit' | 'delete'; row: Record<string, unknown> }): void {
    const id = Number(ev.row['id']);
    const expense = this.expenses.find((x) => x.id === id);
    if (ev.action === 'notes') {
      const desc = ev.row['description'];
      this.openNotes(desc == null ? null : String(desc));
      return;
    }
    if (!expense) {
      this.toastService.error('Expense not found');
      return;
    }
    if (ev.action === 'edit') {
      this.loadCategories();
      this.expenseForModal = { ...expense };
      this.isExpenseFormModalOpen = true;
      return;
    }
    if (ev.action === 'delete') {
      this.selectedDeleteExpense = expense;
    }
  }

  openAddExpense(): void {
    if (!this.isUserActive()) {
      this.toastService.error('Your account is inactive. You cannot add expenses until an administrator activates it.');
      return;
    }
    this.loadCategories();
    this.expenseForModal = null;
    this.isExpenseFormModalOpen = true;
  }

  downloadExpenseReport(): void {
    if (this.isExpenseReportDownloading) {
      return;
    }
    this.isExpenseReportDownloading = true;
    this.expenseService
      .downloadMyPdf({ category_id: this.selectedCategory })
      .pipe(finalize(() => (this.isExpenseReportDownloading = false)))
      .subscribe({
        next: (blob) => {
          this.triggerDownload(blob, 'my-expense-report.pdf');
          this.toastService.success('Expense report downloaded');
        },
        error: (err) => this.toastService.error(err?.error?.message || 'Report download failed')
      });
  }

  openAiSummary(): void {
    this.isAiSummaryOpen = true;
  }

  closeAiSummary(): void {
    this.isAiSummaryOpen = false;
  }

  openNotes(notes?: string | null): void {
    this.selectedNote = notes && String(notes).trim() ? String(notes) : 'No notes available.';
  }

  closeNotes(): void {
    this.selectedNote = null;
  }

  closeDeleteDialog(): void {
    this.selectedDeleteExpense = null;
  }

  confirmDeleteSelected(): void {
    const e = this.selectedDeleteExpense;
    if (!e) {
      return;
    }
    this.expenseService.deleteExpense(e.id).subscribe({
      next: (res) => {
        this.toastService.success(res.message || 'Expense deleted');
        this.closeDeleteDialog();
        this.loadExpenses();
      },
      error: (err) => this.toastService.error(err?.error?.message || 'Delete failed')
    });
  }

  closeExpenseFormModal(): void {
    this.isExpenseFormModalOpen = false;
    this.expenseForModal = null;
  }

  onExpenseFormModalSaved(): void {
    this.loadExpenses();
  }

  private expenseToFlatRow(e: Expense): Record<string, unknown> {
    return { ...e, amount: Number(e.amount) } as Record<string, unknown>;
  }

  private triggerDownload(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  }
}
