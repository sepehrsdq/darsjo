"""A drag-the-puzzle captcha that needs no external service or font.

The server renders a small abstract picture, cuts a puzzle-shaped hole in it and
sends the matching piece separately. The visitor drags the piece into the hole.
The target coordinate never reaches the browser as a number, and the challenge
is one-time and short-lived.
"""

import base64
import io
import random
import secrets

from django.conf import settings
from django.core.cache import cache
from PIL import Image, ImageDraw

WIDTH = 320
HEIGHT = 168
PIECE = 46
KNOB = 15
MARGIN = 12
TRACK_MARGIN = 6

COLORS = [
    (13, 148, 136),
    (217, 119, 6),
    (37, 99, 235),
    (124, 58, 237),
    (219, 39, 119),
    (22, 163, 74),
    (14, 116, 144),
]

PIECE_W = PIECE + KNOB
PIECE_H = PIECE


def _cache_key(token):
    return f"captcha:{token}"


def _rate_key(ip):
    return f"captcha:rate:{ip or 'unknown'}"


def _png_data_url(image: Image.Image) -> str:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def _gradient(color, rng):
    image = Image.new("RGB", (WIDTH, HEIGHT))
    draw = ImageDraw.Draw(image)
    light = tuple(min(255, int(channel + (255 - channel) * 0.62)) for channel in color)
    for y in range(HEIGHT):
        t = y / max(HEIGHT - 1, 1)
        row = tuple(int(light[i] + (color[i] - light[i]) * t * 0.55) for i in range(3))
        draw.line([(0, y), (WIDTH, y)], fill=row)

    # soft translucent circles
    for _ in range(6):
        radius = rng.randint(22, 78)
        cx = rng.randint(-radius, WIDTH + radius)
        cy = rng.randint(-radius, HEIGHT + radius)
        overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
        ImageDraw.Draw(overlay).ellipse(
            [cx - radius, cy - radius, cx + radius, cy + radius],
            fill=(255, 255, 255, rng.randint(14, 46)),
        )
        image = Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")

    draw = ImageDraw.Draw(image)
    for _ in range(5):
        points = [(rng.randrange(WIDTH), rng.randrange(HEIGHT)) for _ in range(3)]
        draw.line(points, fill=(255, 255, 255, 40), width=rng.randint(1, 2))
    for _ in range(420):
        x, y = rng.randrange(WIDTH), rng.randrange(HEIGHT)
        shade = rng.randint(0, 60)
        draw.point((x, y), fill=(255 - shade, 255 - shade, 255 - shade))
    return image


def _piece_mask():
    mask = Image.new("L", (PIECE_W, PIECE_H), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([0, 0, PIECE - 1, PIECE_H - 1], radius=9, fill=255)
    # a round tab on the right edge, like a real jigsaw piece
    draw.ellipse(
        [PIECE - 6, int(PIECE_H * 0.30), PIECE + KNOB - 6, int(PIECE_H * 0.30) + KNOB],
        fill=255,
    )
    return mask


def _render(rng):
    color = rng.choice(COLORS)
    background = _gradient(color, rng)
    mask = _piece_mask()

    target_x = rng.randint(MARGIN, WIDTH - PIECE_W - MARGIN)
    target_y = rng.randint(MARGIN, HEIGHT - PIECE_H - MARGIN)

    # Keep the untouched picture: the piece must be the original pixels, while
    # the board shows a darkened hole in exactly the same place.
    source = background.copy()

    # The hole: darken the exact silhouette and draw a light rim.
    hole_layer = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    hole_draw = ImageDraw.Draw(hole_layer)
    hole_mask = Image.new("L", (WIDTH, HEIGHT), 0)
    hole_mask.paste(mask, (target_x, target_y))
    hole_layer.paste((16, 24, 28, 150), (0, 0), hole_mask)
    background = Image.alpha_composite(background.convert("RGBA"), hole_layer)
    rim = ImageDraw.Draw(background)
    rim.rounded_rectangle(
        [target_x, target_y, target_x + PIECE - 1, target_y + PIECE_H - 1],
        radius=9,
        outline=(255, 255, 255, 175),
        width=2,
    )
    rim.ellipse(
        [
            target_x + PIECE - 6,
            target_y + int(PIECE_H * 0.30),
            target_x + PIECE + KNOB - 6,
            target_y + int(PIECE_H * 0.30) + KNOB,
        ],
        outline=(255, 255, 255, 175),
        width=2,
    )

    # The piece: the very same pixels, with the silhouette as alpha channel.
    crop = source.crop((target_x, target_y, target_x + PIECE_W, target_y + PIECE_H))
    piece = crop.convert("RGBA")
    piece.putalpha(mask)
    piece_draw = ImageDraw.Draw(piece)
    piece_draw.rounded_rectangle(
        [0, 0, PIECE - 1, PIECE_H - 1], radius=9, outline=(255, 255, 255, 190), width=2
    )
    # small glossy highlight so the piece reads as a physical object
    piece_draw.line([(5, 4), (PIECE - 8, 4)], fill=(255, 255, 255, 110), width=2)

    return (
        background.convert("RGB"),
        piece,
        target_x,
        target_y,
    )


def create_challenge(ip=None):
    """Return a fresh challenge payload and remember the target on the server."""
    key = _rate_key(ip)
    count = cache.get(key, 0)
    if count >= settings.CAPTCHA_MAX_PER_MINUTE:
        return None
    cache.set(key, count + 1, 60)

    rng = random.Random(secrets.randbits(64))
    background, piece, target_x, target_y = _render(rng)
    token = secrets.token_urlsafe(24)
    cache.set(
        _cache_key(token),
        {"x": target_x, "y": target_y},
        settings.CAPTCHA_TTL_SECONDS,
    )
    return {
        "token": token,
        "background": _png_data_url(background),
        "piece": _png_data_url(piece),
        "width": WIDTH,
        "height": HEIGHT,
        "pieceWidth": PIECE_W,
        "pieceHeight": PIECE_H,
        "pieceTop": target_y,
        "expiresIn": settings.CAPTCHA_TTL_SECONDS,
    }


def verify(token, x):
    """Login-side check. Every challenge allows exactly one attempt."""
    if not settings.CAPTCHA_ENABLED:
        return True, "disabled", 0
    if not token:
        return False, "missing", 0
    record = cache.get(_cache_key(token))
    if record is None:
        return False, "expired", 0
    cache.delete(_cache_key(token))
    try:
        value = float(x)
    except (TypeError, ValueError):
        return False, "invalid", 0
    if abs(value - float(record["x"])) <= settings.CAPTCHA_TOLERANCE_PX:
        return True, "ok", 0
    return False, "wrong", 0


def check(token, x):
    """Validate the position right after the piece is released.

    This is the live check used by the login screen. On success the challenge is
    kept alive so the following login request can consume it; a wrong position
    burns it immediately (one chance per puzzle).
    """
    if not settings.CAPTCHA_ENABLED:
        return True, "disabled"
    if not token:
        return False, "missing"
    record = cache.get(_cache_key(token))
    if record is None:
        return False, "expired"
    try:
        value = float(x)
    except (TypeError, ValueError):
        cache.delete(_cache_key(token))
        return False, "invalid"
    if abs(value - float(record["x"])) <= settings.CAPTCHA_TOLERANCE_PX:
        record["checked"] = True
        cache.set(_cache_key(token), record, settings.CAPTCHA_TTL_SECONDS)
        return True, "ok"
    cache.delete(_cache_key(token))
    return False, "wrong"
