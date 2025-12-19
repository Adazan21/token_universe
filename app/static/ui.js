window.TokenUniverseUI = (function () {
  const S = window.TokenUniverseState;

  function qs(name) { return document.querySelector(name); }
  function qsa(name) { return Array.from(document.querySelectorAll(name)); }

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
    const title = qs("#drawerTitle");
    const watchBtn = qs("#drawerWatch");
    const copyBtn = qs("#drawerCopy");
    const openLink = qs("#drawerOpen");

    function openDrawer() { drawer.classList.add("open"); }
    function closeDrawer() { drawer.classList.remove("open"); }
    if (closeBtn) closeBtn.addEventListener("click", closeDrawer);

    async function loadToken(mint) {
      body.innerHTML = `<div class="drawerSkeleton"></div><div class="drawerSkeleton"></div><div class="drawerSkeleton"></div>`;
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
        if (e.shiftKey) return; // allow normal nav if they want it
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

    const drawer = qs("#drawer");
    if (!drawer) {
      qsa(".tile[data-href]").forEach((tile) => {
        tile.addEventListener("click", (e) => {
          if (e.target && e.target.classList && e.target.classList.contains("watchBtn")) return;
          const href = tile.getAttribute("data-href");
          if (href) window.location.href = href;
        });
      });
    }
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

  function formatQty(n) {
    const v = Number(n);
    if (!isFinite(v)) return "?";
    if (Math.abs(v) >= 1) return compact(v);
    return v.toFixed(6).replace(/\.?0+$/,"");
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
    const priceUsd = Number(best.priceUsd || 0);

    // pre-format for drawer
    best._mcapFmt = compact(mcap);
    best._liqFmt = compact(liq);
    best._volFmt = compact(vol);

    const div = document.createElement("div");
    div.className = `tile ${rarity}`;
    div.setAttribute("data-token", mint);
    div.setAttribute("data-href", `/coin/${mint}`);
    div.innerHTML = `
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
          <div class="metricTop">
            <div>
              <div class="metricLabel">Market Cap</div>
              <div class="metricMain">$${compact(mcap)}</div>
            </div>
            <div class="sparkWrap ${Number(pc.h24) > 0 ? "pos" : (Number(pc.h24) < 0 ? "neg" : "flat")}">
              ${sparklineSvg(pc)}
            </div>
          </div>
          <div class="metricSub">Liq <b>$${compact(liq)}</b> • Vol <b>$${compact(vol)}</b></div>
          ${position ? `
          <div class="metricSub positionSub">Holding <b>${formatQty(position.qty)}</b> @ <b>$${compact(position.entryPriceUsd)}</b> • Value <b>$${compact(position.qty * priceUsd)}</b></div>
          ` : ``}
          <button class="watchBtn" type="button" title="Toggle watchlist">☆</button>
        </div>
      </div>
      <div class="tileStats">
        <div class="stat"><div class="statLabel">Txns 24h</div><div class="statValue">${compact(txns24(best))}</div></div>
        <div class="stat"><div class="statLabel">Buys</div><div class="statValue">${compact(buys24(best))}</div></div>
        <div class="stat"><div class="statLabel">Sells</div><div class="statValue">${compact(sells24(best))}</div></div>
      </div>
    `;

    // click opens drawer if available; otherwise navigate
    div.addEventListener("click", (e) => {
      if (e.target && e.target.classList && e.target.classList.contains("watchBtn")) return;
      if (e.shiftKey) { window.location.href = `/coin/${mint}`; return; }
      const drawer = qs("#drawer");
      if (!drawer) {
        window.location.href = `/coin/${mint}`;
        return;
      }
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

  function sparklineSvg(priceChange) {
    const pc = priceChange || {};
    const toNum = (val) => {
      const v = Number(val);
      return isFinite(v) ? v : null;
    };
    const h24 = toNum(pc.h24);
    const h6 = toNum(pc.h6);
    const h1 = toNum(pc.h1);
    let pts;
    if (h24 === null && h6 === null && h1 === null) {
      pts = [[0, 0], [24, 0]];
    } else {
      const v0 = h24 !== null ? -h24 : 0;
      const v18 = h6 !== null ? -h6 : 0;
      const v23 = h1 !== null ? -h1 : v18;
      pts = [[0, v0], [18, v18], [23, v23], [24, 0]];
    }

    const xs = pts.map(p => p[0]);
    const ys = pts.map(p => p[1]);
    let minY = Math.min(...ys);
    let maxY = Math.max(...ys);
    if (Math.abs(maxY - minY) < 1e-6) {
      minY -= 1;
      maxY += 1;
    }
    const width = 150;
    const height = 44;
    const pad = 4;
    const sx = (x) => pad + (x - Math.min(...xs)) * (width - pad * 2) / (Math.max(...xs) - Math.min(...xs));
    const sy = (y) => pad + (maxY - y) * (height - pad * 2) / (maxY - minY);
    const poly = pts.map(([x, y]) => `${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(" ");
    const baseline = sy(0).toFixed(1);

    return `
      <svg class="spark" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <line x1="${pad}" y1="${baseline}" x2="${width - pad}" y2="${baseline}" stroke="currentColor" stroke-opacity="0.18" stroke-width="1"/>
        <polyline points="${poly}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
        <circle cx="${sx(pts[pts.length - 1][0]).toFixed(1)}" cy="${sy(pts[pts.length - 1][1]).toFixed(1)}" r="2.4" fill="currentColor"/>
      </svg>
    `;
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
        S.addTrade({ tokenMint: "So11111111111111111111111111111111111111112", side: "BUY", qty: 1.2, priceUsd: 200 });
        S.addTrade({ tokenMint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", side: "BUY", qty: 800000, priceUsd: 0.00001 });
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
        else setEmpty("No open positions yet. Buy from any coin page to start tracking.");
        return;
      }

      emptyState.style.display = "none";
      renderSkeletonCards(Math.min(8, tokens.length));

      const qs = tokens.map(t => "tokens=" + encodeURIComponent(t)).join("&");
      const res = await fetch("/api/best_pairs?" + qs);
      const bests = await res.json();

      const positions = S.derivePositions();
      const posMap = new Map(positions.map(p => [p.tokenMint, p]));

      // rank & render
      cards.innerHTML = "";
      bests.forEach((b, i) => cards.appendChild(renderClientCard(b, i + 1, posMap.get(b.baseToken.address))));

      applyMetricUI();
    }

    await load();
  }

  return {
    initCommonUI,
    applyMetricUI,
    initListPage,
    initPortfolioPage
  };
})();
