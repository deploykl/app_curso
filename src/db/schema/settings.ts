import { pgTable, integer, timestamp } from "drizzle-orm/pg-core";

/*
  Fila única (id fijo en 1) con la configuración global de la plataforma que
  antes vivía como constantes en el código. `getPlatformSettings()` devuelve
  valores por defecto si la fila todavía no existe — así no hace falta una
  migración de datos, la fila se crea recién cuando alguien guarda cambios
  por primera vez en /admin/configuracion.
*/
export const platformSettings = pgTable("platform_settings", {
  id: integer("id").primaryKey().default(1),
  /** Días que una ganancia queda "en garantía" antes de poder pagarse. */
  earningAvailableDays: integer("earning_available_days").notNull().default(7),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
