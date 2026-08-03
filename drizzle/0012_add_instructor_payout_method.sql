CREATE TYPE "public"."payout_method" AS ENUM('yape', 'plin', 'transferencia', 'interbancario');--> statement-breakpoint
ALTER TABLE "instructor_profiles" ADD COLUMN "payout_method" "payout_method";--> statement-breakpoint
ALTER TABLE "instructor_profiles" ADD COLUMN "payout_holder_name" text;--> statement-breakpoint
ALTER TABLE "instructor_profiles" ADD COLUMN "payout_identifier" text;--> statement-breakpoint
ALTER TABLE "instructor_profiles" ADD COLUMN "payout_bank_name" text;--> statement-breakpoint
ALTER TABLE "instructor_profiles" ADD COLUMN "payout_qr_image_key" text;