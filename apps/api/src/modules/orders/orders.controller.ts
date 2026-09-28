import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  businessInsightsSchema,
  businessOrderSchema,
  createFoodOrderSchema,
  insightsQuerySchema,
  listBusinessOrdersQuerySchema,
  listMyOrdersQuerySchema,
  orderSchema,
  orderStatusSchema,
  paginationQuerySchema,
  updateOrderStatusSchema,
  uuidSchema,
  type BusinessInsights,
  type BusinessOrder,
  type CreateFoodOrderRequest,
  type InsightsQuery,
  type ListBusinessOrdersQuery,
  type ListMyOrdersQuery,
  type Order,
  type OrderStatus,
  type PaginationQuery,
  type UpdateOrderStatusRequest,
} from '@platform/contracts';
import { z } from 'zod';
import type { Paginated } from '../../common/http/paginated.js';
import { RequestClient, type ClientContext } from '../../common/http/request-client.decorator.js';
import { ResponseMessage } from '../../common/http/response-message.decorator.js';
import { ApiEnvelopeResponse, ApiErrorResponses } from '../../common/swagger/api-responses.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Permissions } from '../auth/decorators/permissions.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { InsightsService } from './insights.service.js';
import { OrdersService } from './orders.service.js';

const UNAUTHORIZED = {
  status: 401,
  code: 'UNAUTHORIZED',
  message: 'Authentication required',
} as const;
const FORBIDDEN = {
  status: 403,
  code: 'FORBIDDEN',
  message: 'You do not have permission to perform this action',
} as const;
const NOT_FOUND = { status: 404, code: 'NOT_FOUND', message: 'Order not found' } as const;
const CHANGED = {
  status: 409,
  code: 'STATUS_CHANGED',
  message: 'This order changed meanwhile.',
} as const;
const idParam = { schema: uuidSchema } as const;

