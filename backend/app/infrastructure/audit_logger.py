import json
import logging

from starlette.requests import Request

from app.limiter import _get_real_client_ip
from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)


def record_audit_event(
    request: Request,
    event_type: str,
    user_id: str | None = None,
    details: dict | None = None,
) -> None:
    """Persist an audit event in its own isolated session.

    Using a dedicated session means audit events are committed regardless of
    whether the caller's business transaction succeeds or rolls back. This
    removes the need for any db.commit() call in the router layer.
    """
    from app.db.database import SessionLocal

    ip_address = _get_real_client_ip(request)
    user_agent = request.headers.get("user-agent", "")
    details_str = json.dumps(details) if details else None

    log_entry = AuditLog(
        user_id=user_id,
        event_type=event_type,
        ip_address=ip_address,
        user_agent=user_agent,
        details=details_str,
    )

    audit_db = SessionLocal()
    try:
        audit_db.add(log_entry)
        audit_db.commit()
    except Exception:
        audit_db.rollback()
        logger.warning("Failed to persist audit event: %s", event_type, exc_info=True)
    finally:
        audit_db.close()
