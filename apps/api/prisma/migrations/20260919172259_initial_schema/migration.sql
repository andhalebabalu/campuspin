-- CreateTable
CREATE TABLE `users` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `emailVerifiedAt` DATETIME(3) NULL,
    `phone` VARCHAR(20) NULL,
    `phoneVerifiedAt` DATETIME(3) NULL,
    `status` ENUM('ACTIVE', 'SUSPENDED', 'DEACTIVATED') NOT NULL DEFAULT 'ACTIVE',
    `collegeId` CHAR(36) NULL,
    `course` VARCHAR(120) NULL,
    `year` TINYINT NULL,
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    UNIQUE INDEX `users_phone_key`(`phone`),
    INDEX `users_status_idx`(`status`),
    INDEX `users_collegeId_idx`(`collegeId`),
    INDEX `users_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `roles` (
    `id` CHAR(36) NOT NULL,
    `key` VARCHAR(50) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `description` VARCHAR(255) NULL,
    `isSystem` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `roles_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `permissions` (
    `id` CHAR(36) NOT NULL,
    `key` VARCHAR(100) NOT NULL,
    `resource` VARCHAR(50) NOT NULL,
    `description` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `permissions_key_key`(`key`),
    INDEX `permissions_resource_idx`(`resource`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `role_permissions` (
    `roleId` CHAR(36) NOT NULL,
    `permissionId` CHAR(36) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `role_permissions_permissionId_idx`(`permissionId`),
    PRIMARY KEY (`roleId`, `permissionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_roles` (
    `userId` CHAR(36) NOT NULL,
    `roleId` CHAR(36) NOT NULL,
    `assignedById` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `user_roles_roleId_idx`(`roleId`),
    PRIMARY KEY (`userId`, `roleId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `colleges` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `slug` VARCHAR(200) NOT NULL,
    `shortName` VARCHAR(50) NULL,
    `description` TEXT NULL,
    `address` VARCHAR(500) NOT NULL,
    `city` VARCHAR(100) NOT NULL,
    `state` VARCHAR(100) NOT NULL,
    `country` VARCHAR(100) NOT NULL DEFAULT 'India',
    `latitude` DOUBLE NOT NULL,
    `longitude` DOUBLE NOT NULL,
    `website` VARCHAR(500) NULL,
    `logoUrl` VARCHAR(1000) NULL,
    `coverImageUrl` VARCHAR(1000) NULL,
    `status` ENUM('DRAFT', 'ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'DRAFT',
    `verificationStatus` ENUM('PENDING', 'VERIFIED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `serviceRadiusMeters` INTEGER NOT NULL DEFAULT 5000,
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `createdById` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `colleges_slug_key`(`slug`),
    INDEX `colleges_status_idx`(`status`),
    INDEX `colleges_city_status_idx`(`city`, `status`),
    INDEX `colleges_latitude_longitude_idx`(`latitude`, `longitude`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `college_images` (
    `id` CHAR(36) NOT NULL,
    `collegeId` CHAR(36) NOT NULL,
    `imageUrl` VARCHAR(1000) NOT NULL,
    `altText` VARCHAR(200) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `college_images_collegeId_sortOrder_idx`(`collegeId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `college_places` (
    `collegeId` CHAR(36) NOT NULL,
    `placeId` CHAR(36) NOT NULL,
    `distanceMeters` INTEGER NOT NULL,
    `mode` ENUM('AUTO', 'PINNED', 'EXCLUDED') NOT NULL DEFAULT 'AUTO',
    `computedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `college_places_collegeId_distanceMeters_idx`(`collegeId`, `distanceMeters`),
    INDEX `college_places_placeId_idx`(`placeId`),
    PRIMARY KEY (`collegeId`, `placeId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `categories` (
    `id` CHAR(36) NOT NULL,
    `parentId` CHAR(36) NULL,
    `name` VARCHAR(100) NOT NULL,
    `slug` VARCHAR(100) NOT NULL,
    `description` VARCHAR(500) NULL,
    `icon` VARCHAR(50) NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `defaultPriceUnit` ENUM('ONE_TIME', 'HOUR', 'DAY', 'WEEK', 'MONTH', 'SEMESTER', 'YEAR', 'MEAL', 'PAGE', 'KG', 'TRIP') NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `categories_slug_key`(`slug`),
    INDEX `categories_parentId_sortOrder_idx`(`parentId`, `sortOrder`),
    INDEX `categories_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `category_attributes` (
    `id` CHAR(36) NOT NULL,
    `categoryId` CHAR(36) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `key` VARCHAR(60) NOT NULL,
    `dataType` ENUM('BOOLEAN', 'INTEGER', 'DECIMAL', 'TEXT', 'ENUM', 'MULTI_ENUM', 'DATE') NOT NULL,
    `required` BOOLEAN NOT NULL DEFAULT false,
    `filterable` BOOLEAN NOT NULL DEFAULT false,
    `searchable` BOOLEAN NOT NULL DEFAULT false,
    `unit` VARCHAR(20) NULL,
    `options` JSON NULL,
    `helpText` VARCHAR(255) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `category_attributes_categoryId_sortOrder_idx`(`categoryId`, `sortOrder`),
    UNIQUE INDEX `category_attributes_categoryId_key_key`(`categoryId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `category_rating_dimensions` (
    `id` CHAR(36) NOT NULL,
    `categoryId` CHAR(36) NOT NULL,
    `key` VARCHAR(60) NOT NULL,
    `label` VARCHAR(100) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `category_rating_dimensions_categoryId_key_key`(`categoryId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `amenities` (
    `id` CHAR(36) NOT NULL,
    `key` VARCHAR(60) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `icon` VARCHAR(50) NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `amenities_key_key`(`key`),
    INDEX `amenities_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `places` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `slug` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `address` VARCHAR(500) NOT NULL,
    `city` VARCHAR(100) NOT NULL,
    `state` VARCHAR(100) NOT NULL,
    `country` VARCHAR(100) NOT NULL DEFAULT 'India',
    `latitude` DOUBLE NOT NULL,
    `longitude` DOUBLE NOT NULL,
    `phone` VARCHAR(20) NULL,
    `email` VARCHAR(254) NULL,
    `website` VARCHAR(500) NULL,
    `googleMapsUrl` VARCHAR(1000) NULL,
    `priceMin` INTEGER NULL,
    `priceMax` INTEGER NULL,
    `priceUnit` ENUM('ONE_TIME', 'HOUR', 'DAY', 'WEEK', 'MONTH', 'SEMESTER', 'YEAR', 'MEAL', 'PAGE', 'KG', 'TRIP') NULL,
    `ratingAverage` DOUBLE NOT NULL DEFAULT 0,
    `ratingCount` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('DRAFT', 'PENDING', 'ACTIVE', 'INACTIVE', 'REJECTED') NOT NULL DEFAULT 'DRAFT',
    `verificationStatus` ENUM('PENDING', 'VERIFIED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `lastVerifiedAt` DATETIME(3) NULL,
    `verifiedById` CHAR(36) NULL,
    `createdById` CHAR(36) NOT NULL,
    `businessProfileId` CHAR(36) NULL,
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `version` INTEGER NOT NULL DEFAULT 1,
    `publishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `places_slug_key`(`slug`),
    INDEX `places_status_city_idx`(`status`, `city`),
    INDEX `places_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `places_verificationStatus_idx`(`verificationStatus`),
    INDEX `places_businessProfileId_idx`(`businessProfileId`),
    INDEX `places_createdById_idx`(`createdById`),
    INDEX `places_latitude_longitude_idx`(`latitude`, `longitude`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `place_categories` (
    `placeId` CHAR(36) NOT NULL,
    `categoryId` CHAR(36) NOT NULL,
    `isPrimary` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `place_categories_categoryId_idx`(`categoryId`),
    PRIMARY KEY (`placeId`, `categoryId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `place_images` (
    `id` CHAR(36) NOT NULL,
    `placeId` CHAR(36) NOT NULL,
    `imageUrl` VARCHAR(1000) NOT NULL,
    `altText` VARCHAR(200) NULL,
    `isCover` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `place_images_placeId_sortOrder_idx`(`placeId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `place_amenities` (
    `placeId` CHAR(36) NOT NULL,
    `amenityId` CHAR(36) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `place_amenities_amenityId_idx`(`amenityId`),
    PRIMARY KEY (`placeId`, `amenityId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `place_hours` (
    `id` CHAR(36) NOT NULL,
    `placeId` CHAR(36) NOT NULL,
    `dayOfWeek` TINYINT NOT NULL,
    `openTime` VARCHAR(5) NULL,
    `closeTime` VARCHAR(5) NULL,
    `isClosed` BOOLEAN NOT NULL DEFAULT false,
    `is24Hours` BOOLEAN NOT NULL DEFAULT false,
    `slotLabel` VARCHAR(50) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `place_hours_placeId_idx`(`placeId`),
    UNIQUE INDEX `place_hours_placeId_dayOfWeek_sortOrder_key`(`placeId`, `dayOfWeek`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `place_attribute_values` (
    `id` CHAR(36) NOT NULL,
    `placeId` CHAR(36) NOT NULL,
    `attributeId` CHAR(36) NOT NULL,
    `valueBoolean` BOOLEAN NULL,
    `valueNumber` DOUBLE NULL,
    `valueText` VARCHAR(255) NULL,
    `valueDate` DATE NULL,
    `valueJson` JSON NULL,

    INDEX `place_attribute_values_attributeId_valueBoolean_idx`(`attributeId`, `valueBoolean`),
    INDEX `place_attribute_values_attributeId_valueNumber_idx`(`attributeId`, `valueNumber`),
    INDEX `place_attribute_values_attributeId_valueText_idx`(`attributeId`, `valueText`),
    UNIQUE INDEX `place_attribute_values_placeId_attributeId_key`(`placeId`, `attributeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `place_price_options` (
    `id` CHAR(36) NOT NULL,
    `placeId` CHAR(36) NOT NULL,
    `label` VARCHAR(100) NOT NULL,
    `amount` INTEGER NOT NULL,
    `unit` ENUM('ONE_TIME', 'HOUR', 'DAY', 'WEEK', 'MONTH', 'SEMESTER', 'YEAR', 'MEAL', 'PAGE', 'KG', 'TRIP') NOT NULL,
    `note` VARCHAR(255) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `place_price_options_placeId_idx`(`placeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `business_profiles` (
    `id` CHAR(36) NOT NULL,
    `ownerId` CHAR(36) NOT NULL,
    `businessName` VARCHAR(200) NOT NULL,
    `slug` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `phone` VARCHAR(20) NULL,
    `email` VARCHAR(254) NULL,
    `website` VARCHAR(500) NULL,
    `logoUrl` VARCHAR(1000) NULL,
    `status` ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
    `verificationStatus` ENUM('PENDING', 'VERIFIED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `business_profiles_slug_key`(`slug`),
    INDEX `business_profiles_ownerId_idx`(`ownerId`),
    INDEX `business_profiles_status_verificationStatus_idx`(`status`, `verificationStatus`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `business_members` (
    `businessProfileId` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `role` ENUM('OWNER', 'MANAGER', 'STAFF') NOT NULL DEFAULT 'STAFF',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `business_members_userId_idx`(`userId`),
    PRIMARY KEY (`businessProfileId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `place_claims` (
    `id` CHAR(36) NOT NULL,
    `placeId` CHAR(36) NOT NULL,
    `businessProfileId` CHAR(36) NOT NULL,
    `requestedById` CHAR(36) NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `message` TEXT NULL,
    `verificationNote` TEXT NULL,
    `reviewedById` CHAR(36) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `activeKey` VARCHAR(80) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `place_claims_activeKey_key`(`activeKey`),
    INDEX `place_claims_placeId_status_idx`(`placeId`, `status`),
    INDEX `place_claims_businessProfileId_idx`(`businessProfileId`),
    INDEX `place_claims_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `place_claims_requestedById_idx`(`requestedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `place_submissions` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `categoryId` CHAR(36) NOT NULL,
    `collegeId` CHAR(36) NULL,
    `address` VARCHAR(500) NOT NULL,
    `city` VARCHAR(100) NULL,
    `latitude` DOUBLE NOT NULL,
    `longitude` DOUBLE NOT NULL,
    `phone` VARCHAR(20) NULL,
    `priceAmount` INTEGER NULL,
    `priceUnit` ENUM('ONE_TIME', 'HOUR', 'DAY', 'WEEK', 'MONTH', 'SEMESTER', 'YEAR', 'MEAL', 'PAGE', 'KG', 'TRIP') NULL,
    `description` TEXT NULL,
    `status` ENUM('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'DUPLICATE') NOT NULL DEFAULT 'PENDING',
    `submittedById` CHAR(36) NOT NULL,
    `reviewedById` CHAR(36) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `reviewNote` TEXT NULL,
    `resultingPlaceId` CHAR(36) NULL,
    `duplicateOfPlaceId` CHAR(36) NULL,
    `duplicateCandidates` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `place_submissions_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `place_submissions_submittedById_idx`(`submittedById`),
    INDEX `place_submissions_categoryId_idx`(`categoryId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `place_submission_images` (
    `id` CHAR(36) NOT NULL,
    `submissionId` CHAR(36) NOT NULL,
    `imageUrl` VARCHAR(1000) NOT NULL,
    `altText` VARCHAR(200) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `place_submission_images_submissionId_sortOrder_idx`(`submissionId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `place_contributions` (
    `id` CHAR(36) NOT NULL,
    `placeId` CHAR(36) NOT NULL,
    `contributedById` CHAR(36) NOT NULL,
    `type` ENUM('INFO_UPDATE', 'PRICE_UPDATE', 'HOURS_UPDATE', 'PHOTO_ADD', 'AMENITY_UPDATE', 'CONFIRMATION') NOT NULL,
    `payload` JSON NOT NULL,
    `note` TEXT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN') NOT NULL DEFAULT 'PENDING',
    `baseVersion` INTEGER NULL,
    `reviewedById` CHAR(36) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `reviewNote` TEXT NULL,
    `appliedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `place_contributions_placeId_status_idx`(`placeId`, `status`),
    INDEX `place_contributions_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `place_contributions_contributedById_idx`(`contributedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reviews` (
    `id` CHAR(36) NOT NULL,
    `placeId` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `rating` TINYINT NOT NULL,
    `comment` TEXT NULL,
    `status` ENUM('PUBLISHED', 'HIDDEN', 'REPORTED', 'REMOVED') NOT NULL DEFAULT 'PUBLISHED',
    `moderationNote` VARCHAR(500) NULL,
    `moderatedById` CHAR(36) NULL,
    `moderatedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `reviews_placeId_status_createdAt_idx`(`placeId`, `status`, `createdAt`),
    INDEX `reviews_userId_idx`(`userId`),
    INDEX `reviews_status_idx`(`status`),
    UNIQUE INDEX `reviews_placeId_userId_key`(`placeId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `review_ratings` (
    `reviewId` CHAR(36) NOT NULL,
    `dimensionId` CHAR(36) NOT NULL,
    `rating` TINYINT NOT NULL,

    INDEX `review_ratings_dimensionId_idx`(`dimensionId`),
    PRIMARY KEY (`reviewId`, `dimensionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `review_reports` (
    `id` CHAR(36) NOT NULL,
    `reviewId` CHAR(36) NOT NULL,
    `reportedById` CHAR(36) NOT NULL,
    `reason` ENUM('WRONG_INFO', 'BUSINESS_CLOSED', 'WRONG_LOCATION', 'FAKE_LISTING', 'WRONG_PRICE', 'SPAM', 'INAPPROPRIATE', 'OTHER') NOT NULL,
    `description` TEXT NULL,
    `status` ENUM('PENDING', 'IN_REVIEW', 'RESOLVED', 'DISMISSED') NOT NULL DEFAULT 'PENDING',
    `reviewedById` CHAR(36) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `resolutionNote` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `review_reports_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `review_reports_reviewId_idx`(`reviewId`),
    UNIQUE INDEX `review_reports_reviewId_reportedById_key`(`reviewId`, `reportedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `saved_places` (
    `userId` CHAR(36) NOT NULL,
    `placeId` CHAR(36) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `saved_places_placeId_idx`(`placeId`),
    PRIMARY KEY (`userId`, `placeId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reports` (
    `id` CHAR(36) NOT NULL,
    `reporterId` CHAR(36) NOT NULL,
    `targetType` ENUM('PLACE', 'REVIEW', 'USER', 'MARKETPLACE_LISTING', 'COMMUNITY_POST') NOT NULL,
    `targetId` CHAR(36) NOT NULL,
    `reason` ENUM('WRONG_INFO', 'BUSINESS_CLOSED', 'WRONG_LOCATION', 'FAKE_LISTING', 'WRONG_PRICE', 'SPAM', 'INAPPROPRIATE', 'OTHER') NOT NULL,
    `description` TEXT NULL,
    `status` ENUM('PENDING', 'IN_REVIEW', 'RESOLVED', 'DISMISSED') NOT NULL DEFAULT 'PENDING',
    `resolution` TEXT NULL,
    `resolvedById` CHAR(36) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `reports_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `reports_targetType_targetId_idx`(`targetType`, `targetId`),
    INDEX `reports_reporterId_idx`(`reporterId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `type` VARCHAR(64) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `message` TEXT NOT NULL,
    `data` JSON NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notifications_userId_readAt_createdAt_idx`(`userId`, `readAt`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` CHAR(36) NOT NULL,
    `actorId` CHAR(36) NULL,
    `action` VARCHAR(100) NOT NULL,
    `entityType` VARCHAR(50) NOT NULL,
    `entityId` VARCHAR(36) NULL,
    `metadata` JSON NULL,
    `ipAddress` VARCHAR(45) NULL,
    `userAgent` VARCHAR(255) NULL,
    `requestId` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_actorId_createdAt_idx`(`actorId`, `createdAt`),
    INDEX `audit_logs_entityType_entityId_idx`(`entityType`, `entityId`),
    INDEX `audit_logs_action_createdAt_idx`(`action`, `createdAt`),
    INDEX `audit_logs_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_collegeId_fkey` FOREIGN KEY (`collegeId`) REFERENCES `colleges`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permissionId_fkey` FOREIGN KEY (`permissionId`) REFERENCES `permissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_assignedById_fkey` FOREIGN KEY (`assignedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `colleges` ADD CONSTRAINT `colleges_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `college_images` ADD CONSTRAINT `college_images_collegeId_fkey` FOREIGN KEY (`collegeId`) REFERENCES `colleges`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `college_places` ADD CONSTRAINT `college_places_collegeId_fkey` FOREIGN KEY (`collegeId`) REFERENCES `colleges`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `college_places` ADD CONSTRAINT `college_places_placeId_fkey` FOREIGN KEY (`placeId`) REFERENCES `places`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `categories` ADD CONSTRAINT `categories_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `category_attributes` ADD CONSTRAINT `category_attributes_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `category_rating_dimensions` ADD CONSTRAINT `category_rating_dimensions_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `places` ADD CONSTRAINT `places_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `places` ADD CONSTRAINT `places_verifiedById_fkey` FOREIGN KEY (`verifiedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `places` ADD CONSTRAINT `places_businessProfileId_fkey` FOREIGN KEY (`businessProfileId`) REFERENCES `business_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `place_categories` ADD CONSTRAINT `place_categories_placeId_fkey` FOREIGN KEY (`placeId`) REFERENCES `places`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `place_categories` ADD CONSTRAINT `place_categories_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `place_images` ADD CONSTRAINT `place_images_placeId_fkey` FOREIGN KEY (`placeId`) REFERENCES `places`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `place_amenities` ADD CONSTRAINT `place_amenities_placeId_fkey` FOREIGN KEY (`placeId`) REFERENCES `places`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `place_amenities` ADD CONSTRAINT `place_amenities_amenityId_fkey` FOREIGN KEY (`amenityId`) REFERENCES `amenities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `place_hours` ADD CONSTRAINT `place_hours_placeId_fkey` FOREIGN KEY (`placeId`) REFERENCES `places`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `place_attribute_values` ADD CONSTRAINT `place_attribute_values_placeId_fkey` FOREIGN KEY (`placeId`) REFERENCES `places`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `place_attribute_values` ADD CONSTRAINT `place_attribute_values_attributeId_fkey` FOREIGN KEY (`attributeId`) REFERENCES `category_attributes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `place_price_options` ADD CONSTRAINT `place_price_options_placeId_fkey` FOREIGN KEY (`placeId`) REFERENCES `places`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `business_profiles` ADD CONSTRAINT `business_profiles_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `business_members` ADD CONSTRAINT `business_members_businessProfileId_fkey` FOREIGN KEY (`businessProfileId`) REFERENCES `business_profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `business_members` ADD CONSTRAINT `business_members_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `place_claims` ADD CONSTRAINT `place_claims_placeId_fkey` FOREIGN KEY (`placeId`) REFERENCES `places`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `place_claims` ADD CONSTRAINT `place_claims_businessProfileId_fkey` FOREIGN KEY (`businessProfileId`) REFERENCES `business_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `place_claims` ADD CONSTRAINT `place_claims_requestedById_fkey` FOREIGN KEY (`requestedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `place_claims` ADD CONSTRAINT `place_claims_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `place_submissions` ADD CONSTRAINT `place_submissions_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `place_submissions` ADD CONSTRAINT `place_submissions_collegeId_fkey` FOREIGN KEY (`collegeId`) REFERENCES `colleges`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `place_submissions` ADD CONSTRAINT `place_submissions_submittedById_fkey` FOREIGN KEY (`submittedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `place_submissions` ADD CONSTRAINT `place_submissions_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `place_submissions` ADD CONSTRAINT `place_submissions_resultingPlaceId_fkey` FOREIGN KEY (`resultingPlaceId`) REFERENCES `places`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `place_submissions` ADD CONSTRAINT `place_submissions_duplicateOfPlaceId_fkey` FOREIGN KEY (`duplicateOfPlaceId`) REFERENCES `places`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `place_submission_images` ADD CONSTRAINT `place_submission_images_submissionId_fkey` FOREIGN KEY (`submissionId`) REFERENCES `place_submissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `place_contributions` ADD CONSTRAINT `place_contributions_placeId_fkey` FOREIGN KEY (`placeId`) REFERENCES `places`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `place_contributions` ADD CONSTRAINT `place_contributions_contributedById_fkey` FOREIGN KEY (`contributedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `place_contributions` ADD CONSTRAINT `place_contributions_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_placeId_fkey` FOREIGN KEY (`placeId`) REFERENCES `places`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_moderatedById_fkey` FOREIGN KEY (`moderatedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `review_ratings` ADD CONSTRAINT `review_ratings_reviewId_fkey` FOREIGN KEY (`reviewId`) REFERENCES `reviews`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `review_ratings` ADD CONSTRAINT `review_ratings_dimensionId_fkey` FOREIGN KEY (`dimensionId`) REFERENCES `category_rating_dimensions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `review_reports` ADD CONSTRAINT `review_reports_reviewId_fkey` FOREIGN KEY (`reviewId`) REFERENCES `reviews`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `review_reports` ADD CONSTRAINT `review_reports_reportedById_fkey` FOREIGN KEY (`reportedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `review_reports` ADD CONSTRAINT `review_reports_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `saved_places` ADD CONSTRAINT `saved_places_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `saved_places` ADD CONSTRAINT `saved_places_placeId_fkey` FOREIGN KEY (`placeId`) REFERENCES `places`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reports` ADD CONSTRAINT `reports_reporterId_fkey` FOREIGN KEY (`reporterId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reports` ADD CONSTRAINT `reports_resolvedById_fkey` FOREIGN KEY (`resolvedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Hand-written CHECK constraints (Prisma cannot express these).
-- They keep the data valid even for code that bypasses the API. The syntax below works on
-- both MariaDB >= 10.2 (XAMPP) and MySQL >= 8.0.16. Prisma ignores CHECK constraints, so they
-- never cause migration drift.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- Coordinates must be real latitudes/longitudes (distance calculations depend on them).
ALTER TABLE `colleges`
    ADD CONSTRAINT `chk_colleges_latitude` CHECK (`latitude` BETWEEN -90 AND 90),
    ADD CONSTRAINT `chk_colleges_longitude` CHECK (`longitude` BETWEEN -180 AND 180),
    ADD CONSTRAINT `chk_colleges_radius` CHECK (`serviceRadiusMeters` > 0);

ALTER TABLE `places`
    ADD CONSTRAINT `chk_places_latitude` CHECK (`latitude` BETWEEN -90 AND 90),
    ADD CONSTRAINT `chk_places_longitude` CHECK (`longitude` BETWEEN -180 AND 180),
    ADD CONSTRAINT `chk_places_price_min` CHECK (`priceMin` IS NULL OR `priceMin` >= 0),
    ADD CONSTRAINT `chk_places_price_range` CHECK (`priceMin` IS NULL OR `priceMax` IS NULL OR `priceMax` >= `priceMin`),
    ADD CONSTRAINT `chk_places_rating_average` CHECK (`ratingAverage` BETWEEN 0 AND 5),
    ADD CONSTRAINT `chk_places_rating_count` CHECK (`ratingCount` >= 0),
    ADD CONSTRAINT `chk_places_version` CHECK (`version` >= 1);

ALTER TABLE `place_submissions`
    ADD CONSTRAINT `chk_place_submissions_latitude` CHECK (`latitude` BETWEEN -90 AND 90),
    ADD CONSTRAINT `chk_place_submissions_longitude` CHECK (`longitude` BETWEEN -180 AND 180),
    ADD CONSTRAINT `chk_place_submissions_price` CHECK (`priceAmount` IS NULL OR `priceAmount` >= 0);

ALTER TABLE `college_places`
    ADD CONSTRAINT `chk_college_places_distance` CHECK (`distanceMeters` >= 0);

ALTER TABLE `place_price_options`
    ADD CONSTRAINT `chk_place_price_options_amount` CHECK (`amount` >= 0);

-- Ratings are 1..5 stars.
ALTER TABLE `reviews`
    ADD CONSTRAINT `chk_reviews_rating` CHECK (`rating` BETWEEN 1 AND 5);

ALTER TABLE `review_ratings`
    ADD CONSTRAINT `chk_review_ratings_rating` CHECK (`rating` BETWEEN 1 AND 5);

-- Opening hours: ISO weekday, "HH:mm" times, and a slot is either closed, 24 h, or has both times.
ALTER TABLE `place_hours`
    ADD CONSTRAINT `chk_place_hours_day` CHECK (`dayOfWeek` BETWEEN 1 AND 7),
    ADD CONSTRAINT `chk_place_hours_open_format` CHECK (`openTime` IS NULL OR `openTime` REGEXP '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    ADD CONSTRAINT `chk_place_hours_close_format` CHECK (`closeTime` IS NULL OR `closeTime` REGEXP '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    ADD CONSTRAINT `chk_place_hours_not_both` CHECK (NOT (`isClosed` = 1 AND `is24Hours` = 1)),
    ADD CONSTRAINT `chk_place_hours_times_present` CHECK (`isClosed` = 1 OR `is24Hours` = 1 OR (`openTime` IS NOT NULL AND `closeTime` IS NOT NULL));

-- Student year of study.
ALTER TABLE `users`
    ADD CONSTRAINT `chk_users_year` CHECK (`year` IS NULL OR `year` BETWEEN 1 AND 10);
