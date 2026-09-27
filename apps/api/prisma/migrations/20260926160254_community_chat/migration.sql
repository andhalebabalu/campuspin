-- AlterTable
ALTER TABLE `community_posts` ADD COLUMN `replyToId` CHAR(36) NULL,
    MODIFY `title` VARCHAR(150) NULL;

-- CreateIndex
CREATE INDEX `community_posts_collegeId_category_status_id_idx` ON `community_posts`(`collegeId`, `category`, `status`, `id`);

-- AddForeignKey
ALTER TABLE `community_posts` ADD CONSTRAINT `community_posts_replyToId_fkey` FOREIGN KEY (`replyToId`) REFERENCES `community_posts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
