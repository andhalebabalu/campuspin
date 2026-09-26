-- AlterTable
ALTER TABLE `users` ADD COLUMN `studentVerifiedAt` DATETIME(3) NULL,
    ADD COLUMN `studentVerifiedUntil` DATETIME(3) NULL,
    ADD COLUMN `verifiedCollegeId` CHAR(36) NULL;

-- CreateTable
CREATE TABLE `college_email_domains` (
    `id` CHAR(36) NOT NULL,
    `collegeId` CHAR(36) NOT NULL,
    `domain` VARCHAR(253) NOT NULL,
    `createdById` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `college_email_domains_domain_key`(`domain`),
    INDEX `college_email_domains_collegeId_idx`(`collegeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `student_verifications` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `collegeId` CHAR(36) NOT NULL,
    `method` ENUM('COLLEGE_EMAIL', 'DOCUMENT') NOT NULL,
    `status` ENUM('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
    `collegeEmail` VARCHAR(254) NULL,
    `verifiedEmailKey` VARCHAR(254) NULL,
    `codeHash` CHAR(64) NULL,
    `codeExpiresAt` DATETIME(3) NULL,
    `codeAttempts` INTEGER NOT NULL DEFAULT 0,
    `documentKey` VARCHAR(255) NULL,
    `documentType` VARCHAR(40) NULL,
    `reviewNote` VARCHAR(500) NULL,
    `reviewedById` CHAR(36) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `verifiedAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `student_verifications_verifiedEmailKey_key`(`verifiedEmailKey`),
    INDEX `student_verifications_userId_status_idx`(`userId`, `status`),
    INDEX `student_verifications_collegeId_status_idx`(`collegeId`, `status`),
    INDEX `student_verifications_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_settings` (
    `userId` CHAR(36) NOT NULL,
    `profileVisibility` ENUM('PUBLIC', 'STUDENTS', 'PRIVATE') NOT NULL DEFAULT 'STUDENTS',
    `showCommunityActivity` BOOLEAN NOT NULL DEFAULT true,
    `allowMarketplaceMessages` BOOLEAN NOT NULL DEFAULT true,
    `notifyCommunity` BOOLEAN NOT NULL DEFAULT true,
    `notifyMarketplace` BOOLEAN NOT NULL DEFAULT true,
    `notifyEvents` BOOLEAN NOT NULL DEFAULT true,
    `notifyJobs` BOOLEAN NOT NULL DEFAULT true,
    `notifyMessages` BOOLEAN NOT NULL DEFAULT true,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `users_verifiedCollegeId_idx` ON `users`(`verifiedCollegeId`);

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_verifiedCollegeId_fkey` FOREIGN KEY (`verifiedCollegeId`) REFERENCES `colleges`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `college_email_domains` ADD CONSTRAINT `college_email_domains_collegeId_fkey` FOREIGN KEY (`collegeId`) REFERENCES `colleges`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `college_email_domains` ADD CONSTRAINT `college_email_domains_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_verifications` ADD CONSTRAINT `student_verifications_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_verifications` ADD CONSTRAINT `student_verifications_collegeId_fkey` FOREIGN KEY (`collegeId`) REFERENCES `colleges`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_verifications` ADD CONSTRAINT `student_verifications_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_settings` ADD CONSTRAINT `user_settings_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Checks the application relies on (MariaDB 10.4 enforces CHECK constraints).
ALTER TABLE `student_verifications`
    ADD CONSTRAINT `chk_student_verifications_attempts` CHECK (`codeAttempts` >= 0),
    ADD CONSTRAINT `chk_student_verifications_method_data` CHECK (
        (`method` = 'COLLEGE_EMAIL' AND `collegeEmail` IS NOT NULL) OR (`method` = 'DOCUMENT')
    );
ALTER TABLE `college_email_domains`
    ADD CONSTRAINT `chk_college_email_domains_domain` CHECK (`domain` = LOWER(`domain`) AND `domain` NOT LIKE '%@%');
