from pydantic import BaseModel, ConfigDict


class AchievementOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    name: str
    description: str
    category: str
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
