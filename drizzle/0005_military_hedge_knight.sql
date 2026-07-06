CREATE TABLE `activity_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`action` enum('search_created','report_generated','vault_saved','report_shared','trend_refreshed') NOT NULL,
	`detail` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activity_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `calendar_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`vaultItemId` int NOT NULL,
	`scheduledDate` varchar(20) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `calendar_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scrape_cache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`keyword` varchar(500) NOT NULL,
	`result` longtext NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `scrape_cache_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `shared_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reportId` int NOT NULL,
	`userId` int NOT NULL,
	`token` varchar(32) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `shared_reports_id` PRIMARY KEY(`id`),
	CONSTRAINT `shared_reports_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `vault_collections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(200) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `vault_collections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `reports` ADD `competitorIntel` json;--> statement-breakpoint
ALTER TABLE `vault_items` ADD `tags` json;--> statement-breakpoint
ALTER TABLE `vault_items` ADD `collectionId` int;