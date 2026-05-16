import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Router } from '@angular/router';
import { I18nService } from 'src/app/core/services/i18n.service';

export type AdminSidebarToolAction = 'ai-summary' | 'download-report';

export interface AdminSidebarWorkspaceLink {
  path: string;
  label: string;
  icon: string;
  badge?: number;
}

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss']
})
export class SidebarComponent {
  @Input() open = false;
  @Output() openChange = new EventEmitter<boolean>();

  /** Current workspace section (from parent / route) for active link styling. */
  @Input() activeWorkspace: 'expenses' | 'budgets' | 'employees' | 'categories' | 'notifications' | 'requests' = 'expenses';

  @Input() userName = '';
  @Input() userRole = '';
  @Input() notificationCount = 0;
  @Input() requestCount = 0;
  @Input() alertBadgeCount = 0;

  @Output() logoutClick = new EventEmitter<void>();
  @Output() toolAction = new EventEmitter<AdminSidebarToolAction>();
  readonly workspaceLinks: AdminSidebarWorkspaceLink[] = [
    { path: 'expenses', label: 'Expenses', icon: 'receipt_long' },
    { path: 'budgets', label: 'Budgets', icon: 'account_balance_wallet' },
    { path: 'employees', label: 'Employees', icon: 'groups' },
    { path: 'categories', label: 'Categories', icon: 'category' },
    { path: 'notifications', label: 'Notifications', icon: 'notifications' },
    { path: 'requests', label: 'Requests', icon: 'how_to_reg' }
  ];

  readonly toolLinks: Array<{ action: AdminSidebarToolAction; label: string; icon: string; badge?: number }> = [
    { action: 'ai-summary', label: 'Summary', icon: 'auto_awesome' },
    { action: 'download-report', label: 'Download Report', icon: 'download' }
  ];

  constructor(private readonly router: Router, readonly i18n: I18nService) {}

  workspaceLabelKey(path: string): string {
    switch (path) {
      case 'expenses':
        return 'admin.sidebarExpenses';
      case 'budgets':
        return 'admin.sidebarBudgets';
      case 'employees':
        return 'admin.sidebarEmployees';
      case 'categories':
        return 'admin.sidebarCategories';
      case 'notifications':
        return 'admin.sidebarNotifications';
      case 'requests':
        return 'admin.sidebarRequests';
      default:
        return path;
    }
  }

  toolLabelKey(action: AdminSidebarToolAction): string {
    switch (action) {
      case 'ai-summary':
        return 'admin.sidebarSummary';
      case 'download-report':
        return 'admin.sidebarDownloadReport';
      default:
        return action;
    }
  }

  get initials(): string {
    const n = (this.userName || '').trim();
    if (!n) {
      return 'A';
    }
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  close(): void {
    if (this.open) {
      this.openChange.emit(false);
    }
  }

  onOverlayPointerDown(): void {
    this.close();
  }

  isWorkspaceActive(path: string): boolean {
    return this.activeWorkspace === path;
  }

  workspaceLinkBadge(path: string): number | null {
    if (path === 'notifications' && this.notificationCount > 0) {
      return this.notificationCount;
    }
    if (path === 'requests' && this.requestCount > 0) {
      return this.requestCount;
    }
    return null;
  }

  workspaceLinkBadgeAriaKey(path: string): string {
    return path === 'requests' ? 'admin.requestsBadgeAria' : 'admin.notificationsBadgeAria';
  }

  onWorkspaceNav(event: Event, path: string): void {
    event.preventDefault();
    void this.router.navigate(['/admin', path]);
    this.close();
  }

  onTool(action: AdminSidebarToolAction): void {
    this.toolAction.emit(action);
    this.close();
  }

  onLogout(): void {
    this.logoutClick.emit();
    this.close();
  }

}
