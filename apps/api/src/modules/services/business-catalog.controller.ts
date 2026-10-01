import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createQrSchema,
  createTablesSchema,
  listServiceItemsQuerySchema,
  ownerQrCodeSchema,
  placeTableSchema,
  saveServiceItemSchema,
  serviceItemSchema,
  updateServiceItemSchema,
  updateTableSchema,
  uuidSchema,
  type CreateQrRequest,
  type CreateTablesRequest,
  type ListServiceItemsQuery,
  type OwnerQrCode,
  type PlaceTable,
  type SaveServiceItemRequest,
  type ServiceItem,
  type UpdateServiceItemRequest,
  type UpdateTableRequest,
} from '@platform/contracts';
import { z } from 'zod';
import { RequestClient, type ClientContext } from '../../common/http/request-client.decorator.js';
import { ResponseMessage } from '../../common/http/response-message.decorator.js';
import { ApiEnvelopeResponse, ApiErrorResponses } from '../../common/swagger/api-responses.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequiresCapability } from '../capabilities/requires-capability.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CatalogService } from './catalog.service.js';
import { TablesQrService } from './tables-qr.service.js';

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
const NOT_FOUND = { status: 404, code: 'NOT_FOUND', message: 'Not found' } as const;
const idParam = { schema: uuidSchema } as const;

