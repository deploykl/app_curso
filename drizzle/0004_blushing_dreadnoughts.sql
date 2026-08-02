DROP INDEX "payment_proofs_operation_uq";--> statement-breakpoint
ALTER TABLE "payment_proofs" DROP COLUMN "operation_number";--> statement-breakpoint
ALTER TABLE "payment_proofs" DROP COLUMN "transferred_at";