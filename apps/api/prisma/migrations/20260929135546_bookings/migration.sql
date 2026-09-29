-- AlterTable
ALTER TABLE `service_items` ADD COLUMN `capacity` INTEGER NULL,
    ADD COLUMN `durationMinutes` INTEGER NULL;

-- CreateTable
CREATE TABLE `booking_schedules` (
    `id` CHAR(36) NOT NULL,
    `placeId` CHAR(36) NOT NULL,
    `serviceTypeId` CHAR(36) NOT NULL,
    `dayOfWeek` TINYINT NOT NULL,
    `openTime` VARCHAR(5) NOT NULL,
    `closeTime` VARCHAR(5) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `booking_schedules_placeId_serviceTypeId_dayOfWeek_openTime_key`(`placeId`, `serviceTypeId`, `dayOfWeek`, `openTime`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bookings` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(12) NOT NULL,
    `placeId` CHAR(36) NOT NULL,
    `businessProfileId` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `serviceTypeId` CHAR(36) NOT NULL,
    `serviceItemId` CHAR(36) NULL,
    `itemName` VARCHAR(100) NOT NULL,
    `date` DATE NOT NULL,
    `startAt` DATETIME(3) NOT NULL,
    `endAt` DATETIME(3) NOT NULL,
    `seatNo` INTEGER NOT NULL,
    `price` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW') NOT NULL DEFAULT 'PENDING',
    `note` VARCHAR(300) NULL,
    `statusReason` VARCHAR(255) NULL,
    `slotKey` VARCHAR(100) NULL,
    `studentKey` VARCHAR(100) NULL,
    `idempotencyKey` VARCHAR(64) NOT NULL,
    `statusChangedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `bookings_code_key`(`code`),
    UNIQUE INDEX `bookings_slotKey_key`(`slotKey`),
    UNIQUE INDEX `bookings_studentKey_key`(`studentKey`),
    INDEX `bookings_businessProfileId_startAt_idx`(`businessProfileId`, `startAt`),
    INDEX `bookings_serviceItemId_startAt_status_idx`(`serviceItemId`, `startAt`, `status`),
    INDEX `bookings_userId_startAt_idx`(`userId`, `startAt`),
    INDEX `bookings_status_startAt_idx`(`status`, `startAt`),
    UNIQUE INDEX `bookings_userId_idempotencyKey_key`(`userId`, `idempotencyKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `booking_schedules` ADD CONSTRAINT `booking_schedules_placeId_fkey` FOREIGN KEY (`placeId`) REFERENCES `places`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_schedules` ADD CONSTRAINT `booking_schedules_serviceTypeId_fkey` FOREIGN KEY (`serviceTypeId`) REFERENCES `service_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_placeId_fkey` FOREIGN KEY (`placeId`) REFERENCES `places`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_businessProfileId_fkey` FOREIGN KEY (`businessProfileId`) REFERENCES `business_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_serviceTypeId_fkey` FOREIGN KEY (`serviceTypeId`) REFERENCES `service_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_serviceItemId_fkey` FOREIGN KEY (`serviceItemId`) REFERENCES `service_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
