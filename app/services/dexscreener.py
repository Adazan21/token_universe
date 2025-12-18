import httpx
from app.services.cache import cache

DEX_BASE = "https://api.dexscreener.com/latest/dex"
TTL_SECONDS = 20  # short TTL; keeps UI snappy without hammering API


async def search_pairs(query: str) -> list[dict]:
    q = (query or "").strip()
    if not q:
        return []

    cache_key = f"dex:search:{q.lower()}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    try:
        async with httpx.AsyncClient(timeout=12) as client:
            resp = await client.get(f"{DEX_BASE}/search", params={"q": q})
            resp.raise_for_status()
            data = resp.json()
            pairs = data.get("pairs", []) or []
    except Exception as e:
        print(f"[token_universe] DexScreener search failed: {e!r}")
        pairs = []

    cache.set(cache_key, pairs, TTL_SECONDS)
    return pairs


async def fetch_token_pairs(token_address: str) -> list[dict]:
    addr = (token_address or "").strip()
    if not addr:
        return []

    cache_key = f"dex:token:{addr}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    try:
        async with httpx.AsyncClient(timeout=12) as client:
            resp = await client.get(f"{DEX_BASE}/tokens/{addr}")
            resp.raise_for_status()
            data = resp.json()
            pairs = data.get("pairs", []) or []
    except Exception as e:
        print(f"[token_universe] DexScreener token fetch failed: {e!r}")
        pairs = []

    cache.set(cache_key, pairs, TTL_SECONDS)
    return pairs


def solana_pairs_only(pairs: list[dict]) -> list[dict]:
    return [p for p in pairs if p.get("chainId") == "solana"]


def pick_best_pair_by_liquidity_usd(pairs: list[dict]) -> dict | None:
    if not pairs:
        return None

    def liq_usd(p: dict) -> float:
        liq = p.get("liquidity") or {}
        try:
            return float(liq.get("usd") or 0)
        except Exception:
            return 0.0

    ordered = sorted(pairs, key=liq_usd, reverse=True)
    return ordered[0] if ordered else None
