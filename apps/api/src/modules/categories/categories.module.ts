import { Module } from '@nestjs/common';
import { AdminAmenitiesController } from './admin-amenities.controller.js';
import { AdminAmenitiesService } from './admin-amenities.service.js';
import { AdminCategoriesController } from './admin-categories.controller.js';
import { AdminCategoriesService } from './admin-categories.service.js';
import { AmenitiesController } from './amenities.controller.js';
import { AmenitiesService } from './amenities.service.js';
import { CategoriesController } from './categories.controller.js';
import { CategoriesService } from './categories.service.js';

/** The category catalogue: a public, cacheable read API and the staff API behind `categories.manage`. */
@Module({
  controllers: [
    CategoriesController,
    AmenitiesController,
    AdminCategoriesController,
    AdminAmenitiesController,
  ],
  providers: [CategoriesService, AmenitiesService, AdminCategoriesService, AdminAmenitiesService],
})
export class CategoriesModule {}
