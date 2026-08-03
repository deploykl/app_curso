import { Smartphone, Building2 } from "lucide-react";
import { getPlatformSettings } from "@/modules/settings/queries";
import { SettingsForm } from "@/modules/settings/ui/settings-form";
import { listAllPaymentDestinations } from "@/modules/billing/queries";
import { PaymentDestinationFormDialog } from "@/modules/billing/ui/payment-destination-form-dialog";
import { DeleteDestinationButton } from "@/modules/billing/ui/delete-destination-button";

const METHOD_LABEL: Record<string, string> = {
  yape: "Yape", plin: "Plin", transferencia: "Transferencia bancaria",
};

const METHOD_ICON: Record<string, typeof Smartphone> = {
  yape: Smartphone, plin: Smartphone, transferencia: Building2,
};

export default async function AdminConfiguracionPage() {
  const [settings, destinos] = await Promise.all([
    getPlatformSettings(),
    listAllPaymentDestinations(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configuración</h1>
        <p className="mt-1 text-sm text-muted-foreground">Ajustes generales de la plataforma.</p>
      </div>
      <SettingsForm earningAvailableDays={settings.earningAvailableDays} />

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">A dónde te pagan los alumnos</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Yape, Plin o cuenta bancaria que se muestran en la pantalla de pago. Reemplaza los datos
              de ejemplo por los reales antes de lanzar.
            </p>
          </div>
          <PaymentDestinationFormDialog />
        </div>

        {destinos.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Todavía no hay destinos de pago configurados.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {destinos.map((d) => {
              const Icon = METHOD_ICON[d.method] ?? Smartphone;
              return (
                <div
                  key={d.id}
                  className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 ${
                    d.isActive ? "border-border" : "border-border opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                      <Icon className="size-4" />
                    </div>
                    <div>
                      <p className="flex items-center gap-2 font-medium">
                        {METHOD_LABEL[d.method]}
                        {!d.isActive && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            Oculto
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {d.holderName} · {d.identifier}
                        {d.bankName ? ` · ${d.bankName}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <PaymentDestinationFormDialog destino={d} />
                    <DeleteDestinationButton id={d.id} label={`${METHOD_LABEL[d.method]} · ${d.holderName}`} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
