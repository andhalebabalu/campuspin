-- CreateTable
CREATE TABLE `service_items` (
    `id` CHAR(36) NOT NULL,
    `placeId` CHAR(36) NOT NULL,
    `serviceTypeId` CHAR(36) NOT NULL,
    `section` VARCHAR(60) NOT NULL DEFAULT '',
    `name` VARCHAR(100) NOT NULL,
    `description` VARCHAR(300) NULL,
    `price` INTEGER NOT NULL,
    `isVeg` BOOLEAN NULL,
    `options` JSON NULL,
    `available` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `service_items_placeId_serviceTypeId_sortOrder_idx`(`placeId`, `serviceTypeId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `place_tables` (
    `id` CHAR(36) NOT NULL,
    `placeId` CHAR(36) NOT NULL,
    `label` VARCHAR(30) NOT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `place_tables_placeId_label_key`(`placeId`, `label`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `place_qr_codes` (
    `id` CHAR(36) NOT NULL,
    `token` VARCHAR(32) NOT NULL,
    `placeId` CHAR(36) NOT NULL,
    `kind` ENUM('BUSINESS', 'TABLE') NOT NULL,
    `tableId` CHAR(36) NULL,
    `status` ENUM('ACTIVE', 'DISABLED', 'REPLACED') NOT NULL DEFAULT 'ACTIVE',
    `activeKey` VARCHAR(90) NULL,
    `scanCount` INTEGER NOT NULL DEFAULT 0,
    `lastScannedAt` DATETIME(3) NULL,
    `createdById` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `place_qr_codes_token_key`(`token`),
    UNIQUE INDEX `place_qr_codes_activeKey_key`(`activeKey`),
    INDEX `place_qr_codes_placeId_kind_idx`(`placeId`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `service_orders` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(12) NOT NULL,
    `kind` ENUM('FOOD', 'PRINT') NOT NULL,
    `placeId` CHAR(36) NOT NULL,
    `businessProfileId` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `tableId` CHAR(36) NULL,
    `tableLabel` VARCHAR(30) NULL,
    `status` ENUM('PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED', 'CANCELLED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `subtotal` INTEGER NOT NULL,
    `discount` INTEGER NOT NULL DEFAULT 0,
    `total` INTEGER NOT NULL,
    `paymentMethod` ENUM('PAY_AT_COUNTER', 'CASH_AT_TABLE') NOT NULL DEFAULT 'PAY_AT_COUNTER',
    `note` VARCHAR(300) NULL,
    `idempotencyKey` VARCHAR(64) NOT NULL,
    `statusReason` VARCHAR(255) NULL,
    `statusChangedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `service_orders_code_key`(`code`),
    INDEX `service_orders_businessProfileId_status_createdAt_idx`(`businessProfileId`, `status`, `createdAt`),
    INDEX `service_orders_placeId_createdAt_idx`(`placeId`, `createdAt`),
    INDEX `service_orders_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `service_orders_status_createdAt_idx`(`status`, `createdAt`),
    UNIQUE INDEX `service_orders_userId_idempotencyKey_key`(`userId`, `idempotencyKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `service_order_items` (
    `id` CHAR(36) NOT NULL,
    `orderId` CHAR(36) NOT NULL,
    `serviceItemId` CHAR(36) NULL,
    `name` VARCHAR(100) NOT NULL,
    `unitPrice` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL,
    `options` JSON NULL,
    `lineTotal` INTEGER NOT NULL,

    INDEX `service_order_items_orderId_idx`(`orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `place_daily_stats` (
    `placeId` CHAR(36) NOT NULL,
    `day` DATE NOT NULL,
    `views` INTEGER NOT NULL DEFAULT 0,
    `qrScans` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`placeId`, `day`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `service_items` ADD CONSTRAINT `service_items_placeId_fkey` FOREIGN KEY (`placeId`) REFERENCES `places`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_items` ADD CONSTRAINT `service_items_serviceTypeId_fkey` FOREIGN KEY (`serviceTypeId`) REFERENCES `service_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `place_tables` ADD CONSTRAINT `place_tables_placeId_fkey` FOREIGN KEY (`placeId`) REFERENCES `places`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `place_qr_codes` ADD CONSTRAINT `place_qr_codes_placeId_fkey` FOREIGN KEY (`placeId`) REFERENCES `places`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `place_qr_codes` ADD CONSTRAINT `place_qr_codes_tableId_fkey` FOREIGN KEY (`tableId`) REFERENCES `place_tables`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `place_qr_codes` ADD CONSTRAINT `place_qr_codes_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_orders` ADD CONSTRAINT `service_orders_placeId_fkey` FOREIGN KEY (`placeId`) REFERENCES `places`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_orders` ADD CONSTRAINT `service_orders_businessProfileId_fkey` FOREIGN KEY (`businessProfileId`) REFERENCES `business_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_orders` ADD CONSTRAINT `service_orders_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_orders` ADD CONSTRAINT `service_orders_tableId_fkey` FOREIGN KEY (`tableId`) REFERENCES `place_tables`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_order_items` ADD CONSTRAINT `service_order_items_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `service_orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_order_items` ADD CONSTRAINT `service_order_items_serviceItemId_fkey` FOREIGN KEY (`serviceItemId`) REFERENCES `service_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `place_daily_stats` ADD CONSTRAINT `place_daily_stats_placeId_fkey` FOREIGN KEY (`placeId`) REFERENCES `places`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
