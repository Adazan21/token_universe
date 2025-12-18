# app/services/risk.py
from __future__ import annotations
from typing import Dict, Tuple, Optional

import time


def _now_ms() -> int:
    return int(time.time() * 1000)


def _num(x, default=None):
    try:
        return default if x is None else float(x)
    except Exception:
        return default


def _int(x, default=0):
    try:
        return default if x is None else int(x)
    except Exception:
        return default


def compute_risk(pair: Dict, is_verified: bool = False) -> Tuple[int, str]:
    """
    Simple, explainable MVP heuristic (0 = lowest risk, 100 = highest risk).
    Inputs are DexScreener-normalized fields.
    """
    score = 50  # baseline

    liq = _num(pair.get("liquidityUsd"), 0.0) or 0.0
    vol = _num(pair.get("volume24h"), 0.0) or 0.0
    txns24 = _int(pair.get("txns24h"), 0)

    created = _int(pair.get("pairCreatedAt"), 0)
    age_ms = max(0, _now_ms() - created) if created else None
    age_hours = (age_ms / 1000 / 3600) if age_ms else None

    chg24 = _num(pair.get("priceChange24h"), 0.0) or 0.0

    # liquidity bands
    if liq >= 10_000_000:
        score -= 20
    elif liq >= 1_000_000:
        score -= 10
    elif liq >= 200_000:
        score -= 5
    elif liq <= 25_000:
        score += 20
    elif liq <= 75_000:
        score += 10

    # activity bands
    if vol >= 10_000_000:
        score -= 10
    elif vol >= 1_000_000:
        score -= 5
    elif vol <= 25_000:
        score += 10

    if txns24 >= 25_000:
        score -= 10
    elif txns24 >= 5_000:
        score -= 5
    elif txns24 <= 200:
        score += 10

    # age (very new tokens are riskier)
    if age_hours is not None:
        if age_hours < 6:
            score += 20
        elif age_hours < 24:
            score += 10
        elif age_hours > 24 * 30:
            score -= 5

    # volatility proxy
    if abs(chg24) >= 100:
        score += 10
    elif abs(chg24) >= 50:
        score += 5

    # verified allowlist lowers risk
    if is_verified:
        score -= 15

    score = max(0, min(100, int(round(score))))

    if score <= 25:
        label = "Low"
    elif score <= 55:
        label = "Medium"
    elif score <= 80:
        label = "High"
    else:
        label = "Extreme"

    return score, label
