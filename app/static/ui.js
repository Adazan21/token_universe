window.TokenUniverseUI = (function () {
  const S = window.TokenUniverseState;

  function qs(name) { return document.querySelector(name); }
  function qsa(name) { return Array.from(document.querySelectorAll(name)); }

  function formatUsd(value, digits = 2) {
    const v = Number(value || 0);
    return v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  async function fetchBestPair(mint) {
    if (!mint) return null;
    try {
      const res = await fetch(`/api/token/${encodeURIComponent(mint)}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.best || null;
    } catch (err) {
      return null;
    }
  }

  function updateWalletUI() {
    const wallet = S.getWallet();
    const el = qs("#walletBalance");
    if (el) el.textContent = `Wallet: $${formatUsd(wallet.cashUsd, 2)}`;
  }

  function initCommonUI() {
    S.migrateIfNeeded();
    const prefs = S.getPrefs();

    // density
    document.body.classList.toggle("dense", prefs.density === "dense");

    const densityBtn = qs("#densityToggle");
    if (densityBtn) {
      densityBtn.textContent = "Density: " + (prefs.density === "dense" ? "Compact" : "Comfortable");
      densityBtn.addEventListener("click", () => {
        const cur = S.getPrefs();
        const next = (cur.density === "dense") ? "comfortable" : "dense";
        S.setPrefs({ density: next });
        document.body.classList.toggle("dense", next === "dense");
        densityBtn.textContent = "Density: " + (next === "dense" ? "Compact" : "Comfortable");
      });
    }

    // metric
    const metricBtn = qs("#metricToggle");
    if (metricBtn) {
      metricBtn.textContent = "Metric: " + (prefs.metric === "price" ? "Price" : "Market Cap");
      metricBtn.addEventListener("click", () => {
        const cur = S.getPrefs();
        const next = (cur.metric === "mcap") ? "price" : "mcap";
        S.setPrefs({ metric: next });
        metricBtn.textContent = "Metric: " + (next === "price" ? "Price" : "Market Cap");
        applyMetricUI();
      });
    }

    updateWalletUI();
  }

  function applyMetricUI() {
    const prefs = S.getPrefs();
    const isMcap = prefs.metric !== "price";
    qsa(".metricBox").forEach((box) => {
      const label = box.querySelector(".metricLabel");
      const value = box.querySelector(".metricMain") || box.querySelector(".metricHero");
      if (!label || !value) return;
      if (isMcap) {
        label.textContent = "Market Cap";
        value.textContent = box.getAttribute("data-mcap") || "$?";
      } else {
        label.textContent = "Price";
        value.textContent = box.getAttribute("data-price") || "$?";
      }
    });
  }

  // Watchlist UI
  function initWatchButtons() {
    qsa(".tile[data-token]").forEach((tile) => {
      const mint = tile.getAttribute("data-token");
      const btn = tile.querySelector(".watchBtn");
      if (!btn) return;

      const setUI = () => {
        const on = S.isWatched(mint);
        btn.textContent = on ? "★" : "☆";
        btn.classList.toggle("on", on);
        tile.classList.toggle("watched", on);
      };

      setUI();
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        S.toggleWatch(mint);
        setUI();
      });
    });
  }

  // Drawer
  function initDrawer() {
    const drawer = qs("#drawer");
    if (!drawer) return;

    const closeBtn = qs("#drawerClose");
    const body = qs("#drawerBody");
    const chart = qs("#drawerChart");
    const tradePanel = qs("#drawerTrade");
    const tradePrice = qs("#drawerPrice");
    const tradeCash = qs("#drawerCash");
    const tradeHoldings = qs("#drawerHoldings");
    const tradeUsd = qs("#drawerUsd");
    const tradeQty = qs("#drawerQty");
    const tradeHint = qs("#drawerHint");
    const buyBtn = qs("#drawerBuy");
    const sellBtn = qs("#drawerSell");
    const title = qs("#drawerTitle");
    const watchBtn = qs("#drawerWatch");
    const copyBtn = qs("#drawerCopy");
    const openLink = qs("#drawerOpen");

    function openDrawer() { drawer.classList.add("open"); }
    function closeDrawer() { drawer.classList.remove("open"); }
    if (closeBtn) closeBtn.addEventListener("click", closeDrawer);

    async function loadToken(mint) {
      body.innerHTML = `<div class="drawerSkeleton"></div><div class="drawerSkeleton"></div><div class="drawerSkeleton"></div>`;
      if (chart) chart.innerHTML = `<div class="drawerSkeleton"></div>`;
      if (tradePanel) tradePanel.setAttribute("data-mint", mint);
      openDrawer();

      const res = await fetch(`/api/token/${encodeURIComponent(mint)}`);
      const data = await res.json();

      const best = data.best;
      title.textContent = best && best.baseToken ? (best.baseToken.symbol + " • " + (best.baseToken.address.slice(0,4) + "…" + best.baseToken.address.slice(-4))) : "Token";

      const pc = (best && best.priceChange) ? best.priceChange : {};
      const h1 = pc.h1, h6 = pc.h6, h24 = pc.h24;

      const mcap = best ? (best.marketCap || best.fdv || 0) : 0;
      const liq = best && best.liquidity ? (best.liquidity.usd || 0) : 0;
      const vol = best && best.volume ? (best.volume.h24 || 0) : 0;

      body.innerHTML = `
        <div class="drawerGrid">
          <div class="drawerRow"><div class="k">Market Cap</div><div class="v">$${best ? best._mcapFmt || "" : ""}</div></div>
          <div class="drawerRow"><div class="k">Liquidity</div><div class="v">$${best ? best._liqFmt || "" : ""}</div></div>
          <div class="drawerRow"><div class="k">Vol 24h</div><div class="v">$${best ? best._volFmt || "" : ""}</div></div>
          <div class="drawerRow"><div class="k">1h / 6h / 24h</div><div class="v">${fmtPct(h1)} • ${fmtPct(h6)} • ${fmtPct(h24)}</div></div>
        </div>
        <div class="drawerSub">Best pair: ${best ? (best.dexId + " • " + best.quoteToken.symbol) : "—"}</div>
      `;

      if (chart) {
        if (best && best.pairAddress) {
          chart.innerHTML = `
            <div class="drawerSectionTitle">Live chart</div>
            <div class="chartFrame">
              <iframe src="https://dexscreener.com/solana/${best.pairAddress}?embed=1&theme=dark&trades=0&info=0" loading="lazy"></iframe>
            </div>
          `;
        } else {
          chart.innerHTML = `<div class="drawerEmpty">Live chart unavailable.</div>`;
        }
      }

      if (tradePanel) {
        const price = Number(best ? best.priceUsd : 0);
        bindTradePanel({
          mint,
          priceUsd: price,
          priceEl: tradePrice,
          cashEl: tradeCash,
          holdingEl: tradeHoldings,
          usdInput: tradeUsd,
          qtyInput: tradeQty,
          hintEl: tradeHint,
          buyBtn,
          sellBtn
        });
      }

      // actions
      if (openLink) openLink.href = `/coin/${mint}`;

      const watched = S.isWatched(mint);
      watchBtn.textContent = watched ? "★ Watched" : "☆ Watch";

      watchBtn.onclick = () => {
        S.toggleWatch(mint);
        const on = S.isWatched(mint);
        watchBtn.textContent = on ? "★ Watched" : "☆ Watch";
        initWatchButtons(); // refresh list icons
      };

      copyBtn.onclick = async () => {
        try {
          await navigator.clipboard.writeText(mint);
          copyBtn.textContent = "Copied";
          setTimeout(() => (copyBtn.textContent = "Copy mint"), 900);
        } catch {
          copyBtn.textContent = "Copy failed";
          setTimeout(() => (copyBtn.textContent = "Copy mint"), 900);
        }
      };
    }

    function fmtPct(x) {
      const v = Number(x);
      if (!isFinite(v)) return "—";
      const sign = v > 0 ? "+" : "";
      return (Math.abs(v) < 10) ? `${sign}${v.toFixed(2)}%` : `${sign}${v.toFixed(1)}%`;
    }

    // Hook tiles: click opens drawer; shift-click navigates as before
    qsa(".tile[data-token]").forEach((tile) => {
      const mint = tile.getAttribute("data-token");
      tile.addEventListener("click", (e) => {
        if (e.shiftKey) {
          const href = tile.getAttribute("data-href");
          if (href) window.location.href = href;
          return;
        }
        if (e.target && e.target.classList && e.target.classList.contains("watchBtn")) return;
        e.preventDefault();
        loadToken(mint);
      });
    });

    // close when clicking outside (optional, safe)
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeDrawer();
    });
  }

  // List page init
  function initListPage(opts) {
    initCommonUI();
    applyMetricUI();
    initWatchButtons();
    initDrawer();
  }

  // Portfolio pages (positions/watchlist) are client-rendered
  function renderSkeletonCards(count) {
    const cards = qs("#cards");
    cards.innerHTML = "";
    for (let i = 0; i < count; i++) {
      const div = document.createElement("div");
      div.className = "tile skeletonTile";
      div.innerHTML = `
        <div class="tileRow">
          <div class="skeletonIcon"></div>
          <div class="skeletonMeta">
            <div class="skeletonLine w60"></div>
            <div class="skeletonLine w40"></div>
            <div class="skeletonLine w80"></div>
          </div>
          <div class="skeletonMetric">
            <div class="skeletonLine w70"></div>
            <div class="skeletonLine w50"></div>
          </div>
        </div>
        <div class="tileStats">
          <div class="stat"><div class="skeletonLine w60"></div></div>
          <div class="stat"><div class="skeletonLine w60"></div></div>
          <div class="stat"><div class="skeletonLine w60"></div></div>
        </div>
      `;
      cards.appendChild(div);
    }
  }

  function compact(n) {
    const v = Number(n);
    if (!isFinite(v)) return "?";
    const a = Math.abs(v);
    if (a >= 1e9) return (v/1e9).toFixed(2).replace(/\.?0+$/,"") + "B";
    if (a >= 1e6) return (v/1e6).toFixed(2).replace(/\.?0+$/,"") + "M";
    if (a >= 1e3) return (v/1e3).toFixed(2).replace(/\.?0+$/,"") + "k";
    if (a >= 1) return String(Math.trunc(v));
    return v.toFixed(7).replace(/\.?0+$/,"");
  }

  function rarityFromLiq(liq) {
    const v = Number(liq || 0);
    if (v >= 10000000) return "legendary";
    if (v >= 1000000) return "epic";
    if (v >= 100000) return "rare";
    return "common";
  }

  function renderClientCard(best, rank, position) {
    const mint = best.baseToken.address;
    const img = (best.info && best.info.imageUrl) ? best.info.imageUrl : "";
    const mcap = best.marketCap || best.fdv || 0;
    const liq = (best.liquidity && best.liquidity.usd) ? best.liquidity.usd : 0;
    const vol = (best.volume && best.volume.h24) ? best.volume.h24 : 0;
    const pc = best.priceChange || {};
    const rarity = best._rarity || rarityFromLiq(liq);
    const verified = !!best._verified;

    // pre-format for drawer
    best._mcapFmt = compact(mcap);
    best._liqFmt = compact(liq);
    best._volFmt = compact(vol);

    const div = document.createElement("div");
    div.className = `tile ${rarity}`;
    div.setAttribute("data-token", mint);
    const holdingStat = position ? `
        <div class="stat"><div class="statLabel">Holdings</div><div class="statValue">${compact(position.qty)}</div></div>
        <div class="stat"><div class="statLabel">Entry</div><div class="statValue">$${compact(position.entryPriceUsd)}</div></div>
      ` : "";

    div.innerHTML = `
      <div class="rankPill">${rank}</div>
      <div class="tileRow">
        <img class="tokenIconXL" src="${img}" alt="${best.baseToken.symbol || ""}"/>
        <div class="tileMeta">
          <div class="symRow">
            <div class="sym">${best.baseToken.symbol || "?"}</div>
            <div class="pairMuted">/ ${best.quoteToken.symbol || "?"}</div>
            ${verified ? `<span class="verifiedBadge">Verified</span>` : ``}
          </div>
          <div class="subRow">
            <div class="dex">${best.dexId || ""}</div>
            <div class="rarityPill ${rarity}">${rarity[0].toUpperCase()+rarity.slice(1)}</div>
          </div>
          <div class="badgeRow">
            <span class="chgBadge">${fmtPct(pc.h1)}</span>
            <span class="chgBadge">${fmtPct(pc.h6)}</span>
            <span class="chgBadge">${fmtPct(pc.h24)}</span>
          </div>
        </div>
        <div class="tileMetric metricBox" data-price="$${compact(best.priceUsd)}" data-mcap="$${compact(mcap)}">
          <div class="metricLabel">Market Cap</div>
          <div class="metricMain">$${compact(mcap)}</div>
          <div class="metricSub">Liq <b>$${compact(liq)}</b> • Vol <b>$${compact(vol)}</b></div>
          <button class="watchBtn" type="button" title="Toggle watchlist">☆</button>
        </div>
      </div>
      <div class="tileStats">
        <div class="stat"><div class="statLabel">Txns 24h</div><div class="statValue">${compact(txns24(best))}</div></div>
        <div class="stat"><div class="statLabel">Buys</div><div class="statValue">${compact(buys24(best))}</div></div>
        <div class="stat"><div class="statLabel">Sells</div><div class="statValue">${compact(sells24(best))}</div></div>
        ${holdingStat}
      </div>
    `;

    // click opens drawer; shift-click open page
    div.addEventListener("click", (e) => {
      if (e.shiftKey) { window.location.href = `/coin/${mint}`; return; }
      if (e.target && e.target.classList && e.target.classList.contains("watchBtn")) return;
      // Use the same drawer loader as list pages: easiest is to just navigate
      // but we want drawer; call fetch + open from scratch:
      openDrawerFromClient(mint);
    });

    // watch
    const btn = div.querySelector(".watchBtn");
    const setUI = () => {
      const on = S.isWatched(mint);
      btn.textContent = on ? "★" : "☆";
      btn.classList.toggle("on", on);
    };
    setUI();
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      S.toggleWatch(mint);
      setUI();
    });

    return div;
  }

  function buys24(p) {
    const t = (p.txns && p.txns.h24) ? p.txns.h24 : {};
    return Number(t.buys || 0);
  }
  function sells24(p) {
    const t = (p.txns && p.txns.h24) ? p.txns.h24 : {};
    return Number(t.sells || 0);
  }
  function txns24(p) {
    return buys24(p) + sells24(p);
  }
  function fmtPct(x) {
    const v = Number(x);
    if (!isFinite(v)) return "—";
    const sign = v > 0 ? "+" : "";
    return (Math.abs(v) < 10) ? `${sign}${v.toFixed(2)}%` : `${sign}${v.toFixed(1)}%`;
  }

  async function openDrawerFromClient(mint) {
    // Minimal: navigate to coin page if drawer not present
    const drawer = qs("#drawer");
    if (!drawer) { window.location.href = `/coin/${mint}`; return; }
    // reuse list-page drawer logic by triggering click on a fabricated tile is messy;
    // simplest: fetch and render here similar to initDrawer().
    const body = qs("#drawerBody");
    const title = qs("#drawerTitle");
    const watchBtn = qs("#drawerWatch");
    const copyBtn = qs("#drawerCopy");
    const openLink = qs("#drawerOpen");
    drawer.classList.add("open");
    body.innerHTML = `<div class="drawerSkeleton"></div><div class="drawerSkeleton"></div><div class="drawerSkeleton"></div>`;

    const res = await fetch(`/api/token/${encodeURIComponent(mint)}`);
    const data = await res.json();
    const best = data.best;
    title.textContent = best && best.baseToken ? best.baseToken.symbol : "Token";

    body.innerHTML = `
      <div class="drawerGrid">
        <div class="drawerRow"><div class="k">Market Cap</div><div class="v">$${compact(best.marketCap || best.fdv || 0)}</div></div>
        <div class="drawerRow"><div class="k">Liquidity</div><div class="v">$${compact(best.liquidity ? best.liquidity.usd : 0)}</div></div>
        <div class="drawerRow"><div class="k">Vol 24h</div><div class="v">$${compact(best.volume ? best.volume.h24 : 0)}</div></div>
      </div>
      <div class="drawerSub">Best pair: ${best.dexId} • ${best.quoteToken.symbol}</div>
    `;

    const chart = qs("#drawerChart");
    if (chart) {
      if (best && best.pairAddress) {
        chart.innerHTML = `
          <div class="drawerSectionTitle">Live chart</div>
          <div class="chartFrame">
            <iframe src="https://dexscreener.com/solana/${best.pairAddress}?embed=1&theme=dark&trades=0&info=0" loading="lazy"></iframe>
          </div>
        `;
      } else {
        chart.innerHTML = `<div class="drawerEmpty">Live chart unavailable.</div>`;
      }
    }

    const tradePanel = qs("#drawerTrade");
    if (tradePanel) {
      bindTradePanel({
        mint,
        priceUsd: Number(best.priceUsd || 0),
        priceEl: qs("#drawerPrice"),
        cashEl: qs("#drawerCash"),
        holdingEl: qs("#drawerHoldings"),
        usdInput: qs("#drawerUsd"),
        qtyInput: qs("#drawerQty"),
        hintEl: qs("#drawerHint"),
        buyBtn: qs("#drawerBuy"),
        sellBtn: qs("#drawerSell")
      });
    }

    if (openLink) openLink.href = `/coin/${mint}`;
    watchBtn.textContent = S.isWatched(mint) ? "★ Watched" : "☆ Watch";
    watchBtn.onclick = () => {
      S.toggleWatch(mint);
      watchBtn.textContent = S.isWatched(mint) ? "★ Watched" : "☆ Watch";
    };
    copyBtn.onclick = async () => {
      await navigator.clipboard.writeText(mint);
      copyBtn.textContent = "Copied";
      setTimeout(() => (copyBtn.textContent = "Copy mint"), 900);
    };

    const closeBtn = qs("#drawerClose");
    if (closeBtn) closeBtn.onclick = () => drawer.classList.remove("open");
  }

  function bindTradePanel({ mint, priceUsd, priceEl, cashEl, holdingEl, usdInput, qtyInput, hintEl, buyBtn, sellBtn }) {
    if (!mint || !usdInput || !qtyInput || !buyBtn || !sellBtn) return;
    let price = Number(priceUsd || 0);
    const setPriceUI = () => {
      if (priceEl) priceEl.textContent = price ? `$${formatUsd(price, 6)}` : "—";
    };
    setPriceUI();
    if (hintEl) {
      hintEl.textContent = "";
      hintEl.classList.remove("error");
    }
    usdInput.value = "";
    qtyInput.value = "";

    async function refreshPrice({ showError = false } = {}) {
      const best = await fetchBestPair(mint);
      const next = best ? Number(best.priceUsd || 0) : 0;
      if (next) {
        price = next;
        setPriceUI();
        syncFromUsd();
        syncFromQty();
        return price;
      }
      if (showError && hintEl) {
        hintEl.textContent = "Live price unavailable. Try again.";
        hintEl.classList.add("error");
      }
      return price;
    }

    function refreshBalances() {
      const wallet = S.getWallet();
      const holding = S.derivePositions().find(p => p.tokenMint === mint);
      if (cashEl) cashEl.textContent = `$${formatUsd(wallet.cashUsd, 2)}`;
      if (holdingEl) holdingEl.textContent = holding ? `${formatUsd(holding.qty, 6)}` : "0";
      updateWalletUI();
    }

    function syncFromUsd() {
      const usd = Number(usdInput.value || 0);
      if (!price || !usd) { qtyInput.value = ""; return; }
      qtyInput.value = (usd / price).toFixed(6).replace(/\.?0+$/,"");
    }

    function syncFromQty() {
      const qty = Number(qtyInput.value || 0);
      if (!price || !qty) { usdInput.value = ""; return; }
      usdInput.value = (qty * price).toFixed(2);
    }

    usdInput.oninput = () => syncFromUsd();
    qtyInput.oninput = () => syncFromQty();

    async function runTrade(side) {
      const qty = Number(qtyInput.value || 0);
      if (!qty) {
        if (hintEl) {
          hintEl.textContent = "Enter a trade amount.";
          hintEl.classList.add("error");
        }
        return;
      }
      await refreshPrice({ showError: true });
      if (!price) return;
      const res = S.executeTrade({ tokenMint: mint, side, qty, priceUsd: price });
      if (!res.ok) {
        if (hintEl) {
          hintEl.textContent = res.error || "Trade failed.";
          hintEl.classList.add("error");
        }
        return;
      }
      if (hintEl) {
        hintEl.textContent = `${side} filled at $${formatUsd(price, 6)}.`;
        hintEl.classList.remove("error");
      }
      usdInput.value = "";
      qtyInput.value = "";
      refreshBalances();
      initWatchButtons();
    }

    buyBtn.onclick = () => runTrade("BUY");
    sellBtn.onclick = () => runTrade("SELL");
    refreshBalances();
    refreshPrice();
  }

  function initCoinPage() {
    initCommonUI();
    applyMetricUI();

    const tradePanel = qs("#coinTrade");
    if (tradePanel) {
      const mint = tradePanel.getAttribute("data-mint");
      const price = Number(tradePanel.getAttribute("data-price") || 0);
      bindTradePanel({
        mint,
        priceUsd: price,
        priceEl: tradePanel.querySelector("[data-trade='price']"),
        cashEl: tradePanel.querySelector("[data-trade='cash']"),
        holdingEl: tradePanel.querySelector("[data-trade='holdings']"),
        usdInput: tradePanel.querySelector("[data-trade='usd']"),
        qtyInput: tradePanel.querySelector("[data-trade='qty']"),
        hintEl: tradePanel.querySelector("[data-trade='hint']"),
        buyBtn: tradePanel.querySelector("[data-trade='buy']"),
        sellBtn: tradePanel.querySelector("[data-trade='sell']")
      });
    }
  }

  async function initPortfolioPage({ activeTab }) {
    initCommonUI();

    const emptyState = qs("#emptyState");
    const emptySub = qs("#emptySub");
    const cards = qs("#cards");

    function setEmpty(msg) {
      cards.innerHTML = "";
      emptySub.textContent = msg;
      emptyState.style.display = "block";
    }

    function getTokenList() {
      if (activeTab === "watchlist") return S.getWatchlist();
      const positions = S.derivePositions();
      return positions.map(p => p.tokenMint);
    }

    function bindButtons() {
      const seedDemo = qs("#seedDemo");
      const clearTrades = qs("#clearTrades");
      const clearWatch = qs("#clearWatch");

      if (seedDemo) seedDemo.addEventListener("click", () => {
        // Seed demo buys
        S.executeTrade({ tokenMint: "So11111111111111111111111111111111111111112", side: "BUY", qty: 1.2, priceUsd: 200 });
        S.executeTrade({ tokenMint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", side: "BUY", qty: 800000, priceUsd: 0.00001 });
        load();
      });

      if (clearTrades) clearTrades.addEventListener("click", () => {
        S.clearTrades();
        load();
      });

      if (clearWatch) clearWatch.addEventListener("click", () => {
        S.setWatchlist([]);
        load();
      });
    }

    async function load() {
      bindButtons();
      const tokens = getTokenList();

      if (!tokens.length) {
        if (activeTab === "watchlist") setEmpty("Star tokens anywhere to add them to Watchlist.");
        else setEmpty("No open positions yet. Buy from any token to start tracking.");
        return;
      }

      emptyState.style.display = "none";
      renderSkeletonCards(Math.min(8, tokens.length));

      const qs = tokens.map(t => "tokens=" + encodeURIComponent(t)).join("&");
      const res = await fetch("/api/best_pairs?" + qs);
      const bests = await res.json();

      const positionMap = new Map();
      if (activeTab === "positions") {
        S.derivePositions().forEach((p) => positionMap.set(p.tokenMint, p));
      }

      // rank & render
      cards.innerHTML = "";
      bests.forEach((b, i) => cards.appendChild(renderClientCard(b, i + 1, positionMap.get(b.baseToken.address))));

      applyMetricUI();
    }

    await load();
    window.addEventListener("tokenUniverse:trade", async () => {
      if (activeTab !== "positions") return;
      await load();
    });
  }

  return {
    initCommonUI,
    applyMetricUI,
    initListPage,
    initPortfolioPage,
    initCoinPage
  };
})();
