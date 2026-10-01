import { Module } from '@nestjs/common';
import {
  BusinessInvoicesController,
  BusinessSummaryController,
  MyInvoicesController,
} from './invoices.controller.js';
import { InvoicesService } from './invoices.service.js';
import { SummaryService } from './summary.service.js';

/**
 * Invoices for completed orders (issued by the orders module when it completes one), the
 * capability-aware dashboard summary and the live table board.
 */
@Module({
  controllers: [BusinessInvoicesController, MyInvoicesController, BusinessSummaryController],
  providers: [InvoicesService, SummaryService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
