import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type BusinessCapabilities,
  type BusinessCapability,
  type BusinessType,
  type BusinessTypeDefaults,
  type SetBusinessTypeRequest,
  type SetCapabilityOverrideRequest,
  type UpdateTypeCapabilitiesRequest,
  businessCapabilitiesSchema,
  businessCapabilitySchema,
  businessTypeDefaultsSchema,
  businessTypeSchema,
  setBusinessTypeRequestSchema,
  setCapabilityOverrideRequestSchema,
  updateTypeCapabilitiesRequestSchema,
  uuidSchema,
} from '@platform/contracts';
import { z } from 'zod';
import { RequestClient, type ClientContext } from '../../common/http/request-client.decorator.js';
import { ResponseMessage } from '../../common/http/response-message.decorator.js';
import { ApiEnvelopeResponse, ApiErrorResponses } from '../../common/swagger/api-responses.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Permissions } from '../auth/decorators/permissions.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AdminCapabilitiesService } from './admin-capabilities.service.js';
import { CapabilitiesService } from './capabilities.service.js';

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
const NOT_FOUND = { status: 404, code: 'NOT_FOUND', message: 'Business not found' } as const;
const EXAMPLE = {
  businessType: 'MESS',
  typeSource: 'CATEGORY',
  capabilities: ['INVOICE', 'ORDER_MANAGEMENT', 'PAYMENT', 'REVENUE_ANALYTICS'],
  overrides: [],
};

/** What the signed-in business can do: drives its dashboard's modules. */
@ApiTags('Business')
@ApiBearerAuth()
@Roles('BUSINESS_OWNER')
@Controller('business/capabilities')
export class BusinessCapabilitiesController {
  constructor(private readonly capabilities: CapabilitiesService) {}

  @Get()
  @ResponseMessage('Capabilities retrieved')
  @ApiOperation({
    summary: 'My business type and capabilities',
    description:
      'The dashboard shows only the modules these allow; the server enforces the same list.',
  })
  @ApiEnvelopeResponse(businessCapabilitiesSchema, {
    description: 'Type and capabilities.',
    example: { message: 'Capabilities retrieved', data: EXAMPLE },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN)
  async mine(@CurrentUser() actor: AuthenticatedUser): Promise<BusinessCapabilities> {
    return this.capabilities.forBusiness(await this.capabilities.businessOf(actor));
  }
}

/** Staff: a business's type and capability overrides (`businesses.manage`). */
@ApiTags('Admin: Businesses')
@ApiBearerAuth()
@Permissions('businesses.manage')
@Controller('admin/businesses/:id')
export class AdminBusinessCapabilitiesController {
  constructor(private readonly admin: AdminCapabilitiesService) {}

  @Get('capabilities')
  @ResponseMessage('Capabilities retrieved')
  @ApiOperation({ summary: 'A business’s type and capabilities' })
  @ApiEnvelopeResponse(businessCapabilitiesSchema, { description: 'Type and capabilities.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND)
  get(@Param('id', { schema: uuidSchema }) id: string): Promise<BusinessCapabilities> {
    return this.admin.forBusiness(id);
  }

  @Put('type')
  @ResponseMessage('Business type updated')
  @ApiOperation({
    summary: 'Set a business’s type',
    description:
      '`null` goes back to its category’s type. Services it may no longer offer are switched off.',
  })
  @ApiEnvelopeResponse(businessCapabilitiesSchema, { description: 'Type and capabilities.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND)
  setType(
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: setBusinessTypeRequestSchema }) body: SetBusinessTypeRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<BusinessCapabilities> {
    return this.admin.setType(id, body.businessType, actor, client);
  }

  @Put('capabilities/:capability')
  @ResponseMessage('Capability updated')
  @ApiOperation({
    summary: 'Turn one capability on or off for a business',
    description: '`enabled: null` removes the override (back to the type’s default).',
  })
  @ApiEnvelopeResponse(businessCapabilitiesSchema, { description: 'Type and capabilities.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND)
  setOverride(
    @Param('id', { schema: uuidSchema }) id: string,
    @Param('capability', { schema: businessCapabilitySchema }) capability: BusinessCapability,
    @Body({ schema: setCapabilityOverrideRequestSchema }) body: SetCapabilityOverrideRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<BusinessCapabilities> {
    return this.admin.setOverride(id, capability, body, actor, client);
  }
}

/** Staff: each business type's default capabilities. Changing them is `settings.manage`. */
@ApiTags('Admin: Businesses')
@ApiBearerAuth()
@Controller('admin/business-types')
export class AdminBusinessTypesController {
  constructor(private readonly admin: AdminCapabilitiesService) {}

  @Get()
  @Permissions('businesses.manage')
  @ResponseMessage('Business types retrieved')
  @ApiOperation({ summary: 'Every business type with its default capabilities' })
  @ApiEnvelopeResponse(z.array(businessTypeDefaultsSchema), { description: 'The types.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN)
  list(): Promise<BusinessTypeDefaults[]> {
    return this.admin.typeDefaults();
  }

  @Put(':type')
  @Permissions('settings.manage')
  @ResponseMessage('Business type updated')
  @ApiOperation({
    summary: 'Replace a business type’s default capabilities',
    description:
      'Applies to every business of the type at once; their services it no longer allows are switched off.',
  })
  @ApiEnvelopeResponse(z.array(businessTypeDefaultsSchema), { description: 'The types.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN)
  update(
    @Param('type', { schema: businessTypeSchema }) type: BusinessType,
    @Body({ schema: updateTypeCapabilitiesRequestSchema }) body: UpdateTypeCapabilitiesRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<BusinessTypeDefaults[]> {
    return this.admin.setTypeDefaults(type, body.capabilities, actor, client);
  }
}
