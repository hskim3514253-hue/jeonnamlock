CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`encrypted_value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sms_outbox` (
	`inquiry_id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`provider_id` text,
	`error_code` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sms_outbox_status_idx` ON `sms_outbox` (`status`,`updated_at`);