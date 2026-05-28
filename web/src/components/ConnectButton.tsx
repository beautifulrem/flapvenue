"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { shortAddr } from "@/lib/format";
import { getDict, type Lang } from "@/lib/i18n";

export function ConnectButton({ lang }: { lang: Lang }) {
  const t = getDict(lang).nav;
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <button
        type="button"
        onClick={() => disconnect()}
        className="hairline cursor-pointer rounded-md px-4 py-2 font-mono text-xs font-semibold focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60 text-accent transition-colors hover:border-accent"
        title="Disconnect"
      >
        <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-accent align-middle" />
        {shortAddr(address)}
      </button>
    );
  }

  const connector = connectors[0];
  return (
    <button
      type="button"
      onClick={() => connector && connect({ connector })}
      disabled={isPending || !connector}
      className="hairline cursor-pointer rounded-md px-4 py-2 font-mono text-xs font-semibold focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60 text-fg transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isPending ? t.connecting : t.connect}
    </button>
  );
}
