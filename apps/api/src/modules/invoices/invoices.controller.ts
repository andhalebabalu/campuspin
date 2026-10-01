import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type BusinessSummary,
  type Invoice,
  type InvoiceSummary,
  type ListInvoicesQuery,
  type SummaryQuery,
  type TableStatus,
  businessSummarySchema,
  invoiceSchema,
  invoiceSummarySchema,
  listInvoicesQuerySchema,
  summaryQuerySchema,
  tableStatusSchema,
  uuidSchema,
} from '@platform/contracts';
import type { Response } from 'express';
import { z } from 'zod';
import type { Paginated } from '../../common/http/paginated.js';
import { ResponseMessage } from '../../common/http/response-message.decorator.js';
import { ApiEnvelopeResponse, ApiErrorResponses } from '../../common/swagger/api-responses.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { RequiresCapability } from '../capabilities/requires-capability.js';
import { InvoicesService } from './invoices.service.js';
import { SummaryService } from './summary.service.js';

const UNAUTHORIZED = {
  status: 401,
  code: 'UNAUTHORIZED',
  message: 'Authentication required',
} as const;
const FORBIDDEN = {
  status: 403,
  code: 'CAPABILITY_REQUIRED',
  message: 'This is not available for your business (Invoices).',
} as const;
const NOT_FOUND = { status: 404, code: 'NOT_FOUND', message: 'Invoice not found' } as const;
const idParam = { schema: uuidSchema };

function sendPdf(res: Response, bytes: Buffer, number: string): void {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="invoice-${number.replace(/[^A-Za-z0-9-]/g, '_')}.pdf"`,
  );
  res.status(200).send(bytes);
}

/** The business's invoices (`INVOICE` capability). */
@ApiTags('Business: Invoices')
@ApiBearerAuth()
@Roles('BUSINESS_OWNER')
@RequiresCapability('INVOICE')
@Controller('business/invoices')
export class BusinessInvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  @ResponseMessage('Invoices retrieved')
  @ApiOperation({
    summary: 'My invoices',
    description:
      'Newest first. `period` today/week/month/custom (with from/to), `status`, `q` (number or order code).',
  })
  @ApiEnvelopeResponse(z.array(invoiceSummarySchema), { description: 'A page of invoices.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN)
  list(
    @Query({ schema: listInvoicesQuerySchema }) query: ListInvoicesQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Paginated<InvoiceSummary>> {
    return this.invoices.businessList(actor, query);
  }

  @Get(':id')
  @ResponseMessage('Invoice retrieved')
  @ApiOperation({ summary: 'One of my invoices' })
  @ApiEnvelopeResponse(invoiceSchema, { description: 'The invoice.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND)
  get(@Param('id', idParam) id: string, @CurrentUser() actor: AuthenticatedUser): Promise<Invoice> {
    return this.invoices.businessInvoice(actor, id);
  }

  @Get(':id/pdf')
  @ApiOperation({
    summary: 'One of my invoices as a PDF',
    description: 'The file itself (not JSON), never cached.',
  })
  @ApiOkResponse({ description: 'The PDF.', content: { 'application/pdf': {} } })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND)
  async pdf(
    @Param('id', idParam) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Res() res: Response,
  ): Promise<void> {
    const invoice = await this.invoices.businessInvoice(actor, id);
    sendPdf(res, this.invoices.pdf(invoice), invoice.number);
  }
}

/** A student's own invoices (only for their own orders). */
@ApiTags('Orders')
@ApiBearerAuth()
@Controller('me/invoices')
export class MyInvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get(':id')
  @ResponseMessage('Invoice retrieved')
  @ApiOperation({ summary: 'The invoice of one of my orders' })
  @ApiEnvelopeResponse(invoiceSchema, { description: 'The invoice.' })
  @ApiErrorResponses(UNAUTHORIZED, NOT_FOUND)
  get(@Param('id', idParam) id: string, @CurrentUser() actor: AuthenticatedUser): Promise<Invoice> {
    return this.invoices.myInvoice(actor, id);
  }

  @Get(':id/pdf')
  @ApiOperation({ summary: 'The invoice of one of my orders, as a PDF' })
  @ApiOkResponse({ description: 'The PDF.', content: { 'application/pdf': {} } })
  @ApiErrorResponses(UNAUTHORIZED, NOT_FOUND)
  async pdf(
    @Param('id', idParam) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Res() res: Response,
  ): Promise<void> {
    const invoice = await this.invoices.myInvoice(actor, id);
    sendPdf(res, this.invoices.pdf(invoice), invoice.number);
  }
}

/** The capability-aware dashboard numbers and the live table board. */
@ApiTags('Business')
@ApiBearerAuth()
@Roles('BUSINESS_OWNER')
@Controller('business')
export class BusinessSummaryController {
  constructor(private readonly summary: SummaryService) {}

  @Get('summary')
  @ResponseMessage('Summary retrieved')
  @ApiOperation({
    summary: 'My dashboard numbers',
    description:
      'Only the sections the business has the capability for are computed (the others are null): ' +
      'orders, revenue, invoices, payments, tables, enquiries, bookings, requests.',
  })
  @ApiEnvelopeResponse(businessSummarySchema, { description: 'The numbers for the range.' })
  @ApiErrorResponses(UNAUTHORIZED)
  get(
    @Query({ schema: summaryQuerySchema }) query: SummaryQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<BusinessSummary> {
    return this.summary.summary(actor, query);
  }

  @Get('tables/live')
  @RequiresCapability('TABLE_ORDER')
  @ResponseMessage('Tables retrieved')
  @ApiOperation({
    summary: 'My tables right now',
    description:
      'Each table with its live status (available, order pending, occupied, done) from its open orders.',
  })
  @ApiEnvelopeResponse(z.array(tableStatusSchema), { description: 'The tables.' })
  @ApiErrorResponses(UNAUTHORIZED, {
    ...FORBIDDEN,
    message: 'This is not available for your business (Table ordering).',
  })
  tables(@CurrentUser() actor: AuthenticatedUser): Promise<TableStatus[]> {
    return this.summary.tables(actor);
  }
}
