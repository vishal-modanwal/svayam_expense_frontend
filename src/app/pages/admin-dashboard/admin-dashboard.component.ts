import { DOCUMENT } from '@angular/common';
import { Component, ElementRef, Inject, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Sort } from '@angular/material/sort';
import { Chart, registerables } from 'chart.js';
import type { ChartConfiguration } from 'chart.js';
import { forkJoin } from 'rxjs';
import { AdminExpenseTableRow, Category, Expense } from 'src/app/core/models/app.models';
import { AdminService } from 'src/app/core/services/admin.service';
import { AuthService } from 'src/app/core/services/auth.service';
import { CategoryService } from 'src/app/core/services/category.service';
import { ExpenseService } from 'src/app/core/services/expense.service';
import { ChatService, replyTextFromChatJson } from 'src/app/core/services/chat.service';
import { MetaService } from 'src/app/core/services/meta.service';
import { ToastService } from 'src/app/core/services/toast.service';
import {
  buildAdminExpenseViewConfigFromTableMeta,
  buildFallbackBudgetMetaConfig,
  buildFallbackExpenseMetaConfig,
  buildViewConfigFromEmbeddedColumns,
  buildViewConfigFromTableMeta
} from 'src/app/core/utils/table-meta.utils';
import {
  DynamicTableQuery,
  DynamicTableViewConfig
} from 'src/app/shared/components/dynamic-data-table/dynamic-data-table.models';

type AdminSection = 'expenses' | 'budgets' | 'employees';
type SidebarAction = AdminSection | 'ai-summary' | 'download-report';

interface EmployeeInsight {
  name: string;
  entries: number;
  spent: number;
}

interface AiChatLine {
  role: 'user' | 'assistant';
  text: string;
}

type AiChatChipAction = 'reports' | 'budgets' | 'search_tip';

Chart.register(...registerables);

