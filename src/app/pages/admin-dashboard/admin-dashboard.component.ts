import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  Inject,
  OnDestroy,
  OnInit,
  ViewChild
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, Validators } from '@angular/forms';
import { Sort } from '@angular/material/sort';
import { Chart, registerables } from 'chart.js';
import type { ChartConfiguration } from 'chart.js';
import { forkJoin, Subscription } from 'rxjs';
import { Category, Expense } from 'src/app/core/models/app.models';
import { AdminBudgetDetailsFilter, AdminService } from 'src/app/core/services/admin.service';
import { AuthService } from 'src/app/core/services/auth.service';
import { CategoryService } from 'src/app/core/services/category.service';
import { ExpenseService } from 'src/app/core/services/expense.service';
import { ChatService, replyTextFromChatJson } from 'src/app/core/services/chat.service';
import { MetaService } from 'src/app/core/services/meta.service';
import { ToastService } from 'src/app/core/services/toast.service';
import { I18nService } from 'src/app/core/services/i18n.service';
import {
  buildAdminExpenseViewConfigFromTableMeta,
  buildAdminBudgetOverviewTableConfig,
  buildFallbackExpenseMetaConfig,
  buildViewConfigFromEmbeddedColumns,
  buildViewConfigFromTableMeta
} from 'src/app/core/utils/table-meta.utils';
import {
  DynamicTableQuery,
  DynamicTableViewConfig
} from 'src/app/shared/components/dynamic-data-table/dynamic-data-table.models';
import { AdminSidebarToolAction } from './sidebar/sidebar.component';

type AdminSection = 'expenses' | 'budgets' | 'employees';

interface EmployeeInsight {
  name: string;
  entries: number;
  spent: number;
}

interface AiChatLine {
  role: 'user' | 'assistant';
  text: string;
}

/**
 * Budget gauge row: each column height = 100% of that row's budget (normalized).
 * Sky = full budget track; yellow from bottom = spent/budget of column height (capped at 100% visually).
 */
interface BudgetGaugeRow {
  label: string;
  /** Month/year line under the category when present (e.g. `4 / 2026`). */
  period: string;
  /** Native tooltip: budget, spent, headroom / overage. */
  barTitle: string;
  /** One-line spent vs budget (INR) under the column. */
  amountsLine: string;
  pctLabel: string;
  /** Yellow fill height as % of column = min(100, spent/budget×100). */
  yellowPct: number;
  /** Top cap when spent > budget (100% allocation line). */
  showBudgetCap: boolean;
}

/** Totals across visible budget-detail rows (same basis as the gauge). */
interface BudgetGaugeSummary {
  allocated: number;
  spent: number;
  headroom: number;
  overAmount: number;
  /** null when no allocated baseline. */
  usagePct: number | null;
}

type AiChatChipAction = 'reports' | 'budgets' | 'search_tip';

Chart.register(...registerables);

