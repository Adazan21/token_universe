import os
import httpx
from app.services.ttl_cache import cache

SOLANA_RPC_URL = os.getenv("SOLANA_RPC_URL", "https://api.mainnet-beta.solana.com")
SECURITY_TTL_SECONDS = 3600


async def fetch_mint_security(mint: str) -> dict:
    """
    Returns mint/freezer authority details for a token mint.
    Uses Solana RPC parsed account info for a mint address.
    """
    if not mint:
        return {
            "mintAuthority": None,
            "freezeAuthority": None,
            "is_mintable": False,
            "is_freezable": False,
        }

    cache_key = f"mintsec:{mint}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    payload = {
        "jsonrpc": "2.0",
        "id": mint,
        "method": "getAccountInfo",
        "params": [
            mint,
            {"encoding": "jsonParsed"},
        ],
    }

    result = {
        "mintAuthority": None,
        "freezeAuthority": None,
        "is_mintable": False,
        "is_freezable": False,
    }

    try:
        async with httpx.AsyncClient(timeout=12) as client:
            resp = await client.post(SOLANA_RPC_URL, json=payload)
            resp.raise_for_status()
            data = resp.json()
            value = (data.get("result") or {}).get("value") or {}
            parsed = (value.get("data") or {}).get("parsed") or {}
            info = parsed.get("info") or {}

            mint_auth = info.get("mintAuthority")
            freeze_auth = info.get("freezeAuthority")

            result.update(
                {
                    "mintAuthority": mint_auth,
                    "freezeAuthority": freeze_auth,
                    "is_mintable": bool(mint_auth),
                    "is_freezable": bool(freeze_auth),
                }
            )
    except httpx.HTTPStatusError as e:
        if e.response is not None and e.response.status_code == 429:
            cache.set(cache_key, result, 300)
            return result
        print(f"[token_universe] mint security fetch failed for {mint}: {e!r}")
    except Exception as e:
        print(f"[token_universe] mint security fetch failed for {mint}: {e!r}")

    cache.set(cache_key, result, SECURITY_TTL_SECONDS)
    return result
