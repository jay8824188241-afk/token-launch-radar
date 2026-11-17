// Token Radar's page: it renders the board window.RADAR carries, sorts and
// filters it, and opens one protocol's detail view. It never fetches
// anything: the snapshot's data is in data.js, and every figure on the page
// comes from it. The farm plan and the sandbox re-ranking use the same
// functions the model in lib/model.ts uses, so the page and the board file
// never disagree about a protocol.

(function () {
  'use strict';
  var D = window.RADAR;
  if (!D) {
    document.getElementById('lede-text').textContent = 'The snapshot data did not load.';
    return;
  }

  // ------------------------------------------------------------ formatting
  function fmtMoney(n) {
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function fmtCompact(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2).replace(/\.00$/, '') + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(v) {
    if (v === null || v === undefined) return '—';
    var s = (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2) + '%';
    return s;
  }
  function fmtAge(v) {
    if (v === null || v === undefined) return '—';
    return v + 'd';
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ------------------------------------------------------------ the model, again
  // The same family rule, the same multipliers and the same farm plan as
  // lib/model.ts: the sandbox re-ranks with these, and the detail view's
  // farm plan is the one the board file carries for the same row.
  function familyOf(category) {
    var c = (category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0 || c.indexOf('uncollateralized') >= 0) return 'lending';
    if (/\bdexs?\b/.test(c)) return 'dex';
    if (c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('farm') >= 0 || c.indexOf('liquidity manager') >= 0) return 'yield';
    if (c.indexOf('bridge') >= 0) return 'bridge';
    if (c.indexOf('stak') >= 0 || c.indexOf('restak') >= 0) return 'staking';
    if (c.indexOf('derivative') >= 0 || c.indexOf('perpetual') >= 0 || c.indexOf('options') >= 0 || c.indexOf('synthetic') >= 0 || c.indexOf('basis trad') >= 0 || c.indexOf('interest rate') >= 0) return 'derivatives';
    if (c.indexOf('rwa') >= 0 || c.indexOf('reserve currency') >= 0) return 'rwa';
    if (c.indexOf('stable') >= 0 || c.indexOf('anchor btc') >= 0) return 'stable';
    if (c.indexOf('payment') >= 0 || c.indexOf('card issuer') >= 0) return 'payments';
    if (/\bai\b/.test(c)) return 'ai';
    if (c.indexOf('prediction') >= 0) return 'prediction';
    if (c.indexOf('insurance') >= 0) return 'insurance';
    if (c.indexOf('index') >= 0) return 'indexes';
    if (c.indexOf('launchpad') >= 0) return 'launchpad';
    return 'other';
  }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function impliedOf(row, w) {
    var m = D.model;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var growth = 1 + clamp(row.change_7d === null ? 0 : row.change_7d, m.growth_floor, m.growth_cap) / 100 * w.growth;
    var maturity = w.maturityFloor + clamp(age, 0, m.maturity_days) / m.maturity_days * (1 - w.maturityFloor);
    var velocity = row.tvl_usd / Math.max(age, 30);
    var traction = 1 + w.traction * clamp(Math.log10(Math.max(velocity, 1)) - m.traction_center, m.traction_floor, m.traction_cap);
    var breadth = 1 + w.breadth * Math.min(Math.max(row.chains.length - 1, 0), m.breadth_cap);
    return Math.max(1, Math.round(row.tvl_usd * row.family_multiple * growth * maturity * traction * breadth));
  }
  function gasUsd(chain) {
    var c = (chain || '').toLowerCase();
    if (c === 'solana' || c === 'near' || c === 'sui' || c === 'aptos' || c === 'sei') return 0.02;
    if (c === 'polygon') return 0.05;
    if (c === 'base' || c === 'optimism' || c === 'linea' || c === 'scroll' || c === 'blast' || c === 'mantle' || c === 'mode' || c === 'sonic' || c === 'berachain' || c === 'hyperliquid l1') return 0.3;
    if (c === 'arbitrum' || c === 'zksync era') return 0.4;
    if (c === 'binance' || c === 'avalanche' || c === 'cosmos') return 0.25;
    if (c === 'ethereum') return 6;
    return 1;
  }
  function capitalFor(row) {
    if (row.tvl_usd >= 5000000000) return 250;
    if (row.tvl_usd >= 1000000000) return 150;
    if (row.tvl_usd >= 100000000) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(row, capital, chain) {
    var c = (row.category || '').toLowerCase();
    var name = row.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0 || c.indexOf('uncollateralized') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (/\bdexs?\b/.test(c)) return 'Provide $' + capital + ' of liquidity to ' + name + '\'s main pool on ' + chain + ' and keep the position open.';
    if (c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('farm') >= 0 || c.indexOf('liquidity manager') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + '\'s highest-yield strategy on ' + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('stak') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + ' of the chain\'s staking asset through ' + name + ' and keep the receipt token.';
    if (c.indexOf('derivative') >= 0 || c.indexOf('perpetual') >= 0 || c.indexOf('options') >= 0 || c.indexOf('synthetic') >= 0 || c.indexOf('basis trad') >= 0 || c.indexOf('interest rate') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged position.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0 || c.indexOf('anchor btc') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0 || c.indexOf('reserve currency') >= 0) return 'Mint $' + capital + ' of the protocol\'s yield asset on ' + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('launchpad') >= 0) return 'Stake $' + capital + ' through ' + name + ' to qualify for its next launch.';
    if (c.indexOf('payment') >= 0 || c.indexOf('card issuer') >= 0) return 'Fund $' + capital + ' and spend through ' + name + ' on ' + chain + '.';
    if (c.indexOf('index') >= 0) return 'Buy $' + capital + ' of the index token through ' + name + ' on ' + chain + ' and hold it.';
    if (/\bai\b/.test(c)) return 'Use ' + name + '\'s agent with $' + capital + ' on ' + chain + ' and keep the activity on record.';
    if (c.indexOf('nft') >= 0) return 'Buy or list one NFT through ' + name + ' on ' + chain + ' with $' + capital + '.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function weeklyFor(row) {
    var c = (row.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0 || c.indexOf('uncollateralized') >= 0) return 'a supply top-up, a borrow-and-repay cycle, or a governance vote';
    if (/\bdexs?\b/.test(c)) return 'a swap, a liquidity top-up, or a vote on a gauge';
    if (c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('farm') >= 0 || c.indexOf('liquidity manager') >= 0) return 'a deposit, a harvest-and-compound, or a strategy switch';
    if (c.indexOf('bridge') >= 0) return 'a bridge transfer, a swap on the destination chain, or a claim';
    if (c.indexOf('stak') >= 0 || c.indexOf('restak') >= 0) return 'a stake top-up, a restake, or a delegation change';
    if (c.indexOf('derivative') >= 0 || c.indexOf('perpetual') >= 0 || c.indexOf('options') >= 0 || c.indexOf('synthetic') >= 0 || c.indexOf('basis trad') >= 0 || c.indexOf('interest rate') >= 0) return 'a small trade, a funding payment, or a position rebalance';
    if (c.indexOf('prediction') >= 0) return 'a market position, a settlement, or a new market';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'a vault deposit, a rebalance, or a curator vote';
    if (c.indexOf('stable') >= 0 || c.indexOf('anchor btc') >= 0) return 'a mint, a redeem, or a stability-module deposit';
    if (c.indexOf('rwa') >= 0 || c.indexOf('reserve currency') >= 0) return 'a mint, a coupon claim, or a redemption';
    if (c.indexOf('insurance') >= 0) return 'a cover top-up, a claim check, or a policy renewal';
    if (c.indexOf('launchpad') >= 0) return 'a stake top-up, a launch registration, or a vote';
    if (c.indexOf('payment') >= 0 || c.indexOf('card issuer') >= 0) return 'a spend, a top-up, or a rewards claim';
    if (c.indexOf('index') >= 0) return 'a buy, a rebalance, or a composition vote';
    if (/\bai\b/.test(c)) return 'an agent run, a task, or a usage claim';
    if (c.indexOf('nft') >= 0) return 'a listing, a bid, or a trade';
    return 'a deposit, a borrow, a swap or a vote';
  }
  function farmSteps(row) {
    var chain = row.chains.length > 0 ? row.chains[0] : 'its main chain';
    var gas = gasUsd(chain);
    var capital = capitalFor(row);
    var hold = holdDaysFor(row.age_days);
    var gasText = gas >= 1 ? '$' + gas : '$' + gas.toFixed(2);
    var steps = [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'nothing but the wallet', time: '5 minutes' },
      { text: actionFor(row, capital, chain), cost: '$' + capital + ' of capital and about ' + gasText + ' of gas on ' + chain, time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as ' + weeklyFor(row) + '.', cost: 'about ' + gasText + ' of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: 'Before you withdraw, open the protocol\'s own points or rewards page and claim only from the link it publishes.', cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ];
    return steps.map(function (s) {
      var t = s.text + ' Cost: ' + s.cost + '. Time: ' + s.time + '.';
      if (t.length > 600) t = t.slice(0, 596) + '...';
      return t;
    });
  }

  // ------------------------------------------------------------ static copy
  // The watchlist slugs are the board's floor; the page marks them.
  var watchSet = {};
  (D.watchlist || []).forEach(function (s) { watchSet[s] = true; });
  var topImplied = D.rows.length ? D.rows[0].implied_value_usd : 0;

  document.getElementById('meta').textContent = 'Snapshot ' + D.as_of + ' · ' + D.source + ' · model ' + D.model_version;
  document.getElementById('lede-text').textContent =
    'The snapshot lists ' + D.total_count + ' protocols. ' +
    D.pre_token_count + ' record no token; ' + D.board_size + ' pass the launch-candidate rule — the same rule the watchlist uses — and are ranked here by implied value. ' +
    'The other ' + D.excluded_count + ' pre-token protocols are wrapped, staked or bridged products of tokens that already trade, so they are not launches.';
  var cards = [
    [D.board_size, 'protocols ranked'],
    [D.watchlist_size + ' / ' + D.watchlist_size, 'watchlist covered'],
    [fmtCompact(topImplied), 'top implied value · ' + (D.rows[0] ? D.rows[0].name : '')],
    [D.live_size, 'live-token comparables']
  ];
  document.getElementById('fact-cards').innerHTML = cards.map(function (c) {
    return '<div class="fact-card"><b>' + esc(c[0]) + '</b><span>' + esc(c[1]) + '</span></div>';
  }).join('');

  document.getElementById('model-formula').textContent =
    'implied value = TVL × family multiple × growth × maturity × traction × breadth';
  var modelCells = [
    ['Family multiple', 'The median market-cap-to-TVL of the live-token protocols in the same family, read from this snapshot.'],
    ['Growth', 'Seven-day TVL change, clamped to −60%…+120%, worth up to ±' + Math.round(D.model.growth_weight * 100) + '%.'],
    ['Maturity', 'How long it has run with no token: 0.6 at listing, up to 1.0 after three years.'],
    ['Traction', 'TVL gained per day since listing, worth 0.90–1.10.'],
    ['Breadth', 'How many chains it runs on: +2% a chain, up to five.']
  ];
  document.getElementById('model-grid').innerHTML = modelCells.map(function (c) {
    return '<div class="model-cell"><b>' + esc(c[0]) + '</b><span>' + esc(c[1]) + '</span></div>';
  }).join('');

  document.getElementById('method-note').textContent =
    'Method: the board ranks every protocol that records no token and passes the watchlist\'s launch-candidate rule — not a wrapped, staked or bridged product, not an exchange, not a versioned pool. ' +
    'The base multiple comes from the snapshot\'s own live-token protocols, never from a hand-picked number; the other four multipliers come from the protocol\'s own record. ' +
    'The farm plan on each protocol is derived from its category, chains, TVL and age, with the gas cost of its first chain.';
  document.getElementById('source-note').textContent =
    'Source: ' + D.source + ' snapshot of ' + D.as_of + ', TVL floor ' + fmtMoney(D.floor_usd) + '. The page works offline: no fetch, no network.';

  // ------------------------------------------------------------ sandbox
  var weights = {
    growth: D.model.growth_weight,
    maturityFloor: D.model.maturity_floor,
    traction: D.model.traction_weight,
    breadth: D.model.breadth_step
  };
  var defaultWeights = { growth: weights.growth, maturityFloor: weights.maturityFloor, traction: weights.traction, breadth: weights.breadth };
  var sliders = [
    { key: 'growth', label: 'Growth weight', min: 0, max: 1, step: 0.05, fmt: function (v) { return v.toFixed(2); } },
    { key: 'maturityFloor', label: 'Maturity floor', min: 0.3, max: 0.9, step: 0.05, fmt: function (v) { return v.toFixed(2); } },
    { key: 'traction', label: 'Traction weight', min: 0, max: 0.1, step: 0.01, fmt: function (v) { return v.toFixed(2); } },
    { key: 'breadth', label: 'Breadth per chain', min: 0, max: 0.05, step: 0.005, fmt: function (v) { return v.toFixed(3); } }
  ];
  document.getElementById('sliders').innerHTML = sliders.map(function (s) {
    return '<div class="slider"><label><span>' + esc(s.label) + '</span><output id="out-' + s.key + '">' + s.fmt(weights[s.key]) + '</output></label>' +
      '<input type="range" id="sl-' + s.key + '" min="' + s.min + '" max="' + s.max + '" step="' + s.step + '" value="' + weights[s.key] + '"></div>';
  }).join('');
  sliders.forEach(function (s) {
    var input = document.getElementById('sl-' + s.key);
    input.addEventListener('input', function () {
      weights[s.key] = parseFloat(input.value);
      document.getElementById('out-' + s.key).textContent = s.fmt(weights[s.key]);
      renderBoard();
    });
  });
  document.getElementById('sandbox-reset').addEventListener('click', function () {
    weights = { growth: defaultWeights.growth, maturityFloor: defaultWeights.maturityFloor, traction: defaultWeights.traction, breadth: defaultWeights.breadth };
    sliders.forEach(function (s) {
      document.getElementById('sl-' + s.key).value = weights[s.key];
      document.getElementById('out-' + s.key).textContent = s.fmt(weights[s.key]);
    });
    renderBoard();
  });
  function sandboxActive() {
    return weights.growth !== defaultWeights.growth || weights.maturityFloor !== defaultWeights.maturityFloor ||
      weights.traction !== defaultWeights.traction || weights.breadth !== defaultWeights.breadth;
  }

  // ------------------------------------------------------------ controls
  var qEl = document.getElementById('q');
  var catEl = document.getElementById('category');
  var chainEl = document.getElementById('chain');
  var minTvlEl = document.getElementById('min-tvl');
  var wlEl = document.getElementById('watchlist-only');
  var liveEl = document.getElementById('show-live');
  var countEl = document.getElementById('count');
  var boardBody = document.getElementById('board-body');
  var boardEmpty = document.getElementById('board-empty');
  var sortKey = 'rank';
  var sortDir = 1;

  var cats = {};
  var chains = {};
  D.rows.forEach(function (r) {
    if (r.category) cats[r.category] = true;
    r.chains.forEach(function (c) { chains[c] = true; });
  });
  Object.keys(cats).sort().forEach(function (c) {
    var o = document.createElement('option'); o.value = c; o.textContent = c; catEl.appendChild(o);
  });
  Object.keys(chains).sort().forEach(function (c) {
    var o = document.createElement('option'); o.value = c; o.textContent = c; chainEl.appendChild(o);
  });

  function filteredRows() {
    var q = qEl.value.trim().toLowerCase();
    var cat = catEl.value;
    var chain = chainEl.value;
    var minTvl = parseInt(minTvlEl.value, 10) || 0;
    var wl = wlEl.checked;
    var showLive = liveEl.checked;
    var active = sandboxActive();
    var rows = D.rows.map(function (r) {
      return { row: r, live: false, value: active ? impliedOf(r, weights) : r.implied_value_usd };
    });
    if (showLive) {
      D.live.forEach(function (l) {
        rows.push({ row: l, live: true, value: l.mcap_usd || 0 });
      });
    }
    return rows.filter(function (item) {
      var r = item.row;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      if (cat && r.category !== cat) return false;
      if (chain && r.chains.indexOf(chain) < 0) return false;
      if (r.tvl_usd < minTvl) return false;
      if (wl && !watchSet[r.slug]) return false;
      return true;
    });
  }
  function sortRows(items) {
    var dir = sortDir;
    var key = sortKey;
    var active = sandboxActive();
    function val(item) {
      var r = item.row;
      // With sandbox weights on, the board's ranks no longer hold: the
      // re-ranked order is the recomputed value, highest first.
      if (key === 'rank') return active ? -item.value : (item.live ? 1e9 : r.rank);
      if (key === 'name') return r.name.toLowerCase();
      if (key === 'tvl_usd') return r.tvl_usd;
      if (key === 'change_7d') return r.change_7d === null ? -1e9 : r.change_7d;
      if (key === 'age_days') return r.age_days === null ? -1 : r.age_days;
      if (key === 'traction') {
        var age = r.age_days === null ? 365 : r.age_days;
        return r.tvl_usd / Math.max(age, 30);
      }
      if (key === 'implied_value_usd') return item.value;
      return 0;
    }
    return items.slice().sort(function (a, b) {
      var va = val(a), vb = val(b);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return (a.row.slug < b.row.slug ? -1 : 1);
    });
  }
  function renderBoard() {
    var items = sortRows(filteredRows());
    var active = sandboxActive();
    countEl.textContent = items.length + ' of ' + D.board_size + ' ranked' + (liveEl.checked ? ' + ' + D.live_size + ' live' : '') + (active ? ' · sandbox weights active — ranks are recomputed' : '');
    boardEmpty.hidden = items.length > 0;
    boardBody.innerHTML = items.map(function (item, idx) {
      var r = item.row;
      var age = r.age_days === null || r.age_days === undefined ? 365 : r.age_days;
      var traction = r.tvl_usd / Math.max(age, 30);
      var pct = (item.value / topImplied * 100);
      var badge = (!item.live && watchSet[r.slug]) ? '<span class="badge">WATCHLIST</span>' : (item.live ? '<span class="badge">LIVE</span>' : '');
      var rankCell = item.live ? '—' : (active ? '#' + (idx + 1) : '#' + r.rank);
      var change = r.change_7d === null ? '—' : '<span class="' + (r.change_7d >= 0 ? 'pos' : 'neg') + '">' + fmtPct(r.change_7d) + '</span>';
      var ageCell = r.age_days === null || r.age_days === undefined ? '—' : fmtAge(r.age_days);
      return '<tr class="row-link" data-slug="' + esc(r.slug) + '">' +
        '<td class="rank">' + rankCell + '</td>' +
        '<td class="name-cell"><b>' + esc(r.name) + badge + '</b><span>' + esc(r.category || 'Uncategorised') + ' · ' + esc(r.chains.slice(0, 3).join(', ') || '—') + '</span></td>' +
        '<td class="num">' + fmtCompact(r.tvl_usd) + '</td>' +
        '<td class="num">' + change + '</td>' +
        '<td class="num">' + ageCell + '</td>' +
        '<td class="num">' + fmtCompact(traction) + '/d</td>' +
        '<td><span class="bar-wrap"><span class="bar-track"><span class="bar-fill" style="width:' + Math.max(1, Math.min(100, pct)) + '%"></span></span><span class="bar-val">' + fmtCompact(item.value) + '</span></span></td>' +
        '</tr>';
    }).join('');
    document.querySelectorAll('#board th[data-sort]').forEach(function (th) {
      th.classList.toggle('sorted', th.getAttribute('data-sort') === sortKey);
    });
  }
  boardBody.addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (tr) openDetail(tr.getAttribute('data-slug'));
  });
  document.querySelectorAll('#board th[data-sort]').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.getAttribute('data-sort');
      if (sortKey === k) { sortDir = -sortDir; } else { sortKey = k; sortDir = k === 'name' ? 1 : -1; }
      renderBoard();
    });
  });
  [qEl, catEl, chainEl, minTvlEl, wlEl, liveEl].forEach(function (el) {
    el.addEventListener('input', renderBoard);
    el.addEventListener('change', renderBoard);
  });

  // ------------------------------------------------------------ tabs + live view
  var tabBoard = document.getElementById('tab-board');
  var tabLive = document.getElementById('tab-live');
  var boardView = document.getElementById('board-view');
  var liveView = document.getElementById('live-view');
  function showTab(which) {
    var live = which === 'live';
    tabBoard.setAttribute('aria-selected', String(!live));
    tabLive.setAttribute('aria-selected', String(live));
    boardView.hidden = live;
    liveView.hidden = !live;
  }
  tabBoard.addEventListener('click', function () { showTab('board'); });
  tabLive.addEventListener('click', function () { showTab('live'); });

  document.getElementById('live-body').innerHTML = D.live.map(function (l) {
    return '<tr><td class="name-cell"><b>' + esc(l.name) + '</b><span>' + esc(l.category || 'Uncategorised') + ' · ' + esc(l.chains.slice(0, 3).join(', ') || '—') + '</span></td>' +
      '<td class="num">' + fmtCompact(l.tvl_usd) + '</td>' +
      '<td class="num">' + fmtCompact(l.mcap_usd || 0) + '</td>' +
      '<td class="num">' + (l.mcap_tvl === null ? '—' : l.mcap_tvl.toFixed(3)) + '</td></tr>';
  }).join('');
  document.getElementById('families-body').innerHTML = D.families.map(function (f) {
    return '<tr><td>' + esc(f.family) + '</td><td class="num">' + f.live_count + '</td>' +
      '<td class="num">' + (f.median === null ? '—' : f.median.toFixed(3)) + '</td>' +
      '<td class="num">' + f.used.toFixed(3) + '</td></tr>';
  }).join('');

  // ------------------------------------------------------------ detail dialog
  var dialog = document.getElementById('detail');
  var detailBody = document.getElementById('detail-body');
  document.getElementById('detail-close').addEventListener('click', function () { dialog.close(); });
  dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });

  function openDetail(slug) {
    var row = null;
    D.rows.forEach(function (r) { if (r.slug === slug) row = r; });
    var liveRow = null;
    if (!row) D.live.forEach(function (l) { if (l.slug === slug) liveRow = l; });
    if (!row && !liveRow) return;
    var r = row || liveRow;
    var isLive = !row;
    var age = r.age_days === null || r.age_days === undefined ? 365 : r.age_days;
    var traction = r.tvl_usd / Math.max(age, 30);
    var comps = [];
    if (!isLive) {
      var fam = familyOf(r.category);
      D.live.forEach(function (l) { if (familyOf(l.category) === fam && l.mcap_tvl !== null) comps.push(l); });
      comps.sort(function (a, b) { return b.mcap_tvl - a.mcap_tvl; });
      comps = comps.slice(0, 3);
    }
    var value = isLive ? (r.mcap_usd || 0) : (sandboxActive() ? impliedOf(r, weights) : r.implied_value_usd);
    var valueLabel = isLive ? 'market cap' : (sandboxActive() ? 'implied value (sandbox weights)' : 'implied value');
    var html = '<h2>' + esc(r.name) + '</h2>' +
      '<p class="sub">' + esc(r.category || 'Uncategorised') + ' · ' + esc(r.chains.join(', ') || '—') + ' · ' + (isLive ? 'already trading' : 'pre-token · rank #' + r.rank) + '</p>' +
      '<div class="kv">' +
      '<div><b>' + fmtMoney(value) + '</b><span>' + valueLabel + '</span></div>' +
      '<div><b>' + fmtMoney(r.tvl_usd) + '</b><span>TVL</span></div>' +
      '<div><b>' + (r.change_7d === null ? '—' : fmtPct(r.change_7d)) + '</b><span>7-day TVL change</span></div>' +
      '<div><b>' + (r.age_days === null || r.age_days === undefined ? '—' : r.age_days + ' days') + '</b><span>running with no token</span></div>' +
      '<div><b>' + fmtCompact(traction) + '/d</b><span>TVL gained a day</span></div>' +
      '</div>';
    if (!isLive) {
      var maxMult = 0.8;
      var parts = [
        ['Family multiple (' + esc(r.family) + ')', r.family_multiple, maxMult],
        ['Growth', r.growth_multiplier, 1.6],
        ['Maturity', r.maturity_multiplier, 1.0],
        ['Traction', r.traction_multiplier, 1.1],
        ['Breadth', r.breadth_multiplier, 1.1]
      ];
      html += '<h3>How the implied value is built' + (sandboxActive() ? ' (default weights — the sandbox value above uses your weights)' : '') + '</h3>';
      parts.forEach(function (p) {
        html += '<div class="comp-bar"><span>' + p[0] + '</span><span class="track"><span class="fill" style="width:' + Math.max(2, Math.min(100, p[1] / p[2] * 100)) + '%"></span></span><span class="val">' + p[1].toFixed(4) + '×</span></div>';
      });
      html += '<p class="cost-line">TVL ' + fmtMoney(r.tvl_usd) + ' × ' + r.family_multiple.toFixed(4) + ' × ' + r.growth_multiplier.toFixed(4) + ' × ' + r.maturity_multiplier.toFixed(4) + ' × ' + r.traction_multiplier.toFixed(4) + ' × ' + r.breadth_multiplier.toFixed(4) + ' ≈ ' + fmtMoney(r.implied_value_usd) + ' (multipliers rounded to 4 decimals).</p>';
      if (comps.length) {
        html += '<h3>Live comparables in the same family</h3>';
        var maxRatio = Math.max.apply(null, comps.map(function (c) { return c.mcap_tvl; }));
        comps.forEach(function (c) {
          html += '<div class="comp-bar"><span>' + esc(c.name) + '</span><span class="track"><span class="fill" style="width:' + Math.max(2, c.mcap_tvl / maxRatio * 100) + '%"></span></span><span class="val">' + c.mcap_tvl.toFixed(3) + '×</span></div>';
        });
      }
      var steps = farmSteps(r);
      var capital = capitalFor(r);
      var chain = r.chains.length > 0 ? r.chains[0] : 'its main chain';
      var gas = gasUsd(chain);
      html += '<h3>Farm plan</h3><ol class="farm-list">' + steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
        '<p class="cost-line">Cost to farm: <b>$' + capital + ' of capital</b> plus about <b>$' + (gas >= 1 ? gas : gas.toFixed(2)) + ' of gas a transaction</b> on ' + esc(chain) + ', held at least <b>' + holdDaysFor(r.age_days) + ' days</b>.</p>';
    }
    detailBody.innerHTML = html;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    try { history.replaceState(null, '', '#p=' + slug); } catch (e) {}
  }

  // ------------------------------------------------------------ deep links
  function readHash() {
    var h = location.hash.replace(/^#/, '');
    var params = {};
    h.split('&').forEach(function (pair) {
      var kv = pair.split('=');
      if (kv[0]) params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
    });
    return params;
  }
  var params = readHash();
  if (params.q) qEl.value = params.q;
  if (params.category) catEl.value = params.category;
  if (params.chain) chainEl.value = params.chain;
  if (params.watchlist === '1') wlEl.checked = true;
  renderBoard();
  if (params.p) openDetail(params.p);
  window.addEventListener('hashchange', function () {
    var p = readHash();
    if (p.p) openDetail(p.p);
  });
})();
