# Math-Defense — Bug Report Log

All confirmed bugs found during per-feature debugging are recorded here, newest first.
Each entry is appended as a `##` section. Do not delete past entries; mark them resolved instead.

**Status legend:** 🔴 Open · 🟡 In progress · 🟢 Fixed

---

<!-- New bug entries are appended below this line. Template:

## [BUG-NNN] <Short title>

- **Status:** 🔴 Open
- **Severity:** Critical / High / Medium / Low
- **Feature:** <feature name / endpoint>
- **Account level:** admin / teacher / student / anonymous
- **Date found:** YYYY-MM-DD

**Affected Files**
- `path/to/file.ext:line`

**Steps to Reproduce**
1. ...

**Expected vs Actual**
- Expected: ...
- Actual: ...

**Root Cause Analysis**
...

**Suggested Fix** (describe only, do not implement)
...

---
-->

## [BUG-001] Depleted Ward Shield keeps its active-buff slot, blocking re-purchase and showing a misleading countdown

- **Status:** 🔴 Open
- **Severity:** Medium
- **Feature:** In-game Shop (Ward Shield buff) — `shop_shield` / `SHIELD_ACTIVATE`
- **Account level:** any in-game player (student / anonymous)
- **Date found:** 2026-06-07

**Affected Files**
- `frontend/src/systems/EconomySystem.ts:31` (shield hit-absorption: zeroes `shieldActive` at 0 hits but never touches `activeBuffs`)
- `frontend/src/systems/BuffSystem.ts:285` (`update()` — the only place a shield entry is removed, and only when its 30s timer reaches 0)
- `frontend/src/systems/BuffSystem.ts:135` (`SHIELD_ACTIVATE` / `SHIELD_DEACTIVATE` effect strategies)
- `frontend/src/components/game/ShopPanel.vue:64` (`alreadyActive` keyed on `effectId` in `activeBuffs`)
- `frontend/src/components/game/ShopPanel.vue:161` (`:disabled="... || item.alreadyActive || ..."`)
- `frontend/src/data/buff-defs.ts:99` (`shop_shield` def: `duration: 30`, `effectId: SHIELD_ACTIVATE`)

**Steps to Reproduce**
1. During BUILD, buy **Ward Shield** ("Halve the next 3 damage hits for 30s"). `shieldHitsRemaining = 3`, a 30s active-buff entry is pushed.
2. Start the wave. Let 3 enemies reach the origin so all 3 shield hits are absorbed early in the wave (well before 30s elapse). `EconomySystem` sets `shieldHitsRemaining = 0`, `shieldActive = false`, `shieldReductionFactor = 1`.
3. Finish the wave and return to the next BUILD phase, then open the Shop.

**Expected vs Actual**
- Expected: Once the shield is fully consumed (0 hits), it should no longer count as an active buff — the player should be able to buy a fresh Ward Shield for the next wave, and the shop should not advertise non-existent protection.
- Actual: The Ward Shield item still renders as `active` with a (frozen) countdown timer and its button is **disabled** (`alreadyActive`), because the active-buff entry persists until the 30s timer expires. The player cannot re-buy protection even though the current shield absorbs nothing.

**Root Cause Analysis**
A Ward Shield has two independent expiry conditions — 3 absorbed hits (consumed in `EconomySystem.ts:31`) OR 30 seconds (ticked in `BuffSystem.update`, `BuffSystem.ts:285`). Only the timer path removes the `activeBuffs` entry (via `splice` + `BUFF_EXPIRED`/`ACTIVE_BUFFS_CHANGED`). When the hit-count path drains to 0 first, `EconomySystem` flips the shield flags off but leaves the `activeBuffs` entry in place and emits no event. The shop's `alreadyActive` test (`activeByEffectId.get('SHIELD_ACTIVATE') !== null`) therefore stays true for the remainder of the 30s, gating re-purchase and surfacing a countdown that no longer reflects any real protection. The two expiry conditions are not reconciled into a single source of truth for "is the shield still active."

**Suggested Fix** (describe only, do not implement)
When `shieldHitsRemaining` reaches 0 in `EconomySystem`, also retire the corresponding `SHIELD_ACTIVATE` entry from `game.state.activeBuffs` (and emit `ACTIVE_BUFFS_CHANGED`, optionally `BUFF_EXPIRED`) so the shop and any active-buff HUD see the shield as gone. Keep `SHIELD_DEACTIVATE` idempotent so a later 30s timer expiry (if the entry were already removed) is harmless. Ownership note: the `activeBuffs` array is owned by `BuffSystem`, so the cleaner seam is to have `EconomySystem` signal depletion (event) and let `BuffSystem` remove the entry, rather than `EconomySystem` splicing the array directly.

