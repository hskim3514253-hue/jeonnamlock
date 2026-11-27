CREATE TABLE `talk_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`inquiry_id` text NOT NULL,
	`sender` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `talk_messages_inquiry_idx` ON `talk_messages` (`inquiry_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `inquiries` ADD `talk_read_at` integer;
