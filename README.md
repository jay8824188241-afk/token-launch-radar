# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/jay8824188241-afk/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/jay8824188241-afk/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks the pre-token protocols in a sealed DefiLlama snapshot by implied value, with a farm plan for each. It reads one snapshot, scores every protocol that passes the launch-candidate rule — no token on record, and not a wrapped, staked or bridged product, not an exchange, not a versioned pool — and writes a ranked board and a static dashboard you can open offline.

The model, radar-2, prices a launch from the snapshot's own figures. The base multiple is the median market-cap-to-TVL of the live-token protocols in the same family, read from this snapshot, so the market's own pricing sets what a launch is worth. Four multipliers from the protocol's own record follow it: seven-day growth, maturity (how long it has run with no token), traction (TVL gained per day since listing) and breadth (how many chains it runs on). No protocol name is ever special-cased: the same function scores every row.

The dashboard shows the board with sorting, search, category and chain filters, a watchlist-only view, the live-token comparables and their family multiples, a sandbox that re-ranks the page when you move a weight, and a detail view for every protocol with the implied value broken into its five components, the live comparables in its family, and a six-step farm plan with its cost and time.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Node.js 22.18 or later, standard library only. It writes `out/board.json`, `out/data.js`, `out/dashboard/` and `out/dossier.json`. Open `out/dashboard/index.html` in a browser to see the radar.

---

<sub>Entered on [make.fun](https://make.fun/?ref=d1n6bjq8&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
