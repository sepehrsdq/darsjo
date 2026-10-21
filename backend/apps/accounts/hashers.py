"""Password hasher that is byte-compatible with the file-panel (Node) app.

The file panel stores passwords as ``scrypt$N$r$p$<salt-b64>$<hash-b64>``
(see ``portal-v2/lib/security.js``). Using the exact same format here means one
password hash works in both systems, so a teacher can log into the LMS and the
file panel with the same credentials without ever storing a plaintext copy.
"""

import base64
import hashlib
import hmac
import secrets

from django.contrib.auth.hashers import BasePasswordHasher
from django.utils.crypto import constant_time_compare  # noqa: F401  (kept for API parity)

N = 16384
R = 8
P = 1
KEYLEN = 64


def _maxmem(n: int, r: int) -> int:
    return 128 * n * r * 2


class PortalScryptHasher(BasePasswordHasher):
    algorithm = "scrypt"

    def salt(self) -> str:
        return base64.b64encode(secrets.token_bytes(16)).decode("ascii")

    def encode(self, password: str, salt: str, iterations: int | None = None) -> str:
        salt_bytes = base64.b64decode(salt)
        digest = hashlib.scrypt(
            password.encode("utf-8"),
            salt=salt_bytes,
            n=N,
            r=R,
            p=P,
            dklen=KEYLEN,
            maxmem=_maxmem(N, R),
        )
        return f"scrypt${N}${R}${P}${salt}${base64.b64encode(digest).decode('ascii')}"

    def decode(self, encoded: str):
        algorithm, n, r, p, salt, digest = encoded.split("$")
        return {
            "algorithm": algorithm,
            "n": int(n),
            "r": int(r),
            "p": int(p),
            "salt": salt,
            "digest": digest,
        }

    def verify(self, password: str, encoded: str) -> bool:
        try:
            parts = encoded.split("$")
            if len(parts) != 6 or parts[0] != "scrypt":
                return False
            n, r, p = int(parts[1]), int(parts[2]), int(parts[3])
            salt_bytes = base64.b64decode(parts[4])
            expected = base64.b64decode(parts[5])
            actual = hashlib.scrypt(
                password.encode("utf-8"),
                salt=salt_bytes,
                n=n,
                r=r,
                p=p,
                dklen=len(expected),
                maxmem=_maxmem(n, r),
            )
            return hmac.compare_digest(actual, expected)
        except (ValueError, TypeError):
            return False

    def safe_summary(self, encoded: str) -> dict:
        try:
            decoded = self.decode(encoded)
        except (ValueError, TypeError, IndexError):
            return {"algorithm": self.algorithm, "hash": "invalid"}
        return {
            "algorithm": decoded["algorithm"],
            "work factor": f"N={decoded['n']}, r={decoded['r']}, p={decoded['p']}",
            "salt": decoded["salt"][:6] + "...",
        }

    def must_update(self, encoded: str) -> bool:
        try:
            decoded = self.decode(encoded)
        except (ValueError, TypeError, IndexError):
            return True
        return decoded["algorithm"] != "scrypt" or decoded["n"] < N

    def harden_runtime(self, password: str, encoded: str) -> None:
        pass
