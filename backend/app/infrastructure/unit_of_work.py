"""Unit of Work — encapsulates transaction management"""
from sqlalchemy.orm import Session as DbSession


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
        elif not self._committed:
            # Exited without calling commit() — rollback to release locks
            self._db.rollback()

    def commit(self) -> None:
        self._db.commit()
        self._committed = True

    def rollback(self) -> None:
        self._db.rollback()
