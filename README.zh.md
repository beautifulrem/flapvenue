<div align="center">

# ⚡ FlapVenue

### Flap 规划了、却还没上线的 Uniswap V4 落地场所 —— 我们把它建了出来。

一个跑在 **OKX X Layer** 上的 **Uniswap V4 Hook**:把 Flap 的创作者税做成会衰减的 `beforeSwap` delta —— 让 Flap 的**税代币第一次能进集中流动性池**。

[![OKX X Layer · Build X](https://img.shields.io/badge/OKX_X_Layer-Build_X_黑客松-b8ff2e?style=flat-square&labelColor=0b0e11)](https://web3.okx.com/xlayer/build-x-hackathon/hook)
[![Uniswap v4 Hook](https://img.shields.io/badge/Uniswap-v4_Hook-FF007A?style=flat-square&labelColor=0b0e11)](https://docs.uniswap.org/contracts/v4/overview)
[![X Layer](https://img.shields.io/badge/X_Layer-测试网_·_1952-2ebd85?style=flat-square&labelColor=0b0e11)](https://www.okx.com/zh-hans/xlayer)
[![许可](https://img.shields.io/badge/许可-MIT-b8ff2e?style=flat-square&labelColor=0b0e11)](./LICENSE)

[English](./README.md) · **中文**

[**🚀 在线演示**](https://web-beautifulremis-projects.vercel.app) · [**📜 合约**](#-已上线-x-layer-测试网链-1952) · [**🏆 黑客松**](https://web3.okx.com/xlayer/build-x-hackathon/hook) · [**🧩 原理**](#️-hook-如何工作)

</div>

---

## 🎯 切入点

Flap 的发币合约**预留**了一条 Uniswap V4 毕业路径 —— 枚举 `MigratorType.V4_UNI_MIGRATOR`,注释写着 `// (Base, XLayer)`,最新的 Portal 甚至接好了 `uniV4Migrator` / `v4CLHook` 槽位。**但它还没上线**:公开发币目前只能通过 `PCS_INFINITY_CL_MIGRATOR` 毕业,传任何其他 migrator 都会 `revert InvalidMigratorType()`。Flap 文档还写明**税代币"只能迁移到 Uniswap V2 或其分叉"** —— 所以今天,Flap 的税代币**没有集中流动性的去处**。

**FlapVenue 把这条还没上线的 V4 落地路径建了出来。** 它把 Flap 的创作者税做成一个 `beforeSwap` 的 **hook delta**(而非 ERC-20 转账税),在 **30 天内从 10% 线性衰减到 0%**,并只对 Flap Portal 报告为已毕业(`status == DEX`)的代币生效。因为税是 hook delta,**Flap 税代币终于能进集中流动性池** —— 这是它现有毕业路径做不到的。

> 为 **OKX X Layer · Build X 黑客松 ——「Hook the Future」**赛道而建 · Uniswap × Flap × X Layer。

---

## 🚀 已上线 X Layer 测试网(链 1952)

> **[▶ 打开在线演示 →](https://web-beautifulremis-projects.vercel.app)**  ·  页头可切换 EN / 中文。
> _交易终端(K线 / 订单簿 / 盈亏)使用**模拟数据**;**真实链上**数字(衰减、撇税、佣金、毕业事件)在其下方的数据面板里。_

| 合约 | 地址(OKLink) |
|---|---|
| **FlapVenue hook** | [`0x5f07e9CA…4b1c9088`](https://www.oklink.com/x-layer-testnet/address/0x5f07e9CA7c006528bB21d098230F25364b1c9088) |
| PoolManager(自部署) | [`0xd4438703…d4e7Eb04`](https://www.oklink.com/x-layer-testnet/address/0xd44387034102491Af58292fF1c7405AED4e7Eb04) |
| FLAP —— 已毕业税代币(无转账税) | [`0x91Eb5b51…675bE1556`](https://www.oklink.com/x-layer-testnet/address/0x91Eb5b51715AB2958d3087992176616675bE1556) |
| USDT0 —— 计价币(mock) | [`0xBEd71c18…74f05Ef3c`](https://www.oklink.com/x-layer-testnet/address/0xBEd71c18e2275F0A10c56c8f22EbFE774f05Ef3c) |

Hook 地址以 `…9088` 结尾 —— 低位编码了权限标志 `afterInitialize | beforeSwap | beforeSwapReturnDelta`(用 `HookMiner` 挖出)。这次部署还**证明了 X Layer 测试网支持 EIP-1153 瞬态存储**(PoolManager + 真实 swap 都执行成功)。

---

## ⚙️ Hook 如何工作

```text
swap ─▶ beforeSwap ─▶ 从输入里撇取 taxBps(t),记为 ERC-6909 claims ─▶ 集中流动性兑换在剩余部分上执行
                       │
                       ├─ taxBps(t) = startBps · (周期 − 已过) / 周期          (30 天线性衰减)
                       ├─ 拆分  →  创作者 (commissionReceiver) + 协议
                       └─ emit  HookTaxSkim · CommissionAccrued
afterInitialize ─▶ 要求 Portal.status == DEX,缓存 creator/migrationTs/startTax,emit HookGraduation
claim(currency) ─▶ unlock → 销毁 hook 的 ERC-6909 claims → 兑付 ERC-20
```

| 链上事件 | 触发于 | 含义 |
|---|---|---|
| `HookGraduation` | `_afterInitialize` | 一个已毕业 Flap 代币的池子被纳入 |
| `HookTaxSkim` | `_beforeSwap` | 从一笔 swap 撇取衰减中的创作者税 |
| `CommissionAccrued` | `_beforeSwap` | 创作者 / 协议分成入账 |
| `Claimed` | `claim` / `unlockCallback` | 累计税兑付为 ERC-20 |

每一次状态变化都是一个自描述事件 —— 整条 10%→0% 衰减曲线和撇税/佣金流都能直接从链上日志重建。

---

## ▶️ 快速开始

```bash
git clone --recurse-submodules https://github.com/beautifulrem/flapvenue
cd flapvenue

# 合约(Foundry)
cd contracts
forge build
forge script script/DeployTestnet.s.sol \
  --rpc-url https://testrpc.xlayer.tech/terigon --broadcast    # 需在 contracts/.env 配 PRIVATE_KEY

# 前端(Next.js)
cd ../web
npm install
npm run dev                                  # http://localhost:3000  (mock 数据)
NEXT_PUBLIC_DATA_SOURCE=live npm run dev     # 读取线上测试网 hook
```

---

## 🗂 仓库结构

```
contracts/   Foundry · Uniswap v4-template + OZ uniswap-hooks(依赖为子模块)
  src/FlapVenue.sol            主 hook
  src/interfaces/              IFlapPortal · IFlapTaxTokenV3
  test/                        合约测试 + mocks
  script/DeployTestnet.s.sol   X Layer 测试网完整部署(自部署 PoolManager + 路由)
web/         Next.js 16 · wagmi/viem · Tailwind · lightweight-charts · Recharts
  src/lib/{data,i18n,feed}     mock ↔ live 数据层 · EN/中文 · 模拟价格源
  src/components/              TradeTerminal · PriceChart · OrderBook · Dashboard · …
```

---

## 🏆 亮点

- **补完合作方的路线图** —— 把 Flap 预留(枚举 + Portal 槽位)却没上线的 `V4_UNI_MIGRATOR` 落地路径做成了可用实现。
- **真正新颖** —— 没有任何在运行的 Uniswap-V4 Flap 毕业场所;把税做成 hook delta,才让 Flap 税代币能进集中流动性。
- **密集、可读的链上信号** —— 每笔 swap 一条 `HookTaxSkim` + 干净的 10%→0% 衰减曲线,日志直读。
- **不可分叉** —— accrual 只对 Flap 真实的 `status == DEX` + `commissionReceiver` 生效。
- **交易所级 UI** —— OKX 风格深色终端:实时 K线、深度订单簿、盈亏曲线,中英双语。

---

<details>
<summary><b>📚 背景与来源 —— 已核实的"占位"</b></summary>

Flap 的 `MigratorType` 枚举:

```solidity
enum MigratorType {
    V3_MIGRATOR,             // Uniswap V3 类池
    V2_MIGRATOR,             // Uniswap V2 类池
    V4_UNI_MIGRATOR,         // Uniswap V4 池   —— 注释 "(Base, XLayer)"
    PCS_INFINITY_CL_MIGRATOR // PancakeSwap Infinity CL (BNB)
}
```

对照 Flap 文档 + 链上 Portal 核实(2026 年 5 月):
- `V4_UNI_MIGRATOR` **存在**,注释指向 **Base / X Layer**;最新 Portal 接好了 `uniV4Migrator` / `v4CLHook` 槽位 —— 是**预留**,并非假设。
- **未上线**:公开发币只走 `PCS_INFINITY_CL_MIGRATOR`;其他 migrator **`revert InvalidMigratorType()`**。税代币被文档限制为"Uniswap V2 或其分叉"。
- Base / X Layer 上**没有任何在运行的 Flap → Uniswap-V4 毕业场所**。

来源:[通过 Portal 发币](https://docs.flap.sh/flap/developers/token-launcher-developers/launch-token-through-portal) · [上 DEX](https://docs.flap.sh/flap/developers/basic-and-mechanism/list-on-dex) · [查询代币](https://docs.flap.sh/flap/developers/wallet-and-terminal-and-bot-developers/inspect-a-token) · [Flap Portal @ X Layer (OKLink)](https://www.oklink.com/xlayer/address/0xb30D8c4216E1f21F27444D2FfAee3ad577808678)。

> "占位 / 未上线"由**文档里的枚举** + **运行时 `InvalidMigratorType()` revert** 证明 —— **而非**对具体未实现函数名的断言(Flap 合约部分闭源)。

**FlapVenue 是什么、不是什么:** 一个**独立、可运行**的 V4 hook + 池,复刻那条 V4 路径的*经济模型*。它**没有**作为 `uniV4Migrator` 接进 Flap 的 Portal;要真正用于毕业路由需由 Flap(或一个 fork)采纳。这是该路径的一个**参考实现**,不是在 Flap 闭源合约里就地补完。测试网用的是 mock Portal(Flap 未部署在 X Layer 测试网);hook 对照真实 Flap Portal 接口校验(`getTokenV5`/`getTokenV7`、`status == DEX`)。

</details>

---

<div align="center">
<sub>Uniswap V4 × Flap × X Layer · MIT 许可 · Flap 预留却没上线的 V4_UNI_MIGRATOR 路径 —— 在此建成。</sub>
</div>
