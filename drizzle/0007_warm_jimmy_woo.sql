CREATE TYPE "public"."course_delivery_mode" AS ENUM('en_vivo', 'grabado');--> statement-breakpoint
ALTER TABLE "class_sessions" ALTER COLUMN "starts_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "delivery_mode" "course_delivery_mode" DEFAULT 'en_vivo' NOT NULL;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD COLUMN "video_file_key" text;