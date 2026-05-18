"""Replay/Spectate (§24) HTTP routes.

POST /api/sessions/{id}/events — recorder flushes a batch of events.
GET  /api/sessions/{id}/replay — player loads seed + ordered event stream.

Mounted on its own router rather than tacked onto game_session.py so the
ingest path can have a tighter rate limit (recorder flushes every few
seconds) without affecting the session CRUD limits.
"""
from __future__ import annotations

import asyncio
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, Request, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.db.database import SessionLocal, get_db
from app.domain.session.events_log import ReplayEvent
from app.domain.user.aggregate import User
from app.factories import build_auth_service, build_replay_service
from app.infrastructure.spectate_hub import hub as spectate_hub
from app.limiter import limiter
from app.middleware.auth import AUTH_COOKIE_NAME, authenticate_ws, get_current_user
from app.schemas.replay import (
    ReplayBatchIn,
    ReplayBatchOut,
    ReplayBundleOut,
    ReplayEventOut,
)


logger = logging.getLogger(__name__)


router = APIRouter(prefix="/api/sessions", tags=["replay"])


@router.post("/{session_id}/events", response_model=ReplayBatchOut, status_code=202)
# Tuned for the recorder's 1 Hz flush cadence with headroom for a brief
# burst when the player closes the tab and the EventRecorder dumps its
# remaining buffer in one final POST.
@limiter.limit("60/minute")
async def append_events(
    request: Request,
    session_id: UUID,
    req: ReplayBatchIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ReplayBatchOut:
    events = [
        ReplayEvent(
            seq=e.seq,
            ts=e.ts,
            event_type=e.event_type,
            payload=e.payload,
        )
        for e in req.events
    ]
    written = build_replay_service(db).append_events(
        str(session_id), current_user.id, events,
    )
    # Backlog §24 Phase D — fan out to live spectators after the persist
    # commits. We publish only the events that the recorder posted (not
    # `written` minus duplicates), because spectators don't deduplicate;
    # the recorder ensures it doesn't double-send. If publish raises, the
    # ingest still succeeds — spectator delivery is best-effort.
    try:
        await spectate_hub.publish(
            str(session_id),
            [e.model_dump(mode="json") for e in req.events],
        )
    except Exception:
        logger.exception("spectate publish failed session=%s", session_id)
    return ReplayBatchOut(written=written)


@router.get("/{session_id}/replay", response_model=ReplayBundleOut)
@limiter.limit("30/minute")
def get_replay(
    request: Request,
    session_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ReplayBundleOut:
    bundle = build_replay_service(db).get_replay(str(session_id), current_user.id)
    return ReplayBundleOut(
        session_id=bundle.session_id,
        rng_seed=bundle.rng_seed,
        replay_version=bundle.replay_version,
        star_rating=bundle.star_rating,
        events=[
            ReplayEventOut(
                seq=e.seq,
                ts=e.ts,
                event_type=e.event_type,
                payload=e.payload,
            )
            for e in bundle.events
        ],
    )


# ── §24 Phase D: live spectate ──

# A WS spectator first receives the historical event stream (so a viewer
# joining mid-run sees what already happened), then transitions to live
# updates from the SpectateHub. The hand-off is "send all stored, then
# subscribe" — there is a small race window where an event posted between
# those two steps could be missed. Acceptable: the recorder's seq is
# monotonic and gaps are visible client-side.
@router.websocket("/{session_id}/spectate")
async def spectate_session(websocket: WebSocket, session_id: UUID) -> None:
    # B-BUG-5: open the DB session only for auth + history bootstrap, then
    # close it before entering the streaming loop. Holding a SessionLocal
    # for the WS lifetime starves the connection pool — 11 spectators on a
    # pool_size=10 engine block every HTTP route. The streaming loop reads
    # from the in-process SpectateHub and does not need the database.
    # Periodic auth re-validation reopens its own short-lived session.
    db = SessionLocal()
    try:
        user = await authenticate_ws(websocket, db)
        if user is None:
            return

        # Spectator authorization v1: owner-only via the application
        # service so the router does not reach into ORM models. To extend
        # to "class peers" later, swap the predicate inside
        # ReplayApplicationService.authorize_spectator.
        from app.domain.errors import SessionNotFoundError
        try:
            build_replay_service(db).authorize_spectator(str(session_id), user.id)
        except SessionNotFoundError:
            await websocket.close(code=4404, reason="session not found")
            return

        await websocket.accept()

        # Send the (possibly empty) historical event stream so the viewer
        # has context before live events start arriving. Reuses the
        # ReplayApplicationService so ownership / quota rules stay in
        # one place; called with the spectator's own user id since the
        # owner-only gate above guarantees they match.
        bundle = build_replay_service(db).get_replay(
            str(session_id), user.id,
        )
    finally:
        db.close()

    await websocket.send_json({
        "kind": "snapshot",
        "session_id": bundle.session_id,
        "rng_seed": bundle.rng_seed,
        "star_rating": bundle.star_rating,
        "events": [
            {
                "seq": e.seq,
                "ts": e.ts,
                "event_type": e.event_type,
                "payload": e.payload,
            }
            for e in bundle.events
        ],
    })

    # Periodic auth re-validation (B-SEC-14): a long-lived WS would
    # otherwise keep streaming after the underlying session was
    # disabled (account banned, password rotated). Re-decode the
    # cookie every N events and bail if the user is no longer
    # entitled. Asynchronous I/O is bounded — this only runs when a
    # frame arrives, which is the same cadence as the recorder's
    # 1 Hz flushes, so worst case is a 1-second extension of access
    # past revocation.
    from app.domain.errors import DomainError

    # M-07: WS cookies are captured at handshake and never refreshed by the
    # browser mid-connection.  A revoked user can therefore spectate for up to
    # _SPECTATE_REAUTH_INTERVAL more seconds until the next re-auth cycle
    # below detects the stale/invalid token.  Acceptable for an educational
    # context; stricter environments should pass fresh tokens in WS messages.
    _SPECTATE_REAUTH_INTERVAL = 60

    queue = await spectate_hub.subscribe(str(session_id))
    try:
        while True:
            try:
                event = await asyncio.wait_for(
                    queue.get(), timeout=_SPECTATE_REAUTH_INTERVAL,
                )
            except asyncio.TimeoutError:
                event = None

            if event is None:
                revalidate_db = SessionLocal()
                try:
                    try:
                        reauth_token = websocket.cookies.get(AUTH_COOKIE_NAME)
                        re_user = build_auth_service(revalidate_db).authenticate_token(reauth_token)
                        # Guard against a cookie swap: if the token now belongs to a
                        # different user the original spectator's session must close.
                        if re_user.id != user.id:
                            await websocket.close(code=4401, reason="auth revoked")
                            return
                    except DomainError:
                        # Covers all revocation cases: AccountDisabledError (banned),
                        # InvalidTokenError (JTI denied / password-rotated / expired),
                        # UserNotFoundError (deleted). A successfully returned user is
                        # always active — no redundant is_active check needed.
                        await websocket.close(code=4401, reason="auth revoked")
                        return
                finally:
                    revalidate_db.close()
                continue

            await websocket.send_json({"kind": "event", **event})
    except WebSocketDisconnect:
        return
    finally:
        await spectate_hub.unsubscribe(str(session_id), queue)
