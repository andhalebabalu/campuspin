-- AlterTable
ALTER TABLE `business_profiles` ADD COLUMN `categoryId` CHAR(36) NULL,
    ADD COLUMN `city` VARCHAR(100) NULL,
    ADD COLUMN `coverUrl` VARCHAR(1000) NULL,
    ADD COLUMN `facebookUrl` VARCHAR(500) NULL,
    ADD COLUMN `instagramUrl` VARCHAR(500) NULL,
    ADD COLUMN `statusReason` VARCHAR(500) NULL,
    ADD COLUMN `verifiedAt` DATETIME(3) NULL,
    ADD COLUMN `whatsapp` VARCHAR(20) NULL;

-- CreateIndex
CREATE INDEX `business_profiles_categoryId_idx` ON `business_profiles`(`categoryId`);

-- CreateIndex
CREATE INDEX `business_profiles_city_idx` ON `business_profiles`(`city`);

-- CreateIndex
CREATE INDEX `business_profiles_createdAt_idx` ON `business_profiles`(`createdAt`);

-- AddForeignKey
ALTER TABLE `business_profiles` ADD CONSTRAINT `business_profiles_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: existing businesses take their city and primary category from their oldest place, and
-- businesses already verified get a verification time (their last update is the best we know).
UPDATE `business_profiles` b
  JOIN `places` p ON p.`id` = (
    SELECT p2.`id` FROM `places` p2 WHERE p2.`businessProfileId` = b.`id` ORDER BY p2.`createdAt` LIMIT 1
  )
  SET b.`city` = p.`city`;

UPDATE `business_profiles` b
  JOIN `place_categories` pc ON pc.`isPrimary` = TRUE AND pc.`placeId` = (
    SELECT p2.`id` FROM `places` p2 WHERE p2.`businessProfileId` = b.`id` ORDER BY p2.`createdAt` LIMIT 1
  )
  SET b.`categoryId` = pc.`categoryId`;

UPDATE `business_profiles` SET `verifiedAt` = `updatedAt` WHERE `verificationStatus` = 'VERIFIED';
