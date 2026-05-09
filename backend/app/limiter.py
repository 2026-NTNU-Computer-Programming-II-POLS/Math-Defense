import logging
import os
import time
from collections import defaultdict, deque
from threading import Lock

from starlette.requests import Request
from slowapi import Limiter

_logger = logging.getLogger(__name__)

_PROXY_MODE = os.getenv("PROXY_MODE", "").lower() in ("true", "1", "yes")
_TRUSTED_PROXY_IPS: frozenset[str] = frozenset(
    ip.strip() for ip in os.getenv("TRUSTED_PROXY_IPS", "").split(",") if ip.strip()
)

if _PROXY_MODE and not _TRUSTED_PROXY_IPS:
    _logger.warning(
        "PROXY_MODE=true but TRUSTED_PROXY_IPS is not configured — "
        "falling back to raw socket IP. Set TRUSTED_PROXY_IPS (comma-separated "
        "list of your reverse-proxy IPs) to enable X-Forwarded-For extraction."
    )


def _get_real_client_ip(request: Request) -> str:
    """Extract client IP for rate-limiting.

    When PROXY_MODE=true and TRUSTED_PROXY_IPS is set, walks X-Forwarded-For
    *right-to-left* and returns the first hop that is not in our trusted-proxy
    set — that is the closest entry the client itself could not have forged.
    Trusting the leftmost entry would let any client supply a header like
    ``X-Forwarded-For: 1.2.3.4, <real_proxy_ip>`` and have the limiter use
    1.2.3.4. Falls back to the raw socket IP outside proxy mode.
    """
    if _PROXY_MODE and _TRUSTED_PROXY_IPS:
        peer = request.client.host if request.client else None
        if peer in _TRUSTED_PROXY_IPS:
            forwarded_for = request.headers.get("X-Forwarded-For", "")
            if forwarded_for:
                hops = [h.strip() for h in forwarded_for.split(",") if h.strip()]
                for hop in reversed(hops):
                    if hop not in _TRUSTED_PROXY_IPS:
                        return hop
    if request.client:
        return request.client.host
    return "127.0.0.1"


limiter = Limiter(key_func=_get_real_client_ip)


# Per-email login throttle (B-SEC-12). The per-IP @limiter.limit on /login
# can be sidestepped by distributed credential stuffing against a single
# account (the per-account lockout still catches sustained attacks at 5
# failures, but only after they happen). Bound the *total* attempt rate
# per email to LOGIN_EMAIL_LIMIT per LOGIN_EMAIL_WINDOW seconds as a
# layer in front of the lockout. In-process only — combined with the
# per-IP rate limit, this is defence-in-depth, not the primary control.
LOGIN_EMAIL_WINDOW = 60.0
LOGIN_EMAIL_LIMIT = 10
_login_email_history: dict[str, deque[float]] = defaultdict(deque)
_login_email_lock = Lock()


def login_email_throttle_exceeded(email: str) -> bool:
    """Return True if recent login attempts for `email` exceed the window."""
    now = time.monotonic()
    cutoff = now - LOGIN_EMAIL_WINDOW
    key = email.strip().lower()
    with _login_email_lock:
        bucket = _login_email_history[key]
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        if len(bucket) >= LOGIN_EMAIL_LIMIT:
            return True
        bucket.append(now)
        # Cap memory growth: drop empty buckets opportunistically.
        if len(_login_email_history) > 10_000:
            for k in [k for k, v in _login_email_history.items() if not v]:
                del _login_email_history[k]
        return False
