import { Injectable } from '@nestjs/common';
import type {
  AddPlaceImageRequest,
  AdminPlace,
  OwnedPlace,
  UpdateOwnedPlaceRequest,
  UpdatePlaceImageRequest,
} from '@platform/contracts';
import type { ClientContext } from '../../common/http/request-client.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { AdminPlacesService } from '../places/admin-places.service.js';
import { BusinessAccessService } from './business-access.service.js';

/** The owner's view of their place: the public detail plus its review status. */
function toOwnedPlace(place: AdminPlace): OwnedPlace {
  return {
    id: place.id,
    slug: place.slug,
    name: place.name,
    city: place.city,
    state: place.state,
    primaryCategory: place.primaryCategory,
    coverImageUrl: place.coverImageUrl,
    verified: place.verified,
    ratingAverage: place.ratingAverage,
    ratingCount: place.ratingCount,
    priceMin: place.priceMin,
    priceMax: place.priceMax,
    priceUnit: place.priceUnit,
    description: place.description,
    address: place.address,
    country: place.country,
    phone: place.phone,
    email: place.email,
    website: place.website,
    googleMapsUrl: place.googleMapsUrl,
    latitude: place.latitude,
    longitude: place.longitude,
    categories: place.categories,
    amenities: place.amenities,
    hours: place.hours,
    priceOptions: place.priceOptions,
    images: place.images,
    acceptsEnquiries: place.acceptsEnquiries,
    status: place.status,
    updatedAt: place.updatedAt,
  };
}

/**
 * A business owner editing their own listing: details, location, hours, prices and photos. Every
 * call first proves the place is theirs (anyone else's is a 404), then runs the same validated,
 * audited edit staff use, so the rules (leaf categories, price summary, college distances) are
 * identical. Edits go live at once; status, verification and the slug stay with staff.
 */
@Injectable()
export class BusinessPlacesService {
  constructor(
    private readonly access: BusinessAccessService,
    private readonly places: AdminPlacesService,
  ) {}

  async get(placeId: string, actor: AuthenticatedUser): Promise<OwnedPlace> {
    await this.access.placeOf(actor, placeId);
    return toOwnedPlace(await this.places.get(placeId));
  }

  async update(
    placeId: string,
    dto: UpdateOwnedPlaceRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<OwnedPlace> {
    await this.access.placeOf(actor, placeId);
    return toOwnedPlace(await this.places.update(placeId, dto, actor, client));
  }

  async addImage(
    placeId: string,
    dto: AddPlaceImageRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<OwnedPlace> {
    await this.access.placeOf(actor, placeId);
    return toOwnedPlace(await this.places.addImage(placeId, dto, actor, client));
  }

  async updateImage(
    placeId: string,
    imageId: string,
    dto: UpdatePlaceImageRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<OwnedPlace> {
    await this.access.placeOf(actor, placeId);
    return toOwnedPlace(await this.places.updateImage(placeId, imageId, dto, actor, client));
  }

  async removeImage(
    placeId: string,
    imageId: string,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<OwnedPlace> {
    await this.access.placeOf(actor, placeId);
    return toOwnedPlace(await this.places.removeImage(placeId, imageId, actor, client));
  }
}
