CREATE TABLE `analytics_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`day` text NOT NULL,
	`hour` integer NOT NULL,
	`visitor_key` text NOT NULL,
	`received_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `analytics_day_hour_visitor_idx` ON `analytics_events` (`day`,`hour`,`visitor_key`);--> statement-breakpoint
CREATE TABLE `analytics_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
