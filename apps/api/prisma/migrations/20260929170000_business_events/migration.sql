-- CreateTable
CREATE TABLE `business_events` (
    `id` CHAR(36) NOT NULL,
    `businessProfileId` CHAR(36) NOT NULL,
    `placeId` CHAR(36) NULL,
    `type` ENUM('PAGE_VIEW', 'PHONE_CLICK', 'WHATSAPP_CLICK', 'DIRECTION_CLICK', 'SHARE_CLICK') NOT NULL,
    `day` DATE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `business_events_businessProfileId_day_type_idx`(`businessProfileId`, `day`, `type`),
    INDEX `business_events_placeId_idx`(`placeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `business_events` ADD CONSTRAINT `business_events_businessProfileId_fkey` FOREIGN KEY (`businessProfileId`) REFERENCES `business_profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `business_events` ADD CONSTRAINT `business_events_placeId_fkey` FOREIGN KEY (`placeId`) REFERENCES `places`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

