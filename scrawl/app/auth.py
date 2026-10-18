"""Sign-in requirement and a small per-user rate limit (standard library only)."""
import os
import time
from collections import defaultdict, deque

from . import accounts

_hits: dict[str, deque] = defaultdict(deque)


def enabled() -> bool:
    return accounts.enabled()


def require_auth() -> bool:
    return accounts.enabled() and os.getenv("REQUIRE_AUTH", "") == "1"


def verify(token: str) -> str | None:
    return accounts.verify_token(token) if accounts.enabled() else None


def allow(key: str) -> bool:
    """Sliding window: RATE_LIMIT_PER_MIN requests per minute per user or IP (default 8)."""
    limit = int(os.getenv("RATE_LIMIT_PER_MIN", "8"))
    now = time.time()
    q = _hits[key]
    while q and q[0] < now - 60:
        q.popleft()
    if len(q) >= limit:
        return False
    q.append(now)
    return True