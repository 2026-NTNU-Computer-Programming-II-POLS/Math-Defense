# Technical-Debt Ledger

> Canonical ledger of shims, flags, and audit scripts introduced by in-flight
> features. Each row names its own removal date. `scripts/check-debt-ledger.ts`
> (landing in Phase 1 of the Piecewise Paths feature) fails CI on any entry
> whose `Scheduled removal` is in the past.
>
> **No entry is open-ended.** Deadline extensions are allowed only in writing
> and must carry a new dated deadline.

## Active entries

| Item | Introduced | Scheduled removal | Owner | Phase that closes |
|---|---|---|---|---|
| `SEGMENTED_PATHS_ENABLED` flag | Phase 1 (Piecewise Paths) | ship-date + 14d | Feature owner | Phase 7 |

## Retired entries

_(none yet)_

## Governance

- Every row must name the Item, when it was Introduced, a dated Scheduled
  removal, the Owner accountable, and the Phase that closes it.
- `ship-date` resolves to the UTC calendar date of the Phase 6 merge commit
  that flips `SEGMENTED_PATHS_ENABLED = true`. All `ship-date + Nd` deadlines
  in this ledger resolve against that date.
- A row moves to **Retired entries** only when its symbol is deleted from the
  repo and the closing commit is linked in the row.
- To extend a deadline, open a PR that replaces the `Scheduled removal` with
  a new dated value and links the rationale. Silent slips are not allowed.
