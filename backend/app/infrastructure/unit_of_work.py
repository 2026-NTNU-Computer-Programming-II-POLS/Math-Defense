"""Unit of Work — encapsulates transaction management"""
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session as DbSession

from app.domain.errors import ConstraintViolationError, PersistenceError
from app.utils.integrity import extract_constraint_name


class SqlAlchemyUnitOfWork:
    def __init__(self, db: DbSession):
        self._db = db
        self._committed = False
        self._active = False

    def __enter__(self):
        if self._active:
            raise RuntimeError(
                "SqlAlchemyUnitOfWork is not reentrant; "
                "use db.begin_nested() for nested transactions"
            )
        self._committed = False
        self._active = True
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self._active = False
        if exc_type:
            if issubclass(exc_type, IntegrityError):
                # Always rollback SQLAlchemy errors: PostgreSQL aborts the
                # transaction on constraint violations and the session must
                # be cleaned up before the next statement can execute.
                self._db.rollback()
                raise ConstraintViolationError(
                    str(exc_val), constraint_name=extract_constraint_name(exc_val)
                ) from exc_val
            if issubclass(exc_type, SQLAlchemyError):
                self._db.rollback()
                raise PersistenceError(str(exc_val)) from exc_val
            # Non-SQLAlchemy (domain / application) exception: M5 — only
            # rollback uncommitted work. _abandon_and_commit commits before
            # raising SessionStaleError; calling rollback here would start
            # a new transaction and could roll back any flush issued after
            # that inner commit.
            if not self._committed:
                self._db.rollback()
        elif not self._committed:
            # Exited without calling commit() — rollback to release locks
            self._db.rollback()

    def commit(self) -> None:
        try:
            self._db.commit()
            self._committed = True
        except IntegrityError as e:
            raise ConstraintViolationError(
                str(e), constraint_name=extract_constraint_name(e)
            ) from e
        except SQLAlchemyError as e:
            raise PersistenceError(str(e)) from e

    def rollback(self) -> None:
        self._db.rollback()