@Component({
  selector: 'app-admin-dashboard',
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.css']
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
  @ViewChild('adminSummaryDonut') adminSummaryDonutRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('aiChatScroll') aiChatScroll?: ElementRef<HTMLDivElement>;

  summary: any;
  budgetDetails: any[] = [];
  categories: Category[] = [];

  activeSection: AdminSection = 'expenses';
  isAiSummaryOpen = false;
  isReportModalOpen = false;
  /** Add category + budget (budgets section). */
  isAddBudgetModalOpen = false;
  /** Update budget row (budgets table). */
  isEditBudgetModalOpen = false;
  /** Budget table row pending delete confirmation. */
  selectedBudgetDeleteRow: Record<string, unknown> | null = null;
  /** Full description text for budget table View modal. */
  isBudgetDescriptionModalOpen = false;
  budgetDescriptionModalTitle = '';
  budgetDescriptionModalText = '';

  /** Mobile / drawer navigation */
  navDrawerOpen = false;
  adminNotificationCount = 0;
  adminAlertBadgeCount = 0;
  userName = 'Admin';

  expenseLoading = false;
  adminExpenseTableConfig: DynamicTableViewConfig | null = null;
  adminExpenseTableRows: Record<string, unknown>[] = [];
  adminExpenseSortState: Sort | null = { active: 'expense_date', direction: 'desc' };
  expenseTotalCount = 0;
  /** Sum of amounts for admin **extra** expenses (`view: admins-extra`), all pages (stat card). */
  adminExtraExpenseTotal = 0;
  /** Raw rows from the last expense list load (for edit). */
  adminExpensesCache: Expense[] = [];
  isExpenseFormModalOpen = false;
  expenseForModal: Expense | null = null;
  /** Row pending delete confirmation (admin expense table). */
  selectedAdminDeleteExpense: Expense | null = null;
  employeeInsights: EmployeeInsight[] = [];

  expenseSearchInput = '';
  selectedExpenseSort: 'latest' | 'high' | 'low' = 'latest';

  /**
   * Expense table view chips.
   * - employee => users
   * - admin => admins (standard only)
   * - admin-extra => admins-extra
   */
  expenseAudience: 'employee' | 'admin' | 'admin-extra' = 'employee';

  reportMode: 'monthly' | 'user' = 'monthly';
  reportMonth = new Date().getMonth() + 1;
  reportYear = new Date().getFullYear();
  reportUserName = '';

  budgetTableConfig: DynamicTableViewConfig | null = null;
  /** Current page rows from `GET /admin/budget-details` (server sort / filter / pagination). */
  budgetTableRows: Record<string, unknown>[] = [];
  budgetTableTotalCount = 0;
  budgetTableLoading = false;
  budgetSearchInput = '';
  /** Toolbar presets: latest = newest year first (align with backend); null if column sort differs. */
  selectedBudgetListSort: 'latest' | 'high' | 'low' | null = 'latest';
  readonly budgetQuery: DynamicTableQuery = {
    pageIndex: 0,
    pageSize: 10,
    sortActive: 'year',
    sortDirection: 'desc',
    filter: ''
  };
  budgetTableSortState: Sort | null = { active: 'year', direction: 'desc' };

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
    labelKey: string;
    action: AiChatChipAction;
  }> = [
    { labelKey: 'admin.aiChipReports', action: 'reports' },
    { labelKey: 'admin.aiChipBudgets', action: 'budgets' },
    { labelKey: 'admin.aiChipSearch', action: 'search_tip' }
  ];

  /** Server-side list query for the admin expense table (public for template bindings). */
  readonly expenseQuery: DynamicTableQuery = {
    pageIndex: 0,
    pageSize: 10,
    sortActive: 'expense_date',
    sortDirection: 'desc',
    filter: ''
  };

  private summaryDonut?: Chart;
  /** Stacked gauge model for budgets chart (derived from `budgetDetails`). */
  budgetGaugeRows: BudgetGaugeRow[] = [];
  budgetGaugeTicks: number[] = [];
  /** For normalized gauge this is always `100` (percent of row budget). */
  budgetGaugeAxisMax = 0;
  budgetGaugeSummary: BudgetGaugeSummary | null = null;
  /** Swatches for the dual-ring chart inner band (updated when the chart redraws). */
  summaryDonutInnerLegend: Array<{ name: string; color: string }> = [];

  /** Restores window scroll after chat modal used `position: fixed` on `body`. */
  private aiChatPageScrollY = 0;
  private aiChatScrollLocked = false;
  private sectionRouteSub?: Subscription;
  private langSub?: Subscription;

  readonly categoryBudgetForm = this.fb.group({
    name: ['', [Validators.required]],
    description: [''],
    month: [new Date().getMonth() + 1, [Validators.required, Validators.min(1), Validators.max(12)]],
    year: [new Date().getFullYear(), [Validators.required, Validators.min(2024)]],
    allocated_amount: [0, [Validators.required, Validators.min(1)]]
  });

  readonly budgetEditForm = this.fb.group({
    budget_id: [null as number | null, [Validators.required]],
    name: ['', [Validators.required]],
    description: [''],
    month: [new Date().getMonth() + 1, [Validators.required, Validators.min(1), Validators.max(12)]],
    year: [new Date().getFullYear(), [Validators.required, Validators.min(2000)]],
    allocated_amount: [0, [Validators.required, Validators.min(1)]]
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
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly cdr: ChangeDetectorRef,
    @Inject(DOCUMENT) private readonly documentRef: Document,
    readonly i18n: I18nService
  ) {}

  setLang(lang: 'en' | 'hi'): void {
    this.i18n.use(lang);
  }

  chipDismissAria(s: { labelKey: string; action: AiChatChipAction }): string {
    return this.i18n.instant('admin.removeSuggestionWith', { label: this.i18n.instant(s.labelKey) });
  }

  get sectionTitle(): string {
    if (this.activeSection === 'budgets') {
      return this.i18n.instant('admin.sectionBudgetsTitle');
    }
    if (this.activeSection === 'employees') {
      return this.i18n.instant('admin.sectionEmployeesTitle');
    }
    return this.i18n.instant('admin.sectionExpensesTitle');
  }

  get sectionSubtitle(): string {
    if (this.activeSection === 'budgets') {
      return this.i18n.instant('admin.sectionBudgetsSubtitle');
    }
    if (this.activeSection === 'employees') {
      return this.i18n.instant('admin.sectionEmployeesSubtitle');
    }
    return this.i18n.instant('admin.sectionExpensesSubtitle');
  }

  budgetDeleteConfirmText(): string {
    const row = this.selectedBudgetDeleteRow;
    if (!row) {
      return '';
    }
    return this.i18n.instant('admin.deleteBudgetConfirm', {
      cat: String(row['category'] ?? ''),
      month: String(row['month'] ?? ''),
      year: String(row['year'] ?? '')
    });
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
    this.sectionRouteSub = this.route.paramMap.subscribe(() => {
      const raw = this.route.snapshot.paramMap.get('section');
      const next = this.normalizeAdminSectionParam(raw);
      if (raw !== next) {
        void this.router.navigate(['/admin', next], { replaceUrl: true });
        return;
      }
      this.applyWorkspaceSection(next);
    });
    this.langSub = this.i18n.onLanguageChange.subscribe(() => this.cdr.detectChanges());
    this.loadAll();
  }

  private bootstrapTableMetaDefaults(): void {
    const expPag = { pageSizeOptions: [5, 10, 20, 50], defaultPageSize: this.expenseQuery.pageSize };
    this.adminExpenseTableConfig = buildFallbackExpenseMetaConfig(expPag);
    const budPag = { pageSizeOptions: [5, 10, 20, 50], defaultPageSize: this.budgetQuery.pageSize };
    this.budgetTableConfig = buildAdminBudgetOverviewTableConfig(budPag);
  }

  ngOnDestroy(): void {
    this.sectionRouteSub?.unsubscribe();
    this.langSub?.unsubscribe();
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

  onAiChatSuggestion(s: { labelKey: string; action: AiChatChipAction }): void {
    this.dismissedAiChatChipActions.add(s.action);
    this.aiChatMessages.push({ role: 'user', text: this.i18n.instant(s.labelKey) });

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
      void this.router.navigate(['/admin', 'budgets']);
      this.toastService.info('Budgets: blue bars = budget, orange = spent per category.');
      this.queueScrollAiChat();
      return;
    }

    this.aiChatMessages.push({ role: 'assistant', text: 'Opening Expenses. Use the person search to filter by user.' });
    void this.router.navigate(['/admin', 'expenses']);
    this.toastService.info('Expenses: search by user name with the person icon, then submit.');
    this.queueScrollAiChat();
  }

  getExpenseSortLabel(): string {
    switch (this.selectedExpenseSort) {
      case 'high':
        return this.i18n.instant('admin.sortHigh');
      case 'low':
        return this.i18n.instant('admin.sortLow');
      default:
        return this.i18n.instant('admin.sortLatest');
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

  setExpenseAudience(audience: 'employee' | 'admin' | 'admin-extra'): void {
    if (this.expenseAudience === audience) {
      return;
    }
    this.expenseAudience = audience;
    this.expenseQuery.pageIndex = 0;
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

  loadAll(): void {
    this.loadSummary();
    this.loadBudgetDetails();
    this.loadExpenses();
    this.loadCategories();
    this.loadExpenseTableMeta();
    this.loadBudgetTableMeta();
  }

  onSidebarToolAction(action: AdminSidebarToolAction): void {
    if (action === 'ai-summary') {
      this.isAiSummaryOpen = true;
      return;
    }
    this.isReportModalOpen = true;
  }

  private normalizeAdminSectionParam(raw: string | null): AdminSection {
    if (raw === 'budgets' || raw === 'employees' || raw === 'expenses') {
      return raw;
    }
    return 'expenses';
  }

  private applyWorkspaceSection(section: AdminSection): void {
    this.activeSection = section;
    if (section === 'budgets') {
      setTimeout(() => {
        this.rebuildBudgetGaugeModel();
        this.cdr.markForCheck();
      }, 0);
    }
    if (section === 'expenses') {
      setTimeout(() => this.renderSummaryDonut(), 0);
    }
    if (section === 'employees') {
      this.loadUsersDetailsForEmployees();
    }
  }

  logoutAdmin(): void {
    this.closeAiChatModal();
    this.closeExpenseFormModal();
    this.closeAddBudgetModal();
    this.closeEditBudgetModal();
    this.closeBudgetDeleteDialog();
    this.closeBudgetDescriptionModal();
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

  openAddBudgetModal(): void {
    this.loadCategories();
    this.isAddBudgetModalOpen = true;
  }

  closeAddBudgetModal(): void {
    this.isAddBudgetModalOpen = false;
  }

  openEditBudgetModal(row: Record<string, unknown>): void {
    const src = (row['__budgetSource'] as Record<string, unknown>) ?? row;
    const id = this.resolveBudgetRowId(row);
    if (!Number.isFinite(id) || id <= 0) {
      this.toastService.error(
        'This row has no budget id. Ensure GET /admin/budget-details includes id (or budget_id / categoryBudgetId), including inside nested objects.'
      );
      return;
    }
    const name = String(src['category_name'] ?? src['category'] ?? row['category'] ?? '').trim();
    const desc = String(src['description'] ?? '').trim();
    const monthCell = row['month'];
    const yearCell = row['year'];
    let m =
      typeof monthCell === 'number' && monthCell >= 1 && monthCell <= 12
        ? monthCell
        : Number(src['month'] ?? src['budget_month']);
    let y =
      typeof yearCell === 'number' && yearCell >= 2000 && yearCell <= 2100
        ? yearCell
        : Number(src['year'] ?? src['budget_year']);
    if (!Number.isFinite(m) || m < 1 || m > 12) {
      m = new Date().getMonth() + 1;
    }
    if (!Number.isFinite(y) || y < 2000) {
      y = new Date().getFullYear();
    }
    const amt = Number(row['amount'] ?? src['budget_limit'] ?? src['allocated_amount'] ?? 0);
    this.budgetEditForm.reset({
      budget_id: id,
      name: name || 'Category',
      description: desc,
      month: m,
      year: y,
      allocated_amount: amt > 0 ? amt : 1
    });
    this.isEditBudgetModalOpen = true;
    this.cdr.detectChanges();
  }

  closeEditBudgetModal(): void {
    this.isEditBudgetModalOpen = false;
  }

  submitBudgetEdit(): void {
    if (this.budgetEditForm.invalid) {
      this.budgetEditForm.markAllAsTouched();
      return;
    }
    const v = this.budgetEditForm.getRawValue();
    const id = Number(v.budget_id);
    this.adminService
      .updateCategoryBudget(id, {
        name: String(v.name).trim(),
        description: String(v.description || '').trim(),
        month: Number(v.month),
        year: Number(v.year),
        allocated_amount: Number(v.allocated_amount),
        currency: 'INR'
      })
      .subscribe({
        next: (res) => {
          this.toastService.success(res.message || 'Budget updated');
          this.closeEditBudgetModal();
          this.loadBudgetDetails();
          this.loadCategories();
        },
        error: (err) => this.toastService.error(err?.error?.message || 'Update budget failed')
      });
  }

  onAdminBudgetDynamicDelete(row: Record<string, unknown>): void {
    this.selectedBudgetDeleteRow = row;
    this.cdr.detectChanges();
  }

  openBudgetDescriptionModal(row: Record<string, unknown>): void {
    const src = (row['__budgetSource'] as Record<string, unknown>) ?? row;
    const d = this.readBudgetScalar(src, [
      'description',
      'category_description',
      'categoryDescription',
      'budget_description',
      'budgetDescription'
    ]);
    const text =
      d !== undefined && d !== null
        ? String(d).trim()
        : String(row['description'] ?? src['description'] ?? '').trim();
    this.budgetDescriptionModalTitle = String(row['category'] ?? src['category_name'] ?? 'Description').trim();
    this.budgetDescriptionModalText = text || 'No description was provided for this budget.';
    this.isBudgetDescriptionModalOpen = true;
    this.cdr.detectChanges();
  }

  closeBudgetDescriptionModal(): void {
    this.isBudgetDescriptionModalOpen = false;
    this.budgetDescriptionModalTitle = '';
    this.budgetDescriptionModalText = '';
    this.cdr.detectChanges();
  }

  closeBudgetDeleteDialog(): void {
    this.selectedBudgetDeleteRow = null;
  }

  confirmBudgetDelete(): void {
    const row = this.selectedBudgetDeleteRow;
    if (!row) {
      return;
    }
    const id = this.resolveBudgetRowId(row);
    if (!Number.isFinite(id) || id <= 0) {
      this.toastService.error('Cannot delete: missing budget id on this row.');
      this.closeBudgetDeleteDialog();
      return;
    }
    this.adminService.deleteCategoryBudget(id).subscribe({
      next: (res) => {
        this.toastService.success(res.message || 'Budget deleted');
        this.closeBudgetDeleteDialog();
        this.loadBudgetDetails();
        this.loadCategories();
      },
      error: (err) => this.toastService.error(err?.error?.message || 'Delete budget failed')
    });
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
          this.closeAddBudgetModal();
          this.loadBudgetDetails();
          this.loadCategories();
        },
        error: (err) => this.toastService.error(err?.error?.message || 'Create category budget failed')
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

  /**
   * Reads a transaction/expense count from API rows. Handles arrays (e.g. `transactions: []` length),
   * and avoids `Number([])` → 0.
   */
  private coerceBudgetTxnCount(v: unknown): number | null {
    if (v === null || v === undefined) {
      return null;
    }
    if (Array.isArray(v)) {
      return v.length;
    }
    if (typeof v === 'object') {
      const o = v as Record<string, unknown>;
      const inner = o['count'] ?? o['total'] ?? o['length'];
      if (inner === undefined) {
        return null;
      }
      return this.coerceBudgetTxnCount(inner);
    }
    const s = String(v).trim();
    if (s === '') {
      return null;
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  /** BFS nested objects for the first matching key (exact). */
  private readBudgetScalar(root: unknown, keys: string[]): unknown {
    if (!root || typeof root !== 'object') {
      return undefined;
    }
    const queue: unknown[] = [root];
    const seen = new Set<unknown>();
    while (queue.length) {
      const cur = queue.shift();
      if (!cur || typeof cur !== 'object' || seen.has(cur)) {
        continue;
      }
      seen.add(cur);
      const o = cur as Record<string, unknown>;
      for (const k of keys) {
        if (Object.prototype.hasOwnProperty.call(o, k)) {
          const v = o[k];
          if (v !== undefined && v !== null) {
            return v;
          }
        }
      }
      for (const v of Object.values(o)) {
        if (v && typeof v === 'object') {
          queue.push(v);
        }
      }
    }
    return undefined;
  }

  /**
   * Reads optional non-negative integer count from budget-details row (supports nested objects).
   * Returns `null` when the field is absent so the table shows an em dash.
   */
  private readOptionalBudgetCount(raw: Record<string, unknown>, keys: string[]): number | null {
    const v = this.readBudgetScalar(raw, keys);
    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
      return null;
    }
    const n = this.coerceBudgetTxnCount(v);
    if (n === null || n < 0) {
      return null;
    }
    return Math.floor(n);
  }

  /** Budget row id for PATCH/DELETE (top-level or nested). */
  private resolveBudgetRowId(row: Record<string, unknown>): number {
    const direct = Number(row['budget_id']);
    if (Number.isFinite(direct) && direct > 0) {
      return direct;
    }
    const src = (row['__budgetSource'] as Record<string, unknown>) ?? row;
    const v = this.readBudgetScalar(src, [
      'id',
      'budget_id',
      'category_budget_id',
      'categoryBudgetId',
      'budgetId',
      'CategoryBudgetId'
    ]);
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : NaN;
  }

  /**
   * Maps GET /admin/budget-details row into the fixed budget overview table shape.
   * Txn column: `standard_transaction_count` (same category + month/year), snake or camelCase, nested OK.
   */
  private mapBudgetDetailToTableRow(raw: Record<string, unknown>): Record<string, unknown> {
    const budgetLimit = Number(raw['budget_limit'] ?? raw['allocated_amount'] ?? 0);
    const spent = Number(raw['total_spent'] ?? raw['spent'] ?? 0);
    const remaining = Math.max(0, budgetLimit - spent);
    const usageNum = budgetLimit > 0 ? (spent / budgetLimit) * 100 : 0;
    const usage_pct = `${Math.round(usageNum * 10) / 10}%`;
    const category = String(raw['category_name'] ?? raw['category'] ?? '—');
    const monthRaw = raw['month'] ?? raw['budget_month'];
    const yearRaw = raw['year'] ?? raw['budget_year'];
    const monthNum = monthRaw !== undefined && monthRaw !== null && String(monthRaw).trim() !== '' ? Number(monthRaw) : NaN;
    const yearNum = yearRaw !== undefined && yearRaw !== null && String(yearRaw).trim() !== '' ? Number(yearRaw) : NaN;
    const monthOk = Number.isFinite(monthNum) && monthNum >= 1 && monthNum <= 12;
    const yearOk = Number.isFinite(yearNum) && yearNum >= 2000 && yearNum <= 2100;
    const standard_txn_count = this.readOptionalBudgetCount(raw, [
      'standard_transaction_count',
      'standardTransactionCount'
    ]);
    const description = (() => {
      const d = this.readBudgetScalar(raw, [
        'description',
        'category_description',
        'categoryDescription',
        'budget_description',
        'budgetDescription'
      ]);
      const s =
        d !== undefined && d !== null ? String(d).trim() : String(raw['description'] ?? '').trim();
      return s || null;
    })();
    const budget_id = (() => {
      const v = this.readBudgetScalar(raw, [
        'id',
        'budget_id',
        'category_budget_id',
        'categoryBudgetId',
        'budgetId',
        'CategoryBudgetId'
      ]);
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : null;
    })();
    return {
      category,
      description,
      month: monthOk ? monthNum : '—',
      year: yearOk ? yearNum : '—',
      amount: budgetLimit,
      spent,
      remaining,
      usage_pct,
      standard_txn_count,
      budget_id,
      __budgetSource: { ...raw }
    };
  }

  /**
   * Refreshes chart/AI data from the full budget-details payload (no list query params)
   * and reloads the budgets table with server-side page / sort / search.
   */
  private loadBudgetDetails(): void {
    this.refreshBudgetGaugeData();
    this.loadBudgetTableFromServer();
  }

  private refreshBudgetGaugeData(): void {
    this.adminService.getBudgetDetails().subscribe({
      next: (res) => {
        this.budgetDetails = res.data || [];
        this.rebuildBudgetGaugeModel();
        if (this.activeSection === 'expenses') {
          setTimeout(() => this.renderSummaryDonut(), 0);
        }
      },
      error: () => {
        this.budgetDetails = [];
        this.rebuildBudgetGaugeModel();
        this.toastService.info('budget-details endpoint unavailable on current backend build');
      }
    });
  }

  private loadBudgetTableFromServer(): void {
    this.budgetTableLoading = true;
    const filter = this.buildBudgetTableApiFilter();
    this.adminService.getBudgetDetails(filter).subscribe({
      next: (res) => {
        const data = (res.data || []) as Record<string, unknown>[];
        const mapped = data.map((r) => this.mapBudgetDetailToTableRow(r));
        this.budgetTableRows = this.sortBudgetRowsForDisplay(mapped);
        const p = res.pagination;
        this.budgetTableTotalCount =
          typeof p?.totalItems === 'number'
            ? p.totalItems
            : typeof p?.total_records === 'number'
              ? p.total_records
              : this.budgetTableRows.length;
        this.budgetTableLoading = false;
        if (this.activeSection === 'expenses') {
          setTimeout(() => this.renderSummaryDonut(), 0);
        }
      },
      error: (err) => {
        this.budgetTableRows = [];
        this.budgetTableTotalCount = 0;
        this.budgetTableLoading = false;
        this.toastService.error(err?.error?.message || 'Budget list load failed');
      }
    });
  }

  private buildBudgetTableApiFilter(): AdminBudgetDetailsFilter {
    const page = this.budgetQuery.pageIndex + 1;
    const limit = this.budgetQuery.pageSize;
    const search = this.budgetQuery.filter.trim();
    const sortActive = this.budgetQuery.sortActive || 'year';
    const sortBy = this.mapBudgetSortToApiKey(sortActive);
    const order: 'ASC' | 'DESC' = this.budgetQuery.sortDirection === 'asc' ? 'ASC' : 'DESC';
    return {
      page,
      limit,
      sortBy,
      order,
      ...(search ? { search } : {})
    };
  }

  /** Maps dynamic-table column keys to backend `sortBy` values (adjust if API differs). */
  private mapBudgetSortToApiKey(columnKey: string): string {
    switch (columnKey) {
      case 'amount':
        return 'allocated_amount';
      case 'spent':
        return 'total_spent';
      case 'category':
        return 'category_name';
      case 'month':
        return 'month';
      case 'year':
        return 'year';
      case 'remaining':
        return 'remaining';
      case 'usage_pct':
        return 'usage_pct';
      case 'standard_txn_count':
        return 'standard_transaction_count';
      default:
        return 'year';
    }
  }

  /** Ensures visible row order matches toolbar/column sort (covers APIs that ignore sort params). */
  private sortBudgetRowsForDisplay(rows: Record<string, unknown>[]): Record<string, unknown>[] {
    const key = this.budgetQuery.sortActive || 'year';
    const dir = this.budgetQuery.sortDirection === 'asc' ? 'asc' : 'desc';
    return [...rows].sort((a, b) => {
      const c = this.compareBudgetDisplayRows(a, b, key);
      return dir === 'desc' ? -c : c;
    });
  }

  private compareBudgetDisplayRows(a: Record<string, unknown>, b: Record<string, unknown>, key: string): number {
    const va = this.budgetDisplaySortValue(a, key);
    const vb = this.budgetDisplaySortValue(b, key);
    if (typeof va === 'string' && typeof vb === 'string') {
      return va.localeCompare(vb);
    }
    const na = Number(va);
    const nb = Number(vb);
    if (na < nb) {
      return -1;
    }
    if (na > nb) {
      return 1;
    }
    return 0;
  }

  private budgetDisplaySortValue(row: Record<string, unknown>, key: string): string | number {
    switch (key) {
      case 'category':
        return String(row['category'] ?? '').toLowerCase();
      case 'month':
      case 'year':
      case 'amount':
      case 'spent':
      case 'remaining':
      case 'standard_txn_count': {
        const raw = row[key];
        if (raw === '—' || raw === null || raw === undefined || raw === '') {
          return Number.NEGATIVE_INFINITY;
        }
        const n = Number(raw);
        return Number.isFinite(n) ? n : Number.NEGATIVE_INFINITY;
      }
      case 'usage_pct': {
        const s = String(row['usage_pct'] ?? '').replace(/%/g, '').trim();
        const n = Number(s);
        return Number.isFinite(n) ? n : Number.NEGATIVE_INFINITY;
      }
      default:
        return 0;
    }
  }

  getBudgetSortLabel(): string {
    if (this.selectedBudgetListSort === 'latest') {
      return this.i18n.instant('admin.sortLatest');
    }
    if (this.selectedBudgetListSort === 'high') {
      return this.i18n.instant('admin.sortHigh');
    }
    if (this.selectedBudgetListSort === 'low') {
      return this.i18n.instant('admin.sortLow');
    }
    const a = this.budgetQuery.sortActive || 'year';
    const d = this.budgetQuery.sortDirection || 'desc';
    if (a === 'amount') {
      return d === 'desc' ? this.i18n.instant('admin.sortHigh') : this.i18n.instant('admin.sortLow');
    }
    if (a === 'category') {
      return d === 'desc' ? this.i18n.instant('admin.sortCategoryZA') : this.i18n.instant('admin.sortCategoryAZ');
    }
    if (a === 'year') {
      return d === 'desc' ? this.i18n.instant('admin.sortYearNewest') : this.i18n.instant('admin.sortYearOldest');
    }
    const label = this.budgetTableConfig?.columns.find((c) => c.key === a)?.label ?? a;
    return this.i18n.instant('admin.sortDynamic', {
      label,
      dir: d === 'desc' ? this.i18n.instant('admin.sortHighFirst') : this.i18n.instant('admin.sortLowFirst')
    });
  }

  applyBudgetListSort(mode: 'latest' | 'high' | 'low'): void {
    this.selectedBudgetListSort = mode;
    switch (mode) {
      case 'latest':
        this.budgetQuery.sortActive = 'year';
        this.budgetQuery.sortDirection = 'desc';
        break;
      case 'high':
        this.budgetQuery.sortActive = 'amount';
        this.budgetQuery.sortDirection = 'desc';
        break;
      case 'low':
        this.budgetQuery.sortActive = 'amount';
        this.budgetQuery.sortDirection = 'asc';
        break;
    }
    this.budgetQuery.pageIndex = 0;
    this.budgetTableSortState = {
      active: this.budgetQuery.sortActive,
      direction: this.budgetQuery.sortDirection
    };
    this.loadBudgetTableFromServer();
    this.cdr.detectChanges();
  }

  applyBudgetSearch(): void {
    this.budgetQuery.filter = this.budgetSearchInput.trim();
    this.budgetQuery.pageIndex = 0;
    this.loadBudgetTableFromServer();
    this.cdr.detectChanges();
  }

  clearBudgetSearch(): void {
    this.budgetSearchInput = '';
    this.budgetQuery.filter = '';
    this.budgetQuery.pageIndex = 0;
    this.loadBudgetTableFromServer();
    this.cdr.detectChanges();
  }

  onBudgetTableQuery(q: DynamicTableQuery): void {
    const allowed = new Set([
      'category',
      'month',
      'year',
      'amount',
      'spent',
      'remaining',
      'usage_pct',
      'standard_txn_count'
    ]);
    const sortActive = q.sortActive && allowed.has(q.sortActive) ? q.sortActive : 'year';
    const sortDirection = q.sortDirection === 'asc' || q.sortDirection === 'desc' ? q.sortDirection : 'desc';
    const pageSize = Math.max(1, q.pageSize);

    this.budgetQuery.sortActive = sortActive;
    this.budgetQuery.sortDirection = sortDirection;
    this.budgetQuery.pageSize = pageSize;
    this.budgetQuery.pageIndex = q.pageIndex;
    /* Search comes from toolbar (`budgetSearchInput` / `applyBudgetSearch`), not table filter. */

    if (sortActive === 'amount' && sortDirection === 'desc') {
      this.selectedBudgetListSort = 'high';
    } else if (sortActive === 'amount' && sortDirection === 'asc') {
      this.selectedBudgetListSort = 'low';
    } else if (sortActive === 'year' && sortDirection === 'desc') {
      this.selectedBudgetListSort = 'latest';
    } else {
      this.selectedBudgetListSort = null;
    }

    this.budgetTableSortState = { active: sortActive, direction: sortDirection };
    this.loadBudgetTableFromServer();
    this.cdr.detectChanges();
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
    const pagination = { pageSizeOptions: [5, 10, 20, 50], defaultPageSize: this.budgetQuery.pageSize };
    this.budgetTableConfig = buildAdminBudgetOverviewTableConfig(pagination);
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

  private normalizeExpense(item: Expense): Expense {
    const anyItem = item as Expense & {
      user?: { id?: number; name?: string; role?: 'user' | 'admin' };
      category?: { id?: number; name?: string };
    };
    return {
      ...item,
      user_id: item.user_id ?? anyItem.user?.id,
      user_name: item.user_name ?? anyItem.user?.name,
      user_role: item.user_role ?? anyItem.user?.role,
      category_id: item.category_id ?? anyItem.category?.id ?? item.category_id,
      category_name: item.category_name ?? anyItem.category?.name
    };
  }

  private getExpenseAudienceView(): 'users' | 'admins' | 'admins-extra' {
    if (this.expenseAudience === 'admin-extra') {
      return 'admins-extra';
    }
    if (this.expenseAudience === 'admin') {
      return 'admins';
    }
    return 'users';
  }

  private getExpenseRole(expense: Expense): string {
    const loose = expense as unknown as { role?: unknown };
    const role = expense.user_role || expense.user?.role || loose.role || '';
    return String(role).toLowerCase().trim();
  }

  private getExpenseType(expense: Expense): string {
    return String(expense.expense_type || '').toLowerCase().trim();
  }

  private isAdminRole(role: string): boolean {
    return role === 'admin' || role === 'administrator';
  }

  /** Safe client-side fallback in case API view filtering is unavailable. */
  private applyExpenseAudienceFilter(list: Expense[]): Expense[] {
    const hasAnyRole = list.some((e) => this.getExpenseRole(e) !== '');

    if (this.expenseAudience === 'employee') {
      // Employee chip should show all non-admin roles (user / employee etc.).
      if (hasAnyRole) {
        return list.filter((e) => !this.isAdminRole(this.getExpenseRole(e)));
      }
      // Role missing from payload: fall back to non-extra as closest approximation.
      return list.filter((e) => this.getExpenseType(e) !== 'extra');
    }
    if (this.expenseAudience === 'admin') {
      if (hasAnyRole) {
        return list.filter((e) => this.isAdminRole(this.getExpenseRole(e)) && this.getExpenseType(e) !== 'extra');
      }
      // Role missing from payload: fall back to standard slice.
      return list.filter((e) => this.getExpenseType(e) !== 'extra');
    }
    if (hasAnyRole) {
      return list.filter((e) => this.isAdminRole(this.getExpenseRole(e)) && this.getExpenseType(e) === 'extra');
    }
    // Role missing from payload: fall back to extra slice.
    return list.filter((e) => this.getExpenseType(e) === 'extra');
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
    const view = this.getExpenseAudienceView();

    this.expenseService.getDashboardExpenses({ page, limit, sortBy, order, view }).subscribe({
      next: (res) => {
        this.applyExpenseResponse(res, search);
        this.loadAdminExtraExpenseTotal();
      },
      error: (err) => {
        this.expenseLoading = false;
        this.adminExtraExpenseTotal = 0;
        this.toastService.error(err?.error?.message || 'Expense load failed');
      }
    });
  }

  /**
   * Loads all admin-extra dashboard expenses and sums `amount` for the stat card
   * (same slice as the “Admin extra” table chip: `view: admins-extra`).
   */
  private loadAdminExtraExpenseTotal(): void {
    const limit = 200;
    const maxPages = 40;
    this.expenseService.getDashboardExpenses({ view: 'admins-extra', page: 1, limit }).subscribe({
      next: (first) => {
        let sum = this.sumExpenseAmountsFromPayload(first.data as Expense[]);
        const totalPages = Math.min(Math.max(1, first.pagination?.totalPages || 1), maxPages);
        if (totalPages <= 1) {
          this.adminExtraExpenseTotal = sum;
          this.cdr.markForCheck();
          return;
        }
        const reqs = [];
        for (let p = 2; p <= totalPages; p += 1) {
          reqs.push(this.expenseService.getDashboardExpenses({ view: 'admins-extra', page: p, limit }));
        }
        forkJoin(reqs).subscribe({
          next: (pages) => {
            pages.forEach((r) => {
              sum += this.sumExpenseAmountsFromPayload(r.data as Expense[]);
            });
            this.adminExtraExpenseTotal = sum;
            this.cdr.markForCheck();
          },
          error: () => {
            this.adminExtraExpenseTotal = sum;
            this.cdr.markForCheck();
          }
        });
      },
      error: () => {
        this.adminExtraExpenseTotal = 0;
        this.cdr.markForCheck();
      }
    });
  }

  private sumExpenseAmountsFromPayload(data: Expense[] | undefined): number {
    return (data ?? []).reduce((s, raw) => s + Number(this.normalizeExpense(raw).amount || 0), 0);
  }

  private applyExpenseResponse(
    res: { data?: Expense[]; pagination?: { totalItems?: number; total_records?: number } },
    search = ''
  ): void {
    const raw = (res.data || []).map((item) => this.normalizeExpense(item as Expense));
    const rawNormalized = raw.map((item) => ({ ...item, amount: Number(item.amount || 0) })) as Expense[];
    const audienceFiltered = this.applyExpenseAudienceFilter(rawNormalized);
    const q = search.trim().toLowerCase();
    const expenses = q
      ? audienceFiltered.filter((item) => String(item.user_name || '').toLowerCase().includes(q))
      : audienceFiltered;
    this.adminExpensesCache = expenses;
    this.adminExpenseTableRows = expenses.map((item) => this.expenseToFlatRow(item));
    const serverTotal = res.pagination?.totalItems ?? res.pagination?.total_records ?? expenses.length;
    this.expenseTotalCount = q ? expenses.length : serverTotal;
    this.employeeInsights = this.buildEmployeeInsights(expenses);
    this.expenseLoading = false;
    if (this.activeSection === 'expenses') {
      setTimeout(() => this.renderSummaryDonut(), 0);
    }
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

  formatBudgetGaugeTick(n: number): string {
    return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  }

  /** Y-axis labels: INR ticks elsewhere; for budget gauge use 0–100% of row budget. */
  formatBudgetGaugeYAxis(n: number): string {
    if (this.budgetGaugeAxisMax === 100) {
      return `${Math.round(n)}%`;
    }
    return this.formatBudgetGaugeTick(n);
  }

  formatBudgetGaugeInr(value: number): string {
    const n = Number.isFinite(value) ? value : 0;
    return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }

  private readBudgetGaugeMoney(root: Record<string, unknown>, keys: string[]): number {
    for (const key of keys) {
      const v = this.readBudgetScalar(root, [key]);
      if (v !== undefined && v !== null && `${v}`.trim() !== '') {
        const n = Number(v);
        if (Number.isFinite(n) && n >= 0) {
          return n;
        }
      }
    }
    return 0;
  }

  private formatGaugeUsagePct(spent: number, budget: number): string {
    if (budget > 0) {
      const p = (spent / budget) * 100;
      const capped = Math.min(9999, p);
      const rounded =
        capped >= 100 || Math.abs(capped - Math.round(capped)) < 0.04
          ? Math.min(999, Math.round(capped))
          : Math.round(capped * 10) / 10;
      return `${rounded}%`;
    }
    return spent > 0 ? '—' : '0%';
  }

  /**
   * Budget vs spent gauge: each column = 100% of that row's budget; yellow from bottom = spent share.
   * Y-axis is 0–100% of allocation; INR amounts are in tooltips and under labels.
   */
  private rebuildBudgetGaugeModel(): void {
    const raw = Array.isArray(this.budgetDetails) ? this.budgetDetails : [];
    if (!raw.length) {
      this.budgetGaugeRows = [];
      this.budgetGaugeTicks = [0];
      this.budgetGaugeAxisMax = 0;
      this.budgetGaugeSummary = null;
      return;
    }

    type Pre = {
      label: string;
      period: string;
      budget: number;
      spent: number;
    };

    const pre: Pre[] = (raw as Record<string, unknown>[]).map((item) => {
      const nameRaw = this.readBudgetScalar(item, ['category_name', 'category', 'CategoryName', 'categoryName']);
      const label = String(nameRaw ?? '—').trim() || '—';
      const budget = this.readBudgetGaugeMoney(item, [
        'budget_limit',
        'allocated_amount',
        'budgetLimit',
        'allocatedAmount',
        'BudgetLimit'
      ]);
      const spent = this.readBudgetGaugeMoney(item, [
        'total_spent',
        'spent',
        'TotalSpent',
        'totalSpent',
        'expense_total',
        'expenseTotal'
      ]);
      const monthRaw = this.readBudgetScalar(item, ['month', 'budget_month', 'budgetMonth', 'Month']);
      const yearRaw = this.readBudgetScalar(item, ['year', 'budget_year', 'budgetYear', 'Year']);
      const monthNum =
        monthRaw !== undefined && monthRaw !== null && String(monthRaw).trim() !== '' ? Number(monthRaw) : NaN;
      const yearNum =
        yearRaw !== undefined && yearRaw !== null && String(yearRaw).trim() !== '' ? Number(yearRaw) : NaN;
      const monthOk = Number.isFinite(monthNum) && monthNum >= 1 && monthNum <= 12;
      const yearOk = Number.isFinite(yearNum) && yearNum >= 2000 && yearNum <= 2100;
      const period = monthOk && yearOk ? `${monthNum} / ${yearNum}` : '';
      return { label, period, budget, spent };
    });

    const allocatedSum = pre.reduce((s, p) => s + p.budget, 0);
    const spentSum = pre.reduce((s, p) => s + p.spent, 0);
    const headroomSum = pre.reduce((s, p) => s + Math.max(0, p.budget - p.spent), 0);
    const overSum = pre.reduce((s, p) => s + Math.max(0, p.spent - p.budget), 0);
    this.budgetGaugeSummary = {
      allocated: allocatedSum,
      spent: spentSum,
      headroom: headroomSum,
      overAmount: overSum,
      usagePct: allocatedSum > 0 ? Math.min(999, Math.round((spentSum / allocatedSum) * 1000) / 10) : null
    };

    pre.sort((a, b) => {
      const overA = Math.max(0, a.spent - a.budget);
      const overB = Math.max(0, b.spent - b.budget);
      if (overB !== overA) {
        return overB - overA;
      }
      if (b.spent !== a.spent) {
        return b.spent - a.spent;
      }
      return a.label.localeCompare(b.label);
    });

    this.budgetGaugeAxisMax = 100;
    this.budgetGaugeTicks = [0, 25, 50, 75, 100];

    this.budgetGaugeRows = pre.map((p) => {
      const { label, period, budget, spent } = p;
      let yellowPct = 0;
      if (budget > 0) {
        yellowPct = Math.min(100, Math.round((spent / budget) * 10000) / 100);
      } else if (spent > 0) {
        yellowPct = 100;
      }
      const showBudgetCap = budget > 0 && spent > budget + 1e-6;

      const pctLabel = this.formatGaugeUsagePct(spent, budget);
      const headroomInr = Math.max(0, budget - spent);
      const overInr = Math.max(0, spent - budget);
      const amountsLine =
        budget > 0
          ? `${this.formatBudgetGaugeInr(spent)} / ${this.formatBudgetGaugeInr(budget)}`
          : spent > 0
            ? `${this.formatBudgetGaugeInr(spent)} · no budget`
            : '—';
      const barTitleParts = [
        `Column height = 100% of budget (${this.formatBudgetGaugeInr(budget)})`,
        `Spent ${this.formatBudgetGaugeInr(spent)} (${pctLabel} of this row's budget)`,
        spent <= budget
          ? `Unused (sky) ${this.formatBudgetGaugeInr(headroomInr)}`
          : `Over budget ${this.formatBudgetGaugeInr(overInr)}`
      ];
      if (period) {
        barTitleParts.unshift(`Period ${period}`);
      }
      const barTitle = barTitleParts.join(' · ');

      return {
        label,
        period,
        barTitle,
        amountsLine,
        pctLabel,
        yellowPct,
        showBudgetCap
      };
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
