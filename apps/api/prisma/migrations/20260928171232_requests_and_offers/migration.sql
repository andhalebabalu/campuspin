-- CreateTable
CREATE TABLE `table_request_types` (
    `id` CHAR(36) NOT NULL,
    `placeId` CHAR(36) NOT NULL,
    `label` VARCHAR(40) NOT NULL,
    `icon` VARCHAR(40) NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `table_request_types_placeId_sortOrder_idx`(`placeId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `service_requests` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(12) NOT NULL,
    `kind` ENUM('TABLE', 'GENERAL') NOT NULL,
    `placeId` CHAR(36) NOT NULL,
    `businessProfileId` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `serviceTypeId` CHAR(36) NOT NULL,
    `tableId` CHAR(36) NULL,
    `tableLabel` VARCHAR(30) NULL,
    `requestTypeId` CHAR(36) NULL,
    `serviceItemId` CHAR(36) NULL,
    `label` VARCHAR(100) NOT NULL,
    `description` TEXT NULL,
    `imageKey` VARCHAR(80) NULL,
    `preferredAt` DATETIME(3) NULL,
    `status` ENUM('NEW', 'ACKNOWLEDGED', 'ACCEPTED', 'DIAGNOSING', 'ESTIMATE_AVAILABLE', 'APPROVED', 'IN_PROGRESS', 'READY', 'COMPLETED', 'CANCELLED', 'REJECTED') NOT NULL DEFAULT 'NEW',
    `estimateAmount` INTEGER NULL,
    `estimateNote` VARCHAR(300) NULL,
    `statusReason` VARCHAR(255) NULL,
    `activeKey` VARCHAR(120) NULL,
    `idempotencyKey` VARCHAR(64) NOT NULL,
    `statusChangedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `service_requests_code_key`(`code`),
    UNIQUE INDEX `service_requests_activeKey_key`(`activeKey`),
    INDEX `service_requests_businessProfileId_status_createdAt_idx`(`businessProfileId`, `status`, `createdAt`),
    INDEX `service_requests_placeId_createdAt_idx`(`placeId`, `createdAt`),
    INDEX `service_requests_userId_createdAt_idx`(`userId`, `createdAt`),
    UNIQUE INDEX `service_requests_userId_idempotencyKey_key`(`userId`, `idempotencyKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `student_offers` (
    `id` CHAR(36) NOT NULL,
    `placeId` CHAR(36) NOT NULL,
    `businessProfileId` CHAR(36) NOT NULL,
    `title` VARCHAR(80) NOT NULL,
    `description` VARCHAR(500) NULL,
    `discountType` ENUM('PERCENT', 'FLAT', 'FREEBIE') NOT NULL,
    `discountValue` INTEGER NOT NULL DEFAULT 0,
    `maxDiscount` INTEGER NULL,
    `minOrderAmount` INTEGER NULL,
    `validFrom` DATE NOT NULL,
    `validUntil` DATE NULL,
    `daysOfWeek` TINYINT NOT NULL DEFAULT 127,
    `limitPerStudent` INTEGER NOT NULL DEFAULT 1,
    `limitPeriod` ENUM('ONCE', 'DAILY') NOT NULL DEFAULT 'ONCE',
    `totalLimit` INTEGER NULL,
    `redeemedCount` INTEGER NOT NULL DEFAULT 0,
    `terms` TEXT NULL,
    `status` ENUM('ACTIVE', 'PAUSED', 'EXPIRED', 'REMOVED') NOT NULL DEFAULT 'ACTIVE',
    `removedReason` VARCHAR(255) NULL,
    `createdById` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `student_offers_status_validUntil_idx`(`status`, `validUntil`),
    INDEX `student_offers_placeId_idx`(`placeId`),
    INDEX `student_offers_businessProfileId_createdAt_idx`(`businessProfileId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `offer_redemptions` (
    `id` CHAR(36) NOT NULL,
    `offerId` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `placeId` CHAR(36) NOT NULL,
    `businessProfileId` CHAR(36) NOT NULL,
    `code` VARCHAR(12) NOT NULL,
    `status` ENUM('ISSUED', 'REDEEMED', 'EXPIRED') NOT NULL DEFAULT 'ISSUED',
    `periodKey` VARCHAR(10) NOT NULL,
    `slot` INTEGER NOT NULL DEFAULT 1,
    `expiresAt` DATETIME(3) NOT NULL,
    `redeemedAt` DATETIME(3) NULL,
    `verifiedById` CHAR(36) NULL,
    `orderId` CHAR(36) NULL,
    `discountAmount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `offer_redemptions_code_key`(`code`),
    UNIQUE INDEX `offer_redemptions_orderId_key`(`orderId`),
    INDEX `offer_redemptions_businessProfileId_createdAt_idx`(`businessProfileId`, `createdAt`),
    INDEX `offer_redemptions_userId_createdAt_idx`(`userId`, `createdAt`),
    UNIQUE INDEX `offer_redemptions_offerId_userId_periodKey_slot_key`(`offerId`, `userId`, `periodKey`, `slot`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `table_request_types` ADD CONSTRAINT `table_request_types_placeId_fkey` FOREIGN KEY (`placeId`) REFERENCES `places`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_requests` ADD CONSTRAINT `service_requests_placeId_fkey` FOREIGN KEY (`placeId`) REFERENCES `places`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_requests` ADD CONSTRAINT `service_requests_businessProfileId_fkey` FOREIGN KEY (`businessProfileId`) REFERENCES `business_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_requests` ADD CONSTRAINT `service_requests_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_requests` ADD CONSTRAINT `service_requests_serviceTypeId_fkey` FOREIGN KEY (`serviceTypeId`) REFERENCES `service_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_requests` ADD CONSTRAINT `service_requests_tableId_fkey` FOREIGN KEY (`tableId`) REFERENCES `place_tables`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_requests` ADD CONSTRAINT `service_requests_requestTypeId_fkey` FOREIGN KEY (`requestTypeId`) REFERENCES `table_request_types`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_requests` ADD CONSTRAINT `service_requests_serviceItemId_fkey` FOREIGN KEY (`serviceItemId`) REFERENCES `service_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_offers` ADD CONSTRAINT `student_offers_placeId_fkey` FOREIGN KEY (`placeId`) REFERENCES `places`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_offers` ADD CONSTRAINT `student_offers_businessProfileId_fkey` FOREIGN KEY (`businessProfileId`) REFERENCES `business_profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_offers` ADD CONSTRAINT `student_offers_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `offer_redemptions` ADD CONSTRAINT `offer_redemptions_offerId_fkey` FOREIGN KEY (`offerId`) REFERENCES `student_offers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `offer_redemptions` ADD CONSTRAINT `offer_redemptions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `offer_redemptions` ADD CONSTRAINT `offer_redemptions_placeId_fkey` FOREIGN KEY (`placeId`) REFERENCES `places`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `offer_redemptions` ADD CONSTRAINT `offer_redemptions_businessProfileId_fkey` FOREIGN KEY (`businessProfileId`) REFERENCES `business_profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `offer_redemptions` ADD CONSTRAINT `offer_redemptions_verifiedById_fkey` FOREIGN KEY (`verifiedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `offer_redemptions` ADD CONSTRAINT `offer_redemptions_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `service_orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
