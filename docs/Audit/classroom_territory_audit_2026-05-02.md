# Classroom & Grabbing-Territory Audit

> **Date:** 2026-05-02
> **Scope:** Bugs, missing features, security gaps, and UX issues in the
> classroom subsystem (Teacher / Student / Admin / class membership) and
> the Grabbing-Territory mode (intra-class, inter-class, rankings, settlement).
> **Spec source of truth:** `docs/v2_implementation/v2_draft/V2.md`
> (especially Sections 2, 13, 14).

This audit consolidates three independent code-review passes covering:

1. Classroom features (Teacher / Student / Admin, profiles, RBAC)
2. Grabbing-Territory mechanics (slots, plays, settlement, concurrency)
3. Inter-class features (cross-class activities, External rankings, Global ranking)

Severity legend: **Critical · High · Medium · Low**.
Category legend: Bug · Missing Feature · Security · Concurrency · UX · Test Gap.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Top Priorities](#top-priorities)
3. [Section A — Classroom Subsystem](#section-a--classroom-subsystem)
4. [Section B — Grabbing-Territory Subsystem](#section-b--grabbing-territory-subsystem)
5. [Section C — Inter-Class Features & Rankings](#section-c--inter-class-features--rankings)
6. [Section D — Test-Coverage Gaps](#section-d--test-coverage-gaps)
7. [Files Audited](#files-audited)

---

## Executive Summary

The classroom and territory subsystems implement the core spec (CRUD, seize /
counter-seize, score comparison, 5-territory cap, settlement state machine)
and pass the happy path. However, multiple correctness, security, and spec
compliance gaps remain:

- **Authorization is leaky.** `play_territory` and the `?class_id=` listing
  parameter do not check class membership; teachers can read and even mutate
  other teachers' classes/activities; the class-leaderboard endpoint is
  unauthenticated and unscoped; the registration endpoint silently downgrades
  any selected role to `student`.
- **Concurrency is partial.** Several flows rely on optimistic SELECTs that
  do not lock; settlement and play race; the same-student 5-territory cap
  can be exceeded by parallel requests; `IntegrityError` propagates as 500
  instead of being translated to a domain error.
- **Spec drift.** `path_config` is stored on slots but never plumbed into
  gameplay, so each play of the same slot generates a different random level.
  The Internal/External ranking endpoints don't match the spec's metric
  ("Total Score") and definition ("average over all class students").
  Teacher-side delete/rename, player-name change, password change, and
  proper avatar upload are not implemented.
- **Data hygiene gaps.** Removing a student leaves their territory
  occupations intact; `session_id` on occupations is not a FK; cascade
  semantics on teacher deletion are untested; settlement has no audit
  trail.
- **Test coverage is limited to happy paths.** No tests cover RBAC
  enforcement, inter-class scope, deadline enforcement, settle/play race,
  external rankings, or session reuse after counter-seize.

Total: ~117 findings (6 Critical · ~25 High · ~30 Medium · ~50 Low / minor).

---

## Top Priorities

| # | Issue | Section / ID |
|---|-------|--------------|
| 1 | `play_territory` does not enforce class membership — students can play any intra-class activity slot. | B-C-1 |
| 2 | Concurrent seizes raise unhandled `IntegrityError` (500 instead of clean retry/failure). | B-C-3 |
| 3 | A counter-seized session row is hard-deleted, allowing the original session to be reused. | B-C-2 |
| 4 | Teachers can create / view / settle other teachers' classes & activities; `?class_id=` leaks across classes. | A-A-7, B-C-5, B-C-6, B-H-1, C-3, C-4, C-22 |
| 5 | `path_config` is stored but never used in gameplay — slots get random levels per play, breaking fair competition. | B-C-4 |
| 6 | Settlement and play are not lock-coordinated; manual settle and play race; `settle_expired` aborts batch on conflict. | B-H-2, B-H-3 |
| 7 | Registration silently ignores selected role; teacher self-registration is impossible. | A-A-5 / A-F-7 |
| 8 | `class_id=` query on `/api/leaderboard` is unauthenticated; any class roster scrape-able by UUID. | A-A-7 / A-F-9 |
| 9 | `add_student` requires raw UUIDs in the UI; teachers cannot add anyone in practice. | A-A-6 / A-F-2 |
| 10 | No "delete class" / "rename class" endpoints or UI. | A-A-1 / A-A-2 / A-F-4 |
| 11 | Removing a student leaves their territory occupations in place. | A-D-1 |
| 12 | No test coverage for class subsystem, inter-class scope, RBAC, or concurrency. | D-1, D-2 |

---

## Section A — Classroom Subsystem

### A.1 Missing Backend Features (Spec Compliance)

#### A-1. No "delete class" endpoint
- **Severity:** High · **Category:** Missing Feature
- **File:** `backend/app/routers/class_.py`, `backend/app/application/class_service.py`
- **Description:** `ClassRepository.delete()` is implemented at
  `backend/app/infrastructure/persistence/class_repository.py:50` but no
  application service or router exposes it. Spec §2.1 ("Teacher can
  Create/manage Classes") implies deletion. Once a class is created it
  cannot be deleted.
- **Fix:** Add `ClassApplicationService.delete_class(class_id, requester_id, requester_role)`
  and `DELETE /api/classes/{class_id}`. DB cascades for memberships and
  activities are already in place.

#### A-2. No "rename / update class" endpoint
- **Severity:** Medium · **Category:** Missing Feature
- **File:** `backend/app/routers/class_.py`, `backend/app/domain/class_/aggregate.py`
- **Fix:** Add `Class.rename(name)` (validating 1–100 chars), an
  `UpdateClassRequest` schema, and `PUT /api/classes/{id}`.

#### A-3. Player-name change not implemented
- **Severity:** Medium · **Category:** Missing Feature
- **File:** `backend/app/routers/auth.py`, `backend/app/application/auth_service.py`,
  `frontend/src/views/ProfileView.vue:91`
- **Description:** Spec §2.3 requires changeable player name. `auth_service`
  has `update_avatar` but no `update_player_name`.
- **Fix:** Add `PUT /api/auth/profile/name` (reuse `PLAYER_NAME_MIN/MAX_LENGTH`
  from `domain/user/constraints.py:3`).

#### A-4. Avatar upload not supported (only preset URL)
- **Severity:** Medium · **Category:** Missing Feature
- **File:** `backend/app/schemas/auth.py:127-147`
- **Description:** `AvatarUpdateRequest` accepts only a frozen set of 6
  preset URLs. Spec §2.3 says "selectable/uploadable".
- **Fix:** Either descope upload (and update spec) or add
  `POST /api/auth/profile/avatar/upload`.

#### A-5. Teacher self-registration is broken end-to-end
- **Severity:** High · **Category:** Bug + UX
- **Files:** `backend/app/routers/auth.py:56`, `frontend/src/views/AuthView.vue:121-126`,
  `frontend/src/composables/useAuth.ts:51`, `frontend/src/services/authService.ts:21-27`
- **Description:** The register handler hard-codes `role="student"`,
  silently discarding the role payload. The frontend exposes a Teacher
  selector and forwards the choice. Users select "Teacher", land as
  Student, and only direct DB editing recovers it.
- **Fix:** Either let the registration endpoint accept the requested role
  (already in the schema) or remove the selector and add an admin-only
  user-creation endpoint.

#### A-6. Cannot search students by email/name when adding to a class
- **Severity:** High · **Category:** Missing Feature
- **Files:** `backend/app/schemas/class_.py:39-43`, `frontend/src/views/ClassView.vue:220`
- **Description:** `AddStudentRequest` requires a UUID; the UI prompts
  for "學生 ID". Teachers don't know UUIDs, so the endpoint is unusable.
- **Fix:** Accept `email` in `AddStudentRequest` or expose a typeahead
  endpoint (admin-only) for teachers.

#### A-7. `class_id` parameter on `/api/leaderboard` is public and unscoped
- **Severity:** High · **Category:** Security
- **File:** `backend/app/routers/leaderboard.py:24-37`
- **Description:** The endpoint accepts an arbitrary `class_id` with no
  auth or membership check. Anyone can scrape any class's leaderboard by
  iterating UUIDs. Spec §2.1 limits class rankings to teachers and class
  members.
- **Fix:** Require auth and membership/ownership for the `class_id`
  branch; keep level/global public if intended.

#### A-8. Admin pagination is in-process (full-table scan)
- **Severity:** Low · **Category:** Bug (perf)
- **Files:** `backend/app/routers/admin.py:24-26`,
  `backend/app/application/admin_service.py:25-32`
- **Fix:** Push `LIMIT/OFFSET` into the repository methods and return
  total counts.

#### A-9. Admin lists lack membership / class-size visibility
- **Severity:** Low · **Category:** Missing Feature
- **File:** `backend/app/schemas/admin.py:15-22`
- **Fix:** Add `student_count` to `ClassSummaryOut` and
  `classes_joined_count` to `UserSummaryOut`.

### A.2 Bugs in Existing Backend Logic

#### A-10. `regenerate_join_code` does not retry on rare collision
- **Severity:** Low · **Category:** Bug
- **File:** `backend/app/application/class_service.py:135-142`
- **Description:** `create_class` retries 5×; `regenerate_join_code`
  doesn't, so a collision becomes a 500.
- **Fix:** Add the same retry loop.

#### A-11. `list_classes_for_student` performs N+1 queries
- **Severity:** Low · **Category:** Bug (perf)
- **File:** `backend/app/application/class_service.py:77-84`
- **Fix:** Add `ClassRepository.find_by_ids(ids)` and use one IN-query.

#### A-12. `Class.create` doesn't validate name in the aggregate
- **Severity:** Medium · **Category:** Bug (DDD invariant)
- **File:** `backend/app/domain/class_/aggregate.py:44-51`
- **Description:** Pydantic enforces 1–100 chars; the aggregate accepts
  anything. A non-Pydantic caller bypasses the rule and a `String(100)`
  overflow becomes a generic `DataError` 500.
- **Fix:** Add `Class._validate_name` and `ClassNameInvalidError`.

#### A-13. `add_student` returns misleading 403 for "user not found"
- **Severity:** Low · **Category:** Bug
- **File:** `backend/app/application/class_service.py:89-91`
- **Description:** Both "user does not exist" and "user is not a student"
  raise `PermissionDeniedError` with the same message.
- **Fix:** Distinguish `UserNotFoundError(404)` and `NotAStudentError(400)`.

#### A-14. Join-code stored without case constraint
- **Severity:** Low · **Category:** Defensive
- **File:** `backend/app/infrastructure/persistence/class_repository.py:22-23`
- **Description:** Codes are upper-cased at lookup but the column has no
  CHECK constraint. A manual edit can break lookups.
- **Fix:** Add `CHECK (join_code = upper(join_code))`.

#### A-15. `verify_owner` aggregate ignores admin; only the service knows
- **Severity:** Low · **Category:** Defense-in-depth
- **Files:** `backend/app/domain/class_/aggregate.py:56-59`,
  `backend/app/application/class_service.py:45-48`
- **Description:** Any future caller that uses `verify_owner` directly
  will block admins. Document the contract.

#### A-16. `add_student` race window between `find_membership` and INSERT
- **Severity:** Medium · **Category:** Concurrency
- **File:** `backend/app/application/class_service.py:86-101`
- **Description:** `SqlAlchemyUnitOfWork.__enter__` is a no-op (no
  `SELECT … FOR UPDATE`), so two concurrent calls both pass the read,
  one INSERT survives via the unique constraint. The catch translates it
  correctly, but the optimistic-with-unique pattern is undocumented.
- **Fix:** Document or move to explicit row lock.

### A.3 Authorization / RBAC Issues

#### A-17. Admin scope contradicts spec ("audits") but the code allows full mutation
- **Severity:** Low · **Category:** Spec ambiguity
- **File:** `backend/app/application/class_service.py:46`
- **Description:** Admin bypasses `verify_owner` everywhere. Spec §2.4
  uses "audits" implying read-only. Either tighten or document.

#### A-18. Teacher cannot view another teacher's class roster (intentional but undocumented)
- **Severity:** High (UX) · **Category:** Bug / Spec
- **File:** `backend/app/application/class_service.py:113-116`
- **Description:** May be intentional but should be documented; a school
  with multiple teachers cannot share students.

#### A-19. No student-facing `GET /api/classes/{id}` returning safe detail
- **Severity:** Medium · **Category:** Bug / Info disclosure
- **File:** `backend/app/routers/class_.py:66-75`
- **Description:** Endpoint requires TEACHER/ADMIN; students cannot fetch
  their own class detail. Should add a student-safe variant returning
  `ClassOutStudent`.

#### A-20. Admin role missing class-management UI
- **Severity:** Medium · **Category:** UX
- **File:** `frontend/src/views/ClassView.vue:170`
- **Description:** Join-by-code form is `v-if="isStudent"` and the join
  endpoint is `require_role(STUDENT)`, so admins cannot inspect or join
  any class. Spec gives admin "full system access".
- **Fix:** Add admin-only routes for cross-class inspection.

### A.4 Membership Lifecycle / Cascade

#### A-21. Removing a student leaves territory occupations intact
- **Severity:** High · **Category:** Data hygiene
- **Files:** `backend/app/application/class_service.py:103-111`,
  `backend/app/models/territory.py:51-71`
- **Description:** Deleting a class membership does not remove the
  student's territory occupations in activities scoped to that class.
  The student keeps owning territory in a class they no longer belong to.
- **Fix:** Add `TerritoryRepository.delete_occupations_for_student_in_class`
  and call it from `remove_student`.

#### A-22. No history / blocklist on re-join after removal
- **Severity:** Low · **Category:** Missing Feature
- **File:** `backend/app/application/class_service.py:118-133`
- **Description:** A removed student can immediately re-join via the
  code; no audit trail.

#### A-23. Teacher-deletion cascade not tested
- **Severity:** High · **Category:** Risk
- **File:** `backend/app/models/class_.py:18`
- **Description:** `Class.teacher_id` is `ondelete="CASCADE"`; deleting a
  teacher destroys all of their classes, memberships, activities, slots,
  and occupations. No endpoint exists, but a DB-level delete is
  destructive. Test or change to `SET NULL` + reassign.

#### A-24. No soft-delete / `is_active` on user
- **Severity:** Low · **Category:** Missing Feature
- **File:** `backend/app/models/user.py`
- **Description:** Logout revokes the token only; the account is
  permanent. No way to disable a misbehaving account.

### A.5 Validation / Edge Cases

#### A-25. No unique `(teacher_id, name)` on classes
- **Severity:** Low · **Category:** UX
- **File:** `backend/app/schemas/class_.py:5-16`
- **Description:** Teachers can create many classes with identical names.

#### A-26. 6-character join code enables enumeration
- **Severity:** Low · **Category:** Security
- **File:** `backend/app/domain/class_/aggregate.py:12-13`
- **Description:** 36⁶ ≈ 2.18 billion. With `10/min` per-IP limiting and
  a distributed attacker, codes are enumerable over time. Consider 8 chars
  or per-invitation tokens.

#### A-27. Discriminated union response model may emit extra fields
- **Severity:** Low · **Category:** Bug (potential)
- **File:** `backend/app/routers/class_.py:39`
- **Description:** `response_model=list[ClassOut | ClassOutStudent]`'s
  resolution order may include `join_code: ""` for student rows.
- **Fix:** Split routes or test serialization.

#### A-28. Join-code stripped/uppercased twice (cosmetic)
- **Severity:** Low · **Category:** Cleanup
- **Files:** `backend/app/schemas/class_.py:53`,
  `backend/app/application/class_service.py:121`

#### A-29. Limiter on `create_class` may starve under collision retries
- **Severity:** Low · **Category:** Bug (rare)
- **File:** `backend/app/application/class_service.py:52`
- **Description:** 10/min limiter combined with internal 5× retries means
  an unlucky teacher with collisions can be rate-limited.

### A.6 Frontend Issues (Classroom)

#### A-F-1. `ClassView.vue` mixes Chinese and English
- **Severity:** Low · **Category:** i18n / UX
- **File:** `frontend/src/views/ClassView.vue:154-236`
- **Description:** Hard-coded zh-TW strings; other views are in English.

#### A-F-2. Adding student requires raw UUID input
- **Severity:** High · **Category:** UX (depends on A-6)
- **File:** `frontend/src/views/ClassView.vue:220`

#### A-F-3. Remove-student dialog shows UUID, not name
- **Severity:** Low · **Category:** UX
- **File:** `frontend/src/views/ClassView.vue:114-116, 229`
- **Fix:** Extend `MembershipOut` with `player_name` and `email`.

#### A-F-4. No "delete class" / "rename class" UI
- **Severity:** High · **Category:** Missing Feature

#### A-F-5. No clipboard fallback or copy feedback
- **Severity:** Low · **Category:** UX
- **File:** `frontend/src/views/ClassView.vue:139-146`

#### A-F-6. Teacher Dashboard "click class" navigates to list, not detail
- **Severity:** Low · **Category:** UX
- **File:** `frontend/src/views/TeacherDashboard.vue:43`

#### A-F-7. Registration role selector silently ignored (see A-5)
- **Severity:** High · **Category:** UX

#### A-F-8. No password-change UI even though backend exists
- **Severity:** Medium · **Category:** Missing Feature
- **Files:** `backend/app/routers/auth.py:94`,
  `frontend/src/views/ProfileView.vue` (no call), `authService.ts` (no method)

#### A-F-9. RankingsView "class" tab calls unauthenticated endpoint (see A-7)
- **Severity:** Medium · **Category:** Security
- **Files:** `frontend/src/services/rankingService.ts:17-24`,
  `frontend/src/views/RankingsView.vue:74-94`

#### A-F-10. No Pinia `classStore` (re-fetch on every navigation)
- **Severity:** Low · **Category:** Inconsistency
- **File:** `frontend/src/stores/`

#### A-F-11. Student view of class list never shows owning teacher's name
- **Severity:** Low · **Category:** UX
- **File:** `frontend/src/views/ClassView.vue:184-213`
- **Fix:** Backend should return `teacher_player_name` in `ClassOutStudent`.

#### A-F-12. Regenerate-code button has no confirmation dialog
- **Severity:** Low · **Category:** UX
- **File:** `frontend/src/views/ClassView.vue:204-208`

---

## Section B — Grabbing-Territory Subsystem

### B.1 Critical

#### B-C-1. `play_territory` does not enforce class membership
- **Severity:** Critical · **Category:** Security
- **File:** `backend/app/application/territory_service.py:156-200`
- **Description:** Unlike `get_activity_detail` / `*_rankings`,
  `play_territory` never calls `_verify_activity_access`. Any student can
  play any intra-class activity slot if they know the slot id (slot ids
  leak through several paths). Breaks §13.4 intra-class scope.
- **Fix:** Call `self._verify_activity_access(activity, student_id, Role.STUDENT)`
  immediately after `_get_activity_or_raise`.

#### B-C-2. Counter-seized session can be replayed against another slot
- **Severity:** Critical · **Category:** Bug
- **Files:** `backend/app/application/territory_service.py:189-192`,
  `backend/app/infrastructure/persistence/territory_repository.py:184-186`
- **Description:** `delete_occupation(slot_id)` hard-removes the previous
  holder's row; once the row is gone, the unique session_id constraint
  no longer fires and `is_session_used` returns False. The displaced
  student can reuse their old completed session against another slot.
- **Fix:** Add a separate `territory_session_uses` table, soft-delete the
  occupation, or move session_id tracking out of `territory_occupations`.

#### B-C-3. Concurrent seizes of an unoccupied slot raise unhandled IntegrityError
- **Severity:** Critical · **Category:** Concurrency
- **Files:** `backend/app/infrastructure/persistence/territory_repository.py:131-138`,
  `backend/app/application/territory_service.py:163-193`
- **Description:** `find_occupation_by_slot_for_update` cannot lock a
  non-existent row. Two concurrent students both see `occ_from_db = None`,
  both insert; the unique constraint catches one but the resulting
  `IntegrityError` becomes a 500.
- **Fix:** Either lock the parent slot with `with_for_update()`, or wrap
  `save_occupation` in a try/except translating the violation into
  retry / `seized=False`.

#### B-C-4. `path_config` is dead data — slots get random levels per play
- **Severity:** Critical · **Category:** Missing Feature
- **Files:** `frontend/src/views/TerritoryDetailView.vue:24-40`,
  `frontend/src/views/TeacherTerritorySetup.vue:42`,
  `backend/app/schemas/territory.py:11-22`
- **Description:** Backend stores `slot.path_config` and exposes it in
  `SlotOut`. Frontend `TeacherTerritorySetup` only sends `{star_rating}`.
  `TerritoryDetailView.handlePlay` ignores `slot.path_config` and
  generates a fresh random level seeded with `Date.now()`. Each play of
  the same slot becomes a different level → no fair competition.
- **Fix:** Either authoring UI for paths, plumb `slot.path_config` into
  the level generator and session creation, or drop `path_config`
  altogether and document.

#### B-C-5. Teachers can create activities in classes they don't own
- **Severity:** Critical · **Category:** Security
- **File:** `backend/app/application/territory_service.py:58-90`
- **Description:** `create_activity` only verifies the class exists.
  Teacher A can create an activity inside Teacher B's class.
- **Fix:** Verify `cls_.teacher_id == teacher_id` (admins exempt).

#### B-C-6. `list_activities(class_id=…)` leaks across classes
- **Severity:** Critical · **Category:** Security / Privacy
- **File:** `backend/app/application/territory_service.py:92-99`
- **Description:** `if class_id: return self._territory_repo.find_activities_by_class(class_id)`
  is taken before role-based filtering, so anyone authenticated can
  enumerate any class's activities.
- **Fix:** When `class_id` is supplied, verify membership / ownership /
  admin.

### B.2 High

#### B-H-1. Any teacher can view another teacher's activity detail / rankings
- **Severity:** High · **Category:** Security
- **File:** `backend/app/application/territory_service.py:118-131`
- **Description:** `_verify_activity_access` short-circuits for any
  teacher (`if user_role in (ADMIN, TEACHER): return`).
- **Fix:** For teachers, require `activity.teacher_id == user_id` (or
  inter-class) unless admin.

#### B-H-2. Settle vs. play race
- **Severity:** High · **Category:** Concurrency
- **File:** `backend/app/application/territory_service.py:156-200, 224-247`
- **Description:** Play loads activity (no row lock) and only checks
  `settled` in-memory; meanwhile another transaction can flip
  `settled=True` and commit, after which the play still commits. The
  freeze is bypass-able.
- **Fix:** `SELECT … FOR UPDATE` on the activity row in both `play_territory`
  and `settle_activity` / `settle_expired`.

#### B-H-3. `settle_expired` aborts batch on `ActivityAlreadySettledError`
- **Severity:** High · **Category:** Concurrency
- **File:** `backend/app/application/territory_service.py:238-247`
- **Fix:** Catch per-item, or do an idempotent
  `UPDATE … WHERE id=? AND settled=false` and skip 0-row results.

#### B-H-4. Deadline can be set in the past
- **Severity:** High · **Category:** Bug / UX
- **Files:** `backend/app/schemas/territory.py:25-40`,
  `backend/app/application/territory_service.py:58-90`
- **Description:** A teacher can submit a past deadline; the activity is
  immediately expired and unusable.
- **Fix:** Pydantic + domain guard: `deadline > now + minimum_buffer`.

#### B-H-5. Deadline check happens after expensive session validation
- **Severity:** High · **Category:** Concurrency / Bug
- **File:** `backend/app/application/territory_service.py:156-200`
- **Description:** `attempt_occupation → ensure_playable` runs after
  `_validate_session` and `is_session_used`. Plays around the boundary
  do work that must roll back.
- **Fix:** Move `activity.ensure_playable()` to the very top of
  `play_territory`.

#### B-H-6. `is_session_used` not atomic with insertion
- **Severity:** High · **Category:** Concurrency
- **Files:** `backend/app/application/territory_service.py:174-192`,
  `backend/app/infrastructure/persistence/territory_repository.py:158-163`
- **Description:** Two parallel plays of the same session against
  different slots both observe "not used" and both insert; unique
  constraint catches one but the IntegrityError becomes 500.
- **Fix:** Lock the session row, or catch IntegrityError + translate.

#### B-H-7. `session_id` on `territory_occupations` is not a FK
- **Severity:** High · **Category:** Data integrity
- **File:** `backend/app/models/territory.py:68`
- **Fix:** Add `ForeignKey("game_sessions.id", ondelete="SET NULL")` and
  an index.

#### B-H-8. Lock acquired before `slot.activity_id` validation
- **Severity:** High · **Category:** Bug
- **File:** `backend/app/application/territory_service.py:166-170`
- **Description:** Hostile users can DoS occupation rows by passing
  `(activity_A, slot_in_B)` and acquiring locks on unrelated slots.
- **Fix:** Validate `slot.activity_id == activity_id` before locking.

#### B-H-9. External rankings exclude classes whose students hold no territory
- **Severity:** High · **Category:** Bug
- **File:** `backend/app/infrastructure/persistence/territory_repository.py:188-217`
- **Description:** `INNER JOIN` on `student_val` drops classes whose
  members all failed. Spec §14.3 says External = average over **all**
  class students, including 0-scorers.
- **Fix:** `LEFT JOIN ClassMembership` with `COALESCE(territory_value, 0)`.

#### B-H-10. External rankings ignore activity's `class_id` scope
- **Severity:** High · **Category:** Bug
- **File:** `backend/app/infrastructure/persistence/territory_repository.py:188-217`
- **Description:** For an intra-class activity, only the activity's class
  should appear. The current query groups across all participants'
  classes, so a student in classes X and Y with X's activity is counted
  in both X and Y. Also returns nonsense for intra-class activities.
- **Fix:** When `activity.class_id is not None`, scope to that class
  only. Or short-circuit and return [] for intra-class.

#### B-H-11. Internal rankings response omits player names
- **Severity:** High (UX) · **Category:** Missing Feature
- **Files:** `backend/app/application/territory_service.py:207-222`,
  `frontend/src/views/RankingsView.vue:255-261`
- **Description:** Endpoint returns only `{rank, student_id, territory_value}`;
  UI shows UUID prefixes. Slot occupation endpoint already joins
  `players.player_name`; rankings should too.
- **Fix:** Join and add `player_name` to `RankingEntryOut`.

#### B-H-12. Frontend does not disable Play for expired/settled activities
- **Severity:** High · **Category:** UX
- **Files:** `frontend/src/components/territory/TerritorySlotCard.vue:34-40`,
  `frontend/src/views/TerritoryDetailView.vue:80-89`
- **Description:** Players can launch a 5–10 min game and be 409-rejected
  on submission. `TerritoryListView` already classifies the activity but
  doesn't propagate to slot cards.
- **Fix:** Pass a `disabledReason` from `TerritoryDetailView` into
  `TerritorySlotCard`.

### B.3 Medium

#### B-M-1. 5-territory cap can be exceeded by parallel requests
- **Severity:** Medium · **Category:** Concurrency
- **Files:** `backend/app/application/territory_service.py:179-192`,
  `backend/app/infrastructure/persistence/territory_repository.py:148-156`
- **Description:** `count_occupations_by_student_for_update` only locks
  existing rows, not the count. Two parallel plays for the same student
  both see count=4 → both insert → 6 occupations.
- **Fix:** Per-(activity, student) advisory lock, or serializable retry.

#### B-M-2. `attempt_occupation` mutates aggregate before persistence
- **Severity:** Medium · **Category:** Bug (correctness on retry)
- **File:** `backend/app/domain/territory/aggregate.py:165-205`
- **Fix:** Defer mutation until after persistence, or discard aggregate
  on rollback.

#### B-M-3. `_validate_session` rejects `total_score == 0`
- **Severity:** Medium · **Category:** Bug
- **File:** `backend/app/application/territory_service.py:147-148`
- **Fix:** Use `< 0` or just reject `None`.

#### B-M-4. Internal rankings ignore ties
- **Severity:** Medium · **Category:** Bug
- **File:** `backend/app/application/territory_service.py:218-222`
- **Fix:** Apply competition-style or dense ranks; secondary sort by
  player_name.

#### B-M-5. Deadline equality boundary is `>`, not `>=`
- **Severity:** Medium · **Category:** Bug
- **File:** `backend/app/domain/territory/aggregate.py:130-137`

#### B-M-6. Active-session abandonment from territory flow has no warning
- **Severity:** Medium · **Category:** UX
- **File:** `backend/app/application/session_service.py:65-83`

#### B-M-7. Settlement lacks audit trail (no `settled_at`/`settled_by`)
- **Severity:** Medium · **Category:** Missing Feature
- **Files:** `backend/app/models/territory.py:11-31`,
  `backend/app/domain/territory/aggregate.py:207-211`

#### B-M-8. No `(activity_id, slot_index)` uniqueness
- **Severity:** Medium · **Category:** Data integrity
- **File:** `backend/app/models/territory.py:34-48`
- **Fix:** Add `UniqueConstraint("activity_id", "slot_index", name="uq_territory_slot_activity_index")`.

#### B-M-9. Activity title accepts control / zero-width characters
- **Severity:** Medium · **Category:** Bug
- **File:** `backend/app/schemas/territory.py:33-40`
- **Fix:** Reject non-printable characters.

#### B-M-10. `path_config` JSON has no shape validation
- **Severity:** Medium · **Category:** Bug
- **File:** `backend/app/schemas/territory.py:11-22`
- **Fix:** Define a Pydantic model for path_config.

#### B-M-11. `_activity_to_domain` always loads `slots=[]`
- **Severity:** Medium (latent) · **Category:** Bug
- **File:** `backend/app/infrastructure/persistence/territory_repository.py:246-256`

#### B-M-12. RankingsView dropdown lists all activities, ignoring scope
- **Severity:** Medium · **Category:** UX
- **File:** `frontend/src/views/RankingsView.vue:172-184`

#### B-M-13. Teachers without a class can still create inter-class activities
- **Severity:** Medium · **Category:** UX / spec
- **File:** `frontend/src/views/TerritoryListView.vue:24-30`

### B.4 Low

#### B-L-1. `find_unsettled_expired_activities` does not order results
- **Severity:** Low · **Category:** Bug
- **File:** `backend/app/infrastructure/persistence/territory_repository.py:46-53`

#### B-L-2. `RankingsView` falls back to UUID-slice for class names
- **Severity:** Low · **Category:** UX
- **File:** `frontend/src/views/RankingsView.vue:49-51`

#### B-L-3. Teacher can settle before the deadline without warning
- **Severity:** Low · **Category:** UX
- **File:** `frontend/src/views/TerritoryDetailView.vue:18-21`

#### B-L-4. `Date.now()`-seeded level generation per play
- **Severity:** Low (depends on B-C-4) · **Category:** Bug
- **File:** `frontend/src/views/TerritoryDetailView.vue:28`
- **Fix:** Seed from `slot.id` so all plays of the same slot share level.

#### B-L-5. `TerritoryResultView` lacks retry UI
- **Severity:** Low · **Category:** UX
- **File:** `frontend/src/views/TerritoryResultView.vue:42-58`

#### B-L-6. `TerritoryListView` does not paginate
- **Severity:** Low · **Category:** UX

#### B-L-7. `OccupationOut` exposes raw `student_id`
- **Severity:** Low · **Category:** Privacy
- **File:** `backend/app/schemas/territory.py:48-56`

#### B-L-8. Duplicate `star_rating` slots accepted silently
- **Severity:** Low · **Category:** UX
- **File:** `backend/app/schemas/territory.py:25-40`

#### B-L-9. Student `list_activities` is N+1
- **Severity:** Low · **Category:** Performance
- **File:** `backend/app/application/territory_service.py:104-115`

#### B-L-10. Delete + insert pattern instead of UPSERT in counter-seize
- **Severity:** Low · **Category:** Bug (cosmetic)
- **File:** `backend/app/application/territory_service.py:184-192`

#### B-L-11. CSRF posture for state-changing endpoints unspecified
- **Severity:** Low · **Category:** Security
- **File:** `backend/app/routers/territory.py`

#### B-L-12. Dead repository methods (`find_max_star_for_student`, `count_territories_by_student`)
- **Severity:** Low · **Category:** Cleanup
- **File:** `backend/app/infrastructure/persistence/territory_repository.py:219-233`

#### B-L-13. `TerritoryResultView` shows defender's score on failed seize
- **Severity:** Low · **Category:** Bug
- **Files:** `frontend/src/views/TerritoryResultView.vue:25-29`,
  `backend/app/application/territory_service.py:185-187`

#### B-L-14. Default class on `TeacherTerritorySetup` is `null` (inter-class)
- **Severity:** Low · **Category:** UX
- **File:** `frontend/src/views/TeacherTerritorySetup.vue:12, 81`

#### B-L-15. `path_config` 10 KiB limit only at Pydantic layer
- **Severity:** Low · **Category:** Defense-in-depth
- **File:** `backend/app/schemas/territory.py:8, 19-22`

---

## Section C — Inter-Class Features & Rankings

#### C-1. External rankings double-count multi-class students
- **Severity:** High · **Category:** Bug
- **File:** `backend/app/infrastructure/persistence/territory_repository.py:188-217`
- **Description:** Joins `class_memberships` to per-student totals. A
  student in classes A and B contributes their score to both class
  averages. Also, the per-class denominator counts only participating
  members, inflating averages of classes with non-participating members.
  Spec is ambiguous; the current behavior is neither "all members" nor
  "participating only" cleanly.
- **Fix:** Decide and document the denominator. Likely: `LEFT JOIN
  memberships`, `COALESCE → 0`, weight a multi-class student's
  contribution as `1/N`.

#### C-2. External rankings run on intra-class activities
- **Severity:** High · **Category:** Bug
- **Files:** `backend/app/application/territory_service.py:202-205`,
  `backend/app/infrastructure/persistence/territory_repository.py:188-217`
- **Description:** Endpoint never reads `activity.class_id`. For
  intra-class activities the External breakdown is meaningless.
- **Fix:** In the application service, return `[]` (or 400) when
  `activity.class_id is not None`.

#### C-3. Teachers cannot list other teachers' inter-class activities
- **Severity:** High · **Category:** Bug / Missing Feature
- **File:** `backend/app/application/territory_service.py:100-103, 125-126`
- **Description:** `list_activities` for `Role.TEACHER` returns only their
  own activities, but `_verify_activity_access` lets any teacher view
  any activity's detail. Asymmetric: cosmetic check, list is wrong for
  inter-class.
- **Fix:** For teachers, return owned + inter-class. Tighten access
  check.

#### C-4. Any teacher can scope an activity to another teacher's class
  *(duplicate of B-C-5; included here for inter-class context)*
- **Severity:** High · **Category:** Security
- **File:** `backend/app/application/territory_service.py:66-78`

#### C-5. Settlement of inter-class activities locked to original creator
- **Severity:** Medium · **Category:** Bug
- **File:** `backend/app/application/territory_service.py:230-236`
- **Description:** Spec doesn't say which teacher "owns" an inter-class
  activity. Only the original `teacher_id` (or admin) can settle.
- **Fix:** Allow any teacher to settle if `class_id is None`, or document.

#### C-6. `list_activities` is O(N+M) for inter-class scope
- **Severity:** Low · **Category:** Performance
- **File:** `backend/app/application/territory_service.py:104-115`

#### C-7. No visual treatment of inter-class vs intra-class activities
- **Severity:** Medium · **Category:** UX
- **Files:** `frontend/src/views/TerritoryListView.vue:40-55`,
  `frontend/src/views/TerritoryDetailView.vue`
- **Fix:** "All classes" badge if `class_id is None`, otherwise the
  class name (extend `ActivityOut` with `class_name`).

#### C-8. No filter for inter-class activities in the UI
- **Severity:** Low · **Category:** UX
- **Files:** `frontend/src/views/TerritoryListView.vue`,
  `frontend/src/stores/territoryStore.ts:28-38`
- **Description:** Store supports `loadActivities(classId)` but the view
  never passes one; no scope dropdown.

#### C-9. Internal tab metric mismatches spec ("Total Score" vs territory value)
- **Severity:** Medium · **Category:** Bug / UX
- **Files:** `frontend/src/views/RankingsView.vue:13-20, 247-262`,
  `backend/app/application/territory_service.py:207-222`
- **Description:** Spec §14.3 Internal = per-student Total Score; the
  endpoint returns sum of star ratings.
- **Fix:** Either rename the tab to "Activity Rankings" or implement a
  spec-faithful Internal endpoint by Total Score.

#### C-10. Internal/External activity dropdown lists all activities regardless of tab
- **Severity:** Low · **Category:** UX
- **File:** `frontend/src/views/RankingsView.vue:217-220, 173-184`
- **Fix:** Filter by tab; External should list inter-class activities only.

#### C-11. Internal table shows UUID prefix instead of player name
  *(duplicate of B-H-11; restated here for completeness)*
- **Severity:** Medium · **Category:** Bug / UX / Privacy
- **Files:** `frontend/src/views/RankingsView.vue:255-258`,
  `backend/app/application/territory_service.py:218-222`

#### C-12. External rankings show `class_id` UUID prefix when class not in user's list
- **Severity:** Low · **Category:** UX
- **File:** `frontend/src/views/RankingsView.vue:49-51, 273-275`
- **Fix:** Backend should include `class_name` in `ExternalRankingEntryOut`.

#### C-13. No cross-class transfer endpoint
- **Severity:** Medium · **Category:** Missing Feature
- **Description:** No atomic "move student between classes". Workaround
  via remove+add fails across teacher boundaries.
- **Fix:** Admin-only `POST /api/admin/students/{id}/transfer`, or
  document multi-class as the model.

#### C-14. Global Ranking endpoint is leaky and mixes incompatible scopes
- **Severity:** Medium · **Category:** Bug / Security
- **Files:** `backend/app/routers/leaderboard.py:24-37`,
  `backend/app/application/leaderboard_service.py:48-52`
- **Description:** Spec §14.2 says Global = all players across all classes
  by Total Score. Endpoint mixes per-level and global; with `level=None`
  it pools every level, so a Lv1 50000 outranks a Lv5 30000. Frontend
  hard-codes levels `[undefined, 1, 2, 3, 4]` (V1), excluding Lv5.
- **Fix:** Define a true Global metric (max per-player across levels, or
  per-level normalised). Update level list.

#### C-15. Leaderboard service / view type mismatch
- **Severity:** Low · **Category:** Bug
- **Files:** `frontend/src/services/rankingService.ts:14, 23`,
  `frontend/src/views/RankingsView.vue:26`

#### C-16. `query_ranked_by_class` joins User and silently drops NULL `user_id`
- **Severity:** Low · **Category:** Bug (edge)
- **File:** `backend/app/infrastructure/persistence/leaderboard_repository.py:128-195`

#### C-17. `class_id=` query param leaks across classes
  *(duplicate of B-C-6; restated here for inter-class context)*
- **Severity:** Critical · **Category:** Security
- **Files:** `backend/app/routers/territory.py:48-61`,
  `backend/app/application/territory_service.py:98-99`

#### C-18. Inter-class activity creator name not shown in the UI
- **Severity:** Low · **Category:** UX
- **File:** `frontend/src/views/TerritoryDetailView.vue:69-78`
- **Fix:** Resolve `teacher_id → player_name` server-side.

#### C-19. Per-activity 5-cap allows global accumulation across activities
- **Severity:** Low · **Category:** Spec clarification
- **File:** `backend/app/application/territory_service.py:179`,
  `backend/app/infrastructure/persistence/territory_repository.py:140-156`
- **Description:** Cap is per-activity. A student can hold 5 in each of
  N concurrent activities. Spec doesn't define a global cap; flag for
  product clarification.

#### C-20. Settlement scheduler emits no notice / event
- **Severity:** Low · **Category:** Missing Feature
- **File:** `backend/app/application/territory_service.py:238-247`

#### C-21. Pre-settlement rankings visible to students
- **Severity:** Low · **Category:** Spec clarification
- **File:** `backend/app/application/territory_service.py:207-222`
- **Description:** Spec §13.5 says rankings computed at settlement;
  current code shows live rankings. UX-positive but unspec'd.

---

## Section D — Test-Coverage Gaps

#### D-1. No tests for the class subsystem
- **Severity:** High · **Category:** Test Gap
- **Path:** `backend/tests/`
- **Description:** No `test_class*.py`; no class-related cases in
  existing files. Suggested cases:
  - Teacher creates → 201; another teacher cannot view/mutate → 403
  - Student joins by valid code → 201; same code again → 409
  - Removing membership cascades territory occupations (after A-21 fix)
  - Admin can list all classes; student cannot
  - Regenerate code invalidates old code
  - Add nonexistent student → 404; add a teacher as student → 400
  - Concurrent join — exactly one succeeds
  - Cascade behaviour on user/class delete (after A-23 fix)

#### D-2. No tests for inter-class scope
- **Severity:** High · **Category:** Test Gap
- **Path:** `backend/tests/test_territory.py`
- **Description:** No coverage for `class_id is NULL` activities or
  external rankings or multi-class membership. Suggested cases:
  - Teacher creates `class_id=NULL` → student in any class sees it;
    student in no class also sees it
  - Student in classes A and B sees a NULL-scope activity once (no dups)
  - External rankings: 2 classes × 2 students each, all play; verify
    ranks and averages
  - Multi-class student counted correctly (or document chosen
    denominator)
  - Teacher A cannot create activity scoped to Teacher B's class
  - `?class_id=` does not leak unrelated classes' activities
  - `play_territory` rejects students outside the class
  - `play` after deadline → 409
  - `settle_expired` racing with manual settle is idempotent
  - ScoreNotHighEnough on tie (`new_score == old_score`)
  - Session reuse after counter-seize is rejected (after B-C-2 fix)
  - `effective_occupation_count` when at cap and counter-seizing
  - `path_config` round-trip (after B-C-4 fix)
  - Settlement locks out subsequent plays

#### D-3. No tests for `class_id` parameter on `/api/leaderboard`
- **Severity:** High · **Category:** Test Gap
- **Description:** Anonymous-access regression test absent.

#### D-4. Avatar whitelist not asserted between frontend and backend
- **Severity:** Low · **Category:** Test Gap
- **Files:** `backend/app/schemas/auth.py:128`,
  `frontend/src/views/ProfileView.vue:17-24`
- **Description:** The 6-URL whitelist is duplicated in two places with
  no shared constant or test asserting equality.

---

## Files Audited

### Backend
- `backend/app/routers/` — `auth.py`, `class_.py`, `territory.py`, `leaderboard.py`, `admin.py`, `game_session.py`
- `backend/app/application/` — `auth_service.py`, `class_service.py`, `territory_service.py`, `leaderboard_service.py`, `admin_service.py`, `session_service.py`, `mappers.py`
- `backend/app/domain/` — `class_/aggregate.py`, `class_/repository.py`, `class_/errors.py`, `territory/aggregate.py`, `territory/repository.py`, `territory/errors.py`, `user/aggregate.py`, `user/value_objects.py`, `user/constraints.py`
- `backend/app/infrastructure/persistence/` — `class_repository.py`, `territory_repository.py`, `leaderboard_repository.py`, `user_repository.py`, `unit_of_work.py`
- `backend/app/models/` — `class_.py`, `class_membership.py`, `territory.py`, `user.py`, `leaderboard.py`, `game_session.py`
- `backend/app/schemas/` — `class_.py`, `territory.py`, `auth.py`, `admin.py`, `leaderboard.py`
- `backend/tests/` — entire directory grep + read of `test_territory.py`

### Frontend
- `frontend/src/views/` — `AuthView.vue`, `ProfileView.vue`, `ClassView.vue`, `TeacherDashboard.vue`, `MenuView.vue`, `TerritoryListView.vue`, `TerritoryDetailView.vue`, `TerritoryResultView.vue`, `TeacherTerritorySetup.vue`, `RankingsView.vue`, `LeaderboardView.vue`
- `frontend/src/components/territory/` — `TerritorySlotCard.vue`
- `frontend/src/stores/` — `auth.ts`, `territoryStore.ts`
- `frontend/src/services/` — `authService.ts`, `classService.ts`, `territoryService.ts`, `rankingService.ts`, `leaderboardService.ts`
- `frontend/src/composables/` — `useAuth.ts`, `useSessionSync.ts`
- `frontend/src/router/index.ts`

### Spec
- `docs/v2_implementation/v2_draft/V2.md` (Sections 2, 13, 14)

---

*End of audit. Generated 2026-05-02.*