---

## [BUG-002] "Expiring soon" shop notice invites a re-purchase the shop simultaneously disables

- **Status:** 🔴 Open
- **Severity:** Low
- **Feature:** In-game Shop (collapsed-trigger notice dot)
- **Account level:** any in-game player (student / anonymous)
- **Date found:** 2026-06-07

**Affected Files**
- `frontend/src/components/game/ShopPanel.vue:83` (`hasNotice` — second loop pings when an active buff has `remainingTime <= 5`)
- `frontend/src/components/game/ShopPanel.vue:64` (`alreadyActive` is true for any buff whose `effectId` is in `activeBuffs`)
- `frontend/src/components/game/ShopPanel.vue:161` (`:disabled="... || item.alreadyActive || ..."`)

**Steps to Reproduce**
1. Buy a timed buff (e.g. Quagmire / Sharpen Blades) and run waves until its `remainingTime` drops to ≤ 5s while it is still active.
2. Observe the collapsed Shop trigger: the pulsing `notice-dot` appears (its comment states the intent is "worth re-buying").
3. Open the Shop and locate that same buff.

**Expected vs Actual**
- Expected: If the notice dot is advertising that a buff is "worth re-buying," the corresponding shop item should be purchasable (or the dot should not fire for it).
- Actual: The buff is still `alreadyActive`, so its button is **disabled**. The player is pinged to act but cannot re-buy / refresh the buff — the notice and the purchase-gate contradict each other.

**Root Cause Analysis**
`hasNotice`'s second trigger fires for any `activeBuffs` entry with `remainingTime <= expiringSoonSeconds` (5s), with the documented intent of prompting a re-buy. But the shop's re-purchase guard (`alreadyActive`) disables a buff for the entire time it remains in `activeBuffs`, including those final ≤5s. The "re-buy" affordance the dot promises is never reachable while the buff is still active; the two pieces of logic encode opposite policies on the same window. (Note: because buff timers only tick during WAVE while the shop is BUILD-only — an intended freeze — an expiring buff that survives into BUILD can show this dot persistently with no way to clear it via purchase.)

**Suggested Fix** (describe only, do not implement)
Reconcile the two policies. Either: (a) drop the "expiring soon" trigger from `hasNotice` so the dot only signals genuinely actionable opportunities (affordable + not active), or (b) if refreshing a soon-to-expire buff is a desired feature, relax the `alreadyActive` disable to allow re-purchase once `remainingTime <= expiringSoonSeconds` (and have the engine extend/refresh rather than illegally stack). Pick one direction so the notice and the button agree.

---

## [BUG-003] Open Join-Code QR panel keeps showing the old (now-invalid) code after Regenerate

- **Status:** 🔴 Open
- **Severity:** Low
- **Feature:** Teacher class management — regenerate join code / QR (`POST /api/classes/{id}/regenerate-code`, `GET /api/classes/{id}/qr`)
- **Account level:** teacher
- **Date found:** 2026-06-07

