import { listPendingProofs } from "@/modules/billing/queries";
import { AdminProofReview } from "@/modules/billing/ui/admin-proof-review";

export default async function AdminPagosPage() {
  const proofs = await listPendingProofs();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Comprobantes pendientes</h1>
      {proofs.length === 0 ? (
        <p className="text-muted-foreground">No hay comprobantes por revisar.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {proofs.map((p) => <AdminProofReview key={p.proofId} proof={p} />)}
        </div>
      )}
    </div>
  );
}
