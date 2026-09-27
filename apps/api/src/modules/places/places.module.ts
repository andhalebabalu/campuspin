import { Module } from '@nestjs/common';
import { CollegesModule } from '../colleges/colleges.module.js';
import { AdminPlacesController } from './admin-places.controller.js';
import { AdminPlacesService } from './admin-places.service.js';
import { PlacesController } from './places.controller.js';
import { PlacesService } from './places.service.js';
import { SavedPlacesController } from './saved-places.controller.js';
import { SavedPlacesService } from './saved-places.service.js';

/**
 * The place directory: a public, cacheable read API and the staff API behind `places.manage`.
 * Imports `CollegesModule` for the exported `CollegeProximityService`, which a place must refresh
 * when it is created or moved (the reverse direction of what colleges themselves trigger).
 */
@Module({
  imports: [CollegesModule],
  controllers: [PlacesController, AdminPlacesController, SavedPlacesController],
  providers: [PlacesService, AdminPlacesService, SavedPlacesService],
})
export class PlacesModule {}
