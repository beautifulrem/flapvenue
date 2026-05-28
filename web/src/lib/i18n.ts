// Lightweight i18n: a central EN/ZH dictionary + cookie-based locale. The page resolves `lang`
// server-side from the cookie and threads it down as a prop; the client LangToggle writes the cookie
// and reloads. Technical identifiers (event names, token symbols, `status == DEX`, numbers, OHLC) stay
// in English in both locales, as is standard for bilingual crypto UIs.

export type Lang = "en" | "zh";
export const LANG_COOKIE = "flapvenue_lang";

export function resolveLang(v: string | undefined): Lang {
  return v === "zh" ? "zh" : "en";
}

type Dict = {
  nav: { terminal: string; dashboard: string; swap: string; hackathon: string; connect: string; connecting: string };
  hero: {
    kicker: string;
    h1a: string; h1b: string; h1c: string; h1d: string;
    para: string;
    launch: string; trySwap: string;
    badge: string;
    statWindow: string; statRange: string; statGate: string;
    cardTitle: string;
  };
  terminal: {
    title: string; demoBadge: string;
    live: string; paused: string; high: string; low: string; vol: string;
    candles: string; line: string;
    book: string; sizeTotal: string; price: string; size: string; total: string; spread: string;
    pnlTitle: string; vsNotional: string;
  };
  dash: {
    kicker: string; heading: string; sub1: string; sub2: string;
    poolTitle: string; creatorTaxDay: string;
    curTax: string; taxSkims: string; decaysTo: string;
    commissionTitle: string; skimmed: string; creator: string; protocol: string;
    feedTitle: string; age: string; swapper: string; tax: string; amount: string;
    gradTitle: string; by: string; start: string; ago: string;
  };
  swap: {
    kicker: string; heading: string;
    steps: string[];
    note: string;
    panelTitle: string; buy: string; sell: string; youPay: string;
    rowTax: string; rowInto: string; rowOut: string;
    connect: string; switchChain: string; mint: string; approve: string; swap: string;
    confirm: string; confirming: string; swapped: string; failed: string; view: string; viewPanel: string;
    hint: string; balance: string; addToWallet: string; gas: string; faucet: string;
  };
  footer: { left: string; right: string };
};

const en: Dict = {
  nav: { terminal: "Terminal", dashboard: "Dashboard", swap: "Swap", hackathon: "Hackathon ↗", connect: "Connect", connecting: "Connecting…" },
  hero: {
    kicker: "OKX X Layer · Uniswap V4 Hook · chain {chain}",
    h1a: "The V4 venue", h1b: "Flap scoped", h1c: "but hasn't shipped.", h1d: "So we built it.",
    para: "FlapVenue reproduces Flap's creator tax as a beforeSwap hook delta that decays to zero over {days} days. It's a hook delta, not an ERC-20 transfer tax, so a Flap tax token can hold concentrated liquidity. Its live graduation path can't do that today.",
    launch: "Launch dashboard →", trySwap: "Try a swap",
    badge: "demo of Flap's scoped V4_UNI_MIGRATOR path · not live",
    statWindow: "tax window", statRange: "start → end", statGate: "gate",
    cardTitle: "Creator tax · 30-day linear decay",
  },
  terminal: {
    title: "Trade terminal", demoBadge: "illustrative chart, not on-chain · real on-chain data is in the dashboard below ↓",
    live: "LIVE", paused: "PAUSED", high: "24h high", low: "24h low", vol: "24h vol",
    candles: "Candles", line: "Line",
    book: "Order book", sizeTotal: "size · total", price: "price", size: "size", total: "total", spread: "spread",
    pnlTitle: "Cumulative PnL · illustrative position", vsNotional: "vs {n} notional",
  },
  dash: {
    kicker: "Live on X Layer · chain {chain}", heading: "On-chain, not simulated.",
    sub1: "Unlike the terminal's demo feed above, every number here is read live from the deployed hook's events: ",
    sub2: ".",
    poolTitle: "{flap}/{quote} · pool", creatorTaxDay: "creator tax · day {d}/{w}",
    curTax: "current creator tax", taxSkims: "tax skims", decaysTo: "decays to",
    commissionTitle: "Commission accrued · CommissionAccrued", skimmed: "skimmed", creator: "creator", protocol: "protocol",
    feedTitle: "Tax skim feed · HookTaxSkim", age: "age", swapper: "swapper", tax: "tax", amount: "amount",
    gradTitle: "Graduations · HookGraduation (status == DEX)", by: "by", start: "start", ago: "ago",
  },
  swap: {
    kicker: "Interactive", heading: "Swap through the hook.",
    steps: [
      "You swap in the FlapVenue pool.",
      "beforeSwap skims the decaying creator tax from your input and holds it as ERC-6909 claims. The token itself carries no transfer tax.",
      "The concentrated-liquidity swap runs on the remainder.",
      "Creator and protocol claim their accrued tax anytime.",
    ],
    note: "The tax is a hook delta, not an ERC-20 transfer tax. That's the whole reason a Flap tax token can sit in a concentrated-liquidity pool, which its live graduation path can't.",
    panelTitle: "Swap · FlapVenue pool", buy: "Buy", sell: "Sell", youPay: "you pay",
    rowTax: "creator tax skimmed", rowInto: "into the CL swap", rowOut: "{sym} into CL swap (illustrative)",
    connect: "Connect wallet",
    switchChain: "Switch to X Layer testnet",
    mint: "Get test {sym}",
    approve: "Approve {sym}",
    swap: "Swap",
    confirm: "Confirm in wallet…",
    confirming: "Confirming…",
    swapped: "Swap confirmed on-chain ✓. The Tax skim feed and commission panel above update shortly.",
    failed: "Transaction failed. Make sure your wallet holds X Layer testnet OKB for gas, then retry.",
    view: "tx ↗",
    viewPanel: "view panel ↑",
    hint: "Real swap on X Layer testnet. The first click mints test tokens, then approves, then swaps.",
    balance: "balance", addToWallet: "Add to wallet", gas: "Need testnet OKB for gas?", faucet: "Faucet ↗",
  },
  footer: { left: "Uniswap V4 × Flap × X Layer · Build X Hackathon", right: "a working build of the V4_UNI_MIGRATOR path Flap scoped but hasn't shipped." },
};

