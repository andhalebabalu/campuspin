import { Module } from '@nestjs/common';
import { AdminReviewsController } from './admin-reviews.controller.js';
import { AdminReviewsService } from './admin-reviews.service.js';
import { ReviewsController } from './reviews.controller.js';
import { ReviewsService } from './reviews.service.js';

/**
 * Reviews: public reading, the author's own review (post, edit, withdraw) and staff moderation
 * (behind `reviews.moderate`). Keeps each place's stored rating in step with its reviews.
 */
@Module({
  controllers: [ReviewsController, AdminReviewsController],
  providers: [ReviewsService, AdminReviewsService],
})
export class ReviewsModule {}
