import logging
import os

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

    When PROXY_MODE=true and TRUSTED_PROXY_IPS is set, reads X-Forwarded-For
    only when the TCP connection comes from a known proxy IP, preventing
    spoofing. Falls back to raw socket IP in all other cases.
    """
    if _PROXY_MODE and _TRUSTED_PROXY_IPS:
        peer = request.client.host if request.client else None
        if peer in _TRUSTED_PROXY_IPS:
            forwarded_for = request.headers.get("X-Forwarded-For", "")
            if forwarded_for:
                return forwarded_for.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "127.0.0.1"


limiter = Limiter(key_func=_get_real_client_ip)
