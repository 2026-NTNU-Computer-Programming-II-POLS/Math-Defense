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
