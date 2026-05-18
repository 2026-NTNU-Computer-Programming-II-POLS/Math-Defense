"""Application-level Fernet encryption for sensitive fields (e.g. TOTP secrets)."""
from __future__ import annotations

import base64
import hashlib
import os

from cryptography.fernet import Fernet, InvalidToken


def _derive_key() -> bytes:
    raw = os.environ.get("TOTP_ENCRYPTION_KEY", "")
    if not raw:
        raise RuntimeError(
            "TOTP_ENCRYPTION_KEY env var is required. "
            "Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
    if len(raw) == 44 and raw.endswith("="):
        return raw.encode()
    return base64.urlsafe_b64encode(hashlib.sha256(raw.encode()).digest())


_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        _fernet = Fernet(_derive_key())
    return _fernet


def encrypt_field(plaintext: str) -> str:
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_field(ciphertext: str) -> str:
    try:
        return _get_fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken:
        return ciphertext
