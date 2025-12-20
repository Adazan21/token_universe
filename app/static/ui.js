window.TokenUniverseUI = (function () {
  const S = window.TokenUniverseState;
  let drawerLiveStop = null;
  let coinLiveStop = null;

  function qs(name) { return document.querySelector(name); }
  function qsa(name) { return Array.from(document.querySelectorAll(name)); }

  function formatUsd(value, digits = 2) {
    const v = Number(value || 0);
    return v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  function formatPct(value) {
    const v = Number(value);
    if (!isFinite(v)) return "—";
    const sign = v > 0 ? "+" : "";
    return `${sign}${v.toFixed(2)}%`;
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

  function getQuickPercents() {
    const prefs = S.getPrefs();
    const defaults = [5, 10, 50, 100];
    if (!prefs || !Array.isArray(prefs.quickPercents)) return defaults;
    const clean = prefs.quickPercents.map((v, i) => Number(v || defaults[i]));
    return clean.map((v, i) => (v > 0 ? Math.min(v, 100) : defaults[i]));
  }

  function setQuickPercents(values) {
    const next = values.map((v) => Math.max(1, Math.min(100, Number(v || 0))));
    S.setPrefs({ quickPercents: next });
    return next;
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
      if (drawerLiveStop) drawerLiveStop();

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
        const tradeApi = bindTradePanel({
          mint,
          priceUsd: price,
          priceEl: tradePrice,
          cashEl: tradeCash,
          holdingEl: tradeHoldings,
          pnlEl: qs("#drawerPnl"),
          valueEl: qs("#drawerValue"),
          usdInput: tradeUsd,
          qtyInput: tradeQty,
          hintEl: tradeHint,
          buyBtn,
          sellBtn,
          quickWrap: tradePanel.querySelector("[data-trade='quick']"),
          quickSettings: tradePanel.querySelector("[data-trade='quick-settings']")
        });

        drawerLiveStop = startLivePriceFeed({
          mint,
          onUpdate: ({ priceUsd }) => {
            if (tradeApi) tradeApi.setPrice(priceUsd);
          }
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

  function renderClientCard(best, rank) {
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
      const tradeApi = bindTradePanel({
        mint,
        priceUsd: Number(best.priceUsd || 0),
        priceEl: qs("#drawerPrice"),
        cashEl: qs("#drawerCash"),
        holdingEl: qs("#drawerHoldings"),
        pnlEl: qs("#drawerPnl"),
        valueEl: qs("#drawerValue"),
        usdInput: qs("#drawerUsd"),
        qtyInput: qs("#drawerQty"),
        hintEl: qs("#drawerHint"),
        buyBtn: qs("#drawerBuy"),
        sellBtn: qs("#drawerSell"),
        quickWrap: tradePanel.querySelector("[data-trade='quick']"),
        quickSettings: tradePanel.querySelector("[data-trade='quick-settings']")
      });
      if (drawerLiveStop) drawerLiveStop();
      drawerLiveStop = startLivePriceFeed({
        mint,
        onUpdate: ({ priceUsd }) => {
          if (tradeApi) tradeApi.setPrice(priceUsd);
        }
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

  function bindTradePanel({
    mint,
    priceUsd,
    priceEl,
    cashEl,
    holdingEl,
    pnlEl,
    valueEl,
    usdInput,
    qtyInput,
    hintEl,
    buyBtn,
    sellBtn,
    quickWrap,
    quickSettings
  }) {
    if (!mint || !usdInput || !qtyInput || !buyBtn || !sellBtn) return;
    let price = Number(priceUsd || 0);
    let lastInput = "usd";
    let tradeMode = "buy";
    let setTradeMode = () => {};
    if (priceEl) priceEl.textContent = price ? `$${formatUsd(price, 6)}` : "—";
    if (hintEl) {
      hintEl.textContent = "";
      hintEl.classList.remove("error");
    }
    usdInput.value = "";
    qtyInput.value = "";

    function refreshBalances() {
      const wallet = S.getWallet();
      const holding = S.derivePositions().find(p => p.tokenMint === mint);
      if (cashEl) cashEl.textContent = `$${formatUsd(wallet.cashUsd, 2)}`;
      if (holdingEl) holdingEl.textContent = holding ? `${formatUsd(holding.qty, 6)}` : "0";
      updatePositionStats();
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

    usdInput.oninput = () => { lastInput = "usd"; syncFromUsd(); };
    qtyInput.oninput = () => { lastInput = "qty"; syncFromQty(); };

    function runTrade(side) {
      const qty = Number(qtyInput.value || 0);
      if (!price || !qty) {
        if (hintEl) {
          hintEl.textContent = "Enter a trade amount.";
          hintEl.classList.add("error");
        }
        return;
      }
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

    buyBtn.onclick = () => {
      setTradeMode("buy");
      runTrade("BUY");
    };
    sellBtn.onclick = () => {
      setTradeMode("sell");
      runTrade("SELL");
    };
    refreshBalances();

    function updatePositionStats() {
      if (!pnlEl && !valueEl) return;
      const holding = S.derivePositions().find(p => p.tokenMint === mint);
      if (!holding || !price) {
        if (pnlEl) pnlEl.textContent = "—";
        if (valueEl) valueEl.textContent = "$0.00";
        return;
      }
      const value = holding.qty * price;
      const cost = holding.entryPriceUsd * holding.qty;
      const pnlUsd = value - cost;
      const pnlPct = holding.entryPriceUsd ? ((price / holding.entryPriceUsd) - 1) * 100 : 0;
      if (pnlEl) pnlEl.textContent = `${formatPct(pnlPct)} ($${formatUsd(pnlUsd, 2)})`;
      if (valueEl) valueEl.textContent = `$${formatUsd(value, 2)}`;
    }

    function setPrice(nextPrice) {
      const next = Number(nextPrice || 0);
      price = next;
      if (priceEl) priceEl.textContent = price ? `$${formatUsd(price, 6)}` : "—";
      if (lastInput === "usd") syncFromUsd();
      if (lastInput === "qty") syncFromQty();
      updatePositionStats();
    }

    function initQuickUI() {
      if (!quickWrap || !quickSettings) return;
      const buyButtons = Array.from(quickWrap.querySelectorAll("[data-quick-side='buy'] [data-quick-index]"));
      const sellButtons = Array.from(quickWrap.querySelectorAll("[data-quick-side='sell'] [data-quick-index]"));
      const settingsBtn = quickWrap.querySelector("[data-quick-settings]");
      const inputs = Array.from(quickSettings.querySelectorAll("[data-quick-input]"));
      const saveBtn = quickSettings.querySelector("[data-quick-save]");
      const modeButtons = Array.from(quickWrap.closest(".tradeGrid")?.querySelectorAll("[data-trade='mode']") || []);
      const actionBlocks = Array.from(quickWrap.querySelectorAll("[data-action]"));

      setTradeMode = (nextMode) => {
        tradeMode = nextMode;
        actionBlocks.forEach((block) => {
          const isMatch = block.getAttribute("data-action") === tradeMode;
          block.classList.toggle("is-hidden", !isMatch);
        });
        modeButtons.forEach((btn) => {
          btn.classList.toggle("is-active", btn.getAttribute("data-mode") === tradeMode);
        });
        if (tradeMode !== "buy") {
          quickSettings.classList.remove("open");
          quickSettings.classList.add("is-hidden");
        } else {
          quickSettings.classList.remove("is-hidden");
        }
      };

      function renderButtons() {
        const percents = getQuickPercents();
        buyButtons.forEach((btn, idx) => {
          const value = percents[idx] ?? 0;
          btn.textContent = (idx === 3 && Math.round(value) >= 100) ? "Max" : `${value}%`;
        });
        sellButtons.forEach((btn, idx) => {
          const value = percents[idx] ?? 0;
          btn.textContent = (idx === 3 && Math.round(value) >= 100) ? "Max" : `${value}%`;
        });
        inputs.forEach((input, idx) => {
          const value = percents[idx] ?? 0;
          input.value = value;
        });
      }

      function applyPercent(pct, side) {
        if (!price) return;
        const wallet = S.getWallet();
        const holding = S.derivePositions().find(p => p.tokenMint === mint);
        const useHoldings = side === "sell" && holding && holding.qty > 0;
        if (useHoldings) {
          const qty = holding.qty * (pct / 100);
          qtyInput.value = qty ? qty.toFixed(6).replace(/\.?0+$/,"") : "";
          lastInput = "qty";
          syncFromQty();
        } else {
          const usd = wallet.cashUsd * (pct / 100);
          usdInput.value = usd ? usd.toFixed(2) : "";
          lastInput = "usd";
          syncFromUsd();
        }
      }

      buyButtons.forEach((btn, idx) => {
        btn.addEventListener("click", () => {
          const percents = getQuickPercents();
          const pct = Number(percents[idx] || 0);
          applyPercent(pct, "buy");
        });
      });
      sellButtons.forEach((btn, idx) => {
        btn.addEventListener("click", () => {
          const percents = getQuickPercents();
          const pct = Number(percents[idx] || 0);
          applyPercent(pct, "sell");
        });
      });

      modeButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          const mode = btn.getAttribute("data-mode") || "buy";
          setTradeMode(mode);
        });
      });

      if (settingsBtn) {
        settingsBtn.addEventListener("click", () => {
          quickSettings.classList.toggle("open");
          if (quickSettings.classList.contains("open")) renderButtons();
        });
      }

      if (saveBtn) {
        saveBtn.addEventListener("click", () => {
          const next = inputs.map((input) => Number(input.value || 0));
          setQuickPercents(next);
          renderButtons();
          quickSettings.classList.remove("open");
        });
      }

      renderButtons();
      setTradeMode("buy");
    }

    initQuickUI();

    return { setPrice, refreshBalances };
  }

  function initCoinPage() {
    initCommonUI();
    applyMetricUI();

    const tradePanel = qs("#coinTrade");
    if (tradePanel) {
      const mint = tradePanel.getAttribute("data-mint");
      const price = Number(tradePanel.getAttribute("data-price") || 0);
      const tradeApi = bindTradePanel({
        mint,
        priceUsd: price,
        priceEl: tradePanel.querySelector("[data-trade='price']"),
        cashEl: tradePanel.querySelector("[data-trade='cash']"),
        holdingEl: tradePanel.querySelector("[data-trade='holdings']"),
        pnlEl: tradePanel.querySelector("[data-trade='pnl']"),
        valueEl: tradePanel.querySelector("[data-trade='value']"),
        usdInput: tradePanel.querySelector("[data-trade='usd']"),
        qtyInput: tradePanel.querySelector("[data-trade='qty']"),
        hintEl: tradePanel.querySelector("[data-trade='hint']"),
        buyBtn: tradePanel.querySelector("[data-trade='buy']"),
        sellBtn: tradePanel.querySelector("[data-trade='sell']"),
        quickWrap: tradePanel.querySelector("[data-trade='quick']"),
        quickSettings: tradePanel.querySelector("[data-trade='quick-settings']")
      });

      const statPrice = qs("[data-live='price']");
      const statUpdated = qs("[data-live='price-updated']");
      const metricBox = qs(".metricBox");
      const priceMetric = metricBox ? metricBox.getAttribute("data-price") : null;
      let lastPrice = Number.isFinite(price) ? price : null;

      if (coinLiveStop) coinLiveStop();
      coinLiveStop = startLivePriceFeed({
        mint,
        intervalMs: 1000, // keep coin view price ticking without manual refresh
        onUpdate: ({ priceUsd, best }) => {
          if (!best) return;
          if (tradeApi) tradeApi.setPrice(priceUsd);
          tradePanel.setAttribute("data-price", String(priceUsd));
          if (statPrice) statPrice.textContent = `$${compact(priceUsd)}`;
          if (statUpdated && priceUsd !== lastPrice) {
            const stamp = new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
            statUpdated.textContent = `Updated: ${stamp}`;
            lastPrice = priceUsd;
          }
          if (metricBox) {
            metricBox.setAttribute("data-price", `$${compact(priceUsd)}`);
            const prefs = S.getPrefs();
            if (prefs.metric === "price") applyMetricUI();
          }
          if (priceMetric && priceMetric !== metricBox.getAttribute("data-price")) {
            metricBox.setAttribute("data-price", `$${compact(priceUsd)}`);
          }
        }
      });

      window.addEventListener("pagehide", () => {
        if (coinLiveStop) coinLiveStop(); // cleanup polling when leaving coin page
        coinLiveStop = null;
      }, { once: true });
    }
  }

  function startLivePriceFeed({ mint, onUpdate, intervalMs = 5000 }) {
    if (!mint) return null;
    let active = true;
    let timer = null;
    const run = async () => {
      if (!active) return;
      try {
        const res = await fetch(`/api/token/${encodeURIComponent(mint)}`);
        const data = await res.json();
        const best = data.best;
        const priceUsd = Number(best ? best.priceUsd : 0);
        if (onUpdate) onUpdate({ priceUsd, best });
      } catch {
        // ignore transient failures
      }
      if (active) timer = setTimeout(run, intervalMs);
    };
    run();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
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
        else setEmpty("No open positions yet. Buying UI comes next.");
        return;
      }

      emptyState.style.display = "none";
      renderSkeletonCards(Math.min(8, tokens.length));

      const qs = tokens.map(t => "tokens=" + encodeURIComponent(t)).join("&");
      const res = await fetch("/api/best_pairs?" + qs);
      const bests = await res.json();

      // rank & render
      cards.innerHTML = "";
      bests.forEach((b, i) => cards.appendChild(renderClientCard(b, i + 1)));

      applyMetricUI();
    }

    await load();
  }

  return {
    initCommonUI,
    applyMetricUI,
    initListPage,
    initPortfolioPage,
    initCoinPage
  };
})();
