"""Tower-type competency taxonomy for Evidence-Centred Design (Mislevy et al. 2003).

Each enum member names a latent competency that game events provide evidence
for via the Q-matrix (Tatsuoka 1983). The set is closed: adding a competency
is a deliberate curriculum decision, not a casual change, because it requires
re-weighing every Q-matrix row.
"""
from __future__ import annotations

from enum import Enum


class Competency(str, Enum):
    MAGIC = "MAGIC"
    RADAR = "RADAR"
    MATRIX = "MATRIX"
    LIMIT = "LIMIT"
    CALCULUS = "CALCULUS"
    CHAIN_RULE = "CHAIN_RULE"
    PROBABILITY = "PROBABILITY"
