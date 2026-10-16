CREATE TABLE `crm_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`type` text NOT NULL,
	`body` text NOT NULL,
	`is_demo` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `crm_leads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `crm_appointments` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`request_id` text,
	`date` text NOT NULL,
	`time` text NOT NULL,
	`end_time` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`status` text DEFAULT 'requested' NOT NULL,
	`location` text DEFAULT 'telephone' NOT NULL,
	`is_demo` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `crm_leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`request_id`) REFERENCES `crm_requests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `crm_idempotency` (
	`key` text PRIMARY KEY NOT NULL,
	`payload_hash` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `crm_leads` (
	`id` text PRIMARY KEY NOT NULL,
	`identity_key` text NOT NULL,
	`name` text NOT NULL,
	`company` text NOT NULL,
	`email` text NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`sector` text DEFAULT '' NOT NULL,
	`team` text DEFAULT '' NOT NULL,
	`stage` text DEFAULT 'new' NOT NULL,
	`owner` text DEFAULT '' NOT NULL,
	`next_action_at` text,
	`value` integer DEFAULT 0 NOT NULL,
	`source` text DEFAULT 'website' NOT NULL,
	`is_demo` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_leads_identity_key_unique` ON `crm_leads` (`identity_key`);--> statement-breakpoint
CREATE TABLE `crm_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`request_id` text NOT NULL,
	`status` text DEFAULT 'pending_config' NOT NULL,
	`recipient` text DEFAULT '' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text DEFAULT '' NOT NULL,
	`accepted_at` text,
	`sending_at` text,
	`is_demo` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `crm_leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`request_id`) REFERENCES `crm_requests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_notifications_request_id_unique` ON `crm_notifications` (`request_id`);--> statement-breakpoint
CREATE TABLE `crm_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`idempotency_key` text NOT NULL,
	`payload_hash` text NOT NULL,
	`lead_id` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`company` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`sector` text DEFAULT '' NOT NULL,
	`team` text DEFAULT '' NOT NULL,
	`kind` text NOT NULL,
	`goal` text DEFAULT '' NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`date` text,
	`time` text,
	`source` text DEFAULT 'website' NOT NULL,
	`is_demo` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `crm_leads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_requests_idempotency_key_unique` ON `crm_requests` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `crm_requests_lead_idx` ON `crm_requests` (`lead_id`);--> statement-breakpoint
CREATE TABLE `crm_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`appointment_id` text NOT NULL,
	`slot` text NOT NULL,
	FOREIGN KEY (`appointment_id`) REFERENCES `crm_appointments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_reservations_slot_unique` ON `crm_reservations` (`slot`);--> statement-breakpoint
CREATE UNIQUE INDEX `crm_reservation_appointment_slot` ON `crm_reservations` (`appointment_id`,`slot`);--> statement-breakpoint
CREATE TABLE `crm_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `crm_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text,
	`title` text NOT NULL,
	`due_at` text,
	`completed` integer DEFAULT false NOT NULL,
	`owner` text DEFAULT '' NOT NULL,
	`is_demo` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `crm_leads`(`id`) ON UPDATE no action ON DELETE no action
);
