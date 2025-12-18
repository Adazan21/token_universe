from dotenv import load_dotenv
import os

load_dotenv()

APP_NAME = "Token Universe"

JUPITER_BASE_URL = "https://quote-api.jup.ag/v6"
TOKEN_LIST_URL = "https://token.jup.ag/all"

QUOTE_TTL_SECONDS = 15
TOKEN_LIST_TTL_SECONDS = 3600
