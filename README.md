# Blast Sim

An interactive token launch simulator for Sui. Model a presale plus a Cetus liquidity pool, push buys and sells through the pool, and see how price and market cap move.

It runs entirely in the browser. There is no build step, no backend and no wallet connection.

## What it does

- **Launch setup.** Set total supply, presale % and raise, liquidity % and paired $, and the pool fee. It derives the launch price, launch market cap, presale price vs launch, and how much of the raise is left after seeding liquidity.
- **Manual trading.** Buy or sell for $500 / $1k / $5k / $10k or a custom amount. A separate control lets presale holders sell 10% / 25% / 50% / all of their remaining bag.
- **Auto market.** A random market where you set buy pressure, average trade size, the chance a presale holder dumps, and the speed.
- **Live readout.** Shows market cap (FDV), price, pool depth, circulating MC, presale ROI, the impact of a full presale exit, and a trade log.
- **Chart.** Market cap after every trade, with buy and sell markers, the launch level and a hover tooltip.
- **Impact tables.** Single buy, single sell, the net buys needed to reach each market cap target, and presale unlock scenarios. Each table can be computed from launch or from the current pool state.

## Default scenario

| Item | Value |
|---|---|
| Total supply | 1,000,000,000 |
| Presale | 40% for $20,000 |
| Liquidity | 30% of supply + $15,000, Cetus pool |
| Team / other | 30% |
| Launch price | $0.00005 |
| Launch market cap | $50,000 |
| Pool fee | 0.25% |

Key numbers from launch, full-range pool:

| Event | Result |
|---|---|
| $1k buy | +13.7% |
| $5k buy | +77.6% (≈ $89k MC) |
| $10k buy | +177% |
| 2× to $100k MC | ≈ $6.2k net buys |
| 10× to $500k MC | ≈ $32.5k net buys |
| Full presale dump at open | MC → ≈ $9.2k (−82%) |

## The model

The pool is a full-range constant-product AMM:

```
tokens × usd = k
price = usd / tokens = usd² / k
```

- **Buy $u:** `usd' = usd + u·(1−fee)`, `tokens' = k / usd'`, tokens out = `tokens − tokens'`
- **Sell t tokens:** `tokens' = tokens + t·(1−fee)`, `usd' = k / tokens'`, $ out = `usd − usd'`
- **Net $ to reach price p:** `(√(k·p) − usd) / (1−fee)`

The fee is taken from the trade input and paid to the LP position rather than added to pool depth, which is how Cetus CLMM fees work. Market cap means fully diluted value (price × total supply).

### Limitations

- A concentrated Cetus range (not full range) moves less per dollar inside the range and runs out of liquidity past its edges. This isn't modelled yet.
- The $ side is treated as stable, so SUI/USD moves are ignored.
- MEV, sniping bots, other pools and arbitrage are not modelled.

This is a planning tool, not financial advice.

## Run locally

Open `index.html` in any browser. Or serve the folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploy on GitHub Pages

1. Push this folder to your repository.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, then select `main` and `/ (root)`.
4. The site goes live at `https://<your-username>.github.io/<repo-name>/`.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page layout and controls |
| `style.css` | Theme (light and dark) and layout |
| `app.js` | AMM math, simulation state, chart and tables |
| `.nojekyll` | Tells GitHub Pages to serve files as-is |

## License

MIT. See [LICENSE](LICENSE).
