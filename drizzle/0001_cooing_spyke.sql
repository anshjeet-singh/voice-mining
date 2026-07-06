CREATE TABLE `analysis_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`searchId` int NOT NULL,
	`painPoints` json NOT NULL,
	`desires` json NOT NULL,
	`objections` json NOT NULL,
	`fears` json NOT NULL,
	`buyingTriggers` json NOT NULL,
	`emotionalLanguage` json NOT NULL,
	`trendingPhrases` json NOT NULL,
	`verbatimQuotes` json NOT NULL,
	`topThemes` json NOT NULL,
	`sentimentBreakdown` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `analysis_results_id` PRIMARY KEY(`id`),
	CONSTRAINT `analysis_results_searchId_unique` UNIQUE(`searchId`)
);
--> statement-breakpoint
CREATE TABLE `mining_searches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`keyword` varchar(255) NOT NULL,
	`niche` varchar(255),
	`platforms` json NOT NULL,
	`status` enum('pending','mining','analyzing','complete','failed') NOT NULL DEFAULT 'pending',
	`progress` int NOT NULL DEFAULT 0,
	`progressMessage` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mining_searches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`searchId` int NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`marketIntelligence` json NOT NULL,
	`viralHooks` json NOT NULL,
	`adCopyIdeas` json NOT NULL,
	`skoolPosts` json NOT NULL,
	`contentCalendar` json NOT NULL,
	`keywordIntelligence` json NOT NULL,
	`audiencePsychology` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reports_id` PRIMARY KEY(`id`)
);
