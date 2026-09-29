-- AlterTable
ALTER TABLE `service_orders` ADD COLUMN `documentId` CHAR(36) NULL,
    ADD COLUMN `printOptions` JSON NULL;

-- CreateTable
CREATE TABLE `private_documents` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `kind` ENUM('PRINT', 'REQUEST_PHOTO') NOT NULL,
    `fileKey` VARCHAR(80) NULL,
    `fileName` VARCHAR(120) NOT NULL,
    `contentType` VARCHAR(40) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `pageCount` INTEGER NULL,
    `usedAt` DATETIME(3) NULL,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `private_documents_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `service_orders_documentId_key` ON `service_orders`(`documentId`);

-- AddForeignKey
ALTER TABLE `service_orders` ADD CONSTRAINT `service_orders_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `private_documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `private_documents` ADD CONSTRAINT `private_documents_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

