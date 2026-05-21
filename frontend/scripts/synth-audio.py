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


def synth_ambient_wave() -> list[float]:
    """8-second loop: tenser counterpart to ambient-build — minor mode,
    pulsing rhythm at ~0.5Hz, brighter partials. Designed to cross-fade
    against ambient-build during BUILD↔WAVE phase transitions."""
    duration = 8.0
    n = int(SAMPLE_RATE * duration)
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        # Minor triad partials (A2 + C3 + E3 ≈ 110/130.8/164.8)
        a = math.sin(2 * math.pi * 110 * t)
        b = math.sin(2 * math.pi * 130.81 * t)
        c = math.sin(2 * math.pi * 164.81 * t)
        # Pulsing rhythm — 0.5Hz square-ish (4 pulses across the 8s loop).
        pulse = 0.5 + 0.5 * math.sin(2 * math.pi * 0.5 * t) ** 3
        fade = 1.0
        edge = 0.25
        if t < edge:
            fade = t / edge
        elif t > duration - edge:
            fade = (duration - t) / edge
        samples.append(0.2 * fade * pulse * (a * 0.6 + b * 0.5 + c * 0.4))
    return samples


# ─── UI ──────────────────────────────────────────────────────────────

def synth_ui_click() -> list[float]:
    """Short crisp tick — single sine pulse, ~40ms."""
    n = int(SAMPLE_RATE * 0.04)
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        env = math.exp(-t * 80)
        samples.append(0.6 * env * math.sin(2 * math.pi * 2200 * t))
    return samples


def synth_ui_hover() -> list[float]:
    """Soft 25ms breath — high sine with very fast decay."""
    n = int(SAMPLE_RATE * 0.03)
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        env = math.exp(-t * 120)
        samples.append(0.35 * env * math.sin(2 * math.pi * 3000 * t))
    return samples


def synth_ui_confirm() -> list[float]:
    """Two-tone ascending blip — 660Hz → 990Hz, 90ms total."""
    out: list[float] = []
    for freq, dur in [(660.0, 0.04), (990.0, 0.06)]:
        n = int(SAMPLE_RATE * dur)
        for i in range(n):
            t = i / SAMPLE_RATE
            env = envelope(i, n, attack=0.003, release=0.03)
            out.append(0.5 * env * math.sin(2 * math.pi * freq * t))
    return out


def synth_ui_cancel() -> list[float]:
    """Descending blip — 660Hz → 440Hz, 100ms."""
    out: list[float] = []
    for freq, dur in [(660.0, 0.04), (440.0, 0.07)]:
        n = int(SAMPLE_RATE * dur)
        for i in range(n):
            t = i / SAMPLE_RATE
            env = envelope(i, n, attack=0.003, release=0.04)
            out.append(0.5 * env * math.sin(2 * math.pi * freq * t))
    return out


# ─── Build / economy ─────────────────────────────────────────────────

def synth_tower_place() -> list[float]:
    """Solid stone thud — 80Hz body + brief mid-range chunk, 200ms."""
    n = int(SAMPLE_RATE * 0.2)
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        env = envelope(i, n, attack=0.002, release=0.15)
        body = math.sin(2 * math.pi * 80 * t) * math.exp(-t * 15)
        chunk = 0.4 * math.sin(2 * math.pi * 320 * t) * math.exp(-t * 30)
        samples.append(0.6 * env * (body + chunk))
    return samples


def synth_tower_upgrade() -> list[float]:
    """Rising sparkle — three-step major arpeggio C5/E5/G5, 250ms total."""
    out: list[float] = []
    for freq, dur in [(523.25, 0.07), (659.25, 0.07), (783.99, 0.18)]:
        n = int(SAMPLE_RATE * dur)
        for i in range(n):
            t = i / SAMPLE_RATE
            env = envelope(i, n, attack=0.003, release=0.12)
            base = math.sin(2 * math.pi * freq * t)
            harm = 0.25 * math.sin(2 * math.pi * freq * 2 * t)
            out.append(0.45 * env * (base + harm))
    return out


def synth_tower_refund() -> list[float]:
    """Reverse-ish chime — descending G5/E5/C5, 200ms."""
    out: list[float] = []
    for freq, dur in [(783.99, 0.05), (659.25, 0.05), (523.25, 0.12)]:
        n = int(SAMPLE_RATE * dur)
        for i in range(n):
            t = i / SAMPLE_RATE
            env = envelope(i, n, attack=0.003, release=0.08)
            out.append(0.4 * env * math.sin(2 * math.pi * freq * t))
    return out


