import { env } from "@/env";

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}

/** Para valores dentro de un atributo (href, src). */
export const escapeAttr = escapeHtml;

/**
 * Solo dejamos pasar URLs http(s). Evita que un enlace acabe siendo
 * `javascript:` o `data:` si alguna vez la URL viene de fuera.
 */
function safeUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? escapeAttr(url) : "#";
}

export interface EmailContent {
  /** Texto de vista previa que muestran Gmail y Apple Mail junto al asunto. */
  preheader: string;
  heading: string;
  /** Párrafos ya escapados; cada uno se envuelve con el estilo del cuerpo. */
  body: string[];
  cta?: { label: string; url: string };
  /** Nota final en gris pequeño (caducidad, "si no fuiste tú", etc.). */
  footnote?: string;
}

const BRAND = "#4f39d9";
const INK = "#221f38";
const MUTED = "#5b5875";
const FAINT = "#8b88a0";
const BORDER = "#e5e3f0";
const CANVAS = "#f5f4fa";
const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * Maquetación en tablas con estilos en línea: es lo único que renderizan de
 * forma consistente Gmail, Outlook y Apple Mail. Nada de flex, grid ni <style>.
 */
export function renderEmail(content: EmailContent): string {
  const academia = escapeHtml(env.ACADEMIA_NAME);
  const year = new Date().getFullYear();

  const paragraphs = content.body
    .map(
      (html) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${MUTED}">${html}</p>`
    )
    .join("");

  const cta = content.cta
    ? `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 8px">
                <tr>
                  <td align="center" bgcolor="${BRAND}" style="border-radius:10px">
                    <a href="${safeUrl(content.cta.url)}"
                       style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px">
                      ${escapeHtml(content.cta.label)}
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:12px 0 0;font-size:12px;line-height:1.6;color:${FAINT}">
                Si el botón no funciona, copia y pega este enlace en tu navegador:<br />
                <span style="color:${MUTED};word-break:break-all">${escapeHtml(content.cta.url)}</span>
              </p>`
    : "";

  const footnote = content.footnote
    ? `<p style="margin:24px 0 0;padding-top:20px;border-top:1px solid ${BORDER};font-size:13px;line-height:1.6;color:${FAINT}">${escapeHtml(
        content.footnote
      )}</p>`
    : "";

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${academia}</title>
</head>
<body style="margin:0;padding:0;background-color:${CANVAS};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0">
    ${escapeHtml(content.preheader)}
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${CANVAS}">
    <tr>
      <td align="center" style="padding:32px 16px">

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="width:100%;max-width:560px">

          <tr>
            <td style="padding:0 4px 20px">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="32" height="32" bgcolor="${BRAND}" align="center" valign="middle"
                      style="width:32px;height:32px;border-radius:9px;color:#ffffff;font-family:${FONT};font-size:15px;font-weight:700;line-height:32px">
                    ${academia.charAt(0).toUpperCase()}
                  </td>
                  <td style="padding-left:10px;font-family:${FONT};font-size:15px;font-weight:600;color:${INK}">
                    ${academia}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td bgcolor="#ffffff" style="border:1px solid ${BORDER};border-radius:14px;padding:36px 32px">
              <h1 style="margin:0 0 18px;font-family:${FONT};font-size:22px;line-height:1.35;font-weight:700;color:${INK}">
                ${escapeHtml(content.heading)}
              </h1>
              <div style="font-family:${FONT}">
                ${paragraphs}${cta}${footnote}
              </div>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:22px 8px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${FAINT}">
              © ${year} ${academia} · Clases en vivo con certificado verificable<br />
              Este es un correo automático, no respondas a este mensaje.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Versión en texto plano. Nodemailer la manda como parte alternativa: mejora la
 * entregabilidad y evita que los filtros marquen el correo como sospechoso.
 */
export function renderText(content: EmailContent): string {
  const lines = [
    content.heading,
    "",
    ...content.body.map((html) => stripTags(html)),
  ];
  if (content.cta) lines.push("", `${content.cta.label}: ${content.cta.url}`);
  if (content.footnote) lines.push("", content.footnote);
  lines.push("", `— ${env.ACADEMIA_NAME}`);
  return lines.join("\n");
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/** Construye el par {html, text} a partir de un mismo contenido. */
export function renderBoth(content: EmailContent) {
  return { html: renderEmail(content), text: renderText(content) };
}
