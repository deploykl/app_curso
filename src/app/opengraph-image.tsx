import { ImageResponse } from "next/og";
import { env } from "@/env";

export const alt = `${env.ACADEMIA_NAME} — Aprende en vivo, certifícate de verdad`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background: "#fbfbfe",
          backgroundImage:
            "radial-gradient(circle at 8% -10%, rgba(150,140,255,0.55) 0%, rgba(150,140,255,0) 38%), radial-gradient(circle at 96% 4%, rgba(120,220,170,0.45) 0%, rgba(120,220,170,0) 34%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "#4f39d9",
              display: "flex",
            }}
          />
          <span style={{ fontSize: 34, fontWeight: 600, color: "#221f38" }}>
            {env.ACADEMIA_NAME}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 78, fontWeight: 700, color: "#221f38", letterSpacing: -2 }}>
            Aprende en vivo,
          </span>
          <span style={{ fontSize: 78, fontWeight: 700, color: "#4f39d9", letterSpacing: -2 }}>
            certifícate de verdad.
          </span>
        </div>

        <span style={{ fontSize: 30, color: "#5b5875" }}>
          Clases por Zoom · Pago con Yape o Plin · Certificado verificable
        </span>
      </div>
    ),
    size
  );
}
