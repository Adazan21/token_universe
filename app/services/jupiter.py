import httpx
from app.settings import (
    JUPITER_BASE_URL,
    TOKEN_LIST_URL,
    QUOTE_TTL_SECONDS,
    TOKEN_LIST_TTL_SECONDS
)
from app.services.cache import cache

SOL_MINT = "So11111111111111111111111111111111111111112"
LAMPORTS_PER_SOL = 1_000_000_000

# Minimal fallback so the UI always loads
FALLBACK_TOKENS = [
    {"chainId": 101, "address": SOL_MINT, "symbol": "SOL", "name": "Solana"},
    {"chainId": 101, "address": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", "symbol": "BONK", "name": "Bonk"},
]


async def fetch_tokens():
    cached = cache.get("tokens")
    if cached:
        return cached

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(TOKEN_LIST_URL)
            resp.raise_for_status()
            tokens = resp.json()
    except Exception as e:
        # Never crash the site because a 3rd-party endpoint / DNS is down
        print(f"[token_universe] fetch_tokens failed: {e!r}")
        tokens = FALLBACK_TOKENS

    filtered = [
        t for t in tokens
        if t.get("chainId") == 101 and t.get("symbol")
    ]

    cache.set("tokens", filtered, TOKEN_LIST_TTL_SECONDS)
    return filtered


async def fetch_price_in_sol(output_mint: str):
    cache_key = f"quote:{output_mint}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    params = {
        "inputMint": SOL_MINT,
        "outputMint": output_mint,
        "amount": LAMPORTS_PER_SOL
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{JUPITER_BASE_URL}/quote", params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        # Quote failures are common for illiquid/blocked tokens; don't crash the page
        print(f"[token_universe] fetch_price_in_sol failed for {output_mint}: {e!r}")
        cache.set(cache_key, None, QUOTE_TTL_SECONDS)
        return None

    routes = data.get("data", [])
    if not routes:
        cache.set(cache_key, None, QUOTE_TTL_SECONDS)
        return None

    best = routes[0]
    out_amount = int(best["outAmount"])
    decimals = best["outputMintDecimals"]

    price = out_amount / (10 ** decimals)
    cache.set(cache_key, price, QUOTE_TTL_SECONDS)
    return price
