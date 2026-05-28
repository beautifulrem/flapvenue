"use client";

import { LANG_COOKIE, type Lang } from "@/lib/i18n";

export function LangToggle({ lang }: { lang: Lang }) {
  const set = (l: Lang) => {
    if (l === lang) return;
    document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    window.location.reload();
  };
  return (
    <div className="flex items-center rounded-md border border-line p-0.5 font-mono text-[0.7rem]" role="group" aria-label="Language">
      {(["en", "zh"] as Lang[]).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => set(l)}
          aria-pressed={lang === l}
          className={`cursor-pointer rounded px-2 py-1 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60 ${
            lang === l ? "bg-accent/15 text-accent" : "text-muted hover:text-fg"
          }`}
        >
          {l === "en" ? "EN" : "中文"}
        </button>
      ))}
    </div>
  );
}
