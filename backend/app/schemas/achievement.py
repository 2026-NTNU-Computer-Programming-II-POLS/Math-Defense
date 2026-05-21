from pydantic import BaseModel, ConfigDict


class AchievementOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    name: str
    description: str
    category: str
    # Effective talent points: the reward actually banked for an unlocked
    # achievement (2x when unlocked during an active season) or what unlocking
    # it now would grant when still locked. Summing this over unlocked entries
    # equals AchievementSummaryOut.talent_points_earned.
    talent_points: int
    unlocked: bool
    unlocked_at: str | None = None
    season_id: str | None = None
    season_active: bool = False
    season_starts_at: str | None = None
    season_ends_at: str | None = None
    season_name: str | None = None


class AchievementSummaryOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    unlocked: int
    total: int
    talent_points_earned: int
