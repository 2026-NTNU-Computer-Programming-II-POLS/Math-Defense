#!/usr/bin/env python3
"""
Pedagogical Backlog §15 — synthesise the minimal SFX set + BUILD-phase
ambient track into ``frontend/public/audio/`` as 16-bit PCM WAV.

Run from the repo root or `frontend/`:

    python frontend/scripts/synth-audio.py

The output is intentionally licence-free (CC0): every sample is generated
from elementary waveforms in this script, with no third-party audio.
"""
from __future__ import annotations

import math
import os
import struct
import sys
import wave
from pathlib import Path

SAMPLE_RATE = 44100


def envelope(i: int, n: int, attack: float = 0.01, release: float = 0.2) -> float:
    """Linear attack / exponential release envelope in [0, 1]."""
    t = i / SAMPLE_RATE
    total = n / SAMPLE_RATE
    if t < attack:
        return t / attack
    remaining = total - t
    if remaining < release:
        return max(0.0, remaining / release)
    return 1.0


def write_wav(path: Path, samples: list[float]) -> None:
    """Encode mono float samples in [-1, 1] to 16-bit PCM."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        clipped = [max(-1.0, min(1.0, s)) for s in samples]
        w.writeframes(b"".join(struct.pack("<h", int(s * 32767)) for s in clipped))


def synth_cast_spell() -> list[float]:
    """Rising chime — 440Hz → 880Hz over 250ms."""
    n = int(SAMPLE_RATE * 0.25)
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        f = 440 + 1760 * t  # sweep up
        env = envelope(i, n, attack=0.005, release=0.15)
        samples.append(0.45 * env * math.sin(2 * math.pi * f * t))
    return samples


def synth_kill() -> list[float]:
    """Short percussive thud — 90Hz sine + noise burst."""
    n = int(SAMPLE_RATE * 0.12)
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        env = envelope(i, n, attack=0.001, release=0.1)
        # 90Hz body decays faster than envelope
        body = math.sin(2 * math.pi * 90 * t) * math.exp(-t * 25)
        # cheap deterministic "noise" — interference between coprime sines
        noise = 0.3 * (math.sin(2 * math.pi * 1731 * t) + math.sin(2 * math.pi * 2459 * t))
        samples.append(0.5 * env * (body + noise * math.exp(-t * 30)))
    return samples


def synth_wave_end() -> list[float]:
    """Major-third chord stab (C5 + E5) for ~600ms."""
    n = int(SAMPLE_RATE * 0.6)
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        env = envelope(i, n, attack=0.01, release=0.4)
        c5 = math.sin(2 * math.pi * 523.25 * t)
        e5 = math.sin(2 * math.pi * 659.25 * t)
        g5 = math.sin(2 * math.pi * 783.99 * t)
        samples.append(0.35 * env * (c5 + e5 + g5) / 3)
    return samples


def synth_mh_reveal() -> list[float]:
    """Two-step ascending arpeggio: G4 → C5 (200ms each)."""
    out = []
    for freq, dur in [(392.0, 0.18), (523.25, 0.30)]:
        n = int(SAMPLE_RATE * dur)
        for i in range(n):
            t = i / SAMPLE_RATE
            env = envelope(i, n, attack=0.005, release=0.15)
            out.append(0.5 * env * math.sin(2 * math.pi * freq * t))
    return out


def synth_achievement() -> list[float]:
    """Bright fanfare — three sine partials in ascending major triad."""
    out = []
    for freq, dur in [(523.25, 0.10), (659.25, 0.10), (783.99, 0.45)]:
        n = int(SAMPLE_RATE * dur)
        for i in range(n):
            t = i / SAMPLE_RATE
            env = envelope(i, n, attack=0.005, release=0.2)
            base = math.sin(2 * math.pi * freq * t)
            harmonic = 0.3 * math.sin(2 * math.pi * freq * 2 * t)
            out.append(0.45 * env * (base + harmonic))
    return out


def synth_ambient_build() -> list[float]:
    """8-second loop-friendly drone: low pad with slow LFO."""
    duration = 8.0
    n = int(SAMPLE_RATE * duration)
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        # Three detuned partials = warm pad. Loop-safe: integer cycles per loop.
        a = math.sin(2 * math.pi * 110 * t)
        b = math.sin(2 * math.pi * 165 * t)
        c = math.sin(2 * math.pi * 220.5 * t)
        # Slow tremolo (0.25Hz) — also integer cycles in the 8s window.
        lfo = 0.5 + 0.5 * math.sin(2 * math.pi * 0.25 * t)
        # Cross-fade the first/last 250ms with itself so the loop point is
        # seamless even with slight phase drift.
        fade = 1.0
        edge = 0.25
        if t < edge:
            fade = t / edge
        elif t > duration - edge:
            fade = (duration - t) / edge
        samples.append(0.18 * fade * lfo * (a + b * 0.7 + c * 0.5))
    return samples


GENERATORS = {
    "cast-spell.wav":    synth_cast_spell,
    "kill.wav":          synth_kill,
    "wave-end.wav":      synth_wave_end,
    "mh-reveal.wav":     synth_mh_reveal,
    "achievement.wav":   synth_achievement,
    "ambient-build.wav": synth_ambient_build,
}


def main() -> int:
    here = Path(__file__).resolve()
    # Resolve the public/audio target relative to this script regardless of cwd.
    public_audio = here.parent.parent / "public" / "audio"
    public_audio.mkdir(parents=True, exist_ok=True)
    for name, gen in GENERATORS.items():
        target = public_audio / name
        write_wav(target, gen())
        print(f"  wrote {target.relative_to(here.parent.parent.parent)} "
              f"({os.path.getsize(target) // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
