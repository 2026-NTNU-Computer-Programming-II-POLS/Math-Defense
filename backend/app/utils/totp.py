"""TOTP (Time-based One-Time Password) helpers — thin wrapper around pyotp."""
import pyotp


def generate_secret() -> str:
    return pyotp.random_base32()


def get_provisioning_uri(secret: str, email: str, issuer: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name=issuer)


def verify_code(secret: str, code: str) -> bool:
    return pyotp.TOTP(secret).verify(code, valid_window=1)
