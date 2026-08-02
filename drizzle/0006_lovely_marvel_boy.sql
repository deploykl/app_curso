CREATE TABLE "platform_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"earning_available_days" integer DEFAULT 7 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
