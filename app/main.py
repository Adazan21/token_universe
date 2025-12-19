import asyncio
from fastapi import FastAPI, Request, Query
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from urllib.parse import quote
from markupsafe import Markup
import json
import os
import time

from app.services.dexscreener import (
    search_pairs,
    fetch_token_pairs,
    solana_pairs_only,
    pick_best_pair_by_liquidity_usd,
)
from app.services.token_security import fetch_mint_security

from app.services.dexscreener_discovery import (
    fetch_latest_token_profiles,
    fetch_top_boosted_tokens,
    fetch_pairs_for_tokens,
)

from app.services.risk import compute_risk
from app.services.ttl_cache import cache

app = FastAPI()
app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")

# -------------------------
# App config
# -------------------------

QUOTE_DEFAULT = ["USDC", "USDT", "SOL"]
CACHE_TTL_LIST = 20         # seconds
CACHE_TTL_TOKEN = 20        # seconds
CACHE_TTL_SEARCH = 15       # seconds

VERIFIED_JSON_PATH = os.path.join("app", "data", "verified_tokens.json")

def load_verified_tokens() -> dict[str, str]:
    try:
        with open(VERIFIED_JSON_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            return {str(k).upper(): str(v) for k, v in data.items()}
    except Exception:
        pass
    return {}

VERIFIED_TOKENS = load_verified_tokens()
VERIFIED_MINTS = set(VERIFIED_TOKENS.values())

# -------------------------
# Formatting helpers
# -------------------------

def format_compact(value):
    try:
        n = float(value)
    except Exception:
        return "?"
    a = abs(n)
    if a >= 1_000_000_000:
        s = f"{n/1_000_000_000:.2f}B"
    elif a >= 1_000_000:
        s = f"{n/1_000_000:.2f}M"
    elif a >= 1_000:
        s = f"{n/1_000:.2f}k"
    elif a >= 1:
        s = f"{int(n)}"
    else:
        s = f"{n:.7f}"
    return s.rstrip("0").rstrip(".")

def age_from_ms(ms) -> str:
    try:
        ms = int(ms)
        if ms <= 0:
            return "?"
    except Exception:
        return "?"
    now_ms = int(time.time() * 1000)
    sec = max(0, (now_ms - ms) // 1000)
    if sec < 60:
        return f"{sec}s"
    m = sec // 60
    if m < 60:
        return f"{m}m"
    h = m // 60
    if h < 48:
        return f"{h}h"
    d = h // 24
    if d < 14:
        return f"{d}d"
    w = d // 7
    if w < 9:
        return f"{w}w"
    mo = d // 30
    if mo < 24:
        return f"{mo}mo"
    y = d // 365
    return f"{y}y"

def pct_fmt(v) -> str:
    try:
        x = float(v)
    except Exception:
        return "—"
    sign = "+" if x > 0 else ""
    return f"{sign}{x:.2f}%" if abs(x) < 10 else f"{sign}{x:.1f}%"

def pct_class(v) -> str:
    try:
        x = float(v)
    except Exception:
        return "flat"
    if x > 0.0001:
        return "pos"
    if x < -0.0001:
        return "neg"
    return "flat"

def _hash_to_colors(s: str) -> tuple[str, str]:
    h = 2166136261
    for ch in s.encode("utf-8"):
        h ^= ch
        h = (h * 16777619) & 0xFFFFFFFF
    a = h & 0xFFFF
    b = (h >> 16) & 0xFFFF

    def hue_to_hex(hue16: int, sat: float, val: float) -> str:
        hue = (hue16 / 65535.0) * 360.0
        c = val * sat
        x = c * (1 - abs(((hue / 60.0) % 2) - 1))
        m = val - c
        if 0 <= hue < 60:
            r, g, bl = c, x, 0
        elif 60 <= hue < 120:
            r, g, bl = x, c, 0
        elif 120 <= hue < 180:
            r, g, bl = 0, c, x
        elif 180 <= hue < 240:
            r, g, bl = 0, x, c
        elif 240 <= hue < 300:
            r, g, bl = x, 0, c
        else:
            r, g, bl = c, 0, x
        r = int((r + m) * 255)
        g = int((g + m) * 255)
        bl = int((bl + m) * 255)
        return f"#{r:02x}{g:02x}{bl:02x}"
    return hue_to_hex(a, 0.85, 0.95), hue_to_hex(b, 0.85, 0.95)

def token_avatar_data_uri(address: str) -> str:
    addr = (address or "").strip() or "unknown"
    c1, c2 = _hash_to_colors(addr)
    svg = f"""
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <defs>
        <radialGradient id="g" cx="30%" cy="25%" r="80%">
          <stop offset="0%" stop-color="{c1}"/>
          <stop offset="70%" stop-color="{c2}"/>
          <stop offset="100%" stop-color="#0b1020"/>
        </radialGradient>
        <radialGradient id="shine" cx="30%" cy="25%" r="50%">
          <stop offset="0%" stop-color="white" stop-opacity="0.65"/>
          <stop offset="100%" stop-color="white" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="26" fill="url(#g)"/>
      <circle cx="24" cy="22" r="14" fill="url(#shine)"/>
      <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="2"/>
    </svg>
    """.strip()
    return "data:image/svg+xml;utf8," + quote(svg)

def sparkline_svg(price_change: dict | None, width: int = 190, height: int = 56, pad: int = 6) -> Markup:
    pc = price_change or {}
    def f(key):
        try:
            return float(pc.get(key))
        except Exception:
            return None
    h24 = f("h24")
    h6 = f("h6")
    h1 = f("h1")

    if h24 is None and h6 is None and h1 is None:
        pts = [(0, 0.0), (24, 0.0)]
    else:
        v0 = -h24 if h24 is not None else 0.0
        v18 = -h6 if h6 is not None else 0.0
        v23 = -h1 if h1 is not None else v18
        pts = [(0, v0), (18, v18), (23, v23), (24, 0.0)]

    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    min_y, max_y = min(ys), max(ys)
    if abs(max_y - min_y) < 1e-9:
        min_y -= 1
        max_y += 1

    def sx(x): return pad + (x - min(xs)) * (width - 2 * pad) / (max(xs) - min(xs))
    def sy(y): return pad + (max_y - y) * (height - 2 * pad) / (max_y - min_y)
    poly = " ".join(f"{sx(x):.1f},{sy(y):.1f}" for x, y in pts)
    baseline_y = sy(0.0)

    svg = f"""
    <svg class="spark" width="{width}" height="{height}" viewBox="0 0 {width} {height}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <line x1="{pad}" y1="{baseline_y:.1f}" x2="{width - pad}" y2="{baseline_y:.1f}" stroke="currentColor" stroke-opacity="0.18" stroke-width="1"/>
      <polyline points="{poly}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="{sx(pts[-1][0]):.1f}" cy="{sy(pts[-1][1]):.1f}" r="2.8" fill="currentColor"/>
    </svg>
    """.strip()
    return Markup(svg)

templates.env.filters["compact"] = format_compact
templates.env.filters["avatar"] = token_avatar_data_uri
templates.env.filters["age"] = age_from_ms
templates.env.filters["pct"] = pct_fmt
templates.env.filters["pctclass"] = pct_class
templates.env.filters["spark"] = sparkline_svg

# -------------------------
# Pair selection + rarity + verified
# -------------------------

def _liq_usd(p: dict) -> float:
    try:
        return float(((p.get("liquidity") or {}).get("usd") or 0))
    except Exception:
        return 0.0

def _mcap(p: dict) -> float:
    try:
        return float(p.get("marketCap") or p.get("fdv") or 0)
    except Exception:
        return 0.0

def _vol24(p: dict) -> float:
    try:
        return float(((p.get("volume") or {}).get("h24") or 0))
    except Exception:
        return 0.0

def _txns24(p: dict) -> float:
    try:
        t = (p.get("txns") or {}).get("h24") or {}
        return float((t.get("buys") or 0) + (t.get("sells") or 0))
    except Exception:
        return 0.0

def _age_ms(p: dict) -> int:
    try:
        return int(p.get("pairCreatedAt") or 0)
    except Exception:
        return 0

def _h24(p: dict) -> float:
    try:
        return float(((p.get("priceChange") or {}).get("h24") or 0))
    except Exception:
        return 0.0


def _txns_sum(p: dict) -> float:
    try:
        t = (p.get("txns") or {}).get("h24") or {}
        return float((t.get("buys") or 0) + (t.get("sells") or 0))
    except Exception:
        return 0.0


def _liq_locked(p: dict) -> bool | None:
    liq = p.get("liquidity") or {}
    if not isinstance(liq, dict):
        return None
    if "locked" in liq:
        return bool(liq.get("locked"))
    if "isLocked" in liq:
        return bool(liq.get("isLocked"))
    status = liq.get("lockStatus") or liq.get("status")
    if isinstance(status, str):
        s = status.lower()
        if s in ("locked", "lockedliquidity", "locked_liquidity"):
            return True
        if s in ("unlocked", "notlocked"):
            return False
    return None


async def _security_map(base_mints: list[str]) -> dict[str, dict]:
    unique: list[str] = []
    seen = set()
    for m in base_mints:
        if not m or m in seen:
            continue
        seen.add(m)
        unique.append(m)
    results = await asyncio.gather(*(fetch_mint_security(m) for m in unique))
    return {m: r for m, r in zip(unique, results)}


async def annotate_pairs_with_risk(pairs: list[dict]) -> list[dict]:
    if not pairs:
        return []

    base_mints = [(p.get("baseToken") or {}).get("address") for p in pairs]
    sec_map = await _security_map(base_mints)

    enriched: list[dict] = []
    for p in pairs:
        base = (p.get("baseToken") or {}).get("address")
        sec = sec_map.get(base, {})

        is_mintable = bool(sec.get("is_mintable"))
        is_freezable = bool(sec.get("is_freezable"))
        liq_locked = _liq_locked(p)

        # Blacklist mintable or freezable tokens
        if is_mintable or is_freezable:
            continue

        p["_isMintable"] = is_mintable
        p["_isFreezable"] = is_freezable
        p["_liquidityLocked"] = liq_locked
        p["_mintAuthority"] = sec.get("mintAuthority")
        p["_freezeAuthority"] = sec.get("freezeAuthority")

        risk_input = {
            "liquidityUsd": _liq_usd(p),
            "volume24h": _vol24(p),
            "txns24h": _txns_sum(p),
            "pairCreatedAt": _age_ms(p),
            "priceChange24h": (p.get("priceChange") or {}).get("h24"),
        }
        risk_score, risk_label = compute_risk(
            risk_input,
            is_verified=p.get("_verified", False),
            is_mintable=is_mintable,
            is_freezable=is_freezable,
            liq_locked=liq_locked,
        )
        p["_riskScore"] = risk_score
        p["_riskLabel"] = risk_label
        p["_riskClass"] = risk_label.lower()
        enriched.append(p)

    return enriched

def rarity_from_liq(liq_usd: float) -> str:
    if liq_usd >= 10_000_000: return "legendary"
    if liq_usd >= 1_000_000:  return "epic"
    if liq_usd >= 100_000:    return "rare"
    return "common"

def decorate_pair(p: dict) -> dict:
    liq = _liq_usd(p)
    base = (p.get("baseToken") or {}).get("address") or ""
    p["_liqUsd"] = liq
    p["_rarity"] = rarity_from_liq(liq)
    p["_verified"] = (base in VERIFIED_MINTS)
    return p

def quote_ranker(quote_pref: list[str]):
    pref = [x.upper() for x in quote_pref]
    def _rank(p: dict) -> int:
        sym = ((p.get("quoteToken") or {}).get("symbol") or "").upper()
        try:
            return pref.index(sym)
        except ValueError:
            return 999
    return _rank

def dedupe_best_pair_per_token(pairs: list[dict], quote_pref: list[str], limit: int = 36) -> list[dict]:
    rank = quote_ranker(quote_pref)
    best_by_token: dict[str, dict] = {}

    for p in pairs:
        base = (p.get("baseToken") or {}).get("address")
        if not base:
            continue
        p = decorate_pair(p)
        existing = best_by_token.get(base)
        if not existing:
            best_by_token[base] = p
            continue
        liq_new = _liq_usd(p)
        liq_old = _liq_usd(existing)
        if liq_new > liq_old:
            best_by_token[base] = p
        elif liq_new == liq_old and rank(p) < rank(existing):
            best_by_token[base] = p

    result = list(best_by_token.values())
    result.sort(key=lambda p: (_liq_usd(p), -rank(p)), reverse=True)
    return result[:limit]

def apply_filters(pairs: list[dict], min_liq: float, min_vol: float, max_age_hours: float | None) -> list[dict]:
    now_ms = int(time.time() * 1000)
    out = []
    for p in pairs:
        liq = _liq_usd(p)
        vol = _vol24(p)
        if liq < min_liq:
            continue
        if vol < min_vol:
            continue
        if max_age_hours is not None and max_age_hours > 0:
            created = _age_ms(p)
            if created > 0:
                age_hours = (now_ms - created) / (1000 * 60 * 60)
                if age_hours > max_age_hours:
                    continue
        out.append(p)
    return out

def apply_sort(pairs: list[dict], sort: str) -> list[dict]:
    s = (sort or "liq").lower()
    if s == "mcap":
        pairs.sort(key=_mcap, reverse=True)
    elif s == "vol":
        pairs.sort(key=_vol24, reverse=True)
    elif s == "age":
        pairs.sort(key=_age_ms, reverse=True)  # newest first
    elif s == "h24":
        pairs.sort(key=_h24, reverse=True)
    elif s == "txns":
        pairs.sort(key=_txns24, reverse=True)
    else:
        pairs.sort(key=_liq_usd, reverse=True)
    return pairs

# -------------------------
# Tabs
# -------------------------

TABS = {
    "positions": "🏠",
    "search": "Search",
    "trending": "Trending",
    "graduated": "Newly graduated",
    "verified": "Verified",
    "watchlist": "Watchlist",
}

# -------------------------
# Pages
# -------------------------

@app.get("/", response_class=HTMLResponse)
async def home_positions(request: Request):
    return templates.TemplateResponse(
        "positions.html",
        {"request": request, "active_tab": "positions", "title": "Open Positions", "tabs": TABS},
    )

@app.get("/search", response_class=HTMLResponse)
async def search_page(
    request: Request,
    q: str | None = None,
    sort: str = "liq",
    min_liq: float = 0,
    min_vol: float = 0,
    max_age_h: float | None = None,
    quote: str = "USDC",
    density: str = "comfortable",
):
    query = (q or "").strip()
    pairs = []
    note = None

    quote_pref = [quote, "USDT", "SOL"] if quote else QUOTE_DEFAULT

    if query:
        cache_key = f"search:{query}:{quote}:{sort}:{min_liq}:{min_vol}:{max_age_h}"
        cached = cache.get(cache_key)
        if cached is None:
            all_pairs = await search_pairs(query)
            sol_pairs = solana_pairs_only(all_pairs)
            best = dedupe_best_pair_per_token(sol_pairs, quote_pref, limit=80)
            best = apply_filters(best, min_liq, min_vol, max_age_h)
            best = apply_sort(best, sort)[:36]
            best = await annotate_pairs_with_risk(best)
            cache.set(cache_key, best, CACHE_TTL_SEARCH)
            pairs = best
        else:
            pairs = cached
    else:
        note = "Search for any Solana meme token by symbol, name, or address."

    return templates.TemplateResponse(
        "index.html",
        {
            "request": request,
            "pairs": pairs,
            "q": query,
            "active_tab": "search",
            "title": "Search",
            "note": note,
            "tabs": TABS,
            "ui": {
                "sort": sort,
                "min_liq": min_liq,
                "min_vol": min_vol,
                "max_age_h": max_age_h,
                "quote": quote,
                "density": density
            }
        },
    )

@app.get("/discover/{tab}", response_class=HTMLResponse)
async def discover(
    request: Request,
    tab: str,
    sort: str = "liq",
    min_liq: float = 0,
    min_vol: float = 0,
    max_age_h: float | None = None,
    quote: str = "USDC",
    density: str = "comfortable",
):
    tab = (tab or "").strip().lower()
    if tab not in ("trending", "graduated", "verified"):
        tab = "trending"

    title = TABS.get(tab, "Trending")
    pairs: list[dict] = []
    note: str | None = None
    quote_pref = [quote, "USDT", "SOL"] if quote else QUOTE_DEFAULT

    cache_key = f"disc:{tab}:{quote}:{sort}:{min_liq}:{min_vol}:{max_age_h}"
    cached = cache.get(cache_key)
    if cached is not None:
        pairs = cached
        return templates.TemplateResponse(
            "index.html",
            {"request": request, "pairs": pairs, "q": "", "active_tab": tab, "title": title, "note": note, "tabs": TABS,
             "ui": {"sort": sort, "min_liq": min_liq, "min_vol": min_vol, "max_age_h": max_age_h, "quote": quote, "density": density}},
        )

    if tab == "trending":
        boosted = await fetch_top_boosted_tokens()
        token_addrs = [x.get("tokenAddress") for x in boosted if x.get("tokenAddress")]
        raw_pairs = await fetch_pairs_for_tokens(token_addrs)
        sol = solana_pairs_only(raw_pairs)
        pairs = dedupe_best_pair_per_token(sol, quote_pref, limit=120)
        pairs = apply_filters(pairs, min_liq, min_vol, max_age_h)
        pairs = apply_sort(pairs, sort)[:48]

    elif tab == "graduated":
        profiles = await fetch_latest_token_profiles()
        token_addrs = [x.get("tokenAddress") for x in profiles if x.get("tokenAddress")]
        raw_pairs = await fetch_pairs_for_tokens(token_addrs)
        sol = solana_pairs_only(raw_pairs)
        pairs = dedupe_best_pair_per_token(sol, quote_pref, limit=200)
        pairs = apply_filters(pairs, min_liq, min_vol, max_age_h)
        pairs = apply_sort(pairs, sort)[:36]
        note = "Newly graduated tokens from the latest DexScreener profiles."

    elif tab == "verified":
        token_addrs = list(VERIFIED_TOKENS.values())
        raw_pairs = await fetch_pairs_for_tokens(token_addrs)
        sol = solana_pairs_only(raw_pairs)
        pairs = dedupe_best_pair_per_token(sol, quote_pref, limit=80)
        pairs = apply_filters(pairs, min_liq, min_vol, max_age_h)
        pairs = apply_sort(pairs, sort)[:36]

    pairs = await annotate_pairs_with_risk(pairs)

    cache.set(cache_key, pairs, CACHE_TTL_LIST)

    return templates.TemplateResponse(
        "index.html",
        {"request": request, "pairs": pairs, "q": "", "active_tab": tab, "title": title, "note": note, "tabs": TABS,
         "ui": {"sort": sort, "min_liq": min_liq, "min_vol": min_vol, "max_age_h": max_age_h, "quote": quote, "density": density}},
    )

@app.get("/watchlist", response_class=HTMLResponse)
async def watchlist_page(request: Request):
    return templates.TemplateResponse(
        "positions.html",
        {"request": request, "active_tab": "watchlist", "title": "Watchlist", "tabs": TABS},
    )

@app.get("/coin/{token_address}", response_class=HTMLResponse)
async def coin_detail(request: Request, token_address: str):
    cache_key = f"coin:{token_address}"
    cached = cache.get(cache_key)
    if cached is None:
        token_pairs = await fetch_token_pairs(token_address)
        sol_pairs = solana_pairs_only(token_pairs)
        sol_pairs = [decorate_pair(p) for p in sol_pairs]
        sol_pairs = await annotate_pairs_with_risk(sol_pairs)
        best = pick_best_pair_by_liquidity_usd(sol_pairs)
        sol_pairs.sort(key=_liq_usd, reverse=True)
        payload = {"pair": best, "all_pairs": sol_pairs[:25]}
        cache.set(cache_key, payload, CACHE_TTL_TOKEN)
    else:
        payload = cached

    return templates.TemplateResponse(
        "coin.html",
        {"request": request, "token_address": token_address, "pair": payload["pair"], "all_pairs": payload["all_pairs"], "tabs": TABS},
    )

# -------------------------
# JSON endpoints for drawer / client pages
# -------------------------

@app.get("/api/best_pairs", response_class=JSONResponse)
async def api_best_pairs(tokens: list[str] = Query(default=[])):
    out: list[dict] = []
    for addr in tokens[:60]:
        cache_key = f"best:{addr}"
        cached = cache.get(cache_key)
        if cached is None:
            token_pairs = await fetch_token_pairs(addr)
            sol_pairs = solana_pairs_only(token_pairs)
            sol_pairs = [decorate_pair(p) for p in sol_pairs]
            sol_pairs = await annotate_pairs_with_risk(sol_pairs)
            best = pick_best_pair_by_liquidity_usd(sol_pairs)
            cache.set(cache_key, best, CACHE_TTL_TOKEN)
            if best:
                out.append(best)
        else:
            if cached:
                out.append(cached)

    out.sort(key=_liq_usd, reverse=True)
    return out

@app.get("/api/token/{token_address}", response_class=JSONResponse)
async def api_token(token_address: str):
    cache_key = f"api_token:{token_address}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    token_pairs = await fetch_token_pairs(token_address)
    sol_pairs = solana_pairs_only(token_pairs)
    sol_pairs = [decorate_pair(p) for p in sol_pairs]
    sol_pairs = await annotate_pairs_with_risk(sol_pairs)
    best = pick_best_pair_by_liquidity_usd(sol_pairs)
    sol_pairs.sort(key=_liq_usd, reverse=True)

    data = {"best": best, "pairs": sol_pairs[:12]}
    cache.set(cache_key, data, CACHE_TTL_TOKEN)
    return data
