import { Global, Module } from '@nestjs/common';
import { AdminCapabilitiesService } from './admin-capabilities.service.js';
import {
  AdminBusinessCapabilitiesController,
  AdminBusinessTypesController,
  BusinessCapabilitiesController,
} from './capabilities.controller.js';
import { CapabilitiesService } from './capabilities.service.js';
import { CapabilityGuard } from './requires-capability.js';

/**
 * Business types → capabilities → modules. Global: every business module (orders, services,
 * requests, bookings, enquiries, invoices) checks capabilities through it.
 */
@Global()
@Module({
  controllers: [
    BusinessCapabilitiesController,
    AdminBusinessCapabilitiesController,
    AdminBusinessTypesController,
  ],
  providers: [CapabilitiesService, CapabilityGuard, AdminCapabilitiesService],
  exports: [CapabilitiesService, CapabilityGuard],
})
export class CapabilitiesModule {}
