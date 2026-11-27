CREATE TABLE `talk_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`inquiry_id` text NOT NULL,
	`endpoint_id` text NOT NULL,
	`encrypted_endpoint` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_status` text,
	`last_at` integer,
	FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `talk_subscriptions_inquiry_idx` ON `talk_subscriptions` (`inquiry_id`);
