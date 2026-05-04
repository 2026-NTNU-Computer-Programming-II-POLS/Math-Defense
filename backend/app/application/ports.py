"""Application-layer port interfaces.

Protocols defined here decouple application services from infrastructure
implementations so services can be tested with any conforming substitute.
"""
from __future__ import annotations

from typing import Protocol


class UnitOfWork(Protocol):
    def __enter__(self) -> "UnitOfWork": ...
    def __exit__(self, exc_type, exc_val, exc_tb) -> None: ...
    def commit(self) -> None: ...
    def rollback(self) -> None: ...
