from pydantic import BaseModel, ConfigDict


class TalentNodeOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    tower_type: str
    attribute: str
    name: str
    description: str
    max_level: int
    cost_per_level: int
    effect_per_level: float
    prerequisites: list[str]
    current_level: int


class TalentTreeOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    points_earned: int
    points_spent: int
    points_available: int
    nodes: list[TalentNodeOut]


class TalentModifiersOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    modifiers: dict[str, dict[str, float]]
