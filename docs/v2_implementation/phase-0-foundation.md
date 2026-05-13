# Phase 0 — Foundation & Infrastructure

> **Goal**: Expand the database schema, user model, and authentication layer to
> support V2's multi-role classroom structure. Everything in later phases depends
> on the models and RBAC middleware built here.

**Prerequisites**: None (first phase).

---

## 0.1 Database Schema Expansion

### New Tables

| Table | Key Columns | Purpose |
|-------|-------------|---------|
| `classes` | id, name, teacher_id (FK→users), created_at | A classroom group owned by one Teacher |
| `class_memberships` | id, class_id (FK→classes), student_id (FK→users), joined_at | Many-to-many: students ↔ classes |

### Altered Tables

| Table | Changes |
|-------|---------|
| `users` | Add: `email` (unique, not null), `player_name`, `avatar_url`, `role` (enum: admin/teacher/student). Drop: `username` (replaced by email). |

### Alembic Migration

Create a single migration file that:
1. Adds the new columns to `users`.
2. Migrates existing `username` data into `email` (or marks migration as manual).
3. Creates `classes` and `class_memberships` tables.
4. Adds unique constraint on `(class_id, student_id)` in `class_memberships`.

### Files to Create / Modify

| File | Action |
|------|--------|
| `backend/alembic/versions/<hash>_v2_foundation.py` | Create — migration |
| `backend/app/models/user.py` | Modify — add email, player_name, avatar_url, role columns |
| `backend/app/models/class_.py` | Create — SQLAlchemy model |
| `backend/app/models/class_membership.py` | Create — SQLAlchemy model |

---

## 0.2 Domain Layer — User Aggregate Update

Update the DDD aggregate and value objects to reflect the expanded user model.

| File | Action |
|------|--------|
| `backend/app/domain/user/aggregate.py` | Modify — add email, player_name, avatar_url, role |
| `backend/app/domain/user/value_objects.py` | Modify — add `Role` enum (ADMIN, TEACHER, STUDENT), `Email` VO |
| `backend/app/domain/user/constraints.py` | Modify — email format validation, player_name length limits |

---

## 0.3 Domain Layer — Class Aggregate (New)

| File | Action |
|------|--------|
| `backend/app/domain/class_/aggregate.py` | Create — Class aggregate (id, name, teacher_id) |
| `backend/app/domain/class_/repository.py` | Create — abstract repository interface |
| `backend/app/domain/class_/errors.py` | Create — ClassNotFound, StudentAlreadyInClass, etc. |

---

## 0.4 Infrastructure — Repositories

| File | Action |
|------|--------|
| `backend/app/infrastructure/persistence/user/repository.py` | Modify — query by email, filter by role |
| `backend/app/infrastructure/persistence/class_/repository.py` | Create — CRUD for classes + membership |

---

## 0.5 Application Services

| File | Action |
|------|--------|
| `backend/app/application/auth_service.py` | Modify — registration now requires email + player_name + role; login by email |
| `backend/app/application/class_service.py` | Create — create_class, add_student, remove_student, list_classes, list_students_in_class |

---

## 0.6 RBAC Middleware

Add role-based access control on top of the existing JWT auth middleware.

| File | Action |
|------|--------|
| `backend/app/middleware/auth.py` | Modify — decode JWT now includes `role` claim; add `require_role(*roles)` dependency |

### Authorization Matrix

| Endpoint Group | Admin | Teacher | Student |
|---------------|-------|---------|---------|
| User management (list all, audit) | YES | NO | NO |
| Class CRUD | YES | Own classes only | NO |
| Class membership management | YES | Own classes only | NO |
| Join class (by code/invitation) | NO | NO | YES |
| Play game | NO | NO | YES |
| View rankings | YES | YES (own classes) | YES (own classes) |

---

## 0.7 API Routes

| File | Action | Endpoints |
|------|--------|-----------|
| `backend/app/routes/auth.py` | Modify | `POST /register` (add email, role), `POST /login` (email-based) |
| `backend/app/routes/class_.py` | Create | `POST /classes`, `GET /classes`, `GET /classes/{id}`, `POST /classes/{id}/students`, `DELETE /classes/{id}/students/{sid}` |
| `backend/app/routes/admin.py` | Create | `GET /admin/teachers`, `GET /admin/classes`, `GET /admin/students` |

---

## 0.8 Frontend — Auth & Profile Updates

| File | Action |
|------|--------|
| `frontend/src/services/auth.ts` or `useAuth.ts` | Modify — registration form adds email, player_name; login uses email |
| `frontend/src/stores/` | Modify — user store holds role, player_name, avatar_url |
| `frontend/src/views/ProfileView.vue` | Create — display/edit player_name, avatar, achievement list, talent tree (placeholder) |
| `frontend/src/views/ClassView.vue` | Create — Teacher: manage classes; Student: view enrolled classes |
| `frontend/src/router/` | Modify — add route guards based on role (admin routes, teacher routes, student routes) |

---

## 0.9 Class Join Code

V2.md specifies students can join a class "via Teacher invitation or code".

### Mechanism

- When a Teacher creates a class, the system generates a unique **join code**
  (e.g., 6-character alphanumeric).
- Teacher shares the code with students (verbally, on a slide, etc.).
- Student enters the code in the frontend to join the class.

### Schema

| Table | Changes |
|-------|---------|
| `classes` | Add `join_code` (unique, not null, auto-generated) |

### API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `POST /classes/join` | Student | Body: `{ "code": "ABC123" }` — resolves class by code, adds student to membership |
| `POST /classes/{id}/regenerate-code` | Teacher | Regenerates the join code (invalidates the old one) |

### Frontend

| File | Action |
|------|--------|
| `frontend/src/views/ClassView.vue` | Extend — Teacher sees join code with copy button; Student has "Join Class" form |

---

## 0.10 Docker & Deployment Notes

| File | Action |
|------|--------|
| `docker-compose.yml` | Review — ensure Alembic migration runs on startup; volume mounts unchanged unless new services added |
| `backend/Dockerfile` | No changes expected in Phase 0, but review if build context is correct for new model files |

---

## 0.11 Shared Constants

| File | Action |
|------|--------|
| `shared/game-constants.json` | Modify — add `roles` enum definition if consumed by frontend validation |

---

## Acceptance Criteria

- [ ] `POST /register` accepts email + password + player_name + role; rejects duplicate emails.
- [ ] `POST /login` authenticates by email; JWT includes `role` claim.
- [ ] RBAC middleware blocks unauthorized role access (e.g., Student cannot create a Class).
- [ ] Teacher can create a Class, add Students, remove Students.
- [ ] Student can join a Class (via code or Teacher action).
- [ ] Admin can list all Teachers, Classes, Students.
- [ ] Frontend login/register forms updated; route guards enforce role-based navigation.
- [ ] Alembic migration applies cleanly on a fresh database AND on top of existing V1 data.
- [ ] All existing V1 tests still pass (backwards compatibility of auth endpoints during transition).
- [ ] Class join code: Teacher sees generated code; Student can join by entering code.
- [ ] Code regeneration invalidates the old code.
