"""Unit of Work — encapsulates transaction management"""
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session as DbSession

from app.domain.errors import ConstraintViolationError, PersistenceError
from app.utils.integrity import extract_constraint_name


class SqlAlchemyUnitOfWork:
    def __init__(self, db: DbSession):
        self._db = db
        self._committed = False

    def __enter__(self):
        self._committed = False
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type:
            self._db.rollback()
            if issubclass(exc_type, IntegrityError):
                raise ConstraintViolationError(
                    str(exc_val), constraint_name=extract_constraint_name(exc_val)
                ) from exc_val
            if issubclass(exc_type, SQLAlchemyError):
                raise PersistenceError(str(exc_val)) from exc_val
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
