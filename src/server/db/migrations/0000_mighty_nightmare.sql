CREATE TABLE `batches` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`status` text NOT NULL,
	`output_directory` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pairs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`batch_id` text NOT NULL,
	`front_photo_id` integer NOT NULL,
	`back_photo_id` integer,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`front_photo_id`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`back_photo_id`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `photos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`batch_id` text NOT NULL,
	`front_file_path` text NOT NULL,
	`back_file_path` text,
	`original_front_path` text NOT NULL,
	`original_back_path` text,
	`scan_date` text NOT NULL,
	`photo_date` text,
	`extracted_text` text,
	`grid_position` text,
	`confidence_score` real,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE no action
);
