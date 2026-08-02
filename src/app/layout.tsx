import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { env } from "@/env";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const DESCRIPTION =
  "Clases en vivo por Zoom, materiales descargables y un certificado con código público que cualquiera puede verificar.";

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
  title: { default: env.ACADEMIA_NAME, template: `%s — ${env.ACADEMIA_NAME}` },
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    locale: "es_PE",
    siteName: env.ACADEMIA_NAME,
    title: env.ACADEMIA_NAME,
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: env.ACADEMIA_NAME, description: DESCRIPTION },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-PE" className={`${inter.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        {/* Sin JS, GSAP nunca revela los elementos: anulamos su estado inicial. */}
        <noscript>
          <style
            dangerouslySetInnerHTML={{
              __html:
                '[data-reveal="item"],[data-reveal="stagger"]>*{opacity:1!important;transform:none!important}',
            }}
          />
        </noscript>
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
