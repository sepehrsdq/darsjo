"""Shared helpers: text normalization and the Iranian national-ID algorithm."""

import re

PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹"
ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩"
_DIGIT_MAP = {ord(c): str(i) for i, c in enumerate(PERSIAN_DIGITS)}
_DIGIT_MAP.update({ord(c): str(i) for i, c in enumerate(ARABIC_DIGITS)})

# zero-width non-joiner, zero-width joiner, BOM, non-breaking space
_INVISIBLES = dict.fromkeys(map(ord, "\u200c\u200d\ufeff\u00a0"), None)


def to_ascii_digits(value: str) -> str:
    return value.translate(_DIGIT_MAP)


def to_persian_digits(value) -> str:
    """Render ASCII digits with Persian glyphs for user-facing text."""
    return str(value).translate({ord(str(i)): c for i, c in enumerate(PERSIAN_DIGITS)})


def clean_text(value) -> str:
    """Trim, drop zero-width characters and collapse inner whitespace."""
    if value is None:
        return ""
    text = str(value).translate(_DIGIT_MAP).translate(_INVISIBLES)
    return " ".join(text.split()).strip()


def clean_national_id(value) -> str:
    """Normalize a national ID: ASCII digits only, padded to 10 characters.

    Real spreadsheets contain every shape of this value: ``451234567`` (the
    leading zero was dropped by the cell format), ``451234567.0`` (a numeric
    cell), Persian/Arabic digits, and values with spaces or dashes. The first
    digit of an Iranian national ID is frequently ``0``, so padding is not
    cosmetic: it is what makes the checksum and the login password match.
    """
    was_float = isinstance(value, float) and value.is_integer()
    if was_float:
        value = int(value)
    text = clean_text(value)
    # A cell formatted as a number may arrive as the string ``451234567.0``.
    decimal = re.fullmatch(r"(\d+)\.0+", text)
    if decimal:
        text = decimal.group(1)
    digits = "".join(ch for ch in text if ch.isdigit())
    if not digits:
        return ""
    if len(digits) > 10:
        digits = digits[-10:]
    if len(digits) < 10:
        digits = digits.zfill(10)
    return digits


def national_id_variants(password: str) -> list[str]:
    """Passwords a student may type for a national ID (with/without zero)."""
    raw = clean_text(password)
    digits = "".join(ch for ch in raw if ch.isdigit())
    if not digits or len(digits) > 10:
        return []
    variants = []
    for candidate in (digits, digits.zfill(10), digits.lstrip("0")):
        if candidate and candidate not in variants:
            variants.append(candidate)
    return variants


def national_id_is_valid(value: str) -> bool:
    if not value or len(value) != 10 or not value.isdigit():
        return False
    if len(set(value)) == 1:  # 0000000000, 1111111111, ...
        return False
    check = int(value[9])
    total = sum(int(value[i]) * (10 - i) for i in range(9))
    remainder = total % 11
    expected = remainder if remainder < 2 else 11 - remainder
    return check == expected


def mask_national_id(value: str) -> str:
    """Never expose the full national ID: ******1234"""
    if not value:
        return ""
    return "*" * 6 + value[-4:]


def mask_phone(value: str) -> str:
    if not value:
        return ""
    return value[:4] + "*" * max(len(value) - 7, 0) + value[-3:]


def build_national_id(seed: int) -> str:
    """Produce a checksum-valid 10-digit national ID (used by seed/demo data)."""
    base = f"{seed:09d}"[:9]
    total = sum(int(base[i]) * (10 - i) for i in range(9))
    remainder = total % 11
    check = remainder if remainder < 2 else 11 - remainder
    return f"{base}{check}"
