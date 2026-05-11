import { Component, EventEmitter, Input, Output } from '@angular/core';
import { PageEvent } from '@angular/material/paginator';
import { MatTableDataSource } from '@angular/material/table';
import { ExpenseTableRow } from 'src/app/core/models/app.models';
import { environment } from 'src/environments/environment';
import { buildReceiptUrlFromReceiptPath } from 'src/app/core/utils/receipt-url';

@Component({
  selector: 'app-expense-data-table',
  templateUrl: './expense-data-table.component.html',
  styleUrls: ['./expense-data-table.component.css']
})
export class ExpenseDataTableComponent {
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

  @Output() pageChange = new EventEmitter<PageEvent>();
  @Output() viewNotes = new EventEmitter<ExpenseTableRow>();
  @Output() edit = new EventEmitter<ExpenseTableRow>();
  @Output() delete = new EventEmitter<ExpenseTableRow>();

  onPage(e: PageEvent): void {
    this.pageChange.emit(e);
  }

  /** View link from `receipt_path` only (`{apiBase}/uploads/...`). */
  receiptHref(row: ExpenseTableRow): string | null {
    return buildReceiptUrlFromReceiptPath(row.receipt_path ?? null, environment.apiBaseUrl);
  }
}
