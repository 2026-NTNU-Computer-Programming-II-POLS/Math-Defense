"""User domain constraints — single source of truth for validation bounds"""

PLAYER_NAME_MIN_LENGTH = 1
PLAYER_NAME_MAX_LENGTH = 50

EMAIL_MAX_LENGTH = 255

AVATAR_URL_MAX_LENGTH = 500

# Allowlist of avatar URLs the application ships. Lives in the domain layer so
# the User aggregate can enforce it on every code path — not just requests that
# pass through the Pydantic schema. Keep in sync with PRESET_AVATARS in the
# frontend ProfileView.vue (asserted by test_avatar_parity).
ALLOWED_AVATAR_URLS = frozenset({
    '/avatars/wizard.svg',
    '/avatars/knight.svg',
    '/avatars/archer.svg',
    '/avatars/mage.svg',
    '/avatars/scholar.svg',
    '/avatars/alchemist.svg',
})

# ── Endpoint marker (P*) preferences ──
#
# The level-endpoint marker is a presentation-only setting persisted server-
# side so it follows the player across devices. The defense-in-depth chain is:
# FE input restriction → FE store cap → API schema validator → domain aggregate
# re-check → DB CheckConstraint. The constants below are the single source of
# truth for both the Pydantic layer and the aggregate.

ALLOWED_ENDPOINT_MARKER_STYLES = frozenset({'star', 'gorilla', 'custom'})
ALLOWED_ENDPOINT_HIT_FX_STYLES = frozenset({'random', 'fragments', 'crying', 'angry'})

# Mirrors the FE setter cap in `frontend/src/stores/uiStore.ts`
# (ENDPOINT_MARKER_CUSTOM_MAX_BYTES). A 256x256 PNG produced by the FE resize
# pass is typically <100 KB; the 3 MB cap leaves a comfortable safety margin
# without letting a multi-MB row bloat the users table.
ENDPOINT_MARKER_DATAURL_MAX_LENGTH = 3 * 1024 * 1024

# Acceptable dataURL prefixes. The FE always emits PNG (canvas.toDataURL
# defaults to image/png), but JPEG is allowed in case a future FE change
# preserves the source format for photographic uploads. Each prefix maps to a
# magic-byte sentinel (see ENDPOINT_MARKER_MAGIC_BYTES below).
ENDPOINT_MARKER_DATAURL_PREFIXES = (
    'data:image/png;base64,',
    'data:image/jpeg;base64,',
)

# First N bytes of a valid PNG / JPEG file. We never decode the image on the
# server (no Pillow); confirming the magic-byte header is enough to reject
# random bytes a malicious client might base64-encode into the field.
ENDPOINT_MARKER_MAGIC_BYTES = {
    'data:image/png;base64,': b'\x89PNG\r\n\x1a\n',
    'data:image/jpeg;base64,': b'\xff\xd8\xff',
}

# Cap on the dimensions declared in a PNG's IHDR chunk. The FE resizes
# uploads to 256x256 before storing, so legitimate payloads are always well
# under this; the cap exists to defend against hand-crafted PNGs that declare
# huge dimensions in a small file (decompression bomb). At 1024x1024 the
# worst-case decoded RGBA buffer is ~4 MB, which any modern browser handles
# without crashing.
ENDPOINT_MARKER_MAX_DIMENSION = 1024
