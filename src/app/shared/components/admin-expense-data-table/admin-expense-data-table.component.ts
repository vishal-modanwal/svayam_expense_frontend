import { Component, EventEmitter, Input, Output } from '@angular/core';
import { PageEvent } from '@angular/material/paginator';
import { MatTableDataSource } from '@angular/material/table';
import { AdminExpenseTableRow } from 'src/app/core/models/app.models';

@Component({
  selector: 'app-admin-expense-data-table',
  templateUrl: './admin-expense-data-table.component.html',
  styleUrls: ['./admin-expense-data-table.component.css']
})
export class AdminExpenseDataTableComponent {
  @Input() dataSource = new MatTableDataSource<AdminExpenseTableRow>([]);
  @Input() displayedColumns: string[] = ['title', 'user', 'category', 'date', 'amount'];
  @Input() totalRecords = 0;
  @Input() pageSize = 10;
  @Input() pageIndex = 0;
  @Input() pageSizeOptions: number[] = [5, 10, 20, 50];
  @Input() loading = false;

  @Output() pageChange = new EventEmitter<PageEvent>();
  @Output() editExpense = new EventEmitter<AdminExpenseTableRow>();

  onPage(e: PageEvent): void {
    this.pageChange.emit(e);
  }
}
