-- CreateTable
CREATE TABLE `marketplace_listings` (
    `id` CHAR(36) NOT NULL,
    `sellerId` CHAR(36) NOT NULL,
    `collegeId` CHAR(36) NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `description` TEXT NOT NULL,
    `category` ENUM('BOOKS', 'NOTES', 'ELECTRONICS', 'FURNITURE', 'CYCLES', 'HOSTEL_ESSENTIALS', 'CLOTHING', 'SPORTS', 'STATIONERY', 'OTHER') NOT NULL,
    `condition` ENUM('NEW', 'LIKE_NEW', 'GOOD', 'FAIR') NOT NULL,
    `price` INTEGER NOT NULL,
    `negotiable` BOOLEAN NOT NULL DEFAULT false,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `location` VARCHAR(120) NULL,
    `visibility` ENUM('MY_COLLEGE', 'NEARBY_COLLEGES', 'CITY') NOT NULL DEFAULT 'NEARBY_COLLEGES',
    `status` ENUM('ACTIVE', 'RESERVED', 'SOLD', 'EXPIRED', 'HIDDEN', 'REMOVED') NOT NULL DEFAULT 'ACTIVE',
    `moderationNote` VARCHAR(500) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `soldAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `marketplace_listings_status_collegeId_expiresAt_idx`(`status`, `collegeId`, `expiresAt`),
    INDEX `marketplace_listings_sellerId_status_idx`(`sellerId`, `status`),
    INDEX `marketplace_listings_status_price_idx`(`status`, `price`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `marketplace_listing_images` (
    `id` CHAR(36) NOT NULL,
    `listingId` CHAR(36) NOT NULL,
    `imageUrl` VARCHAR(500) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `marketplace_listing_images_listingId_sortOrder_idx`(`listingId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `conversations` (
    `id` CHAR(36) NOT NULL,
    `listingId` CHAR(36) NOT NULL,
    `buyerId` CHAR(36) NOT NULL,
    `sellerId` CHAR(36) NOT NULL,
    `lastMessageAt` DATETIME(3) NOT NULL,
    `buyerLastReadAt` DATETIME(3) NULL,
    `sellerLastReadAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `conversations_buyerId_lastMessageAt_idx`(`buyerId`, `lastMessageAt`),
    INDEX `conversations_sellerId_lastMessageAt_idx`(`sellerId`, `lastMessageAt`),
    UNIQUE INDEX `conversations_listingId_buyerId_key`(`listingId`, `buyerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `conversation_messages` (
    `id` CHAR(36) NOT NULL,
    `conversationId` CHAR(36) NOT NULL,
    `senderId` CHAR(36) NOT NULL,
    `body` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `conversation_messages_conversationId_id_idx`(`conversationId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `marketplace_listings` ADD CONSTRAINT `marketplace_listings_sellerId_fkey` FOREIGN KEY (`sellerId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `marketplace_listings` ADD CONSTRAINT `marketplace_listings_collegeId_fkey` FOREIGN KEY (`collegeId`) REFERENCES `colleges`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `marketplace_listing_images` ADD CONSTRAINT `marketplace_listing_images_listingId_fkey` FOREIGN KEY (`listingId`) REFERENCES `marketplace_listings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_listingId_fkey` FOREIGN KEY (`listingId`) REFERENCES `marketplace_listings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_buyerId_fkey` FOREIGN KEY (`buyerId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_sellerId_fkey` FOREIGN KEY (`sellerId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversation_messages` ADD CONSTRAINT `conversation_messages_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `conversations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversation_messages` ADD CONSTRAINT `conversation_messages_senderId_fkey` FOREIGN KEY (`senderId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Checks the application relies on (MariaDB 10.4 enforces CHECK constraints).
ALTER TABLE `marketplace_listings`
    ADD CONSTRAINT `chk_marketplace_listings_price` CHECK (`price` >= 0),
    ADD CONSTRAINT `chk_marketplace_listings_quantity` CHECK (`quantity` >= 1);
ALTER TABLE `conversations`
    ADD CONSTRAINT `chk_conversations_parties` CHECK (`buyerId` <> `sellerId`);
