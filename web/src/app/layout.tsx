import type { Metadata } from "next";
import { Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { LANG_COOKIE, resolveLang } from "@/lib/i18n";

const display = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

const mono = JetBrains_Mono({
  variable: "--font-jbmono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FlapVenue: a Uniswap V4 landing zone for Flap on X Layer",
  description:
    "A working build of the Uniswap V4 graduation path Flap reserved (V4_UNI_MIGRATOR) but never shipped. A decaying creator tax as a beforeSwap hook delta lets a Flap tax token hold concentrated liquidity on X Layer.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const lang = resolveLang((await cookies()).get(LANG_COOKIE)?.value);
  return (
    <html lang={lang === "zh" ? "zh-Hans" : "en"} suppressHydrationWarning className={`${display.variable} ${mono.variable}`}>
      <body className="atmosphere min-h-dvh bg-bg text-fg antialiased">
        <div className="grain" aria-hidden />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
