# Usuarios de prueba — entorno de desarrollo local

Todas las cuentas usan la misma contraseña: `Starwar1`

| Rol | Nombre | Email | Contraseña |
|---|---|---|---|
| Admin | Admin General | `admin@test.pe` | `Starwar1` |
| Instructor | Ana Instructora | `prof@test.pe` | `Starwar1` |
| Instructor | Carla Instructora | `instructor1@test.pe` | `Starwar1` |
| Instructor | Miguel Instructor | `instructor2@test.pe` | `Starwar1` |
| Alumno | Luis Alumno | `alumno@test.pe` | `Starwar1` |
| Alumno | Sofia Alumna | `alumno1@test.pe` | `Starwar1` |
| Alumno | Diego Alumno | `alumno2@test.pe` | `Starwar1` |
| Alumno | Valeria Alumna | `alumno3@test.pe` | `Starwar1` |

URL de login local: `http://localhost:3000`

Los instructores nuevos (`instructor1`, `instructor2`) quedan con perfil de
instructor **aprobado** de inmediato (igual que `prof@test.pe`) — pueden
publicar cursos sin pasar por ningún flujo de aprobación adicional.

> Solo válido para la base de datos de **desarrollo** local (`.env.local`). La base de
> datos de **test** (`.env.test`) usada por `pnpm test` es independiente y se resetea
> en cada corrida de la suite de integración.