@Component({
  selector: 'app-admin-dashboard',
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.css']
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
  @ViewChild('budgetChart') budgetChartRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('adminSummaryDonut') adminSummaryDonutRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('aiChatScroll') aiChatScroll?: ElementRef<HTMLDivElement>;

  summary: any;
  budgetDetails: any[] = [];
  categories: Category[] = [];

  activeSection: AdminSection = 'expenses';
  isAiSummaryOpen = false;
  isReportModalOpen = false;

  userName = 'Admin';

  expenseLoading = false;
  adminExpenseTableConfig: DynamicTableViewConfig | null = null;
  adminExpenseTableRows: Record<string, unknown>[] = [];
  adminExpenseSortState: Sort | null = { active: 'expense_date', direction: 'desc' };
  expenseTotalCount = 0;
  /** Raw rows from the last expense list load (for edit). */
  adminExpensesCache: Expense[] = [];
  isExpenseFormModalOpen = false;
  expenseForModal: Expense | null = null;
  /** Row pending delete confirmation (admin expense table). */
  selectedAdminDeleteExpense: Expense | null = null;
  employeeInsights: EmployeeInsight[] = [];

  expenseSearchInput = '';
  selectedExpenseSort: 'latest' | 'high' | 'low' = 'latest';

  reportMode: 'monthly' | 'user' = 'monthly';
  reportMonth = new Date().getMonth() + 1;
  reportYear = new Date().getFullYear();
  reportUserName = '';

  budgetTableConfig: DynamicTableViewConfig | null = null;
  budgetTableRows: Record<string, unknown>[] = [];
  budgetTableLoading = false;
  budgetTableSortState: Sort | null = null;

  usersTableSortState: Sort | null = null;

  usersTableConfig: DynamicTableViewConfig | null = null;
  usersTableRows: Record<string, unknown>[] = [];
  usersTableLoading = false;

  /** Chat-style assistant modal (opened from logo orb). */
  isAiChatModalOpen = false;
  /** Chip actions removed via ✕ or after choosing that suggestion; cleared when chat reopens. */
  dismissedAiChatChipActions = new Set<AiChatChipAction>();
  aiChatMessages: AiChatLine[] = [];
  aiChatDraft = '';
  /** True while POST /api/chat/message is in flight. */
  aiChatSending = false;
  readonly aiChatSuggestions: ReadonlyArray<{
    label: string;
    action: AiChatChipAction;
  }> = [
    { label: 'How do I download reports?', action: 'reports' },
    { label: 'What does budget vs spent mean?', action: 'budgets' },
    { label: 'How do I search expenses by user?', action: 'search_tip' }
  ];

  readonly sidebarItems: Array<{ key: SidebarAction; label: string; icon: string }> = [
    { key: 'expenses', label: 'Expenses', icon: 'receipt_long' },
    { key: 'budgets', label: 'Budgets', icon: 'account_balance_wallet' },
    { key: 'employees', label: 'Employees', icon: 'groups' },
    { key: 'ai-summary', label: 'AI Summary', icon: 'auto_awesome' },
    { key: 'download-report', label: 'Download Report', icon: 'download' }
  ];

  /** Server-side list query for the admin expense table (public for template bindings). */
  readonly expenseQuery: DynamicTableQuery = {
    pageIndex: 0,
    pageSize: 10,
    sortActive: 'expense_date',
    sortDirection: 'desc',
    filter: ''
  };

  private budgetChart?: Chart;
  private summaryDonut?: Chart;
  /** Swatches for the dual-ring chart inner band (updated when the chart redraws). */
  summaryDonutInnerLegend: Array<{ name: string; color: string }> = [];

  /** Restores window scroll after chat modal used `position: fixed` on `body`. */
  private aiChatPageScrollY = 0;
  private aiChatScrollLocked = false;

  readonly categoryBudgetForm = this.fb.group({
    name: ['', [Validators.required]],
    description: [''],
    month: [new Date().getMonth() + 1, [Validators.required, Validators.min(1), Validators.max(12)]],
    year: [new Date().getFullYear(), [Validators.required, Validators.min(2024)]],
    allocated_amount: [0, [Validators.required, Validators.min(1)]]
  });

  readonly categoryUpdateForm = this.fb.group({
    id: [null as number | null, [Validators.required]],
    name: ['', [Validators.required]],
    description: ['']
  });

  readonly userToggleForm = this.fb.group({
    userId: [null as number | null, [Validators.required]]
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly adminService: AdminService,
    private readonly expenseService: ExpenseService,
    private readonly categoryService: CategoryService,
    private readonly metaService: MetaService,
    private readonly chatService: ChatService,
    private readonly toastService: ToastService,
    @Inject(DOCUMENT) private readonly documentRef: Document
  ) {}

  get sectionTitle(): string {
    if (this.activeSection === 'budgets') {
      return 'Budget management';
    }
    if (this.activeSection === 'employees') {
      return 'Team insights';
    }
    return 'Organisation expenses';
  }

  get sectionSubtitle(): string {
    if (this.activeSection === 'budgets') {
      return 'Create, update and track category-wise budgets.';
    }
    if (this.activeSection === 'employees') {
      return 'User insights and activation controls.';
    }
    return 'Monitor allocated budgets, spend, and every entry in one place.';
  }

  get adminAllocated(): number {
    return Number(this.summary?.total_allocated || 0);
  }

  get adminSpent(): number {
    return Number(this.summary?.total_spent || 0);
  }

  get adminRemaining(): number {
    return Number(this.summary?.remaining_total || 0);
  }

  get adminUsagePct(): number {
    return Number(this.summary?.overall_usage_hike || 0);
  }

  get aiHighlights(): string[] {
    const allocated = this.adminAllocated;
    const spent = this.adminSpent;
    const remaining = this.adminRemaining;
    const usage = this.adminUsagePct;
    const highestBudget = [...this.budgetDetails].sort(
      (a, b) => Number(b.total_spent || 0) - Number(a.total_spent || 0)
    )[0];

    return [
      `Total spending is ₹${spent.toLocaleString('en-IN')} out of ₹${allocated.toLocaleString('en-IN')}.`,
      `Remaining budget currently stands at ₹${remaining.toLocaleString('en-IN')}.`,
      usage >= 85
        ? `Budget usage is high at ${usage}% — review top spending categories soon.`
        : `Budget usage is at ${usage}% and currently in a manageable range.`,
      highestBudget
        ? `${highestBudget.category_name} is the highest spend category at ₹${Number(
            highestBudget.total_spent || 0
          ).toLocaleString('en-IN')}.`
        : 'Category-wise budget data is not available yet.'
    ];
  }

  ngOnInit(): void {
    this.userName = this.authService.getCurrentUser()?.name || 'Admin';
    this.bootstrapTableMetaDefaults();
    this.loadAll();
  }

  private bootstrapTableMetaDefaults(): void {
    const expPag = { pageSizeOptions: [5, 10, 20, 50], defaultPageSize: this.expenseQuery.pageSize };
    this.adminExpenseTableConfig = buildFallbackExpenseMetaConfig(expPag);
    const budPag = { pageSizeOptions: [10, 25, 50], defaultPageSize: 25 };
    this.budgetTableConfig = buildFallbackBudgetMetaConfig(budPag);
  }

  ngOnDestroy(): void {
    this.budgetChart?.destroy();
    this.summaryDonut?.destroy();
    this.unlockPageScrollForAiChat();
  }

  openAiChatModal(): void {
    this.isAiChatModalOpen = true;
    this.dismissedAiChatChipActions.clear();
    this.aiChatDraft = '';
    this.aiChatMessages = [
      {
        role: 'assistant',
        text: `Hi ${this.userName}. Ask below or use a suggestion.`
      }
    ];
    this.lockPageScrollForAiChat();
    this.queueScrollAiChat();
  }

  closeAiChatModal(): void {
    this.isAiChatModalOpen = false;
    this.unlockPageScrollForAiChat();
  }

  private lockPageScrollForAiChat(): void {
    if (this.aiChatScrollLocked) {
      return;
    }
    const win = this.documentRef.defaultView;
    this.aiChatPageScrollY = win?.scrollY ?? 0;
    const body = this.documentRef.body;
    const html = this.documentRef.documentElement;
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${this.aiChatPageScrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    html.style.overflow = 'hidden';
    this.aiChatScrollLocked = true;
  }

  private unlockPageScrollForAiChat(): void {
    if (!this.aiChatScrollLocked) {
      return;
    }
    const body = this.documentRef.body;
    const html = this.documentRef.documentElement;
    body.style.overflow = '';
    body.style.position = '';
    body.style.top = '';
    body.style.left = '';
    body.style.right = '';
    body.style.width = '';
    html.style.overflow = '';
    this.documentRef.defaultView?.scrollTo(0, this.aiChatPageScrollY);
    this.aiChatScrollLocked = false;
  }

  sendAiChatMessage(): void {
    const text = this.aiChatDraft.trim();
    if (!text || this.aiChatSending) {
      return;
    }
    this.aiChatDraft = '';
    this.aiChatMessages.push({ role: 'user', text });
    this.aiChatSending = true;
    this.queueScrollAiChat();
    this.chatService.sendMessage(text).subscribe({
      next: (res) => {
        this.aiChatMessages.push({ role: 'assistant', text: replyTextFromChatJson(res) });
        this.aiChatSending = false;
        this.queueScrollAiChat();
      },
      error: (err: { error?: { message?: string }; message?: string }) => {
        this.aiChatSending = false;
        const fallback =
          (typeof err?.error?.message === 'string' && err.error.message) ||
          (typeof err?.message === 'string' && err.message) ||
          'Chat request failed.';
        this.aiChatMessages.push({ role: 'assistant', text: fallback });
        this.toastService.error(fallback);
        this.queueScrollAiChat();
      }
    });
  }

  trackAiChatLine(index: number, _line: AiChatLine): number {
    return index;
  }

  private queueScrollAiChat(): void {
    setTimeout(() => this.scrollAiChatToEnd(), 0);
  }

  private scrollAiChatToEnd(): void {
    const el = this.aiChatScroll?.nativeElement;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }

  openAiSummaryFromChat(): void {
    this.closeAiChatModal();
    this.isAiSummaryOpen = true;
  }

  dismissAiChatChip(action: AiChatChipAction, event: MouseEvent): void {
    event.stopPropagation();
    this.dismissedAiChatChipActions.add(action);
  }

  onAiChatSuggestion(s: { label: string; action: AiChatChipAction }): void {
    this.dismissedAiChatChipActions.add(s.action);
    this.aiChatMessages.push({ role: 'user', text: s.label });

    if (s.action === 'reports') {
      this.aiChatMessages.push({ role: 'assistant', text: 'Opening report download…' });
      this.queueScrollAiChat();
      setTimeout(() => {
        this.closeAiChatModal();
        this.isReportModalOpen = true;
      }, 300);
      return;
    }

    if (s.action === 'budgets') {
      this.aiChatMessages.push({ role: 'assistant', text: 'Opening Budgets. Blue = budget, orange = spent.' });
      this.onSidebarItemClick('budgets');
      this.toastService.info('Budgets: blue bars = budget, orange = spent per category.');
      this.queueScrollAiChat();
      return;
    }

    this.aiChatMessages.push({ role: 'assistant', text: 'Opening Expenses. Use the person search to filter by user.' });
    this.onSidebarItemClick('expenses');
    this.toastService.info('Expenses: search by user name with the person icon, then submit.');
    this.queueScrollAiChat();
  }

  getExpenseSortLabel(): string {
    switch (this.selectedExpenseSort) {
      case 'high':
        return 'Amount: High to Low';
      case 'low':
        return 'Amount: Low to High';
      default:
        return 'Latest first';
    }
  }

  applyExpenseSort(mode: 'latest' | 'high' | 'low'): void {
    this.selectedExpenseSort = mode;
    switch (mode) {
      case 'high':
        this.expenseQuery.sortActive = 'amount';
        this.expenseQuery.sortDirection = 'desc';
        break;
      case 'low':
        this.expenseQuery.sortActive = 'amount';
        this.expenseQuery.sortDirection = 'asc';
        break;
      default:
        this.expenseQuery.sortActive = 'expense_date';
        this.expenseQuery.sortDirection = 'desc';
    }
    this.expenseQuery.pageIndex = 0;
    this.adminExpenseSortState = {
      active: this.expenseQuery.sortActive ?? 'expense_date',
      direction: this.expenseQuery.sortDirection
    };
    this.loadExpenses();
  }

  applyExpenseSearch(): void {
    this.expenseQuery.filter = this.expenseSearchInput.trim();
    this.expenseQuery.pageIndex = 0;
    this.loadExpenses();
  }

  clearExpenseSearch(): void {
    this.expenseSearchInput = '';
    this.expenseQuery.filter = '';
    this.expenseQuery.pageIndex = 0;
    this.loadExpenses();
  }

  onAdminExpenseDynamicQuery(q: DynamicTableQuery): void {
    this.expenseQuery.pageIndex = q.pageIndex;
    this.expenseQuery.pageSize = q.pageSize;
    if (q.sortActive === 'amount' || q.sortActive === 'expense_date') {
      this.expenseQuery.sortActive = q.sortActive;
      this.expenseQuery.sortDirection = q.sortDirection || 'desc';
      if (q.sortActive === 'amount') {
        this.selectedExpenseSort = q.sortDirection === 'asc' ? 'low' : 'high';
      } else {
        this.selectedExpenseSort = 'latest';
      }
    }
    this.adminExpenseSortState = {
      active: this.expenseQuery.sortActive ?? 'expense_date',
      direction: this.expenseQuery.sortDirection
    };
    this.loadExpenses();
  }

  onAdminExpenseDynamicDelete(row: Record<string, unknown>): void {
    const id = Number(row['id']);
    const full = this.adminExpensesCache.find((e) => e.id === id);
    if (!full) {
      this.toastService.error('Expense not found');
      return;
    }
    this.selectedAdminDeleteExpense = full;
  }

  closeAdminDeleteDialog(): void {
    this.selectedAdminDeleteExpense = null;
  }

  confirmAdminDeleteSelected(): void {
    const e = this.selectedAdminDeleteExpense;
    if (!e) {
      return;
    }
    this.expenseService.deleteExpense(e.id).subscribe({
      next: (res) => {
        this.toastService.success(res.message || 'Expense deleted');
        this.closeAdminDeleteDialog();
        this.loadExpenses();
      },
      error: (err) => this.toastService.error(err?.error?.message || 'Delete failed')
    });
  }

  onAdminExpenseDynamicEdit(row: Record<string, unknown>): void {
    const id = Number(row['id']);
    const full = this.adminExpensesCache.find((e) => e.id === id);
    if (!full) {
      this.toastService.error('Expense not found on this page. Refresh and try again.');
      return;
    }
    this.openAdminEditExpense(this.mapToAdminRow(full));
  }

  isSidebarSectionActive(key: SidebarAction): boolean {
    if (key === 'expenses' || key === 'budgets' || key === 'employees') {
      return this.activeSection === key;
    }
    return false;
  }

  loadAll(): void {
    this.loadSummary();
    this.loadBudgetDetails();
    this.loadExpenses();
    this.loadCategories();
    this.loadExpenseTableMeta();
    this.loadBudgetTableMeta();
  }

  onSidebarItemClick(item: SidebarAction): void {
    if (item === 'ai-summary') {
      this.isAiSummaryOpen = true;
      return;
    }
    if (item === 'download-report') {
      this.isReportModalOpen = true;
      return;
    }
    this.activeSection = item;
    if (item === 'budgets') {
      setTimeout(() => this.renderBudgetChart(), 0);
    }
    if (item === 'expenses') {
      setTimeout(() => this.renderSummaryDonut(), 0);
    }
    if (item === 'employees') {
      this.loadUsersDetailsForEmployees();
    }
  }

  logoutAdmin(): void {
    this.closeAiChatModal();
    this.closeExpenseFormModal();
    this.authService.logout(true);
  }

  closeAiSummary(): void {
    this.isAiSummaryOpen = false;
  }

  closeReportModal(): void {
    this.isReportModalOpen = false;
  }

  openAdminExpenseModal(): void {
    this.loadCategories();
    this.expenseForModal = null;
    this.isExpenseFormModalOpen = true;
  }

  openAdminEditExpense(row: AdminExpenseTableRow): void {
    const full = this.adminExpensesCache.find((e) => e.id === row.id);
    if (!full) {
      this.toastService.error('Expense not found on this page. Refresh and try again.');
      return;
    }
    this.loadCategories();
    this.expenseForModal = { ...full };
    this.isExpenseFormModalOpen = true;
  }

  closeExpenseFormModal(): void {
    this.isExpenseFormModalOpen = false;
    this.expenseForModal = null;
  }

  onExpenseFormModalSaved(): void {
    this.loadExpenses();
    if (this.activeSection === 'expenses') {
      setTimeout(() => this.renderSummaryDonut(), 0);
    }
  }

  openReportModal(): void {
    this.isReportModalOpen = true;
  }

  switchReportMode(mode: 'monthly' | 'user'): void {
    this.reportMode = mode;
  }

  createCategoryBudget(): void {
    if (this.categoryBudgetForm.invalid) {
      this.categoryBudgetForm.markAllAsTouched();
      return;
    }
    this.adminService
      .createCategoryWithBudget({
        ...this.categoryBudgetForm.value,
        currency: 'INR'
      } as {
        name: string;
        description?: string;
        month: number;
        year: number;
        allocated_amount: number;
        currency?: string;
      })
      .subscribe({
        next: (res) => {
          this.toastService.success(res.message || 'Category+Budget created');
          this.categoryBudgetForm.reset({
            name: '',
            description: '',
            month: new Date().getMonth() + 1,
            year: new Date().getFullYear(),
            allocated_amount: 0
          });
          this.loadBudgetDetails();
          this.loadCategories();
        },
        error: (err) => this.toastService.error(err?.error?.message || 'Create category budget failed')
      });
  }

  loadCategoryForEdit(id: number): void {
    this.categoryService.getById(id).subscribe({
      next: (res) => {
        this.categoryUpdateForm.patchValue({
          id: res.data.id,
          name: res.data.name,
          description: res.data.description || ''
        });
      },
      error: (err) => this.toastService.error(err?.error?.message || 'Category fetch failed')
    });
  }

  updateCategory(): void {
    if (this.categoryUpdateForm.invalid) {
      this.categoryUpdateForm.markAllAsTouched();
      return;
    }
    const value = this.categoryUpdateForm.value;
    this.categoryService
      .updateCategory(value.id as number, { name: value.name as string, description: value.description || '' })
      .subscribe({
        next: (res) => {
          this.toastService.success(res.message || 'Category updated');
          this.loadCategories();
          this.loadBudgetDetails();
        },
        error: (err) => this.toastService.error(err?.error?.message || 'Category update failed')
      });
  }

  deleteCategory(id: number): void {
    this.categoryService.deleteCategory(id).subscribe({
      next: (res) => {
        this.toastService.success(res.message || 'Category deleted');
        this.loadCategories();
        this.loadBudgetDetails();
      },
      error: (err) => this.toastService.error(err?.error?.message || 'Category delete failed')
    });
  }

  toggleUser(): void {
    if (this.userToggleForm.invalid) {
      this.userToggleForm.markAllAsTouched();
      return;
    }
    this.adminService.toggleUserStatus(this.userToggleForm.value.userId as number).subscribe({
      next: (res) => this.toastService.success(res.message || 'User status toggled'),
      error: (err) => this.toastService.error(err?.error?.message || 'Toggle user failed')
    });
  }

  downloadMonthlyReport(): void {
    if (this.reportMonth < 1 || this.reportMonth > 12) {
      this.toastService.error('Enter a valid month (1 to 12)');
      return;
    }
    if (this.reportYear < 2024) {
      this.toastService.error('Enter a valid year');
      return;
    }
    this.expenseService.downloadAllPdf({ month: this.reportMonth, year: this.reportYear }).subscribe({
      next: (blob) => {
        this.triggerDownload(blob, `monthly-report-${this.reportYear}-${this.reportMonth}.pdf`);
        this.toastService.success('Monthly report downloaded');
      },
      error: (err) => this.toastService.error(err?.error?.message || 'Monthly report download failed')
    });
  }

  downloadUserWiseReport(): void {
    const user = this.reportUserName.trim();
    if (!user) {
      this.toastService.error('Enter user name for user-wise report');
      return;
    }

    this.expenseService.searchByUserName(user, 1).subscribe({
      next: (first) => {
        const totalPages = first.pagination?.totalPages || 1;
        const combined: Expense[] = [...(first.data || [])];

        if (totalPages <= 1) {
          this.exportUserWiseCsv(user, combined);
          return;
        }

        const requests = [];
        for (let page = 2; page <= totalPages; page += 1) {
          requests.push(this.expenseService.searchByUserName(user, page));
        }
        forkJoin(requests).subscribe({
          next: (responses) => {
            responses.forEach((res) => {
              combined.push(...(res.data || []));
            });
            this.exportUserWiseCsv(user, combined);
          },
          error: (err) => this.toastService.error(err?.error?.message || 'User-wise report generation failed')
        });
      },
      error: (err) => this.toastService.error(err?.error?.message || 'User data fetch failed')
    });
  }

  private loadSummary(): void {
    this.adminService.getTotalSummary().subscribe({
      next: (res) => {
        this.summary = res.summary;
        if (this.activeSection === 'expenses') {
          setTimeout(() => this.renderSummaryDonut(), 0);
        }
      },
      error: (err) => this.toastService.error(err?.error?.message || 'Summary load failed')
    });
  }

  private loadBudgetDetails(): void {
    this.budgetTableLoading = true;
    this.adminService.getBudgetDetails().subscribe({
      next: (res) => {
        this.budgetDetails = res.data || [];
        this.budgetTableRows = (this.budgetDetails as Record<string, unknown>[]).map((r) => ({ ...r }));
        this.budgetTableLoading = false;
        this.renderBudgetChart();
        if (this.activeSection === 'expenses') {
          setTimeout(() => this.renderSummaryDonut(), 0);
        }
      },
      error: () => {
        this.budgetDetails = [];
        this.budgetTableRows = [];
        this.budgetTableLoading = false;
        this.toastService.info('budget-details endpoint unavailable on current backend build');
      }
    });
  }

  private loadExpenseTableMeta(): void {
    const pagination = { pageSizeOptions: [5, 10, 20, 50], defaultPageSize: this.expenseQuery.pageSize };
    this.metaService.getTableExpenses().subscribe({
      next: (meta) => {
        if (meta?.columns?.length) {
          this.adminExpenseTableConfig = buildAdminExpenseViewConfigFromTableMeta(meta, pagination);
        }
      },
      error: () => {
        /* keep bootstrap fallback */
      }
    });
  }

  private loadBudgetTableMeta(): void {
    const pagination = { pageSizeOptions: [10, 25, 50], defaultPageSize: 25 };
    this.metaService.getTableBudgets().subscribe({
      next: (meta) => {
        if (meta?.columns?.length) {
          this.budgetTableConfig = buildViewConfigFromTableMeta(meta, pagination, []);
        }
      },
      error: () => {
        /* keep bootstrap fallback */
      }
    });
  }

  loadUsersDetailsForEmployees(): void {
    this.usersTableLoading = true;
    const pagination = { pageSizeOptions: [10, 25, 50], defaultPageSize: 25 };
    this.adminService.getUsersDetails().subscribe({
      next: (res) => {
        const cfg = buildViewConfigFromEmbeddedColumns(res.columns, pagination, 'Users');
        this.usersTableConfig = cfg;
        this.usersTableRows = (res.data ?? []) as Record<string, unknown>[];
        this.usersTableLoading = false;
      },
      error: () => {
        this.usersTableConfig = null;
        this.usersTableRows = [];
        this.usersTableLoading = false;
      }
    });
  }

  private expenseToFlatRow(e: Expense): Record<string, unknown> {
    return { ...e, amount: Number(e.amount) } as Record<string, unknown>;
  }

  private loadExpenses(): void {
    this.expenseLoading = true;
    const search = this.expenseQuery.filter.trim();
    const page = this.expenseQuery.pageIndex + 1;
    const limit = this.expenseQuery.pageSize;
    const sortBy =
      this.expenseQuery.sortActive === 'amount' || this.expenseQuery.sortActive === 'expense_date'
        ? this.expenseQuery.sortActive
        : undefined;
    const order =
      this.expenseQuery.sortDirection === 'asc'
        ? 'ASC'
        : this.expenseQuery.sortDirection === 'desc'
          ? 'DESC'
          : undefined;

    const source$ = search
      ? this.expenseService.searchByUserName(search, page, limit)
      : this.expenseService.getAllExpenses({ page, limit, sortBy, order });

    source$.subscribe({
      next: (res) => {
        const expenses = (res.data || []).map((item) => ({ ...item, amount: Number(item.amount) }));
        this.adminExpensesCache = expenses;
        this.adminExpenseTableRows = expenses.map((item) => this.expenseToFlatRow(item));
        this.expenseTotalCount = res.pagination?.totalItems ?? expenses.length;
        this.employeeInsights = this.buildEmployeeInsights(expenses);
        this.expenseLoading = false;
        if (this.activeSection === 'expenses') {
          setTimeout(() => this.renderSummaryDonut(), 0);
        }
      },
      error: (err) => {
        this.expenseLoading = false;
        this.toastService.error(err?.error?.message || 'Expense load failed');
      }
    });
  }

  private mapToAdminRow(item: Expense): AdminExpenseTableRow {
    return {
      id: item.id,
      title: item.title || '—',
      user: item.user_name || '—',
      category: item.category_name || '—',
      date: this.formatDate(item.expense_date),
      amount: Number(item.amount || 0)
    };
  }

  private loadCategories(): void {
    this.categoryService.getAll().subscribe({
      next: (res) => {
        const raw = res as { data?: Category[]; categories?: Category[] };
        const list = raw.data ?? raw.categories;
        this.categories = Array.isArray(list) ? list : [];
      },
      error: (err) => this.toastService.error(err?.error?.message || 'Category load failed')
    });
  }

  private buildEmployeeInsights(expenses: Expense[]): EmployeeInsight[] {
    const employeeMap = new Map<string, EmployeeInsight>();
    expenses.forEach((item) => {
      const name = item.user_name || 'Unknown';
      const prev = employeeMap.get(name);
      if (!prev) {
        employeeMap.set(name, { name, entries: 1, spent: Number(item.amount || 0) });
        return;
      }
      prev.entries += 1;
      prev.spent += Number(item.amount || 0);
    });
    return [...employeeMap.values()].sort((a, b) => b.spent - a.spent);
  }

  private renderBudgetChart(): void {
    if (!this.budgetChartRef || this.activeSection !== 'budgets') {
      return;
    }
    this.budgetChart?.destroy();
    const tick = document.body.classList.contains('dark-theme') ? '#94a3b8' : '#64748b';
    const grid = document.body.classList.contains('dark-theme') ? '#334155' : '#e2e8f0';
    this.budgetChart = new Chart(this.budgetChartRef.nativeElement, {
      type: 'bar',
      data: {
        labels: this.budgetDetails.map((item) => item.category_name),
        datasets: [
          {
            label: 'Budget',
            data: this.budgetDetails.map((item) => Number(item.budget_limit || 0)),
            backgroundColor: '#3b82f6'
          },
          {
            label: 'Spent',
            data: this.budgetDetails.map((item) => Number(item.total_spent || 0)),
            backgroundColor: '#f97316'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: tick }
          }
        },
        scales: {
          x: { grid: { color: grid }, ticks: { color: tick } },
          y: { grid: { color: grid }, ticks: { color: tick } }
        }
      }
    });
  }

  /**
   * Dual-ring doughnut: outer = organisation spend vs remaining budget; inner = category spend
   * (from budget-details when present, else current expense table page).
   */
  private renderSummaryDonut(): void {
    if (!this.adminSummaryDonutRef || this.activeSection !== 'expenses') {
      return;
    }
    this.summaryDonut?.destroy();

    const spent = this.adminSpent;
    const allocated = this.adminAllocated;
    const remaining = Math.max(0, this.adminRemaining);
    const isDark = document.body.classList.contains('dark-theme');
    const muted = isDark ? '#94a3b8' : '#64748b';
    const ringBorder = isDark ? 'rgba(15, 23, 42, 0.92)' : '#ffffff';

    const outerTotal = spent + remaining;
    const outerLabels = ['Expense (spent)', 'Budget remaining'];

    const inner = this.buildSummaryDonutInnerRing();
    this.summaryDonutInnerLegend = inner.labels.map((name, i) => ({
      name,
      color: inner.colors[i] || '#94a3b8'
    }));
    const innerSum = inner.data.reduce((a, b) => a + b, 0) || 1;
    const transparent = 'rgba(0, 0, 0, 0)';

    const fmtInr = (n: number) =>
      `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

    const usagePct = allocated > 0 ? Math.min(100, Math.round((spent / allocated) * 100)) : null;

    const labels = [...outerLabels, ...inner.labels];
    const outerPair = outerTotal > 0 ? [spent, remaining] : [1, 0];
    const zerosInner = new Array(inner.labels.length).fill(0);
    const zerosOuter = new Array(outerLabels.length).fill(0);
    const outerDatasetData = [...outerPair, ...zerosInner];
    const innerDatasetData = [...zerosOuter, ...inner.data];

    const outerBg: string[] = [
      'rgba(249, 115, 22, 0.94)',
      'rgba(45, 212, 191, 0.9)',
      ...inner.labels.map(() => transparent)
    ];
    const innerBg: string[] = [
      ...outerLabels.map(() => transparent),
      ...inner.colors.map((c) => (c.startsWith('rgba') ? c : `${c}e8`))
    ];
    const outerBorder: string[] = [
      ringBorder,
      ringBorder,
      ...inner.labels.map(() => transparent)
    ];
    const innerBorder: string[] = [
      ...outerLabels.map(() => transparent),
      ...inner.data.map(() => ringBorder)
    ];

    const centerPlugin = {
      id: 'adminSummaryDonutCenter',
      afterDraw: (chart: Chart) => {
        const { ctx, chartArea } = chart;
        if (!chartArea) {
          return;
        }
        const cx = (chartArea.left + chartArea.right) / 2;
        const cy = (chartArea.top + chartArea.bottom) / 2;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = isDark ? '#f1f5f9' : '#0f172a';
        ctx.font = '700 1.25rem system-ui, -apple-system, Segoe UI, sans-serif';
        ctx.fillText(usagePct != null ? `${usagePct}%` : '—', cx, cy - 10);
        ctx.font = '600 0.6875rem system-ui, -apple-system, Segoe UI, sans-serif';
        ctx.fillStyle = muted;
        ctx.fillText('of allocated budget', cx, cy + 12);
        ctx.restore();
      }
    };

    const donutConfig: ChartConfiguration<'doughnut'> = {
      type: 'doughnut',
      plugins: [centerPlugin],
      data: {
        labels,
        datasets: [
          {
            label: 'Organisation',
            data: outerDatasetData,
            backgroundColor: outerBg,
            borderColor: outerBorder,
            borderWidth: 2,
            spacing: 1,
            hoverOffset: 6
          },
          {
            label: 'Categories',
            data: innerDatasetData,
            backgroundColor: innerBg,
            borderColor: innerBorder,
            borderWidth: 2,
            spacing: 1,
            hoverOffset: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '52%',
        layout: { padding: { top: 6, bottom: 6 } },
        elements: {
          arc: {
            borderRadius: 6
          }
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            filter: (item) => Number(item.raw) > 0,
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.94)' : 'rgba(255, 255, 255, 0.96)',
            titleColor: isDark ? '#f8fafc' : '#0f172a',
            bodyColor: isDark ? '#e2e8f0' : '#334155',
            borderColor: isDark ? '#334155' : '#e2e8f0',
            borderWidth: 1,
            padding: 12,
            cornerRadius: 10,
            callbacks: {
              title: (items) => {
                const i = items[0]?.datasetIndex ?? 0;
                return i === 0 ? 'Outer · Budget vs expense' : 'Inner · Category spend';
              },
              label: (ctx) => {
                const label = String(ctx.label || '');
                const raw = ctx.raw as number;
                const v = Number(raw);
                if (!Number.isFinite(v) || v <= 0) {
                  return '';
                }
                if (ctx.datasetIndex === 0) {
                  return ` ${label}: ${fmtInr(v)}`;
                }
                const pct = Math.round((v / innerSum) * 100);
                return ` ${label}: ${fmtInr(v)} (${pct}% of inner ring)`;
              }
            }
          }
        }
      }
    };

    this.summaryDonut = new Chart(this.adminSummaryDonutRef.nativeElement, donutConfig);
  }

  private buildSummaryDonutInnerRing(): { labels: string[]; data: number[]; colors: string[] } {
    const palette = [
      '#6366f1',
      '#8b5cf6',
      '#a855f7',
      '#d946ef',
      '#ec4899',
      '#f43f5e',
      '#f97316',
      '#eab308',
      '#84cc16',
      '#22c55e',
      '#14b8a6',
      '#06b6d4',
      '#3b82f6'
    ];

    const fromBudget = (this.budgetDetails || [])
      .map((b: { category_name?: string; total_spent?: number }) => ({
        name: String(b.category_name || 'Other'),
        val: Number(b.total_spent || 0)
      }))
      .filter((x) => x.val > 0)
      .sort((a, b) => b.val - a.val);

    let rows = fromBudget;
    if (!rows.length && this.adminExpensesCache.length) {
      const m = new Map<string, number>();
      this.adminExpensesCache.forEach((e) => {
        const k = e.category_name || 'Other';
        m.set(k, (m.get(k) || 0) + Number(e.amount || 0));
      });
      rows = [...m.entries()]
        .map(([name, val]) => ({ name, val }))
        .filter((x) => x.val > 0)
        .sort((a, b) => b.val - a.val);
    }

    const maxSlices = 9;
    if (rows.length > maxSlices) {
      const head = rows.slice(0, maxSlices - 1);
      const tailSum = rows.slice(maxSlices - 1).reduce((s, x) => s + x.val, 0);
      rows = [...head, { name: 'Other categories', val: tailSum }];
    }

    if (!rows.length) {
      return {
        labels: ['No category data'],
        data: [1],
        colors: ['rgba(148, 163, 184, 0.35)']
      };
    }

    const labels = rows.map((r) => r.name);
    const data = rows.map((r) => r.val);
    const colors = rows.map((_, i) => palette[i % palette.length]);
    return { labels, data, colors };
  }

  private formatDate(dateValue: string): string {
    if (!dateValue) {
      return '—';
    }
    return new Date(dateValue).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  private exportUserWiseCsv(user: string, rows: Expense[]): void {
    if (!rows.length) {
      this.toastService.info('No records found for this user');
      return;
    }
    const header = ['Title', 'Category', 'Amount', 'Date', 'Payment Method', 'Vendor', 'Description'];
    const body = rows.map((item) => [
      item.title || '',
      item.category_name || '',
      Number(item.amount || 0).toFixed(2),
      this.formatDate(item.expense_date),
      item.payment_method || '',
      item.vendor || '',
      item.description || ''
    ]);
    const csv = [header, ...body]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    this.triggerDownload(blob, `user-wise-report-${user.replace(/\s+/g, '-').toLowerCase()}.csv`);
    this.toastService.success('User-wise report downloaded');
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
