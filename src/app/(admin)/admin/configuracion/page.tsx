import { getPlatformSettings } from "@/modules/settings/queries";
import { SettingsForm } from "@/modules/settings/ui/settings-form";

export default async function AdminConfiguracionPage() {
  const settings = await getPlatformSettings();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configuración</h1>
        <p className="mt-1 text-sm text-muted-foreground">Ajustes generales de la plataforma.</p>
      </div>
      <SettingsForm earningAvailableDays={settings.earningAvailableDays} />
    </div>
  );
}
