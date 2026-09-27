-- AlterTable
ALTER TABLE `users` ADD COLUMN `lastActiveAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `daily_visits` (
    `day` DATE NOT NULL,
    `visitorKey` VARCHAR(64) NOT NULL,
    `userId` CHAR(36) NULL,
    `audience` VARCHAR(16) NULL,
    `client` VARCHAR(10) NOT NULL,
    `firstSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `daily_visits_day_userId_idx`(`day`, `userId`),
    INDEX `daily_visits_userId_idx`(`userId`),
    PRIMARY KEY (`day`, `visitorKey`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `users_lastActiveAt_idx` ON `users`(`lastActiveAt`);

-- AddForeignKey
ALTER TABLE `daily_visits` ADD CONSTRAINT `daily_visits_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
