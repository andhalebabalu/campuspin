-- CreateIndex
CREATE FULLTEXT INDEX `places_name_description_idx` ON `places`(`name`, `description`);
