import { cookies } from "next/headers";
import { Hero } from "@/components/Hero";
import { Dashboard } from "@/components/Dashboard";
import { SwapSection } from "@/components/SwapSection";
import { TradeTerminal } from "@/components/TradeTerminal";
import { ConnectButton } from "@/components/ConnectButton";
import { LangToggle } from "@/components/LangToggle";
import { data } from "@/lib/data";
import { getDict, LANG_COOKIE, resolveLang, type Lang } from "@/lib/i18n";

// Render per request so the deployed site reads fresh on-chain data + the locale cookie.
export const dynamic = "force-dynamic";

export default async function Page() {
  const [meta, jar] = await Promise.all([data.getPoolMeta(), cookies()]);
  const lang = resolveLang(jar.get(LANG_COOKIE)?.value);

  return (
    <main className="relative flex min-h-dvh flex-col">
      <SiteHeader lang={lang} />
      <Hero lang={lang} />
      <TradeTerminal symbol={meta.flapSymbol} quote={meta.quoteSymbol} lang={lang} />
      <Dashboard lang={lang} />
      <SwapSection lang={lang} />
      <SiteFooter lang={lang} />
    </main>
  );
}

function SiteHeader({ lang }: { lang: Lang }) {
  const t = getDict(lang).nav;
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/70 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
        <a href="/" className="flex items-center gap-2">
          <span className="inline-block h-4 w-2 bg-accent" />
          <span className="font-display text-sm font-bold tracking-tight">FlapVenue</span>
        </a>
        <nav className="hidden items-center gap-7 sm:flex">
          <a href="#terminal" className="kicker transition-colors hover:text-fg">{t.terminal}</a>
          <a href="#dashboard" className="kicker transition-colors hover:text-fg">{t.dashboard}</a>
          <a href="#swap" className="kicker transition-colors hover:text-fg">{t.swap}</a>
          <a
            href="https://web3.okx.com/xlayer/build-x-hackathon/hook"
            target="_blank"
            rel="noreferrer"
            className="kicker transition-colors hover:text-fg"
          >
            {t.hackathon}
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <LangToggle lang={lang} />
          <ConnectButton lang={lang} />
        </div>
      </div>
    </header>
  );
}

function SiteFooter({ lang }: { lang: Lang }) {
  const t = getDict(lang).footer;
  return (
    <footer className="mt-auto border-t border-line">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-6 py-7 sm:flex-row sm:items-center sm:justify-between">
        <p className="kicker">{t.left}</p>
        <p className="font-mono text-xs text-faint">{t.right}</p>
      </div>
    </footer>
  );
}
