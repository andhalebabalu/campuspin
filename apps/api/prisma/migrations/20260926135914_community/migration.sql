-- AlterTable
ALTER TABLE `reports` MODIFY `targetType` ENUM('PLACE', 'REVIEW', 'USER', 'MARKETPLACE_LISTING', 'COMMUNITY_POST', 'COMMUNITY_COMMENT') NOT NULL,
    MODIFY `reason` ENUM('WRONG_INFO', 'SCAM', 'PROHIBITED_ITEM', 'HARASSMENT', 'BUSINESS_CLOSED', 'WRONG_LOCATION', 'FAKE_LISTING', 'WRONG_PRICE', 'SPAM', 'INAPPROPRIATE', 'OTHER') NOT NULL;

-- AlterTable
ALTER TABLE `review_reports` MODIFY `reason` ENUM('WRONG_INFO', 'SCAM', 'PROHIBITED_ITEM', 'HARASSMENT', 'BUSINESS_CLOSED', 'WRONG_LOCATION', 'FAKE_LISTING', 'WRONG_PRICE', 'SPAM', 'INAPPROPRIATE', 'OTHER') NOT NULL;

-- CreateTable
CREATE TABLE `community_posts` (
    `id` CHAR(36) NOT NULL,
    `authorId` CHAR(36) NOT NULL,
    `collegeId` CHAR(36) NOT NULL,
    `category` ENUM('DISCUSSION', 'QUESTION', 'ANNOUNCEMENT', 'EVENT', 'STUDY', 'JOB', 'LOST_FOUND', 'STUDENT_UPDATE') NOT NULL,
    `visibility` ENUM('COLLEGE_ONLY', 'PUBLIC') NOT NULL DEFAULT 'COLLEGE_ONLY',
    `title` VARCHAR(150) NOT NULL,
    `body` TEXT NOT NULL,
    `eventStartsAt` DATETIME(3) NULL,
    `eventLocation` VARCHAR(200) NULL,
    `status` ENUM('ACTIVE', 'HIDDEN', 'REMOVED') NOT NULL DEFAULT 'ACTIVE',
    `moderationNote` VARCHAR(500) NULL,
    `commentCount` INTEGER NOT NULL DEFAULT 0,
    `reactionCount` INTEGER NOT NULL DEFAULT 0,
    `editedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `community_posts_collegeId_status_createdAt_idx`(`collegeId`, `status`, `createdAt`),
    INDEX `community_posts_visibility_status_createdAt_idx`(`visibility`, `status`, `createdAt`),
    INDEX `community_posts_authorId_createdAt_idx`(`authorId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `community_comments` (
    `id` CHAR(36) NOT NULL,
    `postId` CHAR(36) NOT NULL,
    `authorId` CHAR(36) NOT NULL,
    `parentId` CHAR(36) NULL,
    `body` TEXT NOT NULL,
    `status` ENUM('ACTIVE', 'HIDDEN', 'REMOVED') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `community_comments_postId_status_createdAt_idx`(`postId`, `status`, `createdAt`),
    INDEX `community_comments_authorId_idx`(`authorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `community_reactions` (
    `postId` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `type` ENUM('LIKE', 'HELPFUL', 'CELEBRATE') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `community_reactions_userId_idx`(`userId`),
    PRIMARY KEY (`postId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_blocks` (
    `blockerId` CHAR(36) NOT NULL,
    `blockedId` CHAR(36) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `user_blocks_blockedId_idx`(`blockedId`),
    PRIMARY KEY (`blockerId`, `blockedId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `community_posts` ADD CONSTRAINT `community_posts_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `community_posts` ADD CONSTRAINT `community_posts_collegeId_fkey` FOREIGN KEY (`collegeId`) REFERENCES `colleges`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `community_comments` ADD CONSTRAINT `community_comments_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `community_posts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `community_comments` ADD CONSTRAINT `community_comments_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `community_comments` ADD CONSTRAINT `community_comments_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `community_comments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `community_reactions` ADD CONSTRAINT `community_reactions_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `community_posts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `community_reactions` ADD CONSTRAINT `community_reactions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_blocks` ADD CONSTRAINT `user_blocks_blockerId_fkey` FOREIGN KEY (`blockerId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_blocks` ADD CONSTRAINT `user_blocks_blockedId_fkey` FOREIGN KEY (`blockedId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Checks the application relies on (MariaDB 10.4 enforces CHECK constraints).
ALTER TABLE `community_posts`
    ADD CONSTRAINT `chk_community_posts_counts` CHECK (`commentCount` >= 0 AND `reactionCount` >= 0),
    ADD CONSTRAINT `chk_community_posts_event` CHECK (
        `category` = 'EVENT' OR (`eventStartsAt` IS NULL AND `eventLocation` IS NULL)
    );
ALTER TABLE `user_blocks`
    ADD CONSTRAINT `chk_user_blocks_not_self` CHECK (`blockerId` <> `blockedId`);
