CREATE TABLE `trend_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`keyword` varchar(500) NOT NULL,
	`snapshot_date` varchar(20) NOT NULL,
	`trending_topics` json NOT NULL DEFAULT ('[]'),
	`trending_phrases` json NOT NULL DEFAULT ('[]'),
	`emerging_questions` json NOT NULL DEFAULT ('[]'),
	`created_at` bigint NOT NULL,
	CONSTRAINT `trend_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vault_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`reportId` int NOT NULL,
	`searchKeyword` varchar(255) NOT NULL,
	`contentType` enum('hook','email','skool_post','ad_copy','script','youtube_idea') NOT NULL,
	`label` varchar(255) NOT NULL,
	`content` text NOT NULL,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `vault_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `mining_searches` ADD `brandVoice` text;--> statement-breakpoint
ALTER TABLE `reports` ADD `youtubeIdeas` json;--> statement-breakpoint
ALTER TABLE `reports` ADD `talkingHeadScripts` json;--> statement-breakpoint
ALTER TABLE `reports` ADD `emailSequence` json;--> statement-breakpoint
ALTER TABLE `reports` DROP COLUMN `contentCalendar`;--> statement-breakpoint
ALTER TABLE `reports` DROP COLUMN `keywordIntelligence`;--> statement-breakpoint
ALTER TABLE `reports` DROP COLUMN `audiencePsychology`;