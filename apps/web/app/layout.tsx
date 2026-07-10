import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { AppShell } from "@components/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Valatino — Sabores de Latinoamérica en España",
    template: "%s | Valatino",
  },
  description:
    "Productos latinoamericanos originales enviados a toda España. Chocoramos, Jugos Hit, Galletas Ducales y mucho más.",
  keywords: ["productos latinoamericanos", "colombia españa", "chocoramo", "jugos hit"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
