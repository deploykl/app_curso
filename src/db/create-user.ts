/**
 * Crea (o actualiza) un usuario con un rol concreto.
 *
 *   pnpm user:crear <email> <password> "<nombre>" <student|instructor|admin>
 *
 * Si el usuario ya existe: actualiza el rol, marca el email como verificado y
 * reemplaza la contraseña. Si el rol es instructor o admin, además le crea un
 * perfil de instructor aprobado para que pueda armar cursos.
 */
import { buscarUsuarioPorEmail } from "@/modules/users/queries";
import { crearUsuario, actualizarUsuarioExistente, type RolUsuario } from "@/modules/users/service";

const ROLES = ["student", "instructor", "admin"] as const;

function isRole(value: string): value is RolUsuario {
  return (ROLES as readonly string[]).includes(value);
}

async function main() {
  const [email, password, name, role] = process.argv.slice(2);

  if (!email || !password || !name || !role) {
    console.error(
      'Uso: pnpm user:crear <email> <password> "<nombre>" <student|instructor|admin>'
    );
    process.exit(1);
  }
  if (!isRole(role)) {
    console.error(`Rol inválido: "${role}". Debe ser uno de: ${ROLES.join(", ")}.`);
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("La contraseña debe tener al menos 8 caracteres.");
    process.exit(1);
  }

  const existing = await buscarUsuarioPorEmail(email);

  if (existing) {
    await actualizarUsuarioExistente({ email, password, name, role });
    console.log(`Usuario actualizado: ${email} (rol: ${role}, contraseña reemplazada)`);
  } else {
    await crearUsuario({ email, password, name, role });
    console.log(`Usuario creado: ${email} (rol: ${role})`);
  }

  if (role === "instructor" || role === "admin") {
    console.log(`Perfil de instructor aprobado para ${email}.`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
