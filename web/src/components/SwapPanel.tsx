"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useAccount,
  useChainId,
  useConnect,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWatchAsset,
  useWriteContract,
} from "wagmi";
import { formatUnits, maxUint256, parseUnits } from "viem";
import {
  CURRENCY0,
  CURRENCY1,
  FLAP_TOKEN,
  QUOTE_TOKEN,
  SWAP_ROUTER,
  FLAPVENUE_ADDRESS,
  POOL_FEE,
  TICK_SPACING,
  MIN_SQRT_PRICE_LIMIT,
  MAX_SQRT_PRICE_LIMIT,
  XLAYER_TESTNET_CHAIN_ID,
  erc20Abi,
  poolSwapTestAbi,
} from "@/lib/contracts";
import { currentTaxBps, formatPercent } from "@/lib/data/decay";
import { fmtNum } from "@/lib/format";
import { getDict, interp, type Lang } from "@/lib/i18n";

type Props = {
  startBps: number;
  migrationTs: number;
  windowSec: number;
  now: number;
  flapSymbol: string;
  quoteSymbol: string;
  lang: Lang;
};

const POOL_KEY = {
  currency0: CURRENCY0,
  currency1: CURRENCY1,
  fee: POOL_FEE,
  tickSpacing: TICK_SPACING,
  hooks: FLAPVENUE_ADDRESS,
} as const;
const SETTINGS = { takeClaims: false, settleUsingBurn: false } as const;
const MINT_AMOUNT = parseUnits("1000000", 18); // generous test-token mint so one click covers any demo size
const OKLINK_TX = "https://www.oklink.com/x-layer-testnet/tx";
const fmtBal = (b?: bigint) => (b === undefined ? "…" : fmtNum(Number(formatUnits(b, 18)), 2));

