-- CreateTable
CREATE TABLE `promotions` (
    `id` CHAR(36) NOT NULL,
    `placement` ENUM('SPLASH', 'FEED') NOT NULL,
    `kind` ENUM('ANNOUNCEMENT', 'NEW_FEATURE', 'SPONSORED') NOT NULL DEFAULT 'ANNOUNCEMENT',
    `audience` ENUM('ALL', 'STUDENTS', 'BUSINESSES') NOT NULL DEFAULT 'ALL',
    `title` VARCHAR(80) NOT NULL,
    `body` VARCHAR(300) NULL,
    `imageUrl` VARCHAR(500) NULL,
    `ctaLabel` VARCHAR(30) NULL,
    `ctaLink` VARCHAR(500) NULL,
    `displaySeconds` INTEGER NOT NULL DEFAULT 10,
    `skipAfterSeconds` INTEGER NOT NULL DEFAULT 5,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `priority` INTEGER NOT NULL DEFAULT 0,
    `startsAt` DATETIME(3) NULL,
    `endsAt` DATETIME(3) NULL,
    `views` INTEGER NOT NULL DEFAULT 0,
    `clicks` INTEGER NOT NULL DEFAULT 0,
    `createdById` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `promotions_placement_active_priority_idx`(`placement`, `active`, `priority`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `promotions` ADD CONSTRAINT `promotions_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
