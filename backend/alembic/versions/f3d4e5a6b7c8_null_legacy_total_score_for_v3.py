"""null legacy total_score so V3-scaled rows are not out-ranked by stale V2 values

Revision ID: f3d4e5a6b7c8
Revises: e2c3d4f5a6b7
Create Date: 2026-06-08

The V3 score formula changes total_score from the old V2 value
(base = k, magnitude ~1) to ``killValue**(1/sqrt(denom)) * k * K * difficulty``
(realistically tens to ~1e5; L5 realistic-max core ~135k — the same order of
magnitude as the legacy integer ``score``, whose per-level caps span
5,000-100,000). Rankings use ``COALESCE(total_score, score)``, so leaving
the stale ~1.x V2 values in place would sort EVERY pre-V3 row below EVERY new
row regardless of skill — a fast bad run would beat a perfect old run.

Per the product decision NOT to backfill (recompute) historical gameplay, we
instead clear the now-incomparable V2 total_score on existing rows. COALESCE
then falls back to each old row's integer ``score`` (the same order of
magnitude — per-level caps 5,000-100,000), so old and new rows rank on a
comparable (though not strictly identical) scale. Only rows present at deploy
time are affected; sessions completed afterwards store the V3 value.

Territory standings are RESET. ``territory_occupations.score`` and
``territory_rankings_snapshot.territory_value`` are stored *snapshots* taken at
seize/settle time (not COALESCE-at-read), so clearing total_score cannot fix
them. Most were seized at the old V2 scale (~1.x); leaving them would let any
new V3 play (now in the thousands) trivially out-seize every old slot. Per the
product decision the board is wiped: occupations, session-use markers, and the
rankings snapshot are cleared so the activity restarts on the V3 scale.

Data-only and irreversible: old values are dropped, not archived, so
``downgrade()`` is a no-op. Replay-from-zero safe — on an empty DB every
statement touches zero rows.
"""
from alembic import op


revision = "f3d4e5a6b7c8"
down_revision = "e2c3d4f5a6b7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Order is irrelevant (no FK on total_score); leaderboard first so the
    # ranking-visible table is corrected even if the second statement is
    # interrupted on a non-transactional dialect.
    op.execute("UPDATE leaderboard_entries SET total_score = NULL")
    op.execute("UPDATE game_sessions SET total_score = NULL")
    # Reset territory standings — the score columns are old-scale snapshots
    # (see module docstring). These three tables hold no cross-references to
    # each other, so deletion order is free.
    op.execute("DELETE FROM territory_occupations")
    op.execute("DELETE FROM territory_session_uses")
    op.execute("DELETE FROM territory_rankings_snapshot")


def downgrade() -> None:
    # Irreversible data migration: the pre-V3 total_score values were dropped,
    # not archived, so there is nothing to restore.
    pass
