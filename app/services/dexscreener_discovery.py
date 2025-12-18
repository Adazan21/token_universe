import httpx
from app.services.cache import cache

DEX_BASE = "https://api.dexscreener.com"
CHAIN = "solana"

PROFILES_TTL_SECONDS = 60
BOOSTS_TTL_SECONDS = 60


def _normalize_list(data):
    """
    DexScreener endpoints are not always consistent across docs/examples.
    This normalizes common shapes into a list of objects.
    """
    if data is None:
        return []
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        # common patterns seen in APIs
        for key in ("data", "tokens", "profiles", "results", "items"):
            v = data.get(key)
            if isinstance(v, list):
                return v
        # fallback: treat dict as a single object
        return [data]
    return []


async def fetch_latest_token_profiles():
    """
    Official endpoint:
      GET https://api.dexscreener.com/token-profiles/latest/v1
    """
    cache_key = "dex:profiles:latest"
    cached = cache.get(cache_key)
    if cached:
        return cached

    url = f"{DEX_BASE}/token-profiles/latest/v1"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.json()

    items = _normalize_list(data)
    # filter to Solana profiles only
    sol = [x for x in items if str(x.get("chainId", "")).lower() == CHAIN]
    cache.set(cache_key, sol, PROFILES_TTL_SECONDS)
    return sol


async def fetch_top_boosted_tokens():
    """
    Official endpoint:
      GET https://api.dexscreener.com/token-boosts/top/v1
    """
    cache_key = "dex:boosts:top"
    cached = cache.get(cache_key)
    if cached:
        return cached

    url = f"{DEX_BASE}/token-boosts/top/v1"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.json()

    items = _normalize_list(data)
    sol = [x for x in items if str(x.get("chainId", "")).lower() == CHAIN]
    cache.set(cache_key, sol, BOOSTS_TTL_SECONDS)
    return sol


async def fetch_pairs_for_tokens(token_addresses: list[str]):
    """
    Official endpoint:
      GET https://api.dexscreener.com/tokens/v1/{chainId}/{tokenAddresses}
    tokenAddresses: comma-separated, up to 30 per request
    """
    token_addresses = [t for t in token_addresses if t]
    token_addresses = token_addresses[:30]
    if not token_addresses:
        return []

    joined = ",".join(token_addresses)
    url = f"{DEX_BASE}/tokens/v1/{CHAIN}/{joined}"

    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.json()

    return _normalize_list(data)
