from starlette.requests import Request
from slowapi import Limiter


def _get_real_client_ip(request: Request) -> str:
    """Extract client IP from the TCP connection, ignoring X-Forwarded-For.

    ``get_remote_address`` from slowapi trusts X-Forwarded-For by default,
    which lets an attacker rotate IPs per request and bypass every rate limit.
    Use the raw socket peer address instead; when deployed behind a trusted
    reverse proxy, replace this with logic that reads X-Forwarded-For only
    from known proxy source IPs.
    """
    if request.client:
        return request.client.host
    return "127.0.0.1"


limiter = Limiter(key_func=_get_real_client_ip)
