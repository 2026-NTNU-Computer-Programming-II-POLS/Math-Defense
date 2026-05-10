import ipaddress
import logging
import os
import time
from collections import deque
from threading import Lock

from starlette.requests import Request
from slowapi import Limiter

_logger = logging.getLogger(__name__)

_PROXY_MODE = os.getenv("PROXY_MODE", "").lower() in ("true", "1", "yes")


def _parse_trusted_proxies(
    raw: str,
) -> tuple[frozenset[str], list[ipaddress.IPv4Network | ipaddress.IPv6Network]]:
    """Split TRUSTED_PROXY_IPS into exact IPs and CIDR networks.

    Accepts a comma-separated mix of bare IPs (``192.168.1.1``) and CIDR
    blocks (``172.16.0.0/12``). Invalid entries are skipped with a warning.
    """
    exact: set[str] = set()
    networks: list[ipaddress.IPv4Network | ipaddress.IPv6Network] = []
    for entry in raw.split(","):
        entry = entry.strip()
        if not entry:
            continue
        if "/" in entry:
            try:
                networks.append(ipaddress.ip_network(entry, strict=False))
            except ValueError:
                _logger.warning("TRUSTED_PROXY_IPS: invalid CIDR %r ignored", entry)
        else:
            exact.add(entry)
    return frozenset(exact), networks


_TRUSTED_PROXY_EXACT, _TRUSTED_PROXY_NETWORKS = _parse_trusted_proxies(
    os.getenv("TRUSTED_PROXY_IPS", "")
)
_TRUSTED_PROXY_CONFIGURED = bool(_TRUSTED_PROXY_EXACT or _TRUSTED_PROXY_NETWORKS)

if _PROXY_MODE and not _TRUSTED_PROXY_CONFIGURED:
    _logger.warning(
        "PROXY_MODE=true but TRUSTED_PROXY_IPS is not configured — "
        "falling back to raw socket IP. Set TRUSTED_PROXY_IPS (comma-separated "
        "list of reverse-proxy IPs or CIDR blocks, e.g. 172.16.0.0/12) to "
        "enable X-Forwarded-For extraction."
    )


def _is_trusted_proxy(ip: str) -> bool:
    if ip in _TRUSTED_PROXY_EXACT:
        return True
    if _TRUSTED_PROXY_NETWORKS:
        try:
            addr = ipaddress.ip_address(ip)
            return any(addr in net for net in _TRUSTED_PROXY_NETWORKS)
        except ValueError:
            pass
    return False


def _get_real_client_ip(request: Request) -> str:
    """Extract client IP for rate-limiting.

    When PROXY_MODE=true and TRUSTED_PROXY_IPS is set, walks X-Forwarded-For
    *right-to-left* and returns the first hop that is not in our trusted-proxy
    set — that is the closest entry the client itself could not have forged.
    Trusting the leftmost entry would let any client supply a header like
    ``X-Forwarded-For: 1.2.3.4, <real_proxy_ip>`` and have the limiter use
    1.2.3.4. Falls back to the raw socket IP outside proxy mode.

    TRUSTED_PROXY_IPS supports bare IPs and CIDR blocks (e.g. 172.16.0.0/12)
    so Docker Compose deployments can trust all containers in a private subnet
    without knowing each container's exact address at deploy time.
    """
    if _PROXY_MODE and _TRUSTED_PROXY_CONFIGURED:
        peer = request.client.host if request.client else None
        if peer and _is_trusted_proxy(peer):
            forwarded_for = request.headers.get("X-Forwarded-For", "")
            if forwarded_for:
                hops = [h.strip() for h in forwarded_for.split(",") if h.strip()]
                for hop in reversed(hops):
                    if not _is_trusted_proxy(hop):
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
_login_email_history: dict[str, deque[float]] = {}
_login_email_lock = Lock()


def login_email_throttle_exceeded(email: str) -> bool:
    """Return True if recent login attempts for `email` exceed the window."""
    now = time.monotonic()
    cutoff = now - LOGIN_EMAIL_WINDOW
    key = email.strip().lower()
    with _login_email_lock:
        bucket = _login_email_history.get(key)
        if bucket is not None:
            while bucket and bucket[0] < cutoff:
                bucket.popleft()
        if bucket is not None and len(bucket) >= LOGIN_EMAIL_LIMIT:
            return True
        if bucket is None:
            bucket = deque()
            _login_email_history[key] = bucket
        bucket.append(now)
        # Sweep empty buckets on every write; prevents unbounded growth when
        # an attacker sprays unique addresses and lets their windows expire.
        for k in [k for k, v in _login_email_history.items() if not v]:
            del _login_email_history[k]
        return False