def synth_tower_select() -> list[float]:
    """Crisp tick + subtle ringing harmonic, 80ms."""
    n = int(SAMPLE_RATE * 0.08)
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        env = envelope(i, n, attack=0.002, release=0.06)
        base = math.sin(2 * math.pi * 1320 * t)
        ring = 0.3 * math.sin(2 * math.pi * 2640 * t) * math.exp(-t * 40)
        samples.append(0.4 * env * (base + ring))
    return samples


def synth_buff_expire() -> list[float]:
    """Soft 'power-down' — a gentle descending glissando with a sub-octave
    body and a slow tremolo shimmer, ~340ms. Signals a timed buff fading
    out; kept mellow so it reads as a neutral wind-down, not an alarm."""
    n = int(SAMPLE_RATE * 0.34)
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        # Exponential downward sweep — bright start settling to a low tail.
        f = 320 + 480 * math.exp(-3.2 * t)
        env = envelope(i, n, attack=0.012, release=0.26)
        base = math.sin(2 * math.pi * f * t)
        sub = 0.4 * math.sin(2 * math.pi * f * 0.5 * t)
        # Slow tremolo for a soft wind-down shimmer.
        trem = 0.85 + 0.15 * math.sin(2 * math.pi * 11 * t)
        samples.append(0.4 * env * trem * (base + sub))
    return samples


# ─── Combat ─────────────────────────────────────────────────────────

def synth_tower_attack_light() -> list[float]:
    """Short noisy pew — high coprime-sine interference, 60ms."""
    n = int(SAMPLE_RATE * 0.06)
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        env = math.exp(-t * 50)
        # Bandpass-ish noise via interference between three close partials.
        noise = (math.sin(2 * math.pi * 2113 * t)
                 + math.sin(2 * math.pi * 2671 * t)
                 + math.sin(2 * math.pi * 3329 * t)) / 3
        body = 0.5 * math.sin(2 * math.pi * 420 * t)
        samples.append(0.5 * env * (noise + body))
    return samples


def synth_tower_attack_heavy() -> list[float]:
    """Bass-heavy boom — 70Hz body + low-mid resonance, 180ms."""
    n = int(SAMPLE_RATE * 0.18)
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        env = envelope(i, n, attack=0.001, release=0.14)
        body = math.sin(2 * math.pi * 70 * t) * math.exp(-t * 12)
        res = 0.45 * math.sin(2 * math.pi * 180 * t) * math.exp(-t * 18)
        noise = 0.15 * (math.sin(2 * math.pi * 1731 * t)
                        + math.sin(2 * math.pi * 2459 * t)) * math.exp(-t * 40)
        samples.append(0.55 * env * (body + res + noise))
    return samples


# ─── Enemy lifecycle ─────────────────────────────────────────────────

def synth_enemy_spawn() -> list[float]:
    """Eerie rising glissando — 220Hz → 440Hz, 220ms."""
    n = int(SAMPLE_RATE * 0.22)
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        f = 220 + 1000 * t
        env = envelope(i, n, attack=0.02, release=0.16)
        base = math.sin(2 * math.pi * f * t)
        # Slight detune for unease.
        detune = 0.3 * math.sin(2 * math.pi * (f * 1.015) * t)
        samples.append(0.35 * env * (base + detune))
    return samples


def synth_boss_spawn() -> list[float]:
    """Heavy descending stinger — 220Hz → 55Hz growl + impact, 700ms."""
    n = int(SAMPLE_RATE * 0.7)
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        # Exponential sweep down (220 → 55Hz over the duration).
        f = 220 * math.exp(-1.386 * t / 0.7)  # ln(4) ≈ 1.386 for /4 over duration
        env = envelope(i, n, attack=0.03, release=0.45)
        base = math.sin(2 * math.pi * f * t)
        # Harmonic distortion for menacing tone.
        harm = 0.3 * math.sin(2 * math.pi * f * 1.5 * t)
        # Impact hit at t=0.
        impact = math.exp(-t * 8) * math.sin(2 * math.pi * 90 * t)
        samples.append(0.6 * env * (base + harm + impact * 0.5))
    return samples


def synth_enemy_reached() -> list[float]:
    """HP loss alarm — two short rising stabs, 300ms total."""
    out: list[float] = []
    for freq, dur in [(660.0, 0.08), (880.0, 0.18)]:
        n = int(SAMPLE_RATE * dur)
        for i in range(n):
            t = i / SAMPLE_RATE
            env = envelope(i, n, attack=0.003, release=0.12)
            base = math.sin(2 * math.pi * freq * t)
            # Square-ish for urgency.
            square = 0.4 * math.copysign(1.0, math.sin(2 * math.pi * freq * t))
            out.append(0.45 * env * (base + square * 0.3))
    return out


