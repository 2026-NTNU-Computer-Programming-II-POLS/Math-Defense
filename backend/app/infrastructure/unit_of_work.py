"""Unit of Work — 封裝交易管理"""
from sqlalchemy.orm import Session as DbSession


class SqlAlchemyUnitOfWork:
    def __init__(self, db: DbSession):
        self._db = db

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type:
            self._db.rollback()

    def commit(self) -> None:
        self._db.commit()

    def rollback(self) -> None:
        self._db.rollback()
