-- AlterTable
ALTER TABLE `marketplace_listings` ADD COLUMN `creditsSpent` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `platform_settings` (
    `key` VARCHAR(100) NOT NULL,
    `value` JSON NOT NULL,
    `updatedById` CHAR(36) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `listing_credit_entries` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `amount` INTEGER NOT NULL,
    `reason` ENUM('ADMIN_GRANT', 'ADMIN_DEDUCT', 'LISTING') NOT NULL,
    `listingId` CHAR(36) NULL,
    `note` VARCHAR(200) NULL,
    `actorId` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `listing_credit_entries_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `platform_settings` ADD CONSTRAINT `platform_settings_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `listing_credit_entries` ADD CONSTRAINT `listing_credit_entries_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `listing_credit_entries` ADD CONSTRAINT `listing_credit_entries_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `listing_credit_entries` ADD CONSTRAINT `listing_credit_entries_listingId_fkey` FOREIGN KEY (`listingId`) REFERENCES `marketplace_listings`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
