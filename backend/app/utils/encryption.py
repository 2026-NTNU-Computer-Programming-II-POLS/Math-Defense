"""Application-level Fernet encryption for sensitive fields (e.g. TOTP secrets)."""
from __future__ import annotations

import os

from cryptography.fernet import Fernet, InvalidToken

_KEY_HELP = (
    "Generate one with: python -c "
    "\"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
)


def _derive_key() -> bytes:
    """Return the validated TOTP_ENCRYPTION_KEY as a Fernet key.

    The env var must already be a proper Fernet key (32 url-safe base64-encoded
    bytes). An arbitrary passphrase is rejected outright: stretching it with a
    single, saltless SHA-256 is not a real KDF and would leave a low-entropy
    secret open to a dictionary attack.
    """
    raw = os.environ.get("TOTP_ENCRYPTION_KEY", "")
    if not raw:
        raise RuntimeError("TOTP_ENCRYPTION_KEY env var is required. " + _KEY_HELP)
    key = raw.encode()
    try:
        # Fernet() validates the key is 32 url-safe base64-encoded bytes.
        Fernet(key)
    except ValueError as exc:
        raise RuntimeError(
            "TOTP_ENCRYPTION_KEY must be a valid Fernet key (32 url-safe "
            "base64-encoded bytes), not an arbitrary passphrase. " + _KEY_HELP
        ) from exc
    return key


_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        _fernet = Fernet(_derive_key())
    return _fernet


def verify_key_configured() -> None:
    """Fail-fast startup check for TOTP_ENCRYPTION_KEY.

    encrypt_field / decrypt_field derive the key lazily, so a missing or
    malformed TOTP_ENCRYPTION_KEY would otherwise surface only as a 500 on the
    first MFA-related request. Calling this from the app lifespan handler turns
    that into an immediate boot failure with a clear message, and warms the
    Fernet cache so the first real request pays no derivation cost.
    """
    _get_fernet()


def encrypt_field(plaintext: str) -> str:
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_field(ciphertext: str) -> str:
    """Decrypt a value produced by encrypt_field.

    Raises RuntimeError if the ciphertext cannot be decrypted — e.g. the
    TOTP_ENCRYPTION_KEY was rotated or the stored value is corrupt. The
    failure must surface loudly: previously this returned the raw ciphertext,
    which made verify_code() fail silently and locked users out of MFA with no
    diagnostic and no way to reset.
    """
    try:
        return _get_fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken as exc:
        raise RuntimeError(
            "Failed to decrypt an encrypted field — the TOTP_ENCRYPTION_KEY "
            "may have been rotated or the stored value is corrupt."
        ) from exc
