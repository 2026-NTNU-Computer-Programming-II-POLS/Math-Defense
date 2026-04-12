"""Unit tests for Value Objects — pure Python, no database required"""
import pytest
from app.domain.value_objects import SessionStatus, Level, Score, GameResult


# ── SessionStatus ──

class TestSessionStatus:
    def test_values(self):
        assert SessionStatus.ACTIVE == "active"
        assert SessionStatus.COMPLETED == "completed"
        assert SessionStatus.ABANDONED == "abandoned"

    def test_from_string(self):
        assert SessionStatus("active") is SessionStatus.ACTIVE
        assert SessionStatus("completed") is SessionStatus.COMPLETED


# ── Level ──

class TestLevel:
    def test_valid_levels(self):
        for i in range(1, 5):
            lv = Level(i)
            assert lv == i

    def test_level_zero_raises(self):
        with pytest.raises(ValueError, match="between 1 and 4"):
            Level(0)

    def test_level_five_raises(self):
        with pytest.raises(ValueError, match="between 1 and 4"):
            Level(5)

    def test_negative_level_raises(self):
        with pytest.raises(ValueError, match="between 1 and 4"):
            Level(-1)


# ── Score ──

class TestScore:
    def test_valid_score(self):
        s = Score(value=1000)
        assert s.value == 1000

    def test_zero_score(self):
        s = Score(value=0)
        assert s.value == 0

    def test_max_score(self):
        s = Score(value=9_999_999)
        assert s.value == 9_999_999

    def test_negative_score_raises(self):
        with pytest.raises(ValueError, match="between 0 and 9999999"):
            Score(value=-1)

    def test_overflow_score_raises(self):
        with pytest.raises(ValueError, match="between 0 and 9999999"):
            Score(value=10_000_000)

    def test_frozen(self):
        s = Score(value=100)
        with pytest.raises(AttributeError):
            s.value = 200


# ── GameResult ──

class TestGameResult:
    def test_valid_result(self):
        r = GameResult(score=Score(500), kills=10, waves_survived=3)
        assert r.score.value == 500
        assert r.kills == 10
        assert r.waves_survived == 3

    def test_negative_kills_raises(self):
        with pytest.raises(ValueError, match="Kills must not be negative"):
            GameResult(score=Score(0), kills=-1, waves_survived=0)

    def test_negative_waves_raises(self):
        with pytest.raises(ValueError, match="Waves survived must not be negative"):
            GameResult(score=Score(0), kills=0, waves_survived=-1)
