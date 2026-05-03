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