# ─── Flow ────────────────────────────────────────────────────────────

def synth_wave_start() -> list[float]:
    """Battle horn — fanfare with G3/C4/E4 stack, 500ms."""
    n = int(SAMPLE_RATE * 0.5)
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        env = envelope(i, n, attack=0.02, release=0.35)
        g3 = math.sin(2 * math.pi * 196.0 * t)
        c4 = math.sin(2 * math.pi * 261.63 * t)
        e4 = math.sin(2 * math.pi * 329.63 * t)
        # Brass-ish harmonic.
        harm = 0.3 * (math.sin(2 * math.pi * 392 * t) + math.sin(2 * math.pi * 523.25 * t))
        samples.append(0.45 * env * ((g3 + c4 + e4) / 3 + harm * 0.4))
    return samples


def synth_level_victory() -> list[float]:
    """Triumphant ascending fanfare — C5/E5/G5/C6 hit + sustain, 1.2s."""
    out: list[float] = []
    # Quick arpeggio.
    for freq, dur in [(523.25, 0.10), (659.25, 0.10), (783.99, 0.10)]:
        n = int(SAMPLE_RATE * dur)
        for i in range(n):
            t = i / SAMPLE_RATE
            env = envelope(i, n, attack=0.005, release=0.06)
            out.append(0.5 * env * math.sin(2 * math.pi * freq * t))
    # Sustained C6 + E6 + G6 chord.
    n = int(SAMPLE_RATE * 0.9)
    for i in range(n):
        t = i / SAMPLE_RATE
        env = envelope(i, n, attack=0.01, release=0.6)
        c6 = math.sin(2 * math.pi * 1046.5 * t)
        e6 = math.sin(2 * math.pi * 1318.5 * t)
        g6 = math.sin(2 * math.pi * 1568.0 * t)
        # Lower octave reinforcement.
        c5 = 0.5 * math.sin(2 * math.pi * 523.25 * t)
        out.append(0.4 * env * ((c6 + e6 + g6) / 3 + c5))
    return out


def synth_game_over() -> list[float]:
    """Dirge — descending minor triad with slow decay, 1.3s."""
    out: list[float] = []
    # A4 → F4 → D4 descent.
    for freq, dur in [(440.0, 0.18), (349.23, 0.18), (293.66, 0.18)]:
        n = int(SAMPLE_RATE * dur)
        for i in range(n):
            t = i / SAMPLE_RATE
            env = envelope(i, n, attack=0.01, release=0.14)
            base = math.sin(2 * math.pi * freq * t)
            sub = 0.4 * math.sin(2 * math.pi * freq / 2 * t)
            out.append(0.45 * env * (base + sub))
    # Sustained low D3 + F3 minor chord tail.
    n = int(SAMPLE_RATE * 0.75)
    for i in range(n):
        t = i / SAMPLE_RATE
        env = envelope(i, n, attack=0.02, release=0.55)
        d3 = math.sin(2 * math.pi * 146.83 * t)
        f3 = math.sin(2 * math.pi * 174.61 * t)
        out.append(0.4 * env * (d3 + f3) / 2)
    return out


GENERATORS = {
    "cast-spell.wav":         synth_cast_spell,
    "kill.wav":                synth_kill,
    "wave-end.wav":            synth_wave_end,
    "mh-reveal.wav":           synth_mh_reveal,
    "achievement.wav":         synth_achievement,
    "ambient-build.wav":       synth_ambient_build,
    "ambient-wave.wav":        synth_ambient_wave,
    "ui-click.wav":            synth_ui_click,
    "ui-hover.wav":            synth_ui_hover,
    "ui-confirm.wav":          synth_ui_confirm,
    "ui-cancel.wav":           synth_ui_cancel,
    "tower-place.wav":         synth_tower_place,
    "tower-upgrade.wav":       synth_tower_upgrade,
    "tower-refund.wav":        synth_tower_refund,
    "tower-select.wav":        synth_tower_select,
    "buff-expire.wav":         synth_buff_expire,
    "tower-attack-light.wav":  synth_tower_attack_light,
    "tower-attack-heavy.wav":  synth_tower_attack_heavy,
    "enemy-spawn.wav":         synth_enemy_spawn,
    "boss-spawn.wav":          synth_boss_spawn,
    "enemy-reached.wav":       synth_enemy_reached,
    "wave-start.wav":          synth_wave_start,
    "level-victory.wav":       synth_level_victory,
    "game-over.wav":           synth_game_over,
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