export function SwapPanel(p: Props) {
  const t = getDict(p.lang).swap;
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors } = useConnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { watchAsset } = useWatchAsset();
  const router = useRouter();

  const [amount, setAmount] = useState("100");
  const [buy, setBuy] = useState(true); // buy FLAP: input = quote (currency1), zeroForOne = false
  const [action, setAction] = useState<"mint" | "approve" | "swap" | null>(null);

  const bps = currentTaxBps(p.startBps, p.migrationTs, p.now, p.windowSec);
  const amt = Number(amount) || 0;
  const tax = (amt * bps) / 10_000;
  const swapped = amt - tax;
  const inputToken = buy ? QUOTE_TOKEN : FLAP_TOKEN;
  const inSym = buy ? p.quoteSymbol : p.flapSymbol;
  const outSym = buy ? p.flapSymbol : p.quoteSymbol;
  const amountWei = amt > 0 ? parseUnits(String(amt), 18) : 0n;
  const wrongChain = isConnected && chainId !== XLAYER_TESTNET_CHAIN_ID;
  const readEnabled = { enabled: !!address && !wrongChain };

  const { data: flapBal, refetch: refetchFlap } = useReadContract({
    address: FLAP_TOKEN,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: readEnabled,
  });
  const { data: quoteBal, refetch: refetchQuote } = useReadContract({
    address: QUOTE_TOKEN,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: readEnabled,
  });
  const balance = buy ? quoteBal : flapBal;
  const { data: allowance, refetch: refetchAllow } = useReadContract({
    address: inputToken,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, SWAP_ROUTER] : undefined,
    query: readEnabled,
  });

  const { writeContract, data: txHash, isPending: signing, error: writeError, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess: confirmed } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (confirmed) {
      refetchFlap();
      refetchQuote();
      refetchAllow();
    }
  }, [confirmed, refetchFlap, refetchQuote, refetchAllow]);

  // After a swap lands, refresh the server components (the dashboard above) once the data cache TTL
  // lapses, so the new HookTaxSkim and commission totals appear without a manual reload.
  useEffect(() => {
    if (confirmed && action === "swap") {
      const id = setTimeout(() => router.refresh(), 18_000);
      return () => clearTimeout(id);
    }
  }, [confirmed, action, router]);

  const readsReady = balance !== undefined && allowance !== undefined;
  const needsMint = readsReady && balance < amountWei;
  const needsApprove = readsReady && !needsMint && allowance < amountWei;
  const busy = signing || confirming || switching;

  function onAction() {
    if (!isConnected) {
      const c = connectors[0];
      if (c) connect({ connector: c });
      return;
    }
    if (wrongChain) {
      switchChain({ chainId: XLAYER_TESTNET_CHAIN_ID });
      return;
    }
    if (amt <= 0 || !readsReady) return;
    reset();
    if (needsMint) {
      setAction("mint");
      writeContract({ address: inputToken, abi: erc20Abi, functionName: "mint", args: [address!, MINT_AMOUNT] });
    } else if (needsApprove) {
      setAction("approve");
      writeContract({ address: inputToken, abi: erc20Abi, functionName: "approve", args: [SWAP_ROUTER, maxUint256] });
    } else {
      setAction("swap");
      const zeroForOne = !buy;
      writeContract({
        address: SWAP_ROUTER,
        abi: poolSwapTestAbi,
        functionName: "swap",
        args: [
          POOL_KEY,
          { zeroForOne, amountSpecified: -amountWei, sqrtPriceLimitX96: zeroForOne ? MIN_SQRT_PRICE_LIMIT : MAX_SQRT_PRICE_LIMIT },
          SETTINGS,
          "0x",
        ],
      });
    }
  }

  const label = !isConnected
    ? t.connect
    : wrongChain
      ? t.switchChain
      : signing
        ? t.confirm
        : confirming
          ? t.confirming
          : amt <= 0 || !readsReady
            ? t.swap
            : needsMint
              ? interp(t.mint, { sym: inSym })
              : needsApprove
                ? interp(t.approve, { sym: inSym })
                : t.swap;

  const disabled = busy || (isConnected && !wrongChain && (amt <= 0 || !readsReady));
  const swapDone = confirmed && action === "swap";

  return (
    <div className="hairline rounded-xl bg-surface/60 p-5">
      <div className="flex items-center justify-between">
        <h3 className="kicker">{t.panelTitle}</h3>
        <span className="rounded-full bg-decaydim px-2 py-1 font-mono text-[0.65rem] text-decay">
          {p.lang === "zh" ? "税 " : "tax "}
          {formatPercent(bps)}
        </span>
      </div>

      {/* direction */}
      <div className="mt-4 grid grid-cols-2 gap-1 rounded-md bg-surface2 p-1 font-mono text-xs">
        <button
          type="button"
          onClick={() => setBuy(true)}
          className={`cursor-pointer rounded px-3 py-1.5 transition-colors ${buy ? "bg-accent text-bg" : "text-muted hover:text-fg"}`}
        >
          {t.buy} {p.flapSymbol}
        </button>
        <button
          type="button"
          onClick={() => setBuy(false)}
          className={`cursor-pointer rounded px-3 py-1.5 transition-colors ${!buy ? "bg-accent text-bg" : "text-muted hover:text-fg"}`}
        >
          {t.sell} {p.flapSymbol}
        </button>
      </div>

      {/* input */}
      <label className="mt-4 block">
        <div className="flex items-center justify-between">
          <span className="kicker">{t.youPay}</span>
          {isConnected && !wrongChain && (
            <span className="font-mono text-[0.65rem] text-faint">
              {t.balance}: {fmtBal(balance)} {inSym}
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2 rounded-md border border-line bg-bg px-3 py-3">
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            className="w-full bg-transparent font-mono text-xl text-fg outline-none"
            placeholder="0.0"
          />
          <span className="font-mono text-sm text-faint">{inSym}</span>
        </div>
      </label>

      {/* breakdown */}
      <dl className="mt-4 space-y-2 font-mono text-xs">
        <Row label={t.rowTax} value={`− ${fmtNum(tax, 4)} ${inSym}`} accent="decay" />
        <Row label={t.rowInto} value={`${fmtNum(swapped, 4)} ${inSym}`} />
        <Row label={interp(t.rowOut, { sym: outSym })} value={`≈ ${fmtNum(swapped, 4)}`} accent="accent" />
      </dl>

      {/* action */}
      <button
        type="button"
        disabled={disabled}
        onClick={onAction}
        className="mt-5 w-full cursor-pointer rounded-md bg-accent py-3 font-mono text-sm font-semibold text-bg transition-transform enabled:hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {label}
      </button>

      {/* status */}
      {writeError ? (
        <p className="mt-3 text-center font-mono text-[0.65rem] text-decay">{t.failed}</p>
      ) : swapDone ? (
        <p className="mt-3 text-center font-mono text-[0.65rem] text-accent">
          {t.swapped}{" "}
          <a href={`${OKLINK_TX}/${txHash}`} target="_blank" rel="noreferrer" className="underline">
            {t.view}
          </a>
          {" · "}
          <a href="#dashboard" className="underline">
            {t.viewPanel}
          </a>
        </p>
      ) : txHash && confirming ? (
        <p className="mt-3 text-center font-mono text-[0.65rem] text-muted">
          {t.confirming}{" "}
          <a href={`${OKLINK_TX}/${txHash}`} target="_blank" rel="noreferrer" className="underline">
            {t.view}
          </a>
        </p>
      ) : (
        <p className="mt-3 text-center font-mono text-[0.65rem] text-faint">{t.hint}</p>
      )}

      {/* balances + add tokens to wallet (the mock tokens aren't auto-detected by wallets) */}
      {isConnected && !wrongChain && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-line pt-3 font-mono text-[0.6rem] text-faint">
          <span>
            {fmtBal(flapBal)} {p.flapSymbol} · {fmtBal(quoteBal)} {p.quoteSymbol}
          </span>
          <span className="flex items-center gap-2">
            {t.addToWallet}:
            <button
              type="button"
              onClick={() => watchAsset({ type: "ERC20", options: { address: FLAP_TOKEN, symbol: p.flapSymbol, decimals: 18 } })}
              className="cursor-pointer underline hover:text-fg"
            >
              + {p.flapSymbol}
            </button>
            <button
              type="button"
              onClick={() => watchAsset({ type: "ERC20", options: { address: QUOTE_TOKEN, symbol: p.quoteSymbol, decimals: 18 } })}
              className="cursor-pointer underline hover:text-fg"
            >
              + {p.quoteSymbol}
            </button>
          </span>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: "accent" | "decay" }) {
  const color = accent === "decay" ? "text-decay" : accent === "accent" ? "text-accent" : "text-fg";
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className={color}>{value}</dd>
    </div>
  );
}
