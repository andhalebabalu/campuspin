-- AlterTable
ALTER TABLE `business_profiles` ADD COLUMN `businessType` ENUM('HOTEL_RESTAURANT', 'MESS', 'PG', 'ROOM_RENTAL', 'LIBRARY', 'PRINTING_XEROX', 'SALON', 'SERVICE', 'OTHER') NULL,
    ADD COLUMN `invoiceSeq` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `categories` ADD COLUMN `businessType` ENUM('HOTEL_RESTAURANT', 'MESS', 'PG', 'ROOM_RENTAL', 'LIBRARY', 'PRINTING_XEROX', 'SALON', 'SERVICE', 'OTHER') NULL;

-- AlterTable
ALTER TABLE `service_orders` ADD COLUMN `cancelledAt` DATETIME(3) NULL,
    ADD COLUMN `completedAt` DATETIME(3) NULL,
    ADD COLUMN `paidAt` DATETIME(3) NULL,
    ADD COLUMN `paidVia` ENUM('CASH', 'UPI', 'CARD', 'ONLINE') NULL,
    ADD COLUMN `paymentStatus` ENUM('UNPAID', 'PAID', 'REFUNDED') NOT NULL DEFAULT 'UNPAID';

-- CreateTable
CREATE TABLE `business_type_capabilities` (
    `businessType` ENUM('HOTEL_RESTAURANT', 'MESS', 'PG', 'ROOM_RENTAL', 'LIBRARY', 'PRINTING_XEROX', 'SALON', 'SERVICE', 'OTHER') NOT NULL,
    `capability` ENUM('ORDER_MANAGEMENT', 'TABLE_ORDER', 'INVOICE', 'PAYMENT', 'BOOKING', 'ENQUIRY', 'SERVICE_REQUEST', 'MEMBERSHIP', 'APPOINTMENT', 'REVENUE_ANALYTICS') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`businessType`, `capability`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `business_capability_overrides` (
    `businessProfileId` CHAR(36) NOT NULL,
    `capability` ENUM('ORDER_MANAGEMENT', 'TABLE_ORDER', 'INVOICE', 'PAYMENT', 'BOOKING', 'ENQUIRY', 'SERVICE_REQUEST', 'MEMBERSHIP', 'APPOINTMENT', 'REVENUE_ANALYTICS') NOT NULL,
    `enabled` BOOLEAN NOT NULL,
    `note` VARCHAR(255) NULL,
    `setById` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`businessProfileId`, `capability`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invoices` (
    `id` CHAR(36) NOT NULL,
    `number` VARCHAR(40) NOT NULL,
    `businessProfileId` CHAR(36) NOT NULL,
    `orderId` CHAR(36) NOT NULL,
    `userId` CHAR(36) NULL,
    `status` ENUM('DRAFT', 'ISSUED', 'PAID', 'CANCELLED') NOT NULL DEFAULT 'ISSUED',
    `businessName` VARCHAR(200) NOT NULL,
    `businessAddress` VARCHAR(700) NOT NULL,
    `businessPhone` VARCHAR(20) NULL,
    `businessEmail` VARCHAR(254) NULL,
    `customerName` VARCHAR(120) NOT NULL,
    `subtotal` INTEGER NOT NULL,
    `discount` INTEGER NOT NULL DEFAULT 0,
    `tax` INTEGER NOT NULL DEFAULT 0,
    `total` INTEGER NOT NULL,
    `issuedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `paidAt` DATETIME(3) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `invoices_orderId_key`(`orderId`),
    INDEX `invoices_businessProfileId_issuedAt_idx`(`businessProfileId`, `issuedAt`),
    INDEX `invoices_businessProfileId_status_idx`(`businessProfileId`, `status`),
    INDEX `invoices_userId_idx`(`userId`),
    UNIQUE INDEX `invoices_businessProfileId_number_key`(`businessProfileId`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `service_orders_businessProfileId_paymentStatus_idx` ON `service_orders`(`businessProfileId`, `paymentStatus`);

-- AddForeignKey
ALTER TABLE `business_capability_overrides` ADD CONSTRAINT `business_capability_overrides_businessProfileId_fkey` FOREIGN KEY (`businessProfileId`) REFERENCES `business_profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `business_capability_overrides` ADD CONSTRAINT `business_capability_overrides_setById_fkey` FOREIGN KEY (`setById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_businessProfileId_fkey` FOREIGN KEY (`businessProfileId`) REFERENCES `business_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `service_orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


-- ── Data ─────────────────────────────────────────────────────────────────────────────────────────

-- The business type of the seeded categories (staff can change any of them later).
UPDATE `categories` SET `businessType` = 'HOTEL_RESTAURANT' WHERE `slug` IN ('restaurants', 'cafes');
UPDATE `categories` SET `businessType` = 'MESS' WHERE `slug` IN ('mess', 'tiffin');
UPDATE `categories` SET `businessType` = 'PG' WHERE `slug` IN ('pg', 'hostels');
UPDATE `categories` SET `businessType` = 'ROOM_RENTAL' WHERE `slug` IN ('rooms');
UPDATE `categories` SET `businessType` = 'LIBRARY' WHERE `slug` IN ('libraries', 'reading-rooms');
UPDATE `categories` SET `businessType` = 'PRINTING_XEROX' WHERE `slug` IN ('xerox', 'printing');
UPDATE `categories` SET `businessType` = 'SALON' WHERE `slug` IN ('salons', 'salon', 'beauty');
UPDATE `categories` SET `businessType` = 'SERVICE' WHERE `slug` IN ('laundry', 'repairs', 'repair');

-- The default capabilities of each type (the seed adds any that are missing, never removes).
INSERT IGNORE INTO `business_type_capabilities` (`businessType`, `capability`) VALUES
  ('HOTEL_RESTAURANT', 'ORDER_MANAGEMENT'), ('HOTEL_RESTAURANT', 'TABLE_ORDER'),
  ('HOTEL_RESTAURANT', 'INVOICE'), ('HOTEL_RESTAURANT', 'PAYMENT'),
  ('HOTEL_RESTAURANT', 'REVENUE_ANALYTICS'),
  ('MESS', 'ORDER_MANAGEMENT'), ('MESS', 'INVOICE'), ('MESS', 'PAYMENT'), ('MESS', 'REVENUE_ANALYTICS'),
  ('PRINTING_XEROX', 'ORDER_MANAGEMENT'), ('PRINTING_XEROX', 'INVOICE'), ('PRINTING_XEROX', 'PAYMENT'),
  ('PG', 'ENQUIRY'), ('PG', 'BOOKING'), ('PG', 'SERVICE_REQUEST'), ('PG', 'PAYMENT'),
  ('ROOM_RENTAL', 'ENQUIRY'), ('ROOM_RENTAL', 'BOOKING'), ('ROOM_RENTAL', 'PAYMENT'),
  ('LIBRARY', 'ENQUIRY'), ('LIBRARY', 'BOOKING'), ('LIBRARY', 'MEMBERSHIP'), ('LIBRARY', 'PAYMENT'),
  ('SALON', 'APPOINTMENT'), ('SALON', 'ORDER_MANAGEMENT'), ('SALON', 'INVOICE'), ('SALON', 'PAYMENT'),
  ('SERVICE', 'SERVICE_REQUEST'), ('SERVICE', 'BOOKING'), ('SERVICE', 'INVOICE'), ('SERVICE', 'PAYMENT'),
  ('OTHER', 'ENQUIRY');

-- Orders already completed or cancelled get their time from the last status change.
UPDATE `service_orders` SET `completedAt` = `statusChangedAt` WHERE `status` = 'COMPLETED';
UPDATE `service_orders` SET `cancelledAt` = `statusChangedAt` WHERE `status` IN ('CANCELLED', 'REJECTED');

-- Nothing a business already uses disappears: where its type's defaults would not include a
-- feature it has data for, keep that feature on for that business (staff can switch it off).
CREATE TEMPORARY TABLE `tmp_business_type` AS
  SELECT b.`id`, COALESCE(b.`businessType`, c.`businessType`, 'OTHER') AS `type`
  FROM `business_profiles` b LEFT JOIN `categories` c ON c.`id` = b.`categoryId`;

INSERT IGNORE INTO `business_capability_overrides` (`businessProfileId`, `capability`, `enabled`, `note`, `updatedAt`)
SELECT t.`id`, u.`capability`, TRUE, 'Kept on: already in use before capabilities', CURRENT_TIMESTAMP(3)
FROM `tmp_business_type` t
JOIN (
  SELECT DISTINCT `businessProfileId` AS `id`, 'ENQUIRY' AS `capability` FROM `leads`
  UNION SELECT DISTINCT `businessProfileId`, 'ORDER_MANAGEMENT' FROM `service_orders`
  UNION SELECT DISTINCT p.`businessProfileId`, 'TABLE_ORDER' FROM `place_tables` pt JOIN `places` p ON p.`id` = pt.`placeId` WHERE p.`businessProfileId` IS NOT NULL
  UNION SELECT DISTINCT `businessProfileId`, 'BOOKING' FROM `bookings`
  UNION SELECT DISTINCT `businessProfileId`, 'SERVICE_REQUEST' FROM `service_requests` WHERE `kind` <> 'TABLE'
  UNION SELECT DISTINCT p.`businessProfileId`, 'ORDER_MANAGEMENT' FROM `place_services` ps
    JOIN `service_types` st ON st.`id` = ps.`serviceTypeId` JOIN `places` p ON p.`id` = ps.`placeId`
    WHERE ps.`enabled` = TRUE AND st.`kind` IN ('FOOD_ORDER', 'PRINT_ORDER', 'DAILY_MENU') AND p.`businessProfileId` IS NOT NULL
  UNION SELECT DISTINCT p.`businessProfileId`, 'TABLE_ORDER' FROM `place_services` ps
    JOIN `service_types` st ON st.`id` = ps.`serviceTypeId` JOIN `places` p ON p.`id` = ps.`placeId`
    WHERE ps.`enabled` = TRUE AND st.`kind` = 'TABLE_SERVICE' AND p.`businessProfileId` IS NOT NULL
  UNION SELECT DISTINCT p.`businessProfileId`, 'BOOKING' FROM `place_services` ps
    JOIN `service_types` st ON st.`id` = ps.`serviceTypeId` JOIN `places` p ON p.`id` = ps.`placeId`
    WHERE ps.`enabled` = TRUE AND st.`kind` = 'BOOKING' AND p.`businessProfileId` IS NOT NULL
  UNION SELECT DISTINCT p.`businessProfileId`, 'SERVICE_REQUEST' FROM `place_services` ps
    JOIN `service_types` st ON st.`id` = ps.`serviceTypeId` JOIN `places` p ON p.`id` = ps.`placeId`
    WHERE ps.`enabled` = TRUE AND st.`kind` = 'SERVICE_REQUEST' AND p.`businessProfileId` IS NOT NULL
) u ON u.`id` = t.`id`
WHERE NOT EXISTS (
  SELECT 1 FROM `business_type_capabilities` d WHERE d.`businessType` = t.`type` AND d.`capability` = u.`capability`
);

DROP TEMPORARY TABLE `tmp_business_type`;
