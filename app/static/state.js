// token_universe:v1 state + migrations + portfolio model (Trades -> Positions)
window.TokenUniverseState = (function () {
  const NS = "token_universe:v1:";
  const KEY_SCHEMA = NS + "schema_version";
  const KEY_WATCH = NS + "watchlist";
  const KEY_TRADES = NS + "trades";
  const KEY_PREFS = NS + "prefs";
  const KEY_WALLET = NS + "wallet";

  const CURRENT = 1;
  const DEFAULT_WALLET = { cashUsd: 10000 };

  function _load(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
    catch { return fallback; }
  }
  function _save(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  }

  function migrateIfNeeded() {
    const v = Number(localStorage.getItem(KEY_SCHEMA) || "0");
    if (v === CURRENT) return;

    // migrate old keys from earlier builds if present
    const oldWatch = _load("token_universe_watchlist", null);
    if (oldWatch && Array.isArray(oldWatch)) _save(KEY_WATCH, oldWatch);

    const oldPos = _load("token_universe_positions", null);
    // if old positions existed, convert to trades (best effort)
    if (oldPos && Array.isArray(oldPos) && oldPos.length) {
      const trades = [];
      for (const p of oldPos) {
        if (!p || !p.token) continue;
        trades.push({
          id: crypto.randomUUID(),
          tokenMint: p.token,
          side: "BUY",
          qty: Number(p.qty || 0),
          priceUsd: Number(p.entry || 0),
          timestamp: Date.now(),
          source: "migration"
        });
      }
      _save(KEY_TRADES, trades);
    }

    localStorage.setItem(KEY_SCHEMA, String(CURRENT));
  }

  function getPrefs() {
    return _load(KEY_PREFS, {
      metric: "mcap",
      density: "comfortable",
      quote: "USDC",
      quickPercents: [5, 10, 50, 100]
    });
  }
  function setPrefs(p) {
    const cur = getPrefs();
    _save(KEY_PREFS, Object.assign({}, cur, p));
  }

  function getWatchlist() { return _load(KEY_WATCH, []); }
  function setWatchlist(arr) { _save(KEY_WATCH, arr); }

  function toggleWatch(mint) {
    const cur = getWatchlist();
    const idx = cur.indexOf(mint);
    if (idx >= 0) cur.splice(idx, 1);
    else cur.push(mint);
    setWatchlist(cur);
    return cur;
  }
  function isWatched(mint) {
    return getWatchlist().includes(mint);
  }

  function ensureWallet() {
    const cur = _load(KEY_WALLET, null);
    if (!cur || typeof cur.cashUsd !== "number") {
      _save(KEY_WALLET, DEFAULT_WALLET);
      return Object.assign({}, DEFAULT_WALLET);
    }
    return cur;
  }

  function getWallet() {
    return ensureWallet();
  }
  function setWallet(w) {
    const next = Object.assign({}, DEFAULT_WALLET, w);
    _save(KEY_WALLET, next);
    return next;
  }

  // Trades model
  // Trade: {id, tokenMint, side, priceUsd, qty, timestamp, source}
  function getTrades() { return _load(KEY_TRADES, []); }
  function setTrades(arr) { _save(KEY_TRADES, arr); }

  function addTrade(trade) {
    const t = Object.assign({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      source: "manual"
    }, trade);
    const cur = getTrades();
    cur.push(t);
    setTrades(cur);
    return t;
  }

  function clearTrades() { setTrades([]); }

  // Derive open positions using simple average-cost for MVP
  function derivePositions() {
    const trades = getTrades();
    const map = new Map();

    for (const tr of trades) {
      if (!tr || !tr.tokenMint) continue;
      const mint = tr.tokenMint;
      const side = String(tr.side || "").toUpperCase();
      const qty = Number(tr.qty || 0);
      const price = Number(tr.priceUsd || 0);
      if (!qty || !price) continue;

      if (!map.has(mint)) {
        map.set(mint, { tokenMint: mint, qty: 0, cost: 0, openedAt: tr.timestamp, lastAt: tr.timestamp });
      }
      const p = map.get(mint);

      p.lastAt = Math.max(p.lastAt, tr.timestamp);
      p.openedAt = Math.min(p.openedAt, tr.timestamp);

      if (side === "BUY") {
        p.cost += qty * price;
        p.qty += qty;
      } else if (side === "SELL") {
        // reduce qty; for MVP we assume sells reduce holdings without realized pnl tracking
        p.qty -= qty;
        if (p.qty < 0) p.qty = 0;
        // cost left unchanged (we’ll do proper lot accounting later)
      }
    }

    // return only open positions
    const out = [];
    for (const p of map.values()) {
      if (p.qty > 0) {
        p.entryPriceUsd = p.cost / p.qty;
        out.push(p);
      }
    }
    return out;
  }

  function getHoldingQty(mint) {
    if (!mint) return 0;
    const positions = derivePositions();
    const match = positions.find(p => p.tokenMint === mint);
    return match ? Number(match.qty || 0) : 0;
  }

  function executeTrade({ tokenMint, side, qty, priceUsd }) {
    const mint = String(tokenMint || "");
    const s = String(side || "").toUpperCase();
    const q = Number(qty || 0);
    const price = Number(priceUsd || 0);

    if (!mint) return { ok: false, error: "Missing token mint." };
    if (!q || !price) return { ok: false, error: "Enter a valid amount." };

    const wallet = ensureWallet();
    const total = q * price;

    if (s === "BUY") {
      if (total > wallet.cashUsd + 1e-9) return { ok: false, error: "Insufficient cash balance." };
    } else if (s === "SELL") {
      const holding = getHoldingQty(mint);
      if (q > holding + 1e-9) return { ok: false, error: "Not enough tokens to sell." };
    } else {
      return { ok: false, error: "Invalid trade side." };
    }

    const trade = addTrade({ tokenMint: mint, side: s, qty: q, priceUsd: price });
    wallet.cashUsd += (s === "BUY") ? -total : total;
    setWallet(wallet);
    return { ok: true, trade, wallet };
  }

  return {
    migrateIfNeeded,
    getPrefs, setPrefs,
    getWatchlist, setWatchlist,
    toggleWatch, isWatched,
    getWallet, setWallet,
    getTrades, setTrades, addTrade, clearTrades,
    derivePositions,
    executeTrade,
    NS
  };
})();
