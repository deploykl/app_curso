CREATE TYPE "public"."order_item_type" AS ENUM('curso', 'certificado');--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "certificate_price_cents" integer;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "item_type" "order_item_type" DEFAULT 'curso' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "certificate_id" uuid;--> statement-breakpoint
ALTER TABLE "certificates" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_certificate_id_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."certificates"("id") ON DELETE no action ON UPDATE no action;