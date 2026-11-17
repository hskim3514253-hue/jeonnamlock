CREATE TABLE `inquiries` (
	`id` text PRIMARY KEY NOT NULL,
	`request_key` text NOT NULL,
	`token_hash` text NOT NULL,
	`receipt` text NOT NULL,
	`service` text NOT NULL,
	`space` text NOT NULL,
	`district` text NOT NULL,
	`customer_name` text NOT NULL,
	`phone` text NOT NULL,
	`address` text NOT NULL,
	`address_detail` text DEFAULT '' NOT NULL,
	`details` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`consent_version` text NOT NULL,
	`created_at` integer NOT NULL,
	`submitted_at` integer,
	`updated_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inquiries_request_key_idx` ON `inquiries` (`request_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `inquiries_receipt_idx` ON `inquiries` (`receipt`);--> statement-breakpoint
CREATE INDEX `inquiries_status_created_idx` ON `inquiries` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `inquiries_expiry_idx` ON `inquiries` (`expires_at`);--> statement-breakpoint
CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`inquiry_id` text NOT NULL,
	`kind` text NOT NULL,
	`object_key` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `photos_inquiry_kind_idx` ON `photos` (`inquiry_id`,`kind`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_limits_expiry_idx` ON `rate_limits` (`expires_at`);