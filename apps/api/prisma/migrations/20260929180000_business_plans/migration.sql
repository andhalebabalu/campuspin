-- CreateTable
CREATE TABLE `business_plans` (
    `id` CHAR(36) NOT NULL,
    `key` VARCHAR(40) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `description` VARCHAR(500) NOT NULL,
    `priceMonthly` INTEGER NULL,
    `features` JSON NOT NULL,
    `isAvailable` BOOLEAN NOT NULL DEFAULT false,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `business_plans_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `business_subscriptions` (
    `id` CHAR(36) NOT NULL,
    `businessProfileId` CHAR(36) NOT NULL,
    `planId` CHAR(36) NOT NULL,
    `status` ENUM('ACTIVE', 'CANCELLED', 'EXPIRED') NOT NULL DEFAULT 'ACTIVE',
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `endsAt` DATETIME(3) NULL,
    `endedAt` DATETIME(3) NULL,
    `assignedById` CHAR(36) NULL,
    `note` VARCHAR(500) NULL,
    `activeKey` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `business_subscriptions_activeKey_key`(`activeKey`),
    INDEX `business_subscriptions_businessProfileId_createdAt_idx`(`businessProfileId`, `createdAt`),
    INDEX `business_subscriptions_planId_status_idx`(`planId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `business_subscriptions` ADD CONSTRAINT `business_subscriptions_businessProfileId_fkey` FOREIGN KEY (`businessProfileId`) REFERENCES `business_profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `business_subscriptions` ADD CONSTRAINT `business_subscriptions_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `business_plans`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `business_subscriptions` ADD CONSTRAINT `business_subscriptions_assignedById_fkey` FOREIGN KEY (`assignedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

