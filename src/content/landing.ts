import {
  BadgeCheckIcon,
  BanknoteIcon,
  ClipboardCheckIcon,
  FileDownIcon,
  RotateCcwIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  VideoIcon,
} from "lucide-react";

/**
 * Copy del landing que no vive en la base de datos.
 * Editar aquí: no hay CMS ni tabla de contenidos de marketing.
 */

export const STEPS = [
  {
    icon: VideoIcon,
    title: "Clases en vivo",
    description: "Sesiones por Zoom con tu instructor, en horario de Perú.",
  },
  {
    icon: FileDownIcon,
    title: "Materiales",
    description: "Guías, plantillas y grabaciones descargables por sesión.",
  },
  {
    icon: ClipboardCheckIcon,
    title: "Examen",
    description: "Evalúa lo aprendido con un banco de preguntas del curso.",
  },
  {
    icon: BadgeCheckIcon,
    title: "Certificado verificable",
    description: "Un código público que cualquiera puede validar.",
  },
] as const;

export const PAYMENT_METHODS = [
  { icon: SmartphoneIcon, label: "Yape y Plin" },
  { icon: BanknoteIcon, label: "Transferencia bancaria" },
  { icon: ShieldCheckIcon, label: "Aprobación manual y verificada" },
  { icon: RotateCcwIcon, label: "30 días de reembolso" },
] as const;

/**
 * Testimonios de ejemplo. No hay tabla de reseñas en la BD (está fuera del
 * alcance del producto), así que se editan a mano desde aquí.
 */
export const TESTIMONIALS = [
  {
    name: "Rosa Quispe",
    role: "Asistente administrativa · Lima",
    course: "Excel desde cero",
    quote:
      "Nunca había llevado un curso en vivo y pensé que me perdería. El instructor iba resolviendo mis dudas en la misma clase y me quedaron las grabaciones para repasar.",
  },
  {
    name: "Diego Fernández",
    role: "Emprendedor · Arequipa",
    course: "Excel desde cero",
    quote:
      "Pagué con Yape en la noche y a la mañana siguiente ya tenía el acceso. Sin tarjeta de crédito, que era justo mi problema con otras plataformas.",
  },
  {
    name: "Milagros Ccahuana",
    role: "Contadora · Cusco",
    course: "Excel desde cero",
    quote:
      "Puse el código del certificado en mi CV y en LinkedIn. Que el recruiter pueda validarlo él mismo en la web cambia totalmente cómo lo ven.",
  },
] as const;

export const FAQ = [
  {
    question: "¿Cómo pago si no tengo tarjeta de crédito?",
    answer:
      "Puedes pagar con Yape, Plin o transferencia bancaria. Al inscribirte te mostramos los datos, subes la captura de tu operación y nuestro equipo la verifica manualmente. En cuanto se aprueba, el acceso al curso se activa solo.",
  },
  {
    question: "¿Las clases son grabadas o en vivo?",
    answer:
      "En vivo, por Zoom, en horario de Perú. Puedes preguntar durante la sesión. Además publicamos la grabación y los materiales de cada clase para que repases cuando quieras.",
  },
  {
    question: "¿Qué pasa si falto a una clase?",
    answer:
      "No pierdes nada: cada sesión queda con su grabación y sus materiales descargables dentro del aula, disponibles durante todo el curso.",
  },
  {
    question: "¿Cómo funciona el certificado?",
    answer:
      "Al aprobar el examen final emitimos un certificado con un código único y un QR. Cualquier persona —una empresa, un reclutador— puede entrar a la web, escribir ese código y confirmar que es auténtico, sin necesidad de que tú envíes nada.",
  },
  {
    question: "¿Puedo pedir un reembolso?",
    answer:
      "Sí, dentro de los 30 días siguientes a tu compra. El reembolso cancela el acceso al curso y anula el certificado si ya se había emitido.",
  },
] as const;

/**
 * Piso mínimo por métrica: por debajo de estos valores la cifra no se muestra,
 * para no publicar un "1 alumno" mientras la plataforma arranca.
 */
export const STATS_FLOOR = {
  students: 25,
  courses: 3,
  certificates: 10,
} as const;
