-- AlterTable
ALTER TABLE `user_settings` ADD COLUMN `notifyPlaceUpdates` BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE `service_types` (
    `id` CHAR(36) NOT NULL,
    `key` VARCHAR(40) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `description` VARCHAR(255) NULL,
    `icon` VARCHAR(50) NULL,
    `kind` ENUM('FOOD_ORDER', 'DAILY_MENU', 'TABLE_SERVICE', 'PRINT_ORDER', 'SERVICE_REQUEST', 'BOOKING', 'OFFERS', 'LISTING') NOT NULL,
    `showOnHome` BOOLEAN NOT NULL DEFAULT false,
    `categorySlug` VARCHAR(100) NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `service_types_key_key`(`key`),
    INDEX `service_types_status_sortOrder_idx`(`status`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `place_services` (
    `id` CHAR(36) NOT NULL,
    `placeId` CHAR(36) NOT NULL,
    `serviceTypeId` CHAR(36) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `config` JSON NULL,
    `disabledByAdmin` BOOLEAN NOT NULL DEFAULT false,
    `adminNote` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `place_services_serviceTypeId_enabled_idx`(`serviceTypeId`, `enabled`),
    UNIQUE INDEX `place_services_placeId_serviceTypeId_key`(`placeId`, `serviceTypeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `daily_menus` (
    `id` CHAR(36) NOT NULL,
    `placeId` CHAR(36) NOT NULL,
    `date` DATE NOT NULL,
    `status` ENUM('DRAFT', 'PUBLISHED', 'REMOVED') NOT NULL DEFAULT 'DRAFT',
    `note` VARCHAR(255) NULL,
    `publishedAt` DATETIME(3) NULL,
    `removedReason` VARCHAR(255) NULL,
    `createdById` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `daily_menus_date_status_idx`(`date`, `status`),
    UNIQUE INDEX `daily_menus_placeId_date_key`(`placeId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `daily_menu_items` (
    `id` CHAR(36) NOT NULL,
    `menuId` CHAR(36) NOT NULL,
    `meal` ENUM('BREAKFAST', 'LUNCH', 'SNACKS', 'DINNER') NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `daily_menu_items_menuId_meal_sortOrder_idx`(`menuId`, `meal`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `place_services` ADD CONSTRAINT `place_services_placeId_fkey` FOREIGN KEY (`placeId`) REFERENCES `places`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `place_services` ADD CONSTRAINT `place_services_serviceTypeId_fkey` FOREIGN KEY (`serviceTypeId`) REFERENCES `service_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `daily_menus` ADD CONSTRAINT `daily_menus_placeId_fkey` FOREIGN KEY (`placeId`) REFERENCES `places`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `daily_menus` ADD CONSTRAINT `daily_menus_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `daily_menu_items` ADD CONSTRAINT `daily_menu_items_menuId_fkey` FOREIGN KEY (`menuId`) REFERENCES `daily_menus`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
