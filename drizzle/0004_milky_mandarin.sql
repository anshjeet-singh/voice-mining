ALTER TABLE `mining_searches` MODIFY COLUMN `keyword` text NOT NULL;--> statement-breakpoint
ALTER TABLE `mining_searches` MODIFY COLUMN `niche` text;--> statement-breakpoint
ALTER TABLE `mining_searches` MODIFY COLUMN `progressMessage` text;--> statement-breakpoint
ALTER TABLE `reports` MODIFY COLUMN `name` text NOT NULL;--> statement-breakpoint
ALTER TABLE `trend_snapshots` MODIFY COLUMN `created_at` int NOT NULL;--> statement-breakpoint
ALTER TABLE `vault_items` MODIFY COLUMN `searchKeyword` text NOT NULL;--> statement-breakpoint
ALTER TABLE `vault_items` MODIFY COLUMN `label` text NOT NULL;