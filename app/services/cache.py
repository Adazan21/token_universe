import time

class TTLCache:
    def __init__(self):
        self.store = {}

    def get(self, key):
        entry = self.store.get(key)
        if not entry:
            return None
        value, expires_at = entry
        if time.time() > expires_at:
            del self.store[key]
            return None
        return value

    def set(self, key, value, ttl):
        self.store[key] = (value, time.time() + ttl)


cache = TTLCache()
