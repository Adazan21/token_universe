# app/services/verified_tokens.py
# Curated "well-known" Solana tokens (mint addresses).
# Sources (mint references):
# - SOL (wrapped SOL): So11111111111111111111111111111111111111112 (Solana ecosystem standard)
# - USDC: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v :contentReference[oaicite:0]{index=0}
# - USDT: Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB :contentReference[oaicite:1]{index=1}
# - BONK: DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263 :contentReference[oaicite:2]{index=2}
# - WIF: EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm :contentReference[oaicite:3]{index=3}
# - POPCAT: 7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr :contentReference[oaicite:4]{index=4}
# - BOME: ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82 :contentReference[oaicite:5]{index=5}
# - MEW: MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5 :contentReference[oaicite:6]{index=6}
# - JUP: JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN :contentReference[oaicite:7]{index=7}
# - RAY: 4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R :contentReference[oaicite:8]{index=8}
# - MYRO: HhJpBhRRn4g56VsyLuT8DL5Bv31HkXqsrahTTUCZeZg4 :contentReference[oaicite:9]{index=9}
# - GOAT (Goatcoin): GNHW5JetZmW85vAU35KyoDcYoSd3sNWtx5RPMTDJpump :contentReference[oaicite:10]{index=10}
# - WOJAK (Solana): 7oLWGMuGbBm9uwDmffSdxLE98YChFAH1UdY5XpKYLff8 :contentReference[oaicite:11]{index=11}

VERIFIED_TOKENS = [
    {"symbol": "SOL", "name": "Wrapped SOL", "mint": "So11111111111111111111111111111111111111112"},
    {"symbol": "USDC", "name": "USD Coin", "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"},
    {"symbol": "USDT", "name": "Tether USD", "mint": "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"},
    {"symbol": "JUP", "name": "Jupiter", "mint": "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN"},
    {"symbol": "RAY", "name": "Raydium", "mint": "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R"},
    {"symbol": "BONK", "name": "Bonk", "mint": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"},
    {"symbol": "WIF", "name": "dogwifhat", "mint": "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm"},
    {"symbol": "POPCAT", "name": "POPCAT", "mint": "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr"},
    {"symbol": "BOME", "name": "BOOK OF MEME", "mint": "ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82"},
    {"symbol": "MEW", "name": "cat in a dogs world", "mint": "MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5"},
    {"symbol": "MYRO", "name": "Myro", "mint": "HhJpBhRRn4g56VsyLuT8DL5Bv31HkXqsrahTTUCZeZg4"},
    {"symbol": "GOAT", "name": "Goatcoin", "mint": "GNHW5JetZmW85vAU35KyoDcYoSd3sNWtx5RPMTDJpump"},
    {"symbol": "WOJAK", "name": "Wojak (Solana)", "mint": "7oLWGMuGbBm9uwDmffSdxLE98YChFAH1UdY5XpKYLff8"},
]
