from sqlalchemy.orm import Session
from starlette.requests import Request
import json

from app.limiter import _get_real_client_ip
from app.models.audit_log import AuditLog

def record_audit_event(
    db: Session,
    request: Request,
    event_type: str,
    user_id: str | None = None,
    details: dict | None = None,
) -> None:
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
    db.add(log_entry)
    # The caller (router or service) is typically responsible for committing the transaction
    # via the UnitOfWork or dependency commit, but we commit here if we want to ensure
    # audit logs are saved even on subsequent failures, though typically auth endpoints
    # commit at the end. We'll just let the caller commit or explicitly commit here
    # if it's safe. Wait, `auth.py` router doesn't explicitly commit, the service does.
    # We will explicitly commit the audit log so it's saved.
    db.commit()