**Affected Files**
- `frontend/src/views/ClassView.vue:218` (`regenerateCode` — updates only the list row's `join_code`)
- `frontend/src/views/ClassView.vue:229` (`classes.value[idx].join_code = res.join_code`, the only state it refreshes)
- `frontend/src/views/ClassView.vue:354` (`loadQr` — sets `qrCode` / `showQr`)
- `frontend/src/views/ClassView.vue:592` (QR panel renders `qrCode.join_url` / `qrCode.code`)

**Steps to Reproduce**
1. As a teacher, in "My Classes" click **QR** on a class → the QR panel opens showing the current code and `…/classes/join?code=<OLD>`.
2. Without closing the panel, click **New Code** on the same class and confirm.
3. Observe the still-open QR panel.

**Expected vs Actual**
- Expected: After regenerating, the open QR panel should reflect the new code (or close), so a teacher never shares a QR/link that encodes an invalidated code.
- Actual: The QR panel keeps displaying the old code and old `join_url`. The backend has already replaced `join_code`, so the displayed code/link no longer works for new joiners until the teacher manually reopens the QR.

**Root Cause Analysis**
`regenerateCode` only patches the matching row in `classes` (`classes.value[idx].join_code`, line 229–230). It does not update or close the `qrCode` panel state, and `qrCode` stores no class id to correlate against. The QR panel is a top-level block (line 592) independent of the class list, so it holds whatever `loadQr` last fetched. There is no reactive link between a regenerate action and the cached QR payload, leaving the panel stale. (The backend `GET /qr` itself is correct — it always returns the live `join_code`; this is purely client-side staleness.)

**Suggested Fix** (describe only, do not implement)
On a successful regenerate, refresh or invalidate the QR panel: either re-call `loadQr(classId)` when the panel is open for that class, or close it (`showQr = false` / clear `qrCode`) so the stale code is not shown. To make the correlation safe, track which class the open QR belongs to (e.g. store the class id alongside `qrCode`) and only refresh/close when it matches the regenerated class.

---

## [BUG-004] Owner-only Archive/Delete buttons are shown to co-teachers and fail with 403

- **Status:** 🔴 Open
- **Severity:** Medium
- **Feature:** Teacher class management — class actions for co-taught classes (`POST /api/classes/{id}/archive`, `DELETE /api/classes/{id}`)
- **Account level:** teacher (co-teacher, non-owner)
- **Date found:** 2026-06-07

**Affected Files**
- `frontend/src/views/ClassView.vue:571` (`<div v-if="isTeacherOrAdmin" class="class-actions">` — gated by role, not ownership)
- `frontend/src/views/ClassView.vue:577` (Archive/Unarchive button)
- `frontend/src/views/ClassView.vue:580` (Delete button)
- `frontend/src/views/ClassView.vue:78` (`selectedIsOwner` exists but only gates the co-teacher/transfer subsections, not these list actions)
- `backend/app/application/class_service.py:163` (`_verify_owner_only` — archive/delete are owner-only)
- `backend/app/application/class_service.py:438` (`delete_class`), `:476` (`archive_class`)

**Steps to Reproduce**
1. Teacher A owns a class and adds Teacher B as a co-teacher.
2. Log in as Teacher B. The class appears in B's "My Classes" list (co-taught classes are merged into the teacher listing).
3. On that class row, click **Archive** (or **Delete**).

**Expected vs Actual**
- Expected: Owner-only actions (Archive, Delete; likewise Transfer) should not be offered to a co-teacher who cannot perform them — the buttons should be hidden or disabled for non-owners.
- Actual: The buttons are rendered for any teacher/admin regardless of ownership. A co-teacher clicking Archive/Delete gets a 403 (`NotClassOwnerError`) surfaced as a generic error. (Rename and New Code do work for co-teachers, so the row mixes allowed and always-failing actions.)

**Root Cause Analysis**
The `.class-actions` block is gated only by `isTeacherOrAdmin` (line 571), with no per-class ownership check, even though the component already computes `selectedIsOwner` and uses it to gate the Co-teacher/Transfer subsections (lines 664, 679). Because `list_classes_for_teacher` merges co-taught classes into a teacher's list, a co-teacher sees Archive/Delete on classes they do not own. The backend correctly enforces owner-only via `_verify_owner_only` (returns 403), so this is a UI permission-surface mismatch rather than a security hole — but it presents actions that always fail and produces confusing errors. Note `selectedIsOwner` is keyed on `selectedClass`, whereas the action buttons live in the per-row list loop (`c`), so a per-row `c.teacher_id === auth.user.id` check would be needed rather than reusing `selectedIsOwner` directly.

**Suggested Fix** (describe only, do not implement)
Hide or disable owner-only actions (Archive/Unarchive, Delete) for non-owners by adding a per-row ownership check (e.g. `c.teacher_id === auth.user.id`) to those buttons, mirroring how the Co-teacher/Transfer subsections already use ownership gating. Keep Rename / New Code available to co-teachers since the backend permits them (`_verify_teacher_write`). Admin (read-only) should likewise not see mutating actions.

---

## [BUG-005] Admin cannot edit classes despite being expected to have edit rights

- **Status:** 🔴 Open
- **Severity:** Low
- **Feature:** Teacher class management — edit/rename class (`PUT /api/classes/{id}`)
- **Account level:** admin
- **Date found:** 2026-06-07

**Affected Files**
- `backend/app/routers/class_.py:147` (`rename_class` gated `require_role(Role.TEACHER)` — admin is not allowed to reach the endpoint)
- `backend/app/application/class_service.py:151` (`_verify_teacher_write` — explicitly rejects `Role.ADMIN`, lines 155–156)
- `backend/app/application/class_service.py:132` (`_verify_owner_or_admin` — documents the "admin = read-only" policy)
- `frontend/src/views/ClassView.vue:576` (Rename button shown to admins via `isTeacherOrAdmin`)

**Steps to Reproduce**
1. Log in as an admin.
2. Attempt to edit/rename any class (UI Rename button, or `PUT /api/classes/{id}` directly).

**Expected vs Actual**
- Expected (per feature requirement): the class owner, a co-teacher, **or an admin** can edit a class.
- Actual: Admins are blocked at two layers — the `PUT` router only admits `Role.TEACHER`, and `_verify_teacher_write` raises `PermissionDeniedError` (403) for `Role.ADMIN`. The frontend still shows the Rename button to admins (`isTeacherOrAdmin`), so an admin who clicks it receives an error.

**Root Cause Analysis**
The codebase implements a deliberate "admin has read-only access to class management" policy (documented in `_verify_owner_or_admin` and enforced in `_verify_teacher_write` / `_verify_owner_only`, with write routers gated to `TEACHER`). This conflicts with the stated requirement that admins should be able to edit classes. The two design intents were never reconciled: the access-control layer treats admin as read-only, while the requirement (and the frontend, which surfaces edit controls to admins) treats admin as an editor. The result is an inconsistent contract — admins are offered edit affordances they cannot use.

**Suggested Fix** (describe only, do not implement)
Decide the intended admin policy and apply it consistently. If admins should edit: allow `Role.ADMIN` on the edit/rename router (`require_role(Role.TEACHER, Role.ADMIN)`) and permit admin in `_verify_teacher_write` (and any other edit paths the requirement covers), keeping owner-only destructive ops (delete/transfer/archive) as a separate decision. If admins should remain read-only: keep the backend as-is and hide edit/mutation controls from admins in `ClassView.vue` so the UI matches the policy. Either way, align router gates, the service `_verify_*` helpers, and the frontend so the three layers agree.

---

## [BUG-006] Class report CSV is vulnerable to spreadsheet formula injection via player_name / email

- **Status:** 🔴 Open
- **Severity:** High
- **Feature:** Teacher class management — class report export (`GET /api/classes/{id}/report.csv`)
- **Account level:** teacher / admin (downloader); attack payload planted by a student
- **Date found:** 2026-06-07

**Affected Files**
- `backend/app/routers/class_.py:651` (`for r in rows:` loop writing the data rows)
- `backend/app/routers/class_.py:652` (`writer.writerow([ r.student_id, r.player_name, r.email, ... ])` — `player_name` and `email` written raw)
- `backend/app/domain/user/constraints.py:3` (`PLAYER_NAME_MIN_LENGTH = 1`, `PLAYER_NAME_MAX_LENGTH = 50`)
- `backend/app/schemas/auth.py:60` / `:174` (`player_name_valid` — only `.strip()` + length check; no character allow-list)
- Reference (correct pattern): `backend/app/routers/study.py:90` (`_CSV_INJECTION_TRIGGERS`), `:93` (`_csv_safe`), `:142` (applies `_csv_safe` to user-facing cells)

**Steps to Reproduce**
1. As a student, register or update the player name to a formula payload within the 1–50 char limit, e.g. `=HYPERLINK("http://evil.example","Click")` or `=cmd|'/c calc'!A1` (no character filter rejects the leading `=`).
2. Have that student join a class owned by a teacher (any join path: code, teacher add, or bulk-invite claim).
3. As the teacher (or an admin), call `GET /api/classes/{class_id}/report.csv` and open the downloaded file in Excel or LibreOffice Calc.

**Expected vs Actual**
- Expected: User-controlled text cells (`player_name`, and `email` defensively) are neutralised against formula execution before being written to CSV — matching the project's own `study.py` export, which prefixes any cell starting with `= + - @ \t \r` with a `'`.
- Actual: `class_report_csv` writes `r.player_name` and `r.email` verbatim. A cell beginning with a formula-trigger character is interpreted as a formula when the report is opened in a spreadsheet, enabling CSV/formula injection (e.g. data exfiltration via `HYPERLINK`/`WEBSERVICE`, or command execution via DDE) against the teacher/admin who opens the report.

**Root Cause Analysis**
The codebase already recognises this attack class and mitigates it in the sibling research export (`study.py` defines `_CSV_INJECTION_TRIGGERS` and `_csv_safe`, applying the latter to its string cells). The class-report CSV writer was implemented without the same guard, even though it emits a field (`player_name`) that is fully user-controlled and unrestricted in character set (validation in `schemas/auth.py` only trims and length-checks, 1–50 chars). The two export paths diverged: one sanitises, the other does not. Because the report is downloaded by a higher-privileged user (teacher/admin), a low-privileged student can plant a payload that triggers in the victim's spreadsheet — a stored CSV-injection vector.

**Suggested Fix** (describe only, do not implement)
Apply the same neutralisation that `study.py` already uses. Reuse a shared `_csv_safe`-style helper (prefix any cell whose first character is in `= + - @ \t \r` with a leading `'`) for the user-controlled cells — at minimum `player_name`, and `email` defensively — in `class_report_csv`. Prefer extracting the existing `study.py` helper to a shared module so both exporters stay consistent rather than duplicating the trigger list. (Field-quoting alone via `csv.writer` does not prevent formula execution; the leading-character prefix is the standard mitigation.)

---

## [BUG-007] Class report CSV omits the UTF-8 BOM, garbling Chinese names in Excel

- **Status:** 🔴 Open
- **Severity:** Medium
- **Feature:** Teacher class management — class report export (`GET /api/classes/{id}/report.csv`)
- **Account level:** teacher / admin
- **Date found:** 2026-06-07

**Affected Files**
- `backend/app/routers/class_.py:644` (`buf = io.StringIO()` — no BOM written before the header)
- `backend/app/routers/class_.py:646` (`writer.writerow([... header ...])`)
- `backend/app/routers/class_.py:660` (`StreamingResponse(iter([buf.getvalue()]), media_type="text/csv", ...)` — emits UTF-8 bytes with no BOM)
- `backend/app/routers/class_.py:652` (data rows carry `r.player_name`, which is commonly Chinese for this product's users)

**Steps to Reproduce**
1. Have at least one student with a Chinese `player_name` (e.g. `王小明`) enrolled in a class.
2. As the teacher, download `GET /api/classes/{class_id}/report.csv`.
3. Double-click the saved `.csv` to open it in Microsoft Excel on a Traditional-Chinese / Big5-locale Windows machine.

**Expected vs Actual**
- Expected: Chinese student names render correctly when the exported CSV is opened in Excel — the de-facto tool a teacher uses. The standard way to guarantee this for a UTF-8 CSV is to prepend a UTF-8 BOM (`﻿` / `EF BB BF`) so Excel auto-detects UTF-8.
- Actual: The response body is UTF-8 with no BOM. Although Starlette adds `; charset=utf-8` to the HTTP `Content-Type`, Excel ignores the HTTP header for a downloaded file and falls back to the system ANSI code page (Big5/GBK), so multi-byte Chinese names appear as mojibake (亂碼). The data is technically valid UTF-8 but unreadable in the teacher's primary tool.

**Root Cause Analysis**
`class_report_csv` builds the CSV in a plain `io.StringIO` and streams `buf.getvalue()` without prefixing a UTF-8 BOM. For an export whose user-facing columns (`player_name`) are predominantly Chinese for this product's audience, the missing BOM is the difference between a readable and a garbled file in Excel. (The sibling `study.py` export also lacks a BOM, but its columns are ASCII-only UUIDs/enums/numbers, so the gap never surfaces there — making the class report the one place the omission actually breaks.)

**Suggested Fix** (describe only, do not implement)
Emit the CSV with a UTF-8 BOM so Excel detects the encoding — e.g. write the buffer/bytes using `utf-8-sig`, or prepend `﻿` to the streamed content. Keep `media_type="text/csv; charset=utf-8"` for HTTP correctness. Consider standardising this together with BUG-006 so both exporters share one CSV-writing path (BOM + injection-safe cells).

---

## [BUG-008] QR / share-link join URL points to a non-existent route (`/classes/join`), so the deep-link join never prefills and the code is lost

- **Status:** 🔴 Open
- **Severity:** Medium
- **Feature:** Student class management — join by code via QR / share link (`GET /api/classes/{id}/qr` → `join_url`; `ClassView` deep-link prefill)
- **Account level:** student (consumer of the link; QR generated by teacher)
- **Date found:** 2026-06-07

**Affected Files**
- `backend/app/routers/class_.py:376` (`join_url=f"{base}/classes/join?code={cls_.join_code}"` — builds a URL to `/classes/join`)
- `frontend/src/router/index.ts:99` (`path: '/classes'` is the only class route — there is no `/classes/join`)
- `frontend/src/router/index.ts:203` (`{ path: '/:pathMatch(.*)*', redirect: '/' }` — catch-all swallows `/classes/join` and discards the `?code=` query)
- `frontend/src/views/ClassView.vue:489` (`const codeFromUrl = route.query.code` — the only consumer of the code query param, and it is mounted at `/classes`, not `/classes/join`)
- `frontend/src/views/ClassView.vue:597` (QR panel hint: "Share this link or have students enter code …" — advertises the link as functional)

**Steps to Reproduce**
1. As a teacher, open a class and click **QR**. The panel shows `join_url = https://<frontend>/classes/join?code=ABCD1234`.
2. Share that link with a student (or have the student scan the QR encoding it).
3. As the logged-in student, open `https://<frontend>/classes/join?code=ABCD1234`.

**Expected vs Actual**
- Expected: The link opens the class-join screen with the join code pre-filled (the `ClassView` onMounted deep-link handler reads `route.query.code` and populates `joinCode` for the student), so the student can confirm and join in one tap.
- Actual: `/classes/join` matches no route, so the catch-all redirects to `/` (MenuView) and drops the `?code=` query entirely. The student lands on the main menu with nothing pre-filled; the deep-link / QR join path is effectively dead. Only manually navigating to `/classes` and typing the 8-char code still works.

**Root Cause Analysis**
There is a path mismatch between the URL the backend generates and the routes the frontend registers. The backend hard-codes `/classes/join` in the QR/share `join_url` (`class_.py:376`), but the SPA router only declares `/classes` (`router/index.ts:99`); no `/classes/join` route or alias exists. Any unmatched path falls through to `{ path: '/:pathMatch(.*)*', redirect: '/' }`, which both fails to render `ClassView` and discards the query string on the string-form redirect. Meanwhile the code that would honour the deep link (`ClassView.vue:489`, `route.query.code` → `joinCode`) only runs when the component is mounted, i.e. at `/classes?code=…` — a different URL than the one ever produced. The producer (`/classes/join?code=`) and the only consumer (`/classes` onMounted) were never aligned.

**Suggested Fix** (describe only, do not implement)
Make the generated URL and the router agree on a single path. Either (a) change the backend `join_url` to the path the SPA actually serves and reads — `f"{base}/classes?code={cls_.join_code}"` — so the existing `ClassView` onMounted prefill fires; or (b) add a real `/classes/join` route (or an alias/redirect that preserves the query) that mounts the join screen and consumes `?code=`. If keeping `/classes/join`, ensure the redirect preserves the query (object-form redirect) rather than the bare `redirect: '/'`. Prefer option (a) for the smallest change since the consumer already lives on `/classes`. Optionally auto-submit the join when arriving via a valid deep-link code, instead of only pre-filling.

---

## [BUG-009] Leaderboard level filter omits Star 5, so Legendary-difficulty scores can never be filtered

- **Status:** 🔴 Open
- **Severity:** Medium
- **Feature:** Student leaderboard — level/star filter (`GET /api/leaderboard?level=…`, Personal / Global / Class tabs)
- **Account level:** student
- **Date found:** 2026-06-07

**Affected Files**
- `frontend/src/views/LeaderboardView.vue:129` (`v-for="lv in [undefined, 1, 2, 3, 4]"` — Personal + Global filter row)
- `frontend/src/views/RankingsView.vue:397` (`v-for="lv in [undefined, 1, 2, 3, 4]"` — Personal + Global + Class filter row)
- Reference (source of truth): `backend/app/domain/constraints.py:11-17` (`STAR_MAX = 5`, `LEVEL_MAX = STAR_MAX`)
- Reference (range honoured by backend): `backend/app/routers/leaderboard.py:34` (`level: int | None = Query(None, ge=1, le=5)`)
- Reference (Star 5 is playable): `frontend/src/views/LevelSelectView.vue:40` (`stars = Array.from({length: STAR_MAX - STAR_MIN + 1})` → 1–5) and `:65-67` (Star 5 "Legendary" unlock)

**Steps to Reproduce**
1. As a student, unlock and play **Star 5 ("Legendary")** (requires `ia_unlock_earned`), completing a non-preview session so a `level=5` leaderboard entry is created.
2. Open the leaderboard (`LeaderboardView` or `RankingsView`) and look at the "Level filter" / "Star rating" row.
3. Try to view only Level 5 standings (Global, Personal, or Class tab).

**Expected vs Actual**
- Expected: A "Level 5" filter button is available, mirroring the 5 playable star levels (the level selector itself derives its 1–5 buttons from `STAR_MAX`), so a student can isolate their highest-difficulty standings and personal-best progression.
- Actual: Both views hard-code the filter to `[undefined, 1, 2, 3, 4]`. There is no Level 5 button. A Star-5 entry only ever appears under the "All" filter and can never be isolated on the Global, Personal, or Class leaderboards. The backend fully supports `level=5` (`ge=1, le=5`), so the data is reachable by URL but not by the UI.

**Root Cause Analysis**
The level-filter button list is a hard-coded literal `[undefined, 1, 2, 3, 4]` in both `LeaderboardView.vue` and `RankingsView.vue`, rather than being derived from the same `STAR_MIN`/`STAR_MAX` constants (`difficulty-defs` / `domain/constraints.py`) that drive `LevelSelectView` and the backend `level` bound. When the playable range is 1–5, the two literals silently fall one short of the real maximum. Because `LevelSelectView` builds its star buttons dynamically (`Array.from({length: STAR_MAX - STAR_MIN + 1})`) while the leaderboard views do not, the two screens disagree on how many levels exist, and the gap surfaces precisely for the gated top tier (Star 5). No comment marks the 1–4 truncation as intentional.

**Suggested Fix** (describe only, do not implement)
Derive the filter buttons from the shared star range instead of a literal — e.g. `[undefined, ...Array.from({length: STAR_MAX - STAR_MIN + 1}, (_, i) => STAR_MIN + i)]` using the `STAR_MIN`/`STAR_MAX` exports already imported by `LevelSelectView` — in both `LeaderboardView.vue:129` and `RankingsView.vue:397`, so the leaderboard always offers exactly the playable levels and stays in sync if the range changes. (Confirm the desired label for Star 5 — the views render `Level {n}` / `Lv.{n}`, which is consistent with the existing buttons.)

---

## [BUG-010] Teacher's Personal History (`/api/leaderboard/me`) is always empty because preview runs are never recorded anywhere a teacher can see them

- **Status:** 🔴 Open
- **Severity:** Medium
- **Feature:** Leaderboard — personal history (`GET /api/leaderboard/me`) for the teacher role
- **Account level:** teacher
- **Date found:** 2026-06-07

**Affected Files**
- `backend/app/routers/game_session.py:47` (`is_preview=current_user.role != Role.STUDENT` — every teacher session is a preview run)
- `backend/app/application/session_event_handlers.py:51` (`LeaderboardInsertHandler` skips `is_preview` sessions — no leaderboard row is ever written for a teacher)
- `backend/app/application/leaderboard_service.py:126` (`submit_score` also rejects `is_preview`)
- `backend/app/application/leaderboard_service.py:56-97` (`get_user_history` — the `/me` source — reads only leaderboard entries)
- `backend/app/infrastructure/persistence/leaderboard_repository.py:332-347` (`get_user_history` queries `LeaderboardEntryModel` filtered by `user_id` only; teachers have no such rows)
- `frontend/src/views/LeaderboardView.vue:20` (`activeTab = auth.isLoggedIn ? 'personal' : 'global'` — logged-in teachers land on the Personal History tab by default)
- `frontend/src/views/LeaderboardView.vue:45` (`leaderboardService.getMyHistory(...)`)
- `frontend/src/services/leaderboardService.ts:50-55` (`getMyHistory` → `GET /api/leaderboard/me`)

**Steps to Reproduce**
1. Log in as a teacher.
2. Start and complete a game session. The session is created with `is_preview=true` (server-derived from `role != STUDENT`).
3. Open the Leaderboard view. The teacher lands on the default **Personal History** tab, which calls `GET /api/leaderboard/me`.
4. Observe the result.

**Expected vs Actual**
- Expected (confirmed with product owner): a teacher should still be able to see their own play records — including preview runs — in their personal history.
- Actual: the personal history is **always empty** for a teacher, no matter how many games they play. Preview runs are never inserted into the leaderboard table (both the auto-insert handler at `session_event_handlers.py:51` and `submit_score` at `leaderboard_service.py:126` skip `is_preview`), and `GET /api/leaderboard/me` reads exclusively from that table. The teacher is dropped onto a Personal History tab that can never contain anything.

**Root Cause Analysis**
The preview-exclusion design (preview/practice runs must not pollute the public rankings) is implemented by *never persisting a leaderboard row* for those sessions. That is correct for the public global/level/class/challenge boards. However, `GET /api/leaderboard/me` derives the user's personal history from the *same* leaderboard table (`LeaderboardEntryModel`) rather than from the authoritative `game_sessions` table. Because every teacher session is a preview run, a teacher has zero leaderboard rows and therefore an empty personal history — yet the frontend defaults logged-in users (including teachers) straight to the Personal History tab. The two requirements ("exclude preview from public rankings" and "let a teacher see their own preview history") were both satisfied for students but collide for teachers: the single leaderboard-table source cannot serve both, so the teacher-history requirement is silently unmet. There is no other endpoint exposing a teacher's own session history, so the records are effectively invisible to them.

**Suggested Fix** (describe only, do not implement)
Decouple the personal-history source from the public-ranking source so preview exclusion no longer erases the teacher's own timeline. Options: (a) have `get_user_history` / `/api/leaderboard/me` read the user's own completed `game_sessions` (including `is_preview` / `practice_mode`) for the self-view, while keeping the public boards reading from the leaderboard table as today — this preserves the "preview never on public ranking" invariant while restoring the teacher's view of their own runs; or (b) add a dedicated "my sessions" endpoint and point the teacher UI at it. With either, ensure the self-view still only ever returns the caller's own rows (authorisation already comes from the verified token, never a query param), and re-confirm the personal-best (PB) flag semantics make sense once preview runs are included in the timeline.

---

## [BUG-011] Class-dashboard leaderboard & report count practice_mode / preview runs, inflating student rankings

- **Status:** 🔴 Open
- **Severity:** Medium
- **Feature:** Class leaderboard & report — `GET /api/classes/{id}/leaderboard` and `GET /api/classes/{id}/report` (ClassView dashboard, viewable by class owner/co-teacher and any admin)
- **Account level:** teacher (and admin, who can open any class) — surfaced while reviewing the admin leaderboard feature
- **Date found:** 2026-06-07

**Affected Files**
- `backend/app/infrastructure/persistence/session_repository.py:243-293` (`aggregate_stats_for_users` — filters only `status == COMPLETED`; never excludes `practice_mode` or `is_preview`)
- `backend/app/application/class_service.py:980-1003` (`class_leaderboard` — builds `ClassLeaderboardRow` from the aggregate and ranks by `total_score`)
- `backend/app/application/class_service.py:1005-1032` (`class_report` — same aggregate feeds `sessions_played` / `average_stars` / `total_score`)
- `backend/app/routers/class_.py:588-607` (`GET /{class_id}/leaderboard`)
- `frontend/src/views/ClassView.vue:467` (`classService.leaderboard(selectedClassId)` renders the dashboard table)
- Contrast (correct behaviour): `backend/app/application/leaderboard_service.py:119-129` and `backend/app/application/session_event_handlers.py:51` both exclude `practice_mode` + `is_preview`; the competitive class board `query_ranked_by_class` (`leaderboard_repository.py:245-322`) is therefore clean because such rows are never inserted.

**Steps to Reproduce**
1. Log in as a student and join a class.
2. Play and complete one normal session, then complete one or more **practice-mode** sessions (`practice_mode=true`, e.g. the Star-5 sandbox runs the spec flags as practice) at a higher score.
3. Log in as the class teacher (or as any admin) and open the class's ClassView leaderboard tab → `GET /api/classes/{id}/leaderboard`. Optionally also pull `GET /api/classes/{id}/report`.
4. Compare the same class on the Rankings page "Class" tab (`GET /api/leaderboard?class_id=...`).

**Expected vs Actual**
- Expected: practice-mode (and preview) runs are leaderboard-ineligible, per `Math_Defense_Spec.md` line 84 ("runs flagged `practice_mode` and excluded from the leaderboard") and the policy enforced on every other ranking surface. The class-dashboard leaderboard/report should reflect competition-eligible play only, so a student cannot climb the class ranking via practice runs.
- Actual: `aggregate_stats_for_users` counts **all** completed sessions, so practice-mode runs inflate `total_score` (the primary class-leaderboard sort key), `average_stars`, and `sessions_played`. The same class therefore ranks students differently on the ClassView dashboard than on the Rankings "Class" tab, and a student who only practices outranks one who plays competitively. (Admins see this for every class since `verify_access` grants them read access to all classes; the defect is not admin-specific but is fully visible to admins.)

**Root Cause Analysis**
Two parallel "class leaderboard" surfaces exist with different data sources. The competitive surface (`/api/leaderboard?class_id=...` → `query_ranked_by_class`) reads `leaderboard_entries`, a table into which preview/practice runs are never inserted, so it is correct by construction. The dashboard surface (`/api/classes/{id}/leaderboard` and `/report` → `aggregate_stats_for_users`) instead aggregates the authoritative `game_sessions` table directly and filters only on `status == COMPLETED`. `aggregate_stats_for_users` was introduced with Tier-C class management (commit `c4a0756`) before the `is_preview` flag existed; when `is_preview` was later added (commit `0fc2692`) the insert-time exclusions were updated but this aggregate was never revisited, and the pre-existing `practice_mode` exclusion (Backlog §20 / spec line 84) was never applied here either. No test, comment, or doc indicates the inclusion is intentional (`test_class_leaderboard_lists_members` only asserts the member count). The result is an inconsistent leaderboard policy: "practice/preview never count" holds everywhere except this teacher/admin-facing aggregate.

**Suggested Fix** (describe only, do not implement)
Apply the same eligibility filter the other boards use to the class aggregate: in `aggregate_stats_for_users`, exclude rows where `practice_mode` is true or `is_preview` is true (in addition to the existing `status == COMPLETED` filter), and apply it to both the main aggregate query and the reflections-count sub-query so the two stay consistent. Add a regression test that seeds a member with a high-scoring practice-mode session plus a normal session and asserts the class leaderboard/report counts only the normal session. If, instead, the dashboard is intended to show *all* engagement (a product decision), make that explicit — keep practice runs in `sessions_played`/`average_stars` but exclude them from the `total_score` ranking key, and document the divergence from the competitive board — but the spec as written argues for full exclusion.

---