/** A place's price list (menu), its tables and its printed QR codes. Owner's own places only. */
@ApiTags('Business: Services')
@ApiBearerAuth()
@Roles('BUSINESS_OWNER')
@Controller('business')
export class BusinessCatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly tablesQr: TablesQrService,
  ) {}

  @Get('places/:placeId/items')
  @ResponseMessage('Items retrieved')
  @ApiOperation({
    summary: 'My price list',
    description: 'All items, available or not. Filter with `service` (a service key).',
  })
  @ApiEnvelopeResponse(z.array(serviceItemSchema), { description: 'The items.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND)
  items(
    @Param('placeId', idParam) placeId: string,
    @Query({ schema: listServiceItemsQuerySchema }) query: ListServiceItemsQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ServiceItem[]> {
    return this.catalog.ownerList(actor, placeId, query);
  }

  @Post('places/:placeId/items')
  @ResponseMessage('Item added')
  @ApiOperation({
    summary: 'Add an item',
    description: 'Prices are whole rupees. Add-ons carry their own price.',
  })
  @ApiEnvelopeResponse(serviceItemSchema, { status: 201, description: 'The item.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND, 400)
  addItem(
    @Param('placeId', idParam) placeId: string,
    @Body({ schema: saveServiceItemSchema }) body: SaveServiceItemRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<ServiceItem> {
    return this.catalog.create(actor, placeId, body, client);
  }

  @Patch('places/:placeId/items/:itemId')
  @ResponseMessage('Item updated')
  @ApiOperation({
    summary: 'Edit an item',
    description: 'Mark it unavailable to hide it from students for now.',
  })
  @ApiEnvelopeResponse(serviceItemSchema, { description: 'The item.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND, 400)
  updateItem(
    @Param('placeId', idParam) placeId: string,
    @Param('itemId', idParam) itemId: string,
    @Body({ schema: updateServiceItemSchema }) body: UpdateServiceItemRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<ServiceItem> {
    return this.catalog.update(actor, placeId, itemId, body, client);
  }

  @Delete('places/:placeId/items/:itemId')
  @ResponseMessage('Item deleted')
  @ApiOperation({ summary: 'Delete an item', description: 'Past orders keep its name and price.' })
  @ApiEnvelopeResponse(z.null(), { description: 'Deleted.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND)
  async deleteItem(
    @Param('placeId', idParam) placeId: string,
    @Param('itemId', idParam) itemId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<null> {
    await this.catalog.remove(actor, placeId, itemId, client);
    return null;
  }

  @RequiresCapability('TABLE_ORDER')
  @Get('places/:placeId/tables')
  @ResponseMessage('Tables retrieved')
  @ApiOperation({
    summary: 'My tables',
    description: 'Each with its live QR token, if one was generated.',
  })
  @ApiEnvelopeResponse(z.array(placeTableSchema), { description: 'The tables.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND)
  tables(
    @Param('placeId', idParam) placeId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<PlaceTable[]> {
    return this.tablesQr.tables(actor, placeId);
  }

  @RequiresCapability('TABLE_ORDER')
  @Post('places/:placeId/tables')
  @ResponseMessage('Tables added')
  @ApiOperation({
    summary: 'Add tables',
    description:
      'Send `label` for one named table, or `count` for that many numbered ones ("Table 04" …).',
  })
  @ApiEnvelopeResponse(z.array(placeTableSchema), { status: 201, description: 'All tables now.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND, 400, 409)
  addTables(
    @Param('placeId', idParam) placeId: string,
    @Body({ schema: createTablesSchema }) body: CreateTablesRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<PlaceTable[]> {
    return this.tablesQr.createTables(actor, placeId, body, client);
  }

  @RequiresCapability('TABLE_ORDER')
  @Patch('places/:placeId/tables/:tableId')
  @ResponseMessage('Table updated')
  @ApiOperation({ summary: 'Rename, reorder or switch off a table' })
  @ApiEnvelopeResponse(z.array(placeTableSchema), { description: 'All tables now.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND, 409)
  updateTable(
    @Param('placeId', idParam) placeId: string,
    @Param('tableId', idParam) tableId: string,
    @Body({ schema: updateTableSchema }) body: UpdateTableRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<PlaceTable[]> {
    return this.tablesQr.updateTable(actor, placeId, tableId, body, client);
  }

  @RequiresCapability('TABLE_ORDER')
  @Delete('places/:placeId/tables/:tableId')
  @ResponseMessage('Table deleted')
  @ApiOperation({ summary: 'Delete a table', description: 'Its QR codes stop working.' })
  @ApiEnvelopeResponse(z.array(placeTableSchema), { description: 'All tables now.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND)
  deleteTable(
    @Param('placeId', idParam) placeId: string,
    @Param('tableId', idParam) tableId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<PlaceTable[]> {
    return this.tablesQr.deleteTable(actor, placeId, tableId, client);
  }

  @Get('places/:placeId/qr')
  @ResponseMessage('QR codes retrieved')
  @ApiOperation({
    summary: 'My QR codes',
    description: 'Live and disabled codes (replaced ones are left out).',
  })
  @ApiEnvelopeResponse(z.array(ownerQrCodeSchema), { description: 'The codes.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND)
  qrCodes(
    @Param('placeId', idParam) placeId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<OwnerQrCode[]> {
    return this.tablesQr.qrCodes(actor, placeId);
  }

  @Post('places/:placeId/qr')
  @ResponseMessage('QR code ready')
  @ApiOperation({
    summary: 'Generate a QR code',
    description:
      'For the place (BUSINESS) or one table (TABLE). Returns the live code when there already is one.',
  })
  @ApiEnvelopeResponse(ownerQrCodeSchema, { status: 201, description: 'The code.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND, 400)
  createQr(
    @Param('placeId', idParam) placeId: string,
    @Body({ schema: createQrSchema }) body: CreateQrRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<OwnerQrCode> {
    return this.tablesQr.createQr(actor, placeId, body, client);
  }

  @Post('qr/:id/regenerate')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('New QR code generated')
  @ApiOperation({
    summary: 'Replace a QR code',
    description: 'The old print stops working at once; print the new one.',
  })
  @ApiEnvelopeResponse(ownerQrCodeSchema, { description: 'The new code.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND)
  regenerate(
    @Param('id', idParam) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<OwnerQrCode> {
    return this.tablesQr.regenerate(actor, id, client);
  }

  @Post('qr/:id/disable')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('QR code disabled')
  @ApiOperation({ summary: 'Stop a QR code working' })
  @ApiEnvelopeResponse(ownerQrCodeSchema, { description: 'The code.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND)
  disable(
    @Param('id', idParam) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<OwnerQrCode> {
    return this.tablesQr.setEnabled(actor, id, false, client);
  }

  @Post('qr/:id/enable')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('QR code enabled')
  @ApiOperation({ summary: 'Turn a disabled QR code back on' })
  @ApiEnvelopeResponse(ownerQrCodeSchema, { description: 'The code.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND, 409)
  enable(
    @Param('id', idParam) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<OwnerQrCode> {
    return this.tablesQr.setEnabled(actor, id, true, client);
  }
}