/** Students placing and following their orders. */
@ApiTags('Orders')
@ApiBearerAuth()
@Controller()
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Roles('STUDENT')
  @Post('orders')
  @Throttle({ default: { limit: 20, ttl: 10 * 60_000 } })
  @ResponseMessage('Order placed')
  @ApiOperation({
    summary: 'Place a food order',
    description:
      'Send item ids, quantities and add-on names only; the server prices everything. A table QR token ' +
      'seats the order at that table. Retrying with the same `idempotencyKey` returns the first order. ' +
      '409 `SERVICE_UNAVAILABLE_NOW` when the place is not taking orders.',
  })
  @ApiEnvelopeResponse(orderSchema, { status: 201, description: 'The order.' })
  @ApiErrorResponses(
    UNAUTHORIZED,
    FORBIDDEN,
    400,
    { status: 404, code: 'NOT_FOUND', message: 'Place not found' },
    {
      status: 409,
      code: 'SERVICE_UNAVAILABLE_NOW',
      message: 'This place has paused orders for now.',
    },
    429,
  )
  create(
    @Body({ schema: createFoodOrderSchema }) body: CreateFoodOrderRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<Order> {
    return this.orders.createFood(actor, body, client);
  }

  @Get('me/orders')
  @ResponseMessage('Orders retrieved')
  @ApiOperation({
    summary: 'My orders',
    description: 'Newest first. `active=true` leaves out finished ones.',
  })
  @ApiEnvelopeResponse(z.array(orderSchema), { description: 'A page of orders.' })
  @ApiErrorResponses(UNAUTHORIZED)
  mine(
    @Query({ schema: listMyOrdersQuerySchema }) query: ListMyOrdersQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Paginated<Order>> {
    return this.orders.myOrders(actor, query);
  }

  @Get('me/orders/:id')
  @ResponseMessage('Order retrieved')
  @ApiOperation({
    summary: 'One of my orders',
    description: 'With its status timeline. Poll it to follow progress.',
  })
  @ApiEnvelopeResponse(orderSchema, { description: 'The order.' })
  @ApiErrorResponses(UNAUTHORIZED, NOT_FOUND)
  one(@Param('id', idParam) id: string, @CurrentUser() actor: AuthenticatedUser): Promise<Order> {
    return this.orders.myOrder(actor, id);
  }

  @Post('me/orders/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Order cancelled')
  @ApiOperation({ summary: 'Cancel my order', description: 'Only before the business accepts it.' })
  @ApiEnvelopeResponse(orderSchema, { description: 'The order.' })
  @ApiErrorResponses(UNAUTHORIZED, NOT_FOUND, CHANGED)
  cancel(
    @Param('id', idParam) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<Order> {
    return this.orders.cancelMine(actor, id, client);
  }
}

/** The business order board and dashboard numbers. */
@ApiTags('Business: Orders')
@ApiBearerAuth()
@Roles('BUSINESS_OWNER')
@Controller('business')
export class BusinessOrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly insightsService: InsightsService,
  ) {}

  @Get('orders')
  @ResponseMessage('Orders retrieved')
  @ApiOperation({
    summary: 'My orders',
    description:
      '`scope=active` (default, oldest first: the kitchen queue), `today` or `all`. Poll every few seconds.',
  })
  @ApiEnvelopeResponse(z.array(businessOrderSchema), { description: 'A page of orders.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN)
  list(
    @Query({ schema: listBusinessOrdersQuerySchema }) query: ListBusinessOrdersQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Paginated<BusinessOrder>> {
    return this.orders.businessOrders(actor, query);
  }

  @Get('orders/:id')
  @ResponseMessage('Order retrieved')
  @ApiOperation({
    summary: 'One order',
    description: 'With its status timeline and the moves it allows next.',
  })
  @ApiEnvelopeResponse(businessOrderSchema, { description: 'The order.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND)
  one(
    @Param('id', idParam) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<BusinessOrder> {
    return this.orders.businessOrder(actor, id);
  }

  @Patch('orders/:id/status')
  @ResponseMessage('Order updated')
  @ApiOperation({
    summary: 'Move an order on',
    description:
      'Accept, reject, start preparing, mark ready, served or completed. Only allowed moves; 409 otherwise.',
  })
  @ApiEnvelopeResponse(businessOrderSchema, { description: 'The order.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND, CHANGED)
  updateStatus(
    @Param('id', idParam) id: string,
    @Body({ schema: updateOrderStatusSchema }) body: UpdateOrderStatusRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<BusinessOrder> {
    return this.orders.updateStatus(actor, id, body, client);
  }

  @Get('insights')
  @ResponseMessage('Insights retrieved')
  @ApiOperation({
    summary: 'Dashboard numbers',
    description:
      'Orders, requests, bookings, redemptions, views, QR scans and reviews over today, 7 or 30 days.',
  })
  @ApiEnvelopeResponse(businessInsightsSchema, { description: 'The numbers.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN)
  insights(
    @Query({ schema: insightsQuerySchema }) query: InsightsQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<BusinessInsights> {
    return this.insightsService.insights(actor, query);
  }
}

const adminOrdersQuerySchema = paginationQuerySchema.extend({
  status: orderStatusSchema.optional(),
  q: z.string().trim().max(100).optional(),
});

/** Staff: the order log across businesses. */
@ApiTags('Admin: Services')
@ApiBearerAuth()
@Permissions('services.manage')
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @ResponseMessage('Orders retrieved')
  @ApiOperation({ summary: 'All orders', description: 'Search by order code or place name.' })
  @ApiEnvelopeResponse(z.array(businessOrderSchema), { description: 'A page of orders.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN)
  list(
    @Query({ schema: adminOrdersQuerySchema })
    query: PaginationQuery & { status?: OrderStatus; q?: string },
  ): Promise<Paginated<BusinessOrder>> {
    return this.orders.adminOrders(query);
  }
}