const zh: Dict = {
  nav: { terminal: "交易终端", dashboard: "链上数据", swap: "兑换", hackathon: "黑客松 ↗", connect: "连接钱包", connecting: "连接中…" },
  hero: {
    kicker: "OKX X Layer · Uniswap V4 Hook · 链 {chain}",
    h1a: "Flap 规划了的", h1b: "V4 落地场所，", h1c: "却还没上线。", h1d: "我们把它建了出来。",
    para: "FlapVenue 把 Flap 的创作者税做成 beforeSwap 的 hook delta，在 {days} 天内线性衰减到零，本质是个 hook delta，不是 ERC-20 转账税。所以 Flap 的税代币第一次能进集中流动性池，这是它现有毕业路径做不到的。",
    launch: "进入数据面板 →", trySwap: "试一笔兑换",
    badge: "Flap 规划但未上线的 V4_UNI_MIGRATOR 路径 · 演示",
    statWindow: "衰减周期", statRange: "起始 → 结束", statGate: "门禁",
    cardTitle: "创作者税 · 30 天线性衰减",
  },
  terminal: {
    title: "交易终端", demoBadge: "示意行情(非链上)· 真实链上数据见下方面板 ↓",
    live: "实时", paused: "已暂停", high: "24h 最高", low: "24h 最低", vol: "24h 成交额",
    candles: "K线", line: "折线",
    book: "订单簿", sizeTotal: "数量 · 累计", price: "价格", size: "数量", total: "累计", spread: "价差",
    pnlTitle: "累计盈亏 · 示意持仓(演示)", vsNotional: "本金 {n}",
  },
  dash: {
    kicker: "实时运行于 X Layer · 链 {chain}", heading: "链上真实，并非模拟。",
    sub1: "与上方终端的演示数据不同，这里的每个数字都实时读取自已部署 hook 的事件：",
    sub2: "。",
    poolTitle: "{flap}/{quote} · 池子", creatorTaxDay: "创作者税 · 第 {d}/{w} 天",
    curTax: "当前创作者税", taxSkims: "撇税笔数", decaysTo: "衰减至",
    commissionTitle: "累计佣金 · CommissionAccrued", skimmed: "已撇取", creator: "创作者", protocol: "协议",
    feedTitle: "撇税流水 · HookTaxSkim", age: "时间", swapper: "交易者", tax: "税率", amount: "金额",
    gradTitle: "毕业事件 · HookGraduation (status == DEX)", by: "创建者", start: "起始", ago: "前",
  },
  swap: {
    kicker: "交互演示", heading: "穿过这个 hook 做一笔兑换。",
    steps: [
      "你在 FlapVenue 池子里发起兑换。",
      "beforeSwap 从你的输入里撇取正在衰减的创作者税，记为 ERC-6909 claims。代币本身不带转账税。",
      "集中流动性兑换在剩余部分上执行。",
      "创作者与协议可随时领取各自累计的税。",
    ],
    note: "税是一个 hook delta，不是 ERC-20 转账税。正因如此，Flap 税代币才能待在集中流动性池里，这是它现有毕业路径做不到的。",
    panelTitle: "兑换 · FlapVenue 池", buy: "买入", sell: "卖出", youPay: "你支付",
    rowTax: "撇取的创作者税", rowInto: "进入 CL 兑换", rowOut: "{sym} 进入 CL 兑换（示意）",
    connect: "连接钱包",
    switchChain: "切换到 X Layer 测试网",
    mint: "领取测试 {sym}",
    approve: "授权 {sym}",
    swap: "兑换",
    confirm: "在钱包中确认…",
    confirming: "确认中…",
    swapped: "兑换已上链 ✓ 上方的「撇税流水」和「累计佣金」面板稍后会更新。",
    failed: "交易失败。请确认钱包里有 X Layer 测试网 OKB 当 gas，然后重试。",
    view: "交易 ↗",
    viewPanel: "看面板 ↑",
    hint: "X Layer 测试网真实兑换。首次点击会先领取测试代币，再授权，然后兑换。",
    balance: "余额", addToWallet: "加入钱包", gas: "没有测试网 OKB 当 gas?", faucet: "领水龙头 ↗",
  },
  footer: { left: "Uniswap V4 × Flap × X Layer · Build X 黑客松", right: "Flap 规划但未上线的 V4_UNI_MIGRATOR 路径的一个可用实现。" },
};

const DICTS: Record<Lang, Dict> = { en, zh };
export const getDict = (lang: Lang): Dict => DICTS[lang];
export const interp = (s: string, vars: Record<string, string | number>): string =>
  s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
