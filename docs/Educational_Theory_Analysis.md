# Math Defense — Educational & Gamified-Learning Theory Analysis

> A theory-driven design audit of *Math Defense* (V2 Phase 5 + Phase 6 Grabbing Territory).
> Each section maps a concrete game mechanic to one or more authoritative learning theories, evaluates fit, and flags risks.
> Citations follow APA 7. DOIs are given for every peer-reviewed source.

---

## 1. Executive Summary

*Math Defense* is a tower-defense game in which seven tower types are not merely flavoured by mathematics but **constituted by it**: the slope and intercept of a polynomial determine a Magic-tower zone; the start and end angles of a 1.5×-bonus arc shape every Radar tower's effective firing zone; the dot product of two paired Matrix-tower coordinate vectors produces Matrix-tower damage; a derivative or integral spawns Calculus-tower pets; a multiple-choice limit picks a Limit-tower's effect; a Monty-Hall door choice between waves rewards correct conditional-probability reasoning; and a Boss Type-B fight is gated by a chain-rule challenge. Random function paths, a 1–5 star rating system, an "Initial Answer" pre-wave endpoint identification, time-based spells and buffs, an S1/S2/K/TotalScore formula, a 25-achievement set, a 19-node talent tree, and a teacher-curated *Grabbing Territory* classroom-competition mode complete the loop.

The design is, at the level of intent, a near-canonical implementation of **intrinsic integration** (Habgood & Ainsworth, 2011), layered with **productive failure** (Kapur, 2008, 2014, 2016), **variation-theoretic random instances** (Marton, 2015), **cognitive-load-respecting phase segmentation** (Sweller, van Merriënboer, & Paas, 2019), and **self-determination-aligned progression** (Ryan, Rigby, & Przybylski, 2006). The achievement-and-telemetry layer is now a **fully realised stealth assessment** in the sense of Shute (2011) — declared Q-matrix, Beta competency posteriors per user, teacher-facing dashboard surfacing, and an adaptive star/talent recommender — and the combination of teacher-curated Grabbing Territory, deterministic Replay/Spectate, and a post-wave articulation prompt now satisfies **all six** steps of the cognitive-apprenticeship cycle (Collins, Brown, & Newman, 1989).

This document maps each mechanic to the relevant theory, identifies both strengths and threats to learning effectiveness, re-examines four under-noticed subsystems (Grabbing Territory, the Class system as differentiated-instruction infrastructure, server-side score verification as assessment-validity infrastructure, and the project's identity as a Programming-II final by a mixed-seniority team), and closes with a minimum-defensible empirical-validity plan and three highest-leverage design refinements.

---

## 2. Project at a Glance

| Layer | Mechanic | Math Concept |
|---|---|---|
| Tower | Magic | Polynomial / trigonometric / logarithmic curves |
| Tower | Radar A — Sweep | Radian intervals, arc sectors (rotating beam, AoE inside a configurable 1.5× bonus arc) |
| Tower | Radar B — Rapid | Radian intervals, arc sectors (fast projectiles; same configurable 1.5× bonus arc) |
| Tower | Radar C — Sniper | Radian intervals, arc sectors (slow long-range crit shots; same configurable 1.5× bonus arc) |
| Tower | Matrix | Dot product of paired-tower grid-coordinate vectors |
| Tower | Limit | $\lim_{x\to c} f(x)$, one-sided limits |
| Tower | Calculus | Derivatives & definite integrals |
| Boss | Type-B Chain Rule | Composition of derivatives |
| Event | Monty Hall | Conditional probability, expected value |
| Pre-wave | Initial Answer | Function recognition (graph ↔ algebraic form) |
| Meta | Star rating 1–5 | Difficulty scaffolding |
| Meta | Achievements (25, six categories) + Talents (19 nodes) | Long-horizon goal pursuit, stealth-assessment evidence |
| Meta | Leaderboards (Global / Class / Internal / External) | Bounded vs. open social comparison |
| Class | Grabbing Territory | Teacher-curated competitive activity, scarce-slot strategic choice |

Architecture: Vue 3 + TypeScript front end (ECS engine, Pinia stores), FastAPI / DDD backend, C → WebAssembly math kernel, PostgreSQL persistence, server-side score verification via a domain-layer mirror of the scoring formula.

---

## 3. The Central Thesis — Intrinsic Integration and Generation

### 3.1 Why "Math IS Mechanics" Matters

The single most important property of *Math Defense* is that mathematical reasoning is the **input control surface** of the game, not a gate or a currency. Habgood and Ainsworth (2011) showed in a controlled study of *Zombie Division* that children who played a version where the educational content was **intrinsically integrated** with the core mechanic learned significantly more than children who played an *extrinsically integrated* version with identical content, art, and play time; under free-choice conditions, the same children also chose to play the intrinsic version longer. They define intrinsic integration as making the learning content the most enjoyable and rewarding aspect of the gaming experience (Habgood & Ainsworth, 2011).

By this criterion, *Math Defense* is intrinsically integrated by design:

- The function $y = m x + b$ a player types into a Magic tower **is** the projectile trajectory; the player cannot avoid reasoning about slope and intercept by clicking faster.
- The arc $[\theta_{\text{start}},\theta_{\text{end}}]$ on every Radar tower **is** the 1.5× damage-bonus region; the angles are not numbers the game asks the player about, they are the firing zone the tower preferentially attacks within.
- The Monty-Hall door choice **is** the reward; expected-value reasoning is the only way to maximise it.

This contrasts sharply with the four competitor titles surveyed in the original spec ("answer 7×8 to fire a cannon"), all of which fall under what Habgood and Ainsworth (2011) explicitly criticise as the "chocolate-covered broccoli" pattern: gameplay and content are dissociable, so players learn to skip the broccoli.

> **Green flag.** The architecture invariant ("all game state changes go through events; no `as any` casts; renderers use public system APIs") prevents shortcut UI paths that would let a player bypass the math input. Per-phase update-system gating (`if (game.state.phase !== GamePhase.WAVE) return` in `RadarTowerSystem`/`MatrixTowerSystem`) keeps math evaluation and combat resolution in their respective phases, even though no explicit "lock parameters at wave start" mechanism is implemented in the current codebase — re-configuration events such as `RADAR_ARC_CHANGED` would still mutate tower properties mid-wave if dispatched, so the design depends on UI gating (e.g. `StartWaveButton` only enabled in `BUILD`) rather than a hard domain-level lock.

> **Risk → resolved.** The Initial Answer phase rewards endpoint *recognition* with a score multiplier (`TotalScore = K^{1/(1+2+H_o-H_f-IA)}`). Because IA appears as a flat additive in the exponent's denominator, a player could in principle skip the math and absorb the small score penalty — exactly the failure mode Habgood and Ainsworth's framework predicts whenever the *math option* has lower expected utility than the *math-free option*. The current build closes this loophole at the difficulty surface rather than the score surface: Star-5 selection is **gated** on having answered the IA correctly at least once at any star rating (`user/aggregate.py:ia_unlock_earned`, enforced both client-side in `LevelSelectView.vue` and server-side via `Star5LockedError` raised from `session_service.create_session`). Class-mode Grabbing-Territory slots at Star-5 still bypass the personal lock by design, since slots are teacher-curated.

### 3.2 The Generation Effect — The No-Slider Doctrine

Slamecka and Graf (1978) demonstrated that information *generated* by the learner is better retained than identical information passively read. Bertsch, Pesta, Wiscott, and McDaniel (2007) meta-analysed 86 studies and confirmed a robust generation effect with mean *d* ≈ 0.40, larger when the to-be-generated item is **constrained** (a single correct value) than when it is unconstrained.

The original spec's design rule — *"manual numeric input, not sliders; players must derive each new value by reasoning from the visual outcome"* — is, when honoured, an unusually clean operationalisation of constrained generation. Sliders would convert the task into recognition (pick the right value); typing converts it into recall and construction. The same logic governs:

- the Limit tower's multiple-choice limit (constrained generation among six outcomes: $+\infty,+C,0,\text{const},-C,-\infty$, mapped in `tower-defs.ts` to max-damage, damage, removal, disable, heal, max-heal respectively),
- the Chain-rule challenge (constrained: select correct $f'(g(x))g'(x)$), and
- the Monty-Hall door choice (constrained binary: switch or stay).

> **Green flag (restored).** The Magic tower (`MagicInputPanel`), the Matrix tower's coefficient grid (`MatrixInputPanel`), and the Calculus tower (function/operator selection) all honour the no-slider rule; the Limit and Monty-Hall paths are constrained multiple-choice. The previous Radar-slider counterexample has been retired: `RadarConfigPanel.vue` now uses `<input type="number" min="0" max="360" step="5">` for `arcStart` / `arcEnd` with a manual *Apply* gate (`snapDeg()` rounds to the nearest 5°, and the visual arc updates only on Apply, not on every keystroke — the property the generation literature requires). All seven tower types now place their primary parameter input in the *generation* regime rather than the *recognition* regime. An opt-in slider fallback is exposed for accessibility (see §12.3); enabling it visibly tags the session as **practice mode**, which is excluded from leaderboards (`leaderboard_service` filter on `practice_mode`) so the doctrine is preserved at the level of competitive scoring even when accommodation is granted at the level of input.

---

## 4. Learning-Science Foundations

### 4.1 Productive Failure (Kapur, 2008, 2014, 2016)

Kapur's productive-failure (PF) paradigm holds that learners benefit from being asked to generate solutions to problems *before* receiving canonical instruction, even when those initial attempts fail (Kapur, 2008, 2014). The mechanism is twofold: the failed attempt activates relevant prior knowledge and *makes the structure of the canonical solution learnable*, and the affective cost of failure is a precondition for deep encoding (Kapur, 2016).

*Math Defense*'s **Build Phase** is, by construction, a productive-failure environment:

- Manual numeric input forces the learner to commit to a hypothesis (a value of $m$) before seeing whether it works.
- Build allows **unlimited revision**, but each revision requires a fresh inverse-problem step (read the rendered curve, reason backwards to a parameter change). This is the iterative sense-making cycle Kapur (2014) identifies as effective.
- Wave Phase plays the role of "consolidation" in PF: a non-revisable validation of the solution, followed by a return to Build Phase where the structure of *successful* prior attempts can be reused.

The original spec's slogan "allow failure, but every failure has learning value" cites Kapur (2008) directly and is, in our reading, a faithful operationalisation.

> **Risk → resolved.** Kapur (2016) is explicit that PF only works when learners are asked to grapple with **the same structural problem** that the canonical instruction will then crystallise; Loibl, Roll, and Rummel's (2017) theoretical synthesis argues that PF without consolidation degrades to mere "unproductive failure." The current build adds the consolidation step as an optional, dismissible **post-wave principle-surfacing overlay** (`frontend/src/components/game/PrincipleOverlay.vue`). After every wave (and after `CHAIN_RULE_ANSWERED` / `MONTY_HALL_RESULT`), the engine emits `PRINCIPLE_SHOW`; the overlay renders one of seven principle cards from `frontend/src/data/principle-defs.ts` (`chain-rule`, `monty-hall`, `derivative-as-rate`, `limit-piecewise`, `matrix-dot`, `magic-curve-zone`, `radar-arc`) with a KaTeX formula and a one-paragraph plain-language gloss, dismissible after 8 s or on click. The toggle lives in `ProfileView.vue` settings ("Show learning hints between waves") so the consolidation step is honoured by default but respects autonomy.

### 4.2 Cognitive Load Theory

Sweller's cognitive load theory partitions working-memory load into intrinsic, extraneous, and germane components, and argues that instructional design should minimise extraneous load, manage intrinsic load via segmentation, and direct spare capacity toward germane (schema-building) processing (Sweller, 1988; Sweller et al., 1998, 2019).

*Math Defense*'s phase architecture is essentially a CLT segmentation strategy:

| Phase | Dominant load |
|---|---|
| Initial Answer | Intrinsic (function recognition only — no game state to track) |
| Build | Intrinsic + germane (schema building under no time pressure) |
| Wave | Almost zero germane load — perception/observation only |
| Monty Hall | Intrinsic only (probability decision under no enemy pressure) |
| Chain-rule challenge | Wave is *paused* during the question |

Pausing Wave Phase during chain-rule challenges and forbidding math input during Wave Phase implements CLT's *segmentation principle* (Mayer, 2014). It also avoids the "split attention" problem (Sweller et al., 2019): the player never has to track enemy paths and reason about derivatives in the same second.

> **Green flag.** The HUD redesign in V2 Phase 4 (two-row layout: star, kill value, IA indicator, Monty-Hall progress, spell bar, buffs, prep timer) is a textbook signalling-principle implementation (Mayer, 2014).

> **Risk → resolved.** The Magic tower lets players choose between polynomial, trigonometric, and logarithmic curve families *and* type coefficients. With Limit/Calculus panels on the same screen, Build-Phase load was previously high — the configuration Sweller et al. (2019) flag as exactly the case for **pre-training**. The current build implements pre-training by gating advanced curve families on early-star achievements: new players see only the polynomial tab in `MagicModePanel.vue`; the trigonometric tab unlocks on the `unlock_trig_curves` achievement (clear one Star-1 level) and the logarithmic tab on `unlock_log_curves` (clear one Star-2 level). Existing players are retroactively unlocked through the existing achievement-evaluation loop on session completion.

### 4.3 Desirable Difficulties (Bjork & Bjork, 2011)

Robert and Elizabeth Bjork's *desirable difficulties* framework holds that some kinds of difficulty during learning — variation, spacing, interleaving, and generation — depress short-term performance but improve long-term retention and transfer.

| Desirable difficulty | Math Defense implementation |
|---|---|
| Varied practice | Per-game random function from a level-tagged pool |
| Spacing | Wave intervals + multi-session play |
| Interleaving | Mixed tower types per level rather than blocked single-type levels |
| Generation | Manual numeric input for Magic/Matrix/Calculus; recognition-style sliders on Radar (see §3.2 caveat) |
| Phase-gated re-configuration | The Build → Wave UI gate forces commitment to *one* configuration per wave; effective in practice, though not enforced as a hard domain-level invariant |

A corollary, also emphasised by Bjork and Bjork (2011), is that learners *misjudge* desirable difficulties as bad teaching. Players (and teachers) may rate the random-path system as "unfair." `TeacherDashboard.vue` accordingly surfaces a `<details>` explainer ("Why are paths random?") near the top of the dashboard, default-open on first visit and persisted as collapsed in `localStorage` on dismissal — a low-cost intervention against the well-documented user-misperception failure mode.

### 4.4 Retrieval Practice and the Testing Effect

Roediger and Karpicke (2006) showed across multiple experiments that the act of *retrieving* information produces stronger long-term retention than re-studying it. The effect strengthens with delay — the temporal pattern of a multi-wave game.

Mid-wave retrieval events in *Math Defense*:

- **Boss Type-B chain-rule challenge**: WAVE pauses, learner retrieves the chain rule under modest time pressure, resumes WAVE.
- **Limit tower setup**: each placement is a fresh limit problem. At Star ≥ 4, `LimitQuestionPanel.vue` switches the response mode from multiple-choice to **typed entry** (`limit-evaluator.parseLimitAnswer()` accepts `+inf`/`-inf`/`infinity`/integers/decimals/`DNE`, whitespace-tolerant and case-insensitive). This diversifies the retrieval task type so the high-difficulty band exercises *recall* construction rather than *recognition* selection — the configuration Karpicke & Roediger (2007) identify as the stronger long-term-retention condition.
- **Monty-Hall event**: each occurrence re-tests conditional-probability reasoning.

The spacing between retrieval events varies with kill-value thresholds and wave count, producing the kind of expanding inter-test interval that Cepeda, Vul, Rohrer, Wixted, and Pashler (2008) identify as a robust spacing benefit; Karpicke and Roediger (2007) further show that *repeated successful retrieval* of the same item — exactly the multi-wave structure of *Math Defense* — is the strongest single predictor of long-term retention.

### 4.5 Spacing and Interleaving

Rohrer and Taylor (2007) and the Dunlosky, Rawson, Marsh, Nathan, and Willingham (2013) review identify *interleaved* practice as one of the highest-yield study techniques in cognitive psychology. The forced mixing of tower types within a single level, combined with talent-tree prerequisite chains that span multiple math families, distributes practice across topics rather than blocking it — the configuration these studies endorse.

### 4.6 Variation Theory and Transfer

Marton's (2015) variation theory holds that learners notice a feature only when it varies against an invariant background. Barnett and Ceci (2002) provide the canonical taxonomy of *transfer of learning* and identify "variation across surface features but invariance across deep structure" as a precondition for far transfer.

The **random-function-path system** is a near-perfect variation-theory implementation: surface features (the specific function instance) vary every game; deep structure (the family — linear, quadratic, sinusoidal) is the invariant the learner must abstract. The original spec's argument that "the leaderboard reflects who can really read functions, not who memorised the answer" is, in Barnett and Ceci's (2002) terminology, a claim to far transfer.

> **Green flag.** This is one of the strongest features of the design and would survive almost any peer review of an educational-game artefact paper.

---

## 5. Cognitive and Multimedia Architecture

### 5.1 Multimedia Learning Principles

Mayer's (2014) cognitive theory of multimedia learning lists ~15 evidence-based design principles. Those most relevant to *Math Defense*:

| Mayer principle | Implementation |
|---|---|
| Spatial contiguity | Build-Phase panel renders the curve next to its formula — both spatially co-located on the canvas |
| Signalling | HUD highlights the active phase; KaTeX bolds the active curve term |
| Modality | Realised via `engine/audio/AssetManager.ts` and a minimal SFX set in `frontend/public/audio/` (cast-spell, kill, wave-end, mh-reveal, achievement, plus an ambient build-phase loop). All assets are CC0 / synthesised in-house (`scripts/synth-audio.py`); first user gesture unlocks the `AudioContext` per Chromium autoplay policy; mute/volume are persisted in `uiStore` and exposed in `ProfileView.vue`. Offloading kill/wave/reveal cues onto the auditory channel relieves the visual channel exactly as the Modality principle prescribes |
| Personalisation | Custom avatars (V2 Phase 5 added 6 preset SVGs) — supports the personalisation-principle motivational gain (Mayer, 2014, social-cues principles) |
| Pre-training | Initial Answer phase functions as pre-training on the wave's path before towers are placed; the Magic-tower curve-family unlock (§4.2) extends pre-training across sessions |

### 5.2 Dual Coding Theory

Paivio's (1991) dual-coding theory distinguishes verbal and nonverbal mental representations and predicts that information encoded in *both* channels is retained better than either alone. During Build Phase the parameter panels render the algebraic form (plain-text coefficients in `IntegralPanel` and `MatrixInputPanel`, the operator selector in `CalculusPanel`) alongside a live canvas preview — a textbook verbal+nonverbal pair, although the rich KaTeX typesetting is currently restricted to the Chain-Rule modal (`ChainRulePanel.vue`); see §7.1.2 for the corrected scope of KaTeX use.

### 5.3 Emotional Design in Multimedia

Plass, Heidig, Hayward, Homer, and Um (2014) showed that warm colours, rounded shapes, and human-like features in instructional graphics produce small-to-medium gains on transfer measures (partial η² in the .04–.10 range across their two studies). The pixel-art aesthetic is solidly within Plass et al.'s "engaging without distracting" envelope; the medieval-stone palette is on the cool side at higher stars, and `styles/variables.css` now applies a `[data-star='1']` rule that nudges the canvas background and HUD accent toward warmer hues for the tutorial-difficulty band only (`GameView.vue` writes `data-star` on the root element from `gameStore.starRating`). The auditory dimension of emotional design is now in scope as well — see the Modality row of §5.1 — though the current SFX library is functional rather than orchestral and the affective-tone effect should be considered modest until empirically tested.

### 5.4 Process–Object Dualism in Calculus (Sfard; APOS)

Sfard (1991) argued that mathematical concepts have a dual nature: they begin as **processes** (operational, computational) and only later become **objects** (structural, manipulable as units). Dubinsky's APOS theory (Dubinsky & McDonald, 2002) refines this into Action → Process → Object → Schema.

The Calculus tower's mechanic — *first* pick a function, *then* pick its derivative or integral, *then* receive a Pet entity that itself attacks autonomously — is a faithful enactment of process→object encapsulation:

1. **Action**: numerical computation (player evaluates / differentiates / integrates).
2. **Process**: the chosen operator $\frac{d}{dx}$ or $\int dx$ as a transformation.
3. **Object**: the resulting Pet — a *thing* in the game world that has properties (damage, range) inherited from the operator's output.

Few educational games surface this transition explicitly. *Math Defense* does it as a side-effect of treating math as mechanics.

---

## 6. Motivation and Affect

### 6.1 Flow Theory and GameFlow

Csikszentmihalyi's (1990) flow theory specifies the conditions for the autotelic experience (typically enumerated as eight to nine elements), of which three are most relevant here: a clear goal, immediate feedback, and a continuous challenge–skill match. Sweetser and Wyeth (2005) operationalised flow for digital games as **GameFlow** with eight criteria.

*Math Defense* maps cleanly:

- **Clear goals**: protect the origin; star rating tells the player the difficulty contract up front.
- **Immediate feedback**: WASM-backed real-time curve rendering during Build Phase satisfies the feedback criterion.
- **Challenge–skill match**: the **star rating × random path × wave templates** triple is the system's adaptive-difficulty surface (Hamari, Koivisto, & Sarsa, 2014; Plass, Homer, & Kinzer, 2015).
- **No interruption**: the V2 wave-flow change (eliminate `BUFF_SELECT` end-of-wave card draw, keep economy in BUILD) directly addresses Sweetser and Wyeth's "fragmented session" anti-pattern.

> **Green flag.** The active-time accumulator that *excludes* UI-pause phases reflects an important flow invariant: scoring should reward time spent in productive challenge, not time spent reading menus.

> **Risk → resolved (Star-5 only).** Flow requires that *failure* be visible but not punitive enough to break engagement. The Star-5 band now exposes a **wave checkpoint** on `GAME_OVER`: the engine snapshots gold / HP / cost-total / kill-value at every `WAVE_END` (`frontend/src/domain/level/checkpoint.ts`), and `GameView.vue` renders a "Retry from Wave N" button when `starRating == 5` and a `lastCheckpoint` is in hand. To preserve audit integrity and the `_verify_score()` invariants of §8.4, the retry creates a **new** server-side session pre-seeded with the checkpoint state rather than mutating the abandoned one; checkpoint runs are therefore flagged as *practice* on personal-best (§6.2) and excluded from class leaderboards. Stars 1–4 retain the full `GAME_OVER → restart` loop, on the reading that those bands sit comfortably inside the Csikszentmihalyi flow channel without a checkpoint.

### 6.2 Self-Determination Theory and Player Motivation

Deci and Ryan's (2000) self-determination theory identifies three innate psychological needs whose satisfaction predicts intrinsic motivation: **autonomy**, **competence**, and **relatedness**. Ryan, Rigby, and Przybylski (2006) extended SDT to digital games and showed empirically that the same three needs predict enjoyment and continued play.

| SDT need | Math Defense mechanic |
|---|---|
| Autonomy | Free choice of which towers to build, which talent nodes to allocate, which curve family to use, which Monty-Hall door to switch to |
| Competence | Star rating provides graded challenge; achievements provide explicit competence feedback; the K-formula's S1 (kill efficiency) and S2 (cost efficiency) make competence multidimensional |
| Relatedness | Class system + four leaderboards (Global / Class / Internal / External); teacher-led Class aggregate from V2 Phase 0 |

> **Green flag.** Ryan et al. (2006) report that *meaningful choice* (rather than choice volume) predicts autonomy satisfaction. The talent tree's prerequisite chains (19 nodes across the 7 tower types, gated effects) ensure that each allocation decision has consequences.

> **Risk → resolved.** The Global leaderboard is by raw score, and SDT (Deci & Ryan, 2000) and the achievement-goal literature (Elliot, 1999) caution that pure social-comparison feedback can shift learners from *mastery goals* to *performance-avoidance goals*. `LeaderboardView.vue` now exposes a **Personal** tab alongside Global (with Personal listed first, on the reading that self-referential framing is the healthier default per Ames (1992)); the back-end repository method `get_user_history(user_id, star_rating?)` and `GET /api/leaderboard/me` deliver the timeline, and `components/leaderboard/PersonalTimeline.vue` renders score deltas per star with personal-best markers. An empty history surfaces "Play a session to populate this view" rather than zero-state social comparison.

### 6.3 ARCS and the MUSIC Model

Keller's (1987) **ARCS** model lists four motivational design dimensions: Attention, Relevance, Confidence, Satisfaction. Jones's (2009) **MUSIC** model proposes a complementary rubric: e**M**powerment, **U**sefulness, **S**uccess, **I**nterest, **C**aring.

| MUSIC dimension | Math Defense surface | Strength |
|---|---|---|
| eMpowerment | Talent tree, free tower placement, Monty-Hall switch | Strong |
| Usefulness | Each tower carries a one-sentence `examRelevance` field in `tower-defs.ts`, surfaced in `TowerBar.vue` (hover/long-press) and `TowerInfoPanel.vue` — e.g. Magic: "Polynomial and trigonometric curves appear on Taiwan's GSAT Math A and on AP Precalculus"; Limit: "One-sided and infinite limits are on AP Calculus AB and the AST Calculus subject test"; Calculus: "Differentiation and integration of polynomials are on AP Calculus AB Section I" | Strong |
| Success | Star rating choice, achievement progress, per-student competency posteriors (§8.1) | Strong |
| Interest | Pixel art + random paths + minimal SFX library (see §5.1, Modality row) | Strong |
| Caring | Class system + Teacher Dashboard with per-student competency bars and lowest-competency suggestions (§8.1, §10.2) | Active |

> **Previously high-leverage gap, now closed.** The *Usefulness* row was the cheapest motivational gain in the prior audit and has shipped: every tower advertises its concrete exam relevance through a single dataset-level field, sourced from `tower-defs.ts` so a single edit propagates to every UI surface.

### 6.4 Goal-Setting Theory and Achievement Goals

Locke and Latham (2002): specific, difficult, attainable goals improve performance. The 25-achievement set across six categories (combat, scoring, survival, efficiency, exploration, territory) implements this directly — each achievement is specific, measurable, and graded.

Elliot (1999): achievement-goal orientation matters. The Global leaderboard risks performance-goal orientation; Grabbing Territory's *External* (per-class) ranking creates a *team mastery* goal, which Elliot's framework predicts is healthier than purely individual performance comparison.

### 6.5 Prospect Theory and the Monty Hall Mechanic

Kahneman and Tversky's (1979) prospect theory predicts systematic deviations from expected-value optimality: people overweight small probabilities, underweight medium-to-large probabilities, and treat losses as more salient than equivalent gains; the canonical loss-aversion coefficient λ ≈ 2.25 was estimated in the cumulative-prospect-theory follow-up (Tversky & Kahneman, 1992). The Monty Hall puzzle is a famous case where intuitive prospect-theoretic reasoning fails (most people stay; switching is correct). Embedding it as a *gameplay event* with concrete, immediate rewards is — to our knowledge — novel in the educational-game literature. In `MontyHallSystem.ts`, the reward (an entry from `MONTY_HALL_REWARD_POOL`, applied as a temporary buff on win) is *the same regardless of whether the player switched or stayed*; the asymmetry the player faces is therefore purely **probabilistic** — switching wins with ≈ (n−1)/n probability versus 1/n for staying — so the reinforcement signal that teaches the correct policy is the higher *expected* buff yield from switching, not a different reward type. This is still a clean operationalisation of policy-learning by reward, but it does not depend on (or implement) any explicit reward asymmetry between the two actions.

### 6.6 Math Anxiety and Affective Reframing

Ashcraft (2002) and Ramirez, Shaw, and Maloney (2018) document that math anxiety in adolescents (the design's target group) is widespread, gendered, and associated with reduced working-memory capacity available for math reasoning; Ashcraft and Krause (2007) provide the experimental evidence that high-anxiety learners show working-memory deficits specifically on demanding math tasks. Ramirez et al. (2018) review interventions and find consistent effects for two families: **affective reappraisal** (relabelling arousal as readiness rather than threat — the Jamieson et al. lineage) and **expressive-writing / supportive-climate** approaches that reduce the evaluative threat of error.

*Math Defense* implements both:

- **Reappraisal-friendly framing**: math is "magic"; coordinates are "runes"; commit is "Cast Spell." This relabels math arousal in non-evaluative terms — the kind of framing the reappraisal literature (Jamieson et al.) shows to help anxious learners.
- **Non-punitive error climate**: Build-Phase unlimited revision; productive-failure architecture (§4.1); no in-task time pressure outside Wave Phase.

> **Risk → mitigated.** The leaderboard re-introduces evaluative threat for anxious learners. The personal-best view now in place (§6.2) provides the self-referential alternative Ramirez et al. (2018) flag as especially load-bearing for this subgroup; the **practice-mode** opt-in (§12.3) provides a second mitigation by allowing slider input under a leaderboard-ineligible badge so high-anxiety learners can lower working-memory load on input under evaluative pressure (Ashcraft & Krause, 2007) without forfeiting achievements or talent points.

---

## 7. Sociocultural and Constructionist Frame

### 7.1 Zone of Proximal Development and Scaffolding

Vygotsky (1978) defined the ZPD as the gap between what a learner can do unaided and what they can do with guidance. Wood, Bruner, and Ross (1976) operationalised the bridging support as *scaffolding*: tutorial assistance gradually removed as the learner internalises the skill.

The ZPD construct applies to *Math Defense* on **two distinct layers** that must be separated to avoid overclaiming. The first — and the strongest single Vygotskian claim the design supports — is **curricular**: the choice of mathematical content sits, by design, just beyond the audience's unaided reach. The second is **mechanism-level scaffolding**: well-implemented in the chain-rule modal and the Monty-Hall reveal, partially present in star-rating differentiation, and *absent* in the talent tree. The mechanism-level claims below are anchored in a code audit against `level-generator.ts`, `difficulty-defs.ts`, `talent-defs.ts`, `talent_service.py`, `MontyHallSystem.ts`, `monty-hall-defs.ts`, and `ChainRulePanel.vue`.

#### 7.1.1 Curricular ZPD — The Content Itself Sits in the Gap

The design's stated audience is the Taiwan high-school cohort (corroborated by §6.6's "adolescents" framing and §12.2's curriculum-alignment table). For this cohort:

| Mechanic | Taiwan curriculum status | ZPD relation |
|---|---|---|
| Polynomial / trig / log curves (Magic) | 高一 / 高二 必修 | At-grade — *unaided-performance* baseline |
| 2×2 linear maps (Matrix) | 高一–高二 線性代數 unit | At-grade |
| Radar arc / radian angle (Radar A/B/C) | 高一 三角函數 | At-grade |
| ε-δ limits (Limit tower) | Above syllabus — most curricula introduce limits informally | **In the ZPD** |
| Definite integrals (Calculus tower) | 大學微積分 (above-syllabus for many tracks) | **In the ZPD** |
| Chain rule (Boss Type-B) | 大學微積分 | **In the ZPD** |
| Conditional probability (Monty Hall) | 高二 機率, but the Monty-Hall problem itself is famously counterintuitive even for adults | **In the ZPD** |

Plass, Homer, and Kinzer (2015) explicitly endorse digital games as access points to *above-grade* concepts, and Goldstone and Son (2005) show that concrete-fading scaffolds can lift learners across exactly this kind of gap. By this reading, *Math Defense*'s **content selection** — at-grade mechanics as the productive-failure substrate, plus three above-grade towers (Limit, Calculus, Chain-rule) and a counter-intuitive probability puzzle — is itself a Vygotskian construct: the input vocabulary is calibrated so the learner cannot succeed by recall alone (above-syllabus) but can succeed *with* the in-game scaffolds (KaTeX-rendered chain-rule modal, Monty-Hall reveal, multiple-choice for limits). This is a stronger ZPD claim than mechanism-level scaffolding alone supports, and one the existing curriculum-alignment audit (§12.2) directly licences.

> **Green flag.** This curricular-level ZPD framing is, in our reading, the design's most defensible Vygotskian claim. The original spec's choice to make limits / derivatives / chain-rule into game mechanics — rather than confining the design to 高一 / 高二 必修 — is what *creates* the ZPD substrate at all. A game whose hardest mechanic was already on the audience's syllabus would be drilling, not scaffolding.

#### 7.1.2 Mechanism-Level Scaffolds — What the Codebase Actually Ships

Beyond curricular positioning, the codebase implements three mechanism-level scaffolds (one further system that an earlier draft of this section listed has been recategorised below):

1. **Star rating 1–5** (task-level differentiation, *not* adaptive scaffolding). Star 1 generates one to four segments of degree-1 or degree-2 polynomial only — *not* a horizontal line as the previous draft asserted (`difficulty-defs.ts` type-1 multisets `[1,1] / [1,2] / [2,2] / [1,1,1] / [1,1,1,1]`; degree-1 in `level-generator.ts:136–140` returns an arbitrary slope). Star 4 produces type-7 segmented paths mixing polynomial, trigonometric, and logarithmic families (`['polynomial', 'trigonometric', 'logarithmic']` in `path-group-defs.ts`). Star also scales enemy composition and spawn rate (`domain/wave/wave-generator.ts`): Star 1 = GENERAL only at 1.5–1.0 s intervals; Star 4–5 = HELPER + STRONG + SPLIT + FAST + BOSS_B with 0.8–0.5 s intervals. This is task-level *differentiation*: the player chooses the star up front (`LevelSelectView.vue`) with **no system recommendation based on prior performance**. See §7.1.3 for why this matters for the ZPD claim.

2. **Chain-rule challenge with KaTeX co-presentation** (representational scaffolding, restricted scope). `ChainRulePanel.vue:88,97` renders the composite expression and each candidate answer with KaTeX (`MathDisplay.vue` → `katex.render({ displayMode: true })`). For an above-syllabus mechanic this is the right call: the rich-typeset $f'(g(x))\,g'(x)$ is the textbook representation the learner has not yet internalised. **Correction from the prior draft:** Build-Phase parameter panels (`IntegralPanel`, `MatrixInputPanel`, `FunctionPanel`, `MagicModePanel`, `CalculusPanel`, `LimitQuestionPanel`) display coefficients and operators as plain HTML text — *not* KaTeX. The doctrine "algebraic form alongside rendered curve" still holds in textual form for those panels (still dual-coded per Paivio, 1991, and still spatially-contiguous per Mayer, 2014), but the rich-typeset form previously implied is not present there.

3. **Monty-Hall doors with progressive disclosure** (decision scaffolding). Implemented in `MontyHallSystem.ts` as an n-door variant — `doorCount: 3 | 4 | 5` by star (`monty-hall-defs.ts`), with `revealCount = doorCount − 2` (`MontyHallSystem.ts:120`). For every n the system reveals exactly enough losing doors to leave a binary switch-or-stay decision while preserving the (n−1)/n vs 1/n probability asymmetry. The reveal step is unconditional: `_revealDoor()` fires after every selection, so the visual scaffold never degrades. **Caveat:** `MontyHallPanel.vue` shows only the door count and revealed-door count — there is no in-game textual explanation of the conditional-probability logic. The visual disclosure mirrors the textbook diagram; the verbal half of the textbook explanation is missing, which limits how much the scaffold can transfer to unaided reasoning.

4. **Talent tree — *not* scaffolding (recategorisation).** A code audit of `talent-defs.ts`, `talent_service.py`, and `talentStore.ts` confirms 19 nodes across 7 root nodes (one per tower type), each providing **purely additive, permanent numerical modifiers** — range, attack speed, damage, target count, duration, HP, AoE strength, ramp. The previous draft's example, "early talents reduce the precision required of player input (e.g. larger hit radii)," is not supported: no early talent reduces input precision, no late talent unlocks a new mechanic, and allocations have no fade or removal step (only an all-or-nothing `reset()` in `TalentTreeView.vue`). Wood, Bruner, and Ross (1976) define scaffolding by *gradual removal* of help; this system moves monotonically in the opposite direction. The talent tree is therefore correctly understood as **player-driven progression** in the SDT-autonomy sense (§6.2) and Locke-and-Latham goal-setting sense (§6.4) — both of which it serves well — but classifying it as Vygotskian scaffolding is a category error and has been removed from this section.

#### 7.1.3 Two Previously-Standing ZPD Gaps — Now Substantively Addressed

> **Diagnostic gap → resolved.** Vygotskian scaffolding presupposes that someone (the more-capable other) *diagnoses* where the learner is and supplies help "just above" that point. The previous build had no such diagnostic. The current build closes the gap with the **measurement-and-recommender stack** described in §8.1: a declared Q-matrix maps every evidence event to one or more of the seven tower-type competencies; `assessment_service.record_event` updates per-user Beta posteriors after every session; and `application/recommender_service.py` (exposed at `GET /api/recommendation/me`) consumes those posteriors to surface a per-learner steer at the two existing self-selection surfaces — `LevelSelectView.vue` shows a "Suggested for you: Star N" badge (mapping posterior mean to star band: <0.3→1; <0.5→2; <0.7→3; <0.85→4; ≥0.85→5), and `TalentTreeView.vue` highlights the talent-root node tied to the lowest-posterior competency. Both nudges are dismissible and dismissal persists, preserving SDT autonomy (Deci & Ryan, 2000): the system *suggests*, never *gates*. Today's implementation therefore qualifies as *targeted ZPD support* in Vygotsky's sense rather than *static differentiation* alone.

> **Fading-direction gap → partially addressed.** Classical scaffolding fades; Vygotsky's whole point is internalisation. The previous build offered no scaffold that faded: Star 1 always rendered a Star 1 path; KaTeX was always rendered for the chain-rule modal; talent buffs were monotonic. The current build introduces the cleanest available fade hook — **concrete-fading on the Star-1 path renderer** (§12.6): `curve-renderer.ts` accepts a `labelOpacity` argument bound to `user.ia_recent_accuracy` (the rolling-last-10 IA accuracy maintained on `User` and recomputed on `session_service.end_session`). Y-axis labels render at full opacity ≤ 30 % accuracy, fade through 0.6 / 0.3 in the 30–80 % bands, and disappear above 80 %, matching the Goldstone & Son (2005) concrete-fading prescription. A second hook flagged in earlier drafts — phased reduction of the Monty-Hall reveal — is *not yet* implemented; the n-door reveal still runs unconditionally in `MontyHallSystem.ts:_revealDoor()`, so this remains the single cheapest extension of the fade-hook surface.

#### 7.1.4 Summary

The ZPD reading of *Math Defense* survives strongly at the **curricular** layer (§7.1.1, anchored in §12.2) and at three of the four **mechanism** layers previously listed (§7.1.2). The talent tree is recategorised as progression rather than scaffolding. The two structural gaps that previously held back the design from a full Vygotskian reading — no per-learner diagnosis and no fading scaffolds — have both been substantively closed: a measurement-and-recommender stack now provides per-learner diagnosis (§8.1) and a concrete-fading hook on the Star-1 path renderer now provides one fading scaffold (§12.6). The implementation can fairly be characterised, today, as *targeted ZPD support* layered on the curricular ZPD substrate, with the Monty-Hall reveal as the one remaining no-fade scaffold worth a future pass.

### 7.2 Constructionism and Embodied / Grounded Mathematics

Papert's (1980) *Mindstorms* argued that mathematics is best learned by **building** with mathematical objects, not by being told about them. The embodied-cognition literature on mathematics (Núñez & Lakoff, 2000; Abrahamson & Sánchez-García, 2016) has shown that learners internalise mathematical structures most robustly when those structures are tied to perceptual-motor experience.

*Math Defense*'s coordinate-plane map is a constructionist environment in Papert's sense. The player *builds* with functions; the screen is, in the spec's own words, "a living mathematical chart." The Calculus tower's pet system makes derivatives literally **move**: a derivative produces faster, leaner pets; an integral produces a slower but heavier pet. This is a direct embodiment of the conceptual metaphor "DERIVATIVE IS RATE OF CHANGE" (Núñez & Lakoff, 2000).

### 7.3 Realistic Mathematics Education

Freudenthal's RME programme (Gravemeijer, 1999) holds that students should re-invent mathematics from authentic contextual problems rather than from formal definitions; the contextual model gradually formalises into the abstract object (the "emergent models" principle).

The coordinate plane in *Math Defense* is an emergent model in Gravemeijer's precise sense: at Level 1 it is *concretely* the battlefield; at Level 4, after the student has typed dozens of $y=mx+b$ inputs and seen them rendered, the same plane has become an *abstract* representational tool. The progression mirrors Gravemeijer's "model-of → model-for" transition — a strong (if probably unintended) alignment with Dutch math-education tradition.

### 7.4 Cognitive Apprenticeship

Collins, Brown, and Newman (1989) describe **cognitive apprenticeship** as a six-step process: modelling → coaching → scaffolding → articulation → reflection → exploration. The teacher–class–student structure (V2 Phase 0) plus Grabbing Territory (Phase 6) provides hooks for all six:

| Step | Math Defense affordance |
|---|---|
| Modelling | Teacher can play and demonstrate; deterministic **Replay** and **Spectate** modes (§12.5) now close this loop — sessions are persisted as RNG-seed + event-log streams (`backend/app/models/session_event.py`, `domain/session/events_log.py`) and replayed via `engine/replay/EventPlayer.ts` in `ReplayView.vue`; live spectator scrubbing runs through `infrastructure/spectate_hub.py` and `SpectateView.vue` |
| Coaching | Teacher Dashboard sees per-student S1/S2 *and* per-competency Beta posteriors with auto-generated suggestions (§8.1, §10.2) |
| Scaffolding | Star rating differentiation + Monty-Hall reveal + chain-rule KaTeX modal + concrete-fading on Star-1 path labels (§7.1.3) (see §7.1.2; the talent tree is *not* scaffolding — it is progression, see §6.2 / §6.4) |
| Articulation | Post-wave free-text "describe the strategy that worked" prompt on `ScoreResultView.vue`, persisted via `GameSession.record_reflection()` to the new `reflection_text` column (migration `add_reflection_text`) and surfaced per-student per-session in `TeacherDashboard.vue` for class-mode plays. Reflection is appendable only when `session.status == COMPLETED`, capped at 2000 chars, and skippable (empty submission allowed); non-class-mode sessions persist the text but do not surface it in any dashboard for privacy |
| Reflection | Score Result View shows S1/S2/K breakdown plus the just-submitted articulation |
| Exploration | Free play + talent reset + teacher-curated **Generative Challenges** (§12.5) — a Bloom-Create surface for the teacher whose constraints become the explored sandbox for the student |

> **Previously high-leverage gap, now closed.** The articulation step is the single highest-yield peer-talk behaviour in Webb's (1991) classic study of small-group mathematics learning. The current build implements it as a non-mandatory free-text submission so the cognitive-apprenticeship cycle no longer breaks at step 4 for class-mode plays. The Webb effect is conditional on *elaborated* explanations, so future passes should consider gentle UI prompting (e.g. character-count floor, sentence-starter scaffolds) before claiming the full literature transfer.

### 7.5 Communities of Practice

Lave and Wenger's (1991) *communities of practice* extends apprenticeship with **legitimate peripheral participation** — newcomers learn by participating at the periphery of an authentic activity. Grabbing Territory operationalises this at the class level: a new student can attempt Star-1 territories, watch peers contend for Star-5 slots, and progressively take on harder ones — the canonical LPP trajectory.

---

## 8. Assessment Architecture

### 8.1 Stealth Assessment and Evidence-Centred Design

Shute's (2011; Shute & Ventura, 2013) stealth-assessment paradigm uses unobtrusive in-game telemetry to estimate latent learner competencies without interrupting gameplay. The technique is a specialisation of Mislevy, Steinberg, and Almond's (2003) Evidence-Centred Design (ECD), which factors any assessment into three connected models: a **competency** model (what we infer), an **evidence** model (what counts as evidence), and a **task** model (what the learner does).

*Math Defense* already collects all the substrate ECD requires:

| ECD layer | Math Defense artefact |
|---|---|
| Competency variables | Tower-type-specific skill (one per Magic / Radar A–C / Matrix / Limit / Calculus) |
| Evidence variables | S1 (kill efficiency), S2 (cost efficiency), K combinator, IA correctness, chain-rule answer, Monty-Hall switch rate, time-to-decision in Build Phase, achievement unlock pattern |
| Task variables | star_rating, path_config, wave templates, time_exclude_prepare buckets |

The 25-achievement structure across six categories (combat, scoring, survival, efficiency, exploration, territory) is now backed by an **explicit Q-matrix** (Tatsuoka, 1983), declared as data in `backend/app/domain/assessment/q_matrix_defs.py`: each evidence event (achievement unlocks plus the diagnostic events `chain_rule_correct`, `monty_hall_switch_won` / `..._kept_won`, `ia_correct`, `limit_correct`) maps to weights in `[0, 1]` across the seven tower-type competencies (`MAGIC`, `RADAR`, `MATRIX`, `LIMIT`, `CALCULUS`, `CHAIN_RULE`, `PROBABILITY`). A CI parity test in `backend/tests/test_q_matrix.py` enforces row completeness — adding a new achievement without adding a Q-matrix row fails the build.

On top of the Q-matrix sits a **Bayesian competency estimator** (`domain/assessment/competency_estimator.py`): for each user × competency the system maintains a Beta posterior, updated by the rule `α' = α + w·s`, `β' = β + w·(1−s)` from a uniform `Beta(1, 1)` prior; `domain/assessment/competency_state.py` aggregates the seven competencies per user, persisted via `infrastructure/persistence/competency_state_repository.py` to the new `user_competency_state` table (`alpha`, `beta`, `updated_at` per competency; one SELECT per `get_posteriors`). `application/assessment_service.py::record_event` is invoked from `session_service.end_session` after achievement evaluation, so every completed session moves the relevant posteriors. After five chain-rule-correct events the `CHAIN_RULE` posterior mean exceeds 0.85; with no events the prior mean is 0.5; the seven posteriors persist across logins. As Shute and Ventura (2013) predict, the resulting per-competency means are usable as low-stakes assessment signals while preserving the engagement of gameplay.

The teacher-facing surface follows from the same stack. `routers/assessment.py` exposes `GET /api/assessment/class/{class_id}/posteriors` (teacher-only, with `class_service.is_owner` membership check inside); `services/assessmentService.ts` calls it and `components/teacher/CompetencyBar.vue` renders a 7-bar mini chart per class member in `TeacherDashboard.vue`. Each row carries an auto-generated suggestion derived from the lowest-posterior competency (deterministic mapping in the service: `MAGIC → "Magic-tower-only run at Star ≤ current"`; `LIMIT → "Limit-tower run with frugal-spend constraint"`; `CHAIN_RULE → "Replay a Boss Type-B level"`; etc.). The same posteriors feed the per-learner star/talent recommender at `GET /api/recommendation/me` (§7.1.3). Selection-bias caveats remain — only positive evidence is logged for unlock-style achievements, since failure-to-unlock is not yet a tracked event — but the v1 implementation is sufficient for low-stakes formative use within a single course.

> **Known limit.** Current evidence is asymmetric: chain-rule and Monty-Hall events have explicit failure signals, but achievement unlocks only emit on success. The mean posterior of a player who *never* unlocks `combat_kill_50` will not move for that competency, so absence of evidence is treated as the prior rather than as weak negative evidence. This is acceptable for a formative classroom signal but should be documented if the data is ever used for higher-stakes decisions.

### 8.2 Formative Assessment and the Hattie–Timperley Feedback Model

Black and Wiliam's (1998, 2009) formative-assessment programme synthesised >250 studies and concluded that learning gains from well-designed formative-assessment cycles are among the largest in education research (effect sizes typically *d* > 0.4). Hattie and Timperley (2007) decomposed feedback into three questions: *Where am I going?* (feed-up), *How am I going?* (feed-back), *Where to next?* (feed-forward), and identified four feedback levels (task, process, self-regulation, self).

| H–T question | Level | Math Defense surface |
|---|---|---|
| Feed-up | Task | Star-rating selection screen + IA pre-game prompt |
| Feed-up | Self-regulation | Talent tree shows where future allocations lead |
| Feed-back | Task | Real-time curve preview in Build Phase |
| Feed-back | Process | Score breakdown screen (S1 vs S2 isolates *efficiency* vs *cost-control* skill) |
| Feed-forward | Process | Achievement near-misses ("you killed 9 helpers — kill 1 more for X") |
| Feed-forward | Self-regulation | Personal-best deltas via the Personal tab on `LeaderboardView.vue`, plus per-competency posterior bars and adaptive star/talent suggestions on the player-facing surfaces (§7.1.3, §8.1) |

> **Risk → resolved.** Hattie and Timperley (2007) report that *self*-level feedback ("great job!") has the smallest learning effect and can even be detrimental. The current `ACHIEVEMENT_DEFS` corpus is enforced against trait/self praise by a Vitest lint (`frontend/src/data/achievement-defs.test.ts`): names and descriptions are rejected if they contain banned tokens (`Master`, `Legendary`, `Genius`, `Amazing`, …), and every description must begin with a task-level action verb (`Kill`, `Achieve`, `Score`, `Complete`, `Survive`, `Hold`, `Play`, `Unlock`, `Clear`). `AchievementToast.vue` renders the description rather than a generic superlative, so toast copy stays at the *task / process* level the literature endorses.

### 8.3 Bloom's Revised Taxonomy Coverage

Anderson and Krathwohl's (2001) revision of Bloom's taxonomy distinguishes six cognitive process dimensions: Remember, Understand, Apply, Analyse, Evaluate, Create.

| Mechanic | Bloom level | Justification |
|---|---|---|
| Initial Answer (pick the matching graph) | Remember / Understand | Match algebraic form to graph |
| Magic / Function tower input | Apply | Apply function-family knowledge to fit a trajectory |
| Radar parameter tuning | Apply | Apply trigonometric definitions |
| Matrix tower | Analyse | Decompose required transformation into rotation × scale |
| Limit tower | Evaluate | Evaluate which of $\pm\infty,\pm C,0$ a limit yields |
| Monty Hall | Evaluate | Compare expected values |
| Calculus tower (pick a monomial, then derivative or integral) | Apply / Analyse | Apply differentiation/integration rules and predict the resulting pet's traits — selection from a defined set, not novel construction |
| Chain-rule challenge | Apply / Analyse | Decompose a composition |
| Talent allocation strategy | Evaluate / Create | Construct a build order under uncertainty — the closest the design currently comes to a true Bloom-Create task |

The design exercises five of the six Bloom levels (Remember through Evaluate, plus a partial Create at the talent-build-strategy layer). The student-facing Create surface remains modest by design — most mechanics select from defined option sets rather than generating novel mathematical objects — but a genuine Create surface now exists at the **teacher** layer through the **Generative Challenge** mode (§12.5): a teacher specifies a typed constraint schema (`allowed_towers`, `magic_param_bounds`, `forbidden_mechanics`, `wave_count`, `target_score`) in `domain/challenge/constraint_dsl.py` and publishes it as a parameterised challenge with its own leaderboard. Designing the constrained sandbox is the Bloom-Create activity (Anderson & Krathwohl, 2001); the student then plays inside it. This is a defensible compromise with the meta-analytic finding by Wouters, van Nimwegen, van Oostendorp, and van der Spek (2013) that serious games produce larger effects on higher-order skills than on declarative recall: the *teacher* gets the strong Create affordance, while the *student* faces a Create-shaped problem-solving surface inside the teacher's constraints.

### 8.4 Score Validity Infrastructure

The backend re-computes the S1/S2/K formula in `backend/app/domain/scoring/score_calculator.py` (the `recompute_total_score()` pure function, dispatching to the canonical WASM `total_score_fn` when loaded and falling back to a Python mirror otherwise) and the application service `backend/app/application/session_service.py::_verify_score()` calls it on every session completion. Mismatches that exceed the absolute tolerance (`1e-4` in strict mode, `5e-4` in standard mode — chosen, respectively, as a 1× and 5× safety margin over the frontend's 4-decimal rounding) are logged and the session is *always* updated via `session.override_total_score(recomputed)`, so the persisted `total_score` is the server-recomputed value rather than the client-submitted one. Mathematical validity in *measurement* terms (Messick, 1995) requires that scores actually reflect the construct they claim to measure. For systems that consume `total_score` — territory occupation, the §7.1.3 recommender, and any downstream that reads the persisted column — this guarantee is therefore load-bearing for Messick's *substantive* validity check, not merely an anti-cheating guard. (The achievement evaluator in `AchievementCheckHandler` is passed `event.score` rather than `event.total_score`; competency posteriors are then derived from the *unlock events* the evaluator emits, so the substantive-validity argument carries to the posteriors only insofar as individual achievement criteria depend on counts/star/HP rather than on raw score arithmetic — which most of `ACHIEVEMENT_DEFS` does.)

> **Known scope limit.** The leaderboard ranking pipeline does *not* yet read `total_score`. `LeaderboardEntry` (`backend/app/domain/leaderboard/aggregate.py`) carries only a `Score` value object, and `LeaderboardInsertHandler` (`application/session_event_handlers.py:60`) constructs the entry from the client-submitted `event.score`; the only forgery defense is the per-level cap `LEVEL_MAX_SCORES` and the per-update `MAX_SCORE_DELTA` guard. A scripted client making in-range `update_session` calls can climb to the per-level maximum without ever generating valid replay-derivable evidence — the open finding `BD-1` in `docs/Audit/AUDIT_REPORT_2026-05-15.md`. The substantive-validity argument in this section therefore applies to the competency-and-recommender stack (which consumes `total_score` end-to-end) but should be read with caution for the leaderboard surface specifically — until `LeaderboardEntry` is extended with `total_score` (or `score`'s plausibility bound is tightened), every leaderboard-mediated motivational claim in §§6.2, 6.4, 8.2, and 10.1 inherits a residual validity risk.

---

## 9. Game-Design Lenses

### 9.1 Mechanics–Dynamics–Aesthetics

Hunicke, LeBlanc, and Zubek's (2004) MDA framework decomposes a game into **Mechanics** (rules), **Dynamics** (run-time behaviour), and **Aesthetics** (player-experienced emotion). Designers think mechanics → aesthetics; players experience aesthetics → mechanics. Misalignment is the most common failure mode in serious games.

*Math Defense* MDA layering:

- **Mechanics**: tower placement, parameter input, intersection solver (WASM), DoT/shield/aura systems, scoring formula, Monty-Hall RNG, talent modifiers.
- **Dynamics**: emergent build orders ("Magic + Radar-A combo"), risk/reward in Monty Hall, territory-contestation patterns.
- **Aesthetics** (per the eight aesthetics): *Challenge*, *Discovery* (random paths), *Narrative* (medieval framing), *Expression* (talent build), *Submission* (wave repetition), *Fellowship* (class + spectator mode), *Sensation* (pixel art plus the minimal SFX library described in §5.1 / §5.3).

The aesthetic of **Challenge** dominates, with *Discovery* second. *Fellowship* is now better served by Spectator mode and challenge leaderboards (§12.5), and *Expression* by the talent tree plus teacher-authored generative challenges; the one remaining underweighted dimension is *real-time peer collaboration* — see §12.4 on the cooperative-learning gap that has not yet been built.

### 9.2 Theory of Gamified Learning

Landers (2014) provides a moderator/mediator model: gamification elements affect learning *only via* their effects on (a) the *behaviours/attitudes* the elements target and (b) the *instructional content* they apply to. A leaderboard in a vacuum does nothing; a leaderboard that increases time-on-task on a game whose core mechanic is intrinsically integrated math should produce learning.

Predictions for *Math Defense* under Landers' model:

- **Achievements** → moderator on *persistence* → mediator for repeated exposure to math mechanics → predicted positive effect.
- **Talent tree** → moderator on *strategic engagement* → mediator for deeper analysis of tower choice → predicted positive effect.
- **Global leaderboard (raw score)** → moderator on *competition* → mediator with *no clear path* to math content (a high-scoring player may have memorised builds) → predicted *uncertain* effect, possibly negative under heavy use.
- **Grabbing Territory** → moderator on *peer accountability* → mediator for discussing strategy with classmates → predicted positive effect *if* an articulation channel exists; null otherwise.

Landers' framework thus generates the same recommendation as the SDT analysis (§6.2) but from an entirely different theoretical route — strong convergent evidence.

### 9.3 Serious Games and Gamification — Where This Project Sits

Deterding, Dixon, Khaled, and Nacke (2011) define gamification as "the use of game design elements in non-game contexts" and warn that gamification ≠ serious games. Hamari et al. (2014) reviewed 24 empirical studies and reported that gamification *can* produce positive learning outcomes, heavily moderated by context, element type, and user characteristics. Connolly, Boyle, MacArthur, Hainey, and Boyle (2012) reviewed 129 studies and found mixed but generally positive effects.

*Math Defense* is best classified as a **serious game with intrinsic gamification**: the achievements/talent-tree/leaderboard layer is gamification (Deterding et al., 2011), but the core gameplay is a serious game in Plass et al.'s (2015) sense. This dual classification is the configuration Plass et al. (2015) argue is most empirically defensible.

---

## 10. Project Subsystems In Depth

### 10.1 Grabbing Territory as Bounded Competition

Phase 6's Grabbing Territory mode is the project's most pedagogically distinctive feature. Mechanics:

- Teacher creates an *activity* with a deadline and N territory *slots* of teacher-chosen star ratings and path configs.
- Students play any slot; on a high-enough score they *seize* it. A 5-territory cap per student forces strategic choice.
- Counter-seize is unlimited — a displaced student may replay and reclaim.
- Pessimistic row-level locking (`SELECT … FOR UPDATE`, exposed via SQLAlchemy's `with_for_update()` in `territory_repository.py`) serialises concurrent seize attempts.
- Four ranking views: Global, Class, Internal (per-student in this activity), External (per-class in this activity).

Theoretical reading:

- **Bounded social comparison** (Festinger, 1954) within a teacher-curated peer group narrows the comparison set to similar others; Hanus and Fox's (2015) longitudinal classroom study found that open leaderboards and badges, used over a semester, *reduced* intrinsic motivation, satisfaction, and final-exam performance — the very failure mode a curated, bounded competition is structured to avoid.
- **Goal-setting** (Locke & Latham, 2002): the deadline + scarce-territory structure provides *specific, time-bound, moderately difficult* goals — the three preconditions for performance gains.
- **Achievement-goal theory** (Elliot, 1999): the External (class-average) ranking creates a *team mastery* goal, which the framework predicts is healthier than purely individual performance goals.
- **Cognitive apprenticeship**: the teacher *curates the curriculum* (slot star/path), *models* by playing themselves, and *coaches* through the dashboard — three of Collins et al.'s (1989) six steps in a single mechanic.

### 10.2 Class System as Differentiated-Instruction Infrastructure

Tomlinson's (2014) differentiated-instruction (DI) framework requires teachers to vary content, process, product, and learning environment by student readiness, interest, and profile. The V2 Phase 0 class system supplies the *technical* preconditions for DI:

- Per-student sessions, talent allocations, achievements (content/process variation visible to teacher).
- Teacher-curated GT activities (process variation by teacher choice).
- Score Result View (product variation: which of S1/S2/K the student optimises).
- Custom avatars + personal display name (environment).

The system now *prompts* teachers to differentiate. `TeacherDashboard.vue` renders per-student competency bars and an auto-generated suggestion under each row driven by the lowest-posterior competency (§8.1) — e.g., "Student X has 0.78 Magic, 0.32 Limit — assign a Limit-tower run with frugal-spend constraint." The teacher can act on the suggestion directly through the **Generative Challenge** builder (§12.5) by composing the recommended constraint set and publishing a deep-link the student opens to play. The DI substrate of this section therefore now includes both the *measurement* signal and the *act-on-it* surface that Tomlinson's framework requires.

### 10.3 Server-Side Score Verification as Validity Substrate

Covered above (§8.4). Worth restating in this section: the assessment-validity guarantee that Messick (1995) requires is *infrastructure*, not content; without it, every motivational feature that depends on the server-recomputed `total_score` (talent points, achievement evaluation, competency posteriors, and the territory / recommender stack) would fail substantive validity. The project's decision to mirror the formula on the server is therefore load-bearing for the assessment substrate the recommender and competency-posterior pipelines rely on, even though — as the §8.4 scope-limit box notes — the leaderboard ranking surface itself currently still ranks by the client-submitted `score` and inherits a residual validity risk that is tracked as the open `BD-1` finding rather than closed by this section.

### 10.4 Programming-Pedagogy Layer for the Authors

The project is a Programming-II final by three students of different seniorities (大一 / 大二 / 大三, per the spec's §XIV). The architectural ambition (Vue 3 strict TypeScript, FastAPI DDD, ECS engine, C → WASM, Alembic, optimistic locking, Pydantic v2, JWT + bcrypt + TOTP, slowapi rate limiting, role-based middleware, server-side score verification) is, by any reasonable rubric, a *capstone-level* software-engineering syllabus. The pedagogy here is **Vygotskian for the authors**: the senior partitioned the work so each junior operates inside their ZPD with scaffolded interfaces (`Tower` base class, `MathEngine.sectorCoverage()`, `game.on('buildPhaseStart', cb)`).

This satisfies the conditions the cognitive-apprenticeship literature (Collins et al., 1989) lays out for *productive* mixed-skill collaboration:

- Interface contracts are explicit and minimal (modelling step).
- Each contributor's territory is bounded but non-trivial (legitimate peripheral participation à la Lave & Wenger, 1991).
- The senior member commits the architecture *first*, forcing all juniors to learn against a real codebase rather than a toy (Squire's (2006) "designed experience" applied to a CS team).

> **Note.** This dimension belongs in the Report's *reflection* section — both because it is unusual and because it is the part most directly assessable by the course instructor.

---

## 11. Cross-Cutting Audit

The table below distinguishes *resolved* risks (an action that earlier audits flagged has now shipped) from *standing* risks (still open). Section anchors point to the relevant in-text discussion.

| Theme | Strength | Risk status | Resolution / outstanding action |
|---|---|---|---|
| Intrinsic integration | Math is the input, not a quiz gate | **Resolved** | Star-5 selection gated on at least one correct IA (`ia_unlock_earned`, server-enforced via `Star5LockedError`); §3.1 |
| Generation | Manual numeric input on **all seven** tower types after the Radar typed-degree migration | **Resolved** | `RadarConfigPanel.vue` migrated to `<input type="number">` with snap-on-Apply; the slider survives only as an opt-in accessibility fallback that disables leaderboard eligibility (§3.2, §12.3) |
| Productive failure | Build-phase iteration is structurally PF | **Resolved** | Post-wave principle-surfacing overlay (`PrincipleOverlay.vue`, seven principle cards) supplies the consolidation step Loibl et al. (2017) require; §4.1 |
| Cognitive load | Phase segmentation + UI-pause exclusion | **Resolved** | Magic-tower curve families gated on early-star achievements (`unlock_trig_curves`, `unlock_log_curves`); §4.2 |
| Desirable difficulties | Random path + locked-after-build | **Resolved** | `<details>` "Why are paths random?" explainer at the top of `TeacherDashboard.vue`, default-open on first visit; §4.3 |
| Retrieval | Chain-rule challenge mid-wave | **Resolved** | Limit tower switches MCQ → typed entry at Star ≥ 4 via `parseLimitAnswer`; boss-ability triggers now sample uniformly within configured ranges; §4.4, §11 (this section row), §12.5 |
| Variation / transfer | Random path pool from level-tagged set | **Resolved** | Boss Type-A/B abilities now use `triggerHpRange` instead of fixed thresholds; `EnemyAbilitySystem` samples per spawn from `game.rng()`; preserves variation invariant (boss *type*) while varying surface (trigger timing) |
| Mayer principles | Spatial contiguity + signalling honoured | **Resolved** | Minimal SFX library + ambient-build loop loaded through `engine/audio/AssetManager.ts`; mute and master volume in `ProfileView.vue`; assets are CC0 / synthesised in-house; §5.1 |
| Flow | Wave flow is uninterrupted | **Resolved (Star-5)** | Star-5 checkpoint via `domain/level/checkpoint.ts`; retry creates a new server-side session pre-seeded with checkpoint state and is flagged as practice (not on class leaderboards); §6.1 |
| SDT | Talent-tree autonomy + class relatedness | **Resolved** | Personal tab on `LeaderboardView.vue` (listed first); `PersonalTimeline.vue` shows score deltas per star with personal-best markers; §6.2 |
| MUSIC – Usefulness | All five dimensions now strong | **Resolved** | Per-tower `examRelevance` field in `tower-defs.ts`, surfaced in `TowerBar.vue` and `TowerInfoPanel.vue`; §6.3 |
| Stealth assessment | All ECD substrate present and surfaced | **Resolved** | Q-matrix + Beta posteriors + teacher dashboard bars + auto-suggestions + adaptive recommender; §7.1.3, §8.1 |
| ZPD (curricular + targeted) | Above-syllabus towers place the hardest content in the learner's ZPD; per-learner posteriors steer star and talent picks | **Substantively resolved** | Diagnostic gap closed by recommender (`GET /api/recommendation/me`); fading-direction gap closed for Star-1 paths via concrete-fading; Monty-Hall reveal fade is the one remaining no-fade scaffold; §7.1.3, §12.6 |
| Cognitive apprenticeship | All 6 steps present (Modelling now via Replay/Spectate) | **Resolved** | Post-wave articulation prompt persists `reflection_text` and surfaces it in `TeacherDashboard.vue` for class-mode plays; §7.4 |
| Bloom coverage | All six levels exercised | **Resolved at teacher layer** | Generative Challenge mode supplies a real Create surface for the teacher; student-facing Create remains modest by design; §8.3, §12.5 |
| Long-horizon engagement | Anti-novelty mitigations all in place | **Resolved** | Seasonal achievement sets with 2× talent-point multiplier; generative challenges; deterministic replay/spectate; §12.5 |
| Equity (Matthew effect) | Concrete-fading on Star-1 path | **Resolved** | `curve-renderer` opacity bound to `user.ia_recent_accuracy`; thresholds at 30 / 60 / 80 %; §12.6 |
| Score-substantive validity (`total_score`) | Server-recompute + always-overwrite drives the recommender / competency / territory stack | **Resolved** | `_verify_score()` with `1e-4` / `5e-4` tolerance; `session.override_total_score(recomputed)`; §8.4 |
| Leaderboard-substantive validity (`score`) | Coarse per-level cap is the only forgery defense | **Standing** | `LeaderboardEntry` does not carry `total_score`; tracked as open `BD-1` in `AUDIT_REPORT_2026-05-15.md`; §8.4 |
| Accessibility | Keyboard nav + glyphs + practice mode + statement | **Resolved (per WCAG 2.2 limits)** | `useKeyboardPlacement.ts`; per-tower `glyph` overlays; opt-in slider fallback with leaderboard-ineligible badge; `AboutView.vue` declares known canvas-screen-reader limits; §12.3 |
| Empirical validity | Engineering substrate for the §13 study | **Resolved (engineering only)** | Probe runner, two-arm group assignment, affect Likerts, admin CSV export — all in place; the study still needs to be *run*; §13 |
| Cooperative learning | All technical substrate exists | **Standing** | Real-time pair / WebSocket Build-Phase Pair mode is *not* yet built; the largest standing pedagogical gap; §12.4 |

---

## 12. Limitations and Threats

### 12.1 Empirical Validity Has Not Been Measured

The theoretical alignment in this document is hypothesis, not evidence. *Math Defense* has not yet been evaluated with a pre/post knowledge probe, transfer measure, or comparison group. The minimum defensible plan (Anderson & Shattuck, 2012, on design-based research) is given in §13.

### 12.2 Curriculum Alignment

The original spec implies alignment with Taiwan's high-school math curriculum, but a closer mapping reveals over-reach:

- Polynomial / trigonometric / logarithmic curves: yes, 高一 / 高二 必修.
- 2×2 linear maps: yes, 高一-高二 線性代數 unit.
- ε-δ limits: **above syllabus** — most curricula introduce limits informally.
- Definite integrals: 大學微積分 (above syllabus for many Taiwan high-school tracks).
- Chain rule: as above.

This is not a defect but the design's strongest Vygotskian move: §7.1.1 reads exactly this content selection as **curricular ZPD** — placing the hardest mechanics just beyond the audience's unaided reach, in line with Plass et al.'s (2015) endorsement of games as access points to above-grade concepts and Goldstone and Son's (2005) concrete-fading literature. The Report should therefore frame above-syllabus towers as *deliberate ZPD targeting*, not as syllabus drift; the residual obligation is honesty about which mechanics are at-grade and which are in the ZPD (the table above), not an apology for the latter.

### 12.3 Accessibility (WCAG 2.2)

| Disability area | Current state | Mitigation in place |
|---|---|---|
| Color-blindness (~8% of male players) | Each tower carries a Unicode `glyph` (`✦`, `◐`, `◑`, `◒`, `⊞`, `∞`, `∫`) overlaid by `TowerRenderer.ts` and rendered next to the label in `TowerBar.vue` | WCAG 2.2 SC 1.4.1 ("Use of Color") satisfied — towers are still distinguishable in a greyscale screenshot |
| Screen reader | Canvas-rendered game state remains opaque to assistive tech | `AboutView.vue` (`/about` route, no auth) declares the known limit, lists supported assistive workflows (keyboard, glyphs, practice mode), and provides a contact link — the W3C *Understanding* documents endorse declared limits over silent failure |
| Dyscalculia | Manual input is high-cost for this group | Opt-in `sliderFallbackEnabled` in `uiStore.ts` re-enables sliders on `MagicModePanel.vue` and `MatrixInputPanel.vue`; the session is created with `practice_mode = true` so it is excluded from the global leaderboard (`leaderboard_service` filter) but achievements still unlock and talent points still award — accessibility users are not punished twice. Practice-mode sessions appear on the personal-best view (§6.2) flagged as such, and the HUD displays a persistent "Practice mode — leaderboard ineligible" badge |
| Motor impairment | Keyboard navigation of grid intersections via `frontend/src/composables/useKeyboardPlacement.ts` (arrow keys move a focus cursor across legal positions; Enter places; 1–7 select tower type; Esc cancels; Tab cycles types). Cursor invisible during WAVE phase | WCAG 2.2 SC 2.1.1 ("Keyboard") satisfied — Star-1 is completable without a mouse; visible focus ring complies with WCAG 2.4.7 |

W3C WCAG 2.2 (W3C, 2023) Level AA is the minimum a published serious-learning artefact should support. The current build closes the four largest-impact gaps the original audit flagged; the canvas-rendering screen-reader limitation is honestly acknowledged rather than silently shipped.

### 12.4 Single-Player Only — The One Standing Pedagogical Gap

Slavin's (2014) review, summarising decades of meta-analytic evidence on cooperative learning (typical effect sizes around *d* ≈ 0.25–0.40 across hundreds of studies), shows reliable transfer gains for *structured* peer cooperation. The current build is **single-player at the gameplay layer**: classmates can spectate one another (§12.5) and contend over the same teacher-curated territories or generative-challenge leaderboards, but no surface lets two students *jointly* configure a Build Phase. The technical substrate the Pair mode would require — an authoritative server-side tick, real-time multiplayer state sync via WebSocket or Server-Sent Events on top of the existing FastAPI surface — is not in place; the spectator hub at `infrastructure/spectate_hub.py` is read-only. A "Build-Phase Pair" mode where one student types parameters while the other reads the rendered curve, with roles swapping each wave, is therefore the largest unrealised pedagogical addition in the current design and is best treated as a Phase-2 capstone rather than a single-sprint backlog item.

### 12.5 Long-Horizon Engagement

Hamari et al. (2014) and Connolly et al. (2012) both flag *novelty effects* as the dominant threat to gamified-learning evidence. After a semester of *Math Defense* a student would historically have unlocked all 25 achievements and most of the 19 talent nodes, with little new content to pursue. The current build addresses this with three structural mitigations:

- **Seasonal achievement sets** (`domain/season/`, `application/season_service.py`, migration `add_seasons`). Admins promote a set of achievements as "seasonal" with a start/end window; while the season is active, unlocking a seasonal achievement awards 2× talent points (`achievement_service.evaluate` applies the multiplier when `season_active`). `AchievementView.vue` exposes a Seasonal tab with the end-date banner; `AdminView.vue` hosts the management surface; past seasons are archived but visible.
- **Generative challenge mode** (§8.3). Teachers compose a typed constraint schema (`allowed_towers`, `magic_param_bounds`, `forbidden_mechanics ⊆ {calculus_pet, monty_hall, chain_rule, buffs, spells}`, `wave_count ∈ [1,6]`, `target_score`) in `domain/challenge/constraint_dsl.py` and publish a public-with-link challenge at `/challenge/{id}`. Students enter through `ChallengeView.vue`; their session carries `challenge_id` end-to-end, so the leaderboard at `GET /api/leaderboard?challenge_id={id}` is isolated from the global ranking. Constraints are immutable after the first leaderboard entry (router returns 409); the engine soft-enforces forbidden towers and clamped coefficient bounds client-side, while `end_session` hard-enforces the wave-count override server-side so a tampered client cannot inflate the challenge ranking.
- **Deterministic Replay and live Spectate** (§7.4 Modelling row). Sessions are persisted as RNG-seed plus event-log streams (`models/session_event.py`, migration `add_rng_seed_and_session_events`); `application/replay_service.py` reconstructs them; `engine/replay/EventRecorder.ts` and `EventPlayer.ts` provide the recording and playback halves; `ReplayView.vue` lets a student scrub their own (or a permitted peer's) session, and `SpectateView.vue` over `infrastructure/spectate_hub.py` lets a class peer watch a live session in near-real-time. The determinism contract — single `SeededRng`, no `Date.now()` / `performance.now()` in game logic, audio explicitly excluded from the replay invariant — was the gating prerequisite and is now in place.

### 12.6 Equity and the Matthew Effect

Stanovich's (1986) Matthew-effect mechanism predicts that learners with stronger graph-reading fluency benefit *more* from any graph-rich environment, widening achievement gaps. Random function paths are a *desirable difficulty* for fluent readers but may be a *prohibitive* one for dis-fluent readers. Concrete-fading (Goldstone & Son, 2005) prescribes the mitigation: in early Star-1 sessions, render the path with explicit y-value labels on a discrete grid; fade these labels as the player's IA accuracy improves. The current build implements this end-to-end. `User` carries an `ia_recent_accuracy` column (rolling-last-10 IA outcomes; migration `add_ia_rolling_accuracy`), recomputed in `session_service.end_session`. `frontend/src/math/curve-renderer.ts` accepts a `labelOpacity` parameter; `GameView.vue` derives it from `ia_recent_accuracy` per the schedule `≤30 % → 1.0` (full labels), `30–60 % → 0.6` (labels at integer x only), `60–80 % → 0.3` (every other integer x), `>80 % → 0` (no labels). Stars ≥ 2 always render with no labels, preserving prior behaviour for above-tutorial bands. The mitigation is automatic — no toggle required — because Goldstone & Son (2005) emphasise that the *fade* itself is what carries the transfer effect.

### 12.7 Other Standing Threats

1. **Affective interference** — Plass et al. (2015) and Wouters et al. (2013) note that high-stakes scoring can crowd out learning. *Math Defense*'s S1/S2/K formula is publicly displayed and tied to leaderboards; under cognitive load, players may default to memorised "build orders" rather than reasoning. The random function path is the principal mitigation.
2. **Productive failure without consolidation** (Loibl, Roll, & Rummel, 2017) — see §4.1.
3. **Selection bias in playtesting** — empirical claims should be hedged. Existing meta-analyses on serious games (Clark, Tanner-Smith, & Killingsworth, 2016; Sitzmann, 2011; Vogel et al., 2006) report moderate effect sizes (roughly *g* ≈ 0.30–0.50) with substantial heterogeneity, and the small body of work specifically on mathematics learning in tower-defense games (Hernández-Sabaté, Joanpere, Gorgorió, & Albarracín, 2015) is encouraging but exploratory.

---

## 13. Empirical-Validity Plan

A minimum defensible evaluation, drawn from design-based-research practice (Anderson & Shattuck, 2012):

1. **Pre/post knowledge probe** (10 items) drawn from a calibrated bank, covering the seven concept areas. Items target the *deep structure* the design claims to teach, not the surface form a player would memorise.
2. **Dosage tracking** via the existing `time_exclude_prepare[]` field, summing only productive-time buckets per student.
3. **Comparison group** — the same students on a non-game intervention of equal duration (e.g. textbook practice on the same item bank).
4. **Transfer measure** at one-week delay (Barnett & Ceci, 2002), with surface features re-randomised so memorised exemplars do not transfer.
5. **Affective measures** — short Likert scales for math anxiety (Ashcraft, 2002) and intrinsic motivation (Ryan et al., 2006) at pre and post.
6. **Sample size** — even *N* = 20 per group is enough to cross the threshold from "theoretically aligned" to "empirically defensible" for a course final.

The **engineering enablers** for this plan are now in place. `frontend/src/domain/study/probe-items.ts` ships the calibrated item bank (with pre / post / delayed-transfer forms re-randomised on surface features); `frontend/src/views/StudyProbeView.vue` runs the 10-item probe; `frontend/src/views/AffectSurveyView.vue` collects the Ashcraft (2002) anxiety short form and a Ryan et al. (2006) IMI subset at pre and post; `backend/app/domain/study/group_assignment.py` provides deterministic two-arm assignment by user-id hash so the assignment is reproducible across reloads; `backend/app/application/study_service.py` orchestrates enrolment and submission; the dosage signal is read directly from the existing `time_exclude_prepare[]` field; and `routers/study.py` exposes an admin-only `GET /api/study/export` endpoint that returns one CSV row per participant with `user_id`, `group`, `pre_score`, `post_score`, `delay_score`, `dosage_seconds`, `anxiety_pre`, `anxiety_post`. Migration `add_study_tables` provisions the persistence side. The remaining work is non-engineering: recruit two groups of 20, secure course-instructor sign-off on the protocol, run the four-week intervention with the one-week delayed transfer test, and analyse the export. Until that is done, every theory citation in this document remains hypothesis rather than evidence — but the gap is now study-execution rather than missing infrastructure.

---

## 14. Conclusion — From Design Intent to Empirical Test

*Math Defense* is, at the level of design intent, a strong implementation of intrinsic integration (Habgood & Ainsworth, 2011) layered with productive failure (Kapur, 2008, 2016), generation across all seven tower types (Slamecka & Graf, 1978), variation-theoretic random instances (Marton, 2015), CLT-respecting phase segmentation (Sweller et al., 2019), SDT-aligned progression (Ryan et al., 2006), and a fully-realised ECD-style stealth assessment (Shute & Ventura, 2013) with declared Q-matrix, Beta posteriors, teacher-facing dashboard, and adaptive recommender. The teacher-curated Grabbing Territory mode realises bounded social comparison; deterministic Replay and live Spectate close the *modelling* step of cognitive apprenticeship; the post-wave articulation prompt closes the *articulation* step; together with the existing coaching, scaffolding, reflection, and exploration affordances this gives the design **all six** cognitive-apprenticeship steps. Above all of these sits the design's **curricular ZPD** (§7.1.1, Vygotsky, 1978; Plass, Homer, & Kinzer, 2015): three of the seven tower types and the Boss Type-B challenge place the hardest mathematics *deliberately* beyond the audience's unaided reach — making the design Vygotskian by content selection, not merely by mechanism — and the recommender now converts that curricular ZPD into per-learner targeted ZPD support.

### 14.1 What Has Shifted Since the Original Audit

The earlier draft of this conclusion identified five highest-leverage refinements. Each is now in production:

1. **Stealth-assessment measurement layer with teacher view** — declared Q-matrix, Beta posteriors per user × competency, per-student bars and lowest-competency suggestions on `TeacherDashboard.vue`, plus an adaptive star/talent recommender at `GET /api/recommendation/me` (§7.1.3, §8.1).
2. **Articulation channel** — post-wave free-text reflection persisted to `GameSession.reflection_text` and surfaced per student in the teacher dashboard for class-mode plays (§7.4).
3. **Empirical-validity probe substrate** — pre/post probe runner, two-arm group assignment, Ashcraft + IMI Likerts, admin CSV export. The remaining gap is *running the study*, not the engineering (§13).
4. **Personal-best leaderboard view** — Personal tab listed first on `LeaderboardView.vue`, with per-star timelines and personal-best markers (§6.2).
5. **Post-wave principle-surfacing overlay** — seven principle cards rotate on `WAVE_END` / `CHAIN_RULE_ANSWERED` / `MONTY_HALL_RESULT`; toggleable in `ProfileView` (§4.1).

The two follow-on bundle items (Star-5 IA gate; per-tower exam-relevance copy) shipped alongside, as did the adaptive recommender that earlier drafts deferred to Phase 2. Three further structural mitigations against earlier risks also landed: concrete-fading on the Star-1 path renderer (Matthew-effect mitigation, §12.6), seasonal achievement sets and generative challenge mode (anti-novelty, §12.5), and a full accessibility pass — keyboard navigation, color-blind glyphs, opt-in slider fallback under a leaderboard-ineligible practice mode, and a declared `/about` accessibility statement (§12.3).

### 14.2 The Single Standing Pedagogical Gap

The one substantive pedagogical addition that was on the original radar and has *not* been built is **real-time cooperative play** (§12.4): a Build-Phase Pair mode where two students share a Build phase, one typing parameters while the other reads the rendered curve, with roles swapping each wave. The spectator hub provides one-way visibility into a peer's session but no shared input surface, and there is no authoritative server-side tick on top of which a co-op session could run. Slavin's (2014) cooperative-learning meta-analyses (typical *d* ≈ 0.25–0.40) make this the largest single body of pedagogical literature the current design cannot yet draw on. Treat it as a Phase-2 capstone, not a single-sprint backlog item.

A second, narrower standing item is the **leaderboard score-validity gap** (§8.4, §10.3): `LeaderboardEntry` still ranks by the client-submitted `score` rather than the server-recomputed `total_score`, so the substantive-validity guarantee Messick (1995) requires is delivered for the recommender / competency / territory pipelines but not yet for the leaderboard ranking surface. This is a single-sprint fix (add `total_score` to `LeaderboardEntry` and rank by it, or tighten the `score` plausibility bound) tracked as the open `BD-1` finding in `docs/Audit/AUDIT_REPORT_2026-05-15.md`; until it ships, leaderboard-mediated motivational claims in §§6.2, 6.4, 8.2, and 10.1 should be read with the residual-risk qualifier from §8.4.

### 14.3 Where The Design Now Stands

The implementation has moved from *theoretically aligned* to *empirically testable*: every theoretical claim in §§3–10 now has a corresponding mechanism in code, and the §13 study can be executed against the shipped build without further engineering. The defensible next step is therefore not another refinement but the **empirical run itself** — pre/post probe + delayed transfer + comparison group + Likert affect at *N* = 20 per arm — followed by the cooperative-pair-mode capstone if engineering capacity allows. The design no longer needs to choose between adding features and validating the ones it has; the substrate is in place to do the latter.

---

## 15. Pedagogical Backlog — Implementation Status

This section consolidates every pedagogically defensible addition surfaced in §§3–13 into a single tracking table. Items are grouped by the learning function they serve. **Status** is one of *Implemented* (shipped end-to-end and visible in current production code), *Standing* (not yet built), or *Engineering complete; non-engineering work remaining*. Anchors point to the in-text discussion. Items previously assessed as out-of-scope or Phase-2 follow-ons are still listed for completeness, with their as-shipped status recorded.

Of the 28 items, 27 are implemented; the one standing item is **#26** (real-time cooperative pair mode), discussed at §12.4. The empirical-validity probe (#27) is *engineering-complete*; running the study itself is the only remaining work.

### 15.1 Closing the Productive-Failure Loop

| # | Change | Theory | Status | Anchor |
|---|---|---|---|---|
| 1 | **Post-wave principle-surfacing overlay** — `PrincipleOverlay.vue` renders one of seven principle cards (`chain-rule`, `monty-hall`, `derivative-as-rate`, `limit-piecewise`, `matrix-dot`, `magic-curve-zone`, `radar-arc`) on `WAVE_END` / `CHAIN_RULE_ANSWERED` / `MONTY_HALL_RESULT`. KaTeX-rendered, dismissible, toggleable in `ProfileView`. Converts productive failure into productive learning. | Kapur (2014, 2016); Loibl et al. (2017) | Implemented | §4.1 |
| 2 | **Articulation prompt** — post-wave free-text box on `ScoreResultView.vue`, persisted via `GameSession.record_reflection()` to `reflection_text` (migration `add_reflection_text`), surfaced per student in `TeacherDashboard.vue` for class-mode plays. Optional, capped at 2000 chars. Closes the missing 4th step of cognitive apprenticeship and unlocks Webb's "elaborated explanations" effect. | Collins et al. (1989); Webb (1991) | Implemented | §7.4, §10.2 |
| 3 | **Limit-tower typed entry at higher stars** — `LimitQuestionPanel.vue` branches on `gameStore.starRating`: ≤ 3 keeps MCQ, ≥ 4 takes typed input parsed by `limit-evaluator.parseLimitAnswer()` (accepts `+inf`, `-inf`, `infinity`, integers, decimals, `DNE`; whitespace-tolerant, case-insensitive). Backend tower payload format unchanged. | Roediger & Karpicke (2006); Karpicke & Roediger (2007) | Implemented | §4.4 |

### 15.2 Restoring the Generation-Effect Doctrine

| # | Change | Theory | Status | Anchor |
|---|---|---|---|---|
| 4 | **Radar typed-degree inputs** — `RadarConfigPanel.vue` migrated from `<input type="range">` to `<input type="number" min="0" max="360" step="5">` with manual *Apply* gate; values snap to nearest 5° before emitting `RADAR_ARC_CHANGED`; the visual range arc updates only on Apply, preserving the generation property. Slider remains as opt-in accessibility fallback (item #20) under a leaderboard-ineligible practice flag. | Slamecka & Graf (1978); Bertsch et al. (2007) | Implemented | §3.2, §11 |
| 5 | **Star-5 unlock gated on IA correctness** — `User` carries `ia_unlock_earned` derived from `session/repository.has_correct_ia_session(user_id)`; `LevelSelectView.vue` disables Star-5 with tooltip; `session_service.create_session` raises `Star5LockedError` (HTTP 403, code `STAR_5_LOCKED`) for direct API access. Class-mode Grabbing-Territory slots at Star-5 still bypass the personal lock by design. | Habgood & Ainsworth (2011) | Implemented | §3.1, §14 |
| 6 | **Curve-family unlock by achievement** — `unlock_trig_curves` and `unlock_log_curves` registered in `achievement-defs.ts` and `domain/achievement/definitions.py` (criteria: clear one Star-1 / one Star-2 level). `MagicModePanel.vue` disables trig and log tabs until the corresponding achievement is unlocked; existing players are retroactively unlocked through the achievement-evaluation loop on session completion. | Sweller et al. (2019) | Implemented | §4.2 |

### 15.3 Stealth-Assessment Measurement Layer

| # | Change | Theory | Status | Anchor |
|---|---|---|---|---|
| 7 | **Explicit Q-matrix declaration** — `backend/app/domain/assessment/q_matrix.py` plus `competencies.py` (`MAGIC | RADAR | MATRIX | LIMIT | CALCULUS | CHAIN_RULE | PROBABILITY`) and `q_matrix_defs.py` (the mapping table). Each evidence event maps to weights in `[0, 1]` per competency. CI parity test (`tests/test_q_matrix.py`) enforces row completeness against `ACHIEVEMENT_DEFS.keys() ∪ DIAGNOSTIC_EVENTS`. | Tatsuoka (1983); Mislevy et al. (2003) | Implemented | §8.1 |
| 8 | **Bayesian competency estimator** — pure-function `competency_estimator.py` (`update`, `mean`, `ci95`) plus per-user aggregate `competency_state.py`; persisted to `user_competency_state` table (migration `add_competency_state`); orchestrated by `application/assessment_service.py::record_event`, fired from `session_service.end_session` after achievement evaluation. Uniform `Beta(1, 1)` prior; update rule `α' = α + w·s`, `β' = β + w·(1−s)`. After 5 chain-rule-correct events the `CHAIN_RULE` posterior mean exceeds 0.85; with no events the prior mean is 0.5. | Shute & Ventura (2013) | Implemented | §8.1 |
| 9 | **Teacher dashboard competency surfacing** — `routers/assessment.py` exposes `GET /api/assessment/class/{class_id}/posteriors` (teacher-only, with `class_service.is_owner` membership check inside); `services/assessmentService.ts` calls it; `components/teacher/CompetencyBar.vue` renders 7-bar mini charts per class member in `TeacherDashboard.vue`. Each row carries a deterministic suggestion derived from the lowest-posterior competency (e.g., `LIMIT → "Limit-tower run with frugal-spend constraint"`). | Tomlinson (2014); Hattie & Timperley (2007) | Implemented | §8.1, §10.2 |
| 28 | **Adaptive star/talent recommender** — `application/recommender_service.py` consumes the posterior; `routers/recommendation.py` exposes `GET /api/recommendation/me`; `LevelSelectView.vue` renders "Suggested for you: Star N" badge (mapping: < 0.3 → 1; < 0.5 → 2; < 0.7 → 3; < 0.85 → 4; ≥ 0.85 → 5); `TalentTreeView.vue` highlights the talent-root node tied to the lowest-posterior competency. Suggestions are dismissible and dismissal persists, preserving SDT autonomy. Closes the §7.1.3 diagnostic-ZPD gap. | Vygotsky (1978); Shute & Ventura (2013); Tomlinson (2014) | Implemented | §7.1.3 |

### 15.4 Motivation, Affect, and Anxiety

| # | Change | Theory | Status | Anchor |
|---|---|---|---|---|
| 10 | **Personal-best leaderboard view** — `leaderboard/repository.get_user_history(user_id, star_rating?)`; `GET /api/leaderboard/me`; `components/leaderboard/PersonalTimeline.vue` renders a minimalist SVG timeline with personal-best markers; `LeaderboardView.vue` exposes the Personal tab and lists it *first* (the §6.2 reading: self-referential framing is the healthier default). | Ames (1992); Ramirez et al. (2018); Ryan et al. (2006) | Implemented | §6.2, §6.6 |
| 11 | **Per-tower exam-relevance copy** — `tower-defs.ts` adds `examRelevance: string` per tower (lint-tested for non-empty); `TowerBar.vue` (hover/long-press) and `TowerInfoPanel.vue` render it. Single source so a single edit propagates to every UI surface. | Jones (2009); Keller (1987) | Implemented | §6.3, §14 |
| 12 | **Wave checkpoint for Star-5** — `frontend/src/domain/level/checkpoint.ts` snapshots `{ waveIndex, gold, hp, costTotal, killValue }` at every `WAVE_END`; `GameView.vue` renders "Retry from Wave N" on `GAME_OVER` only when `starRating == 5` and a checkpoint exists; retry creates a new server-side session pre-seeded with the snapshot, so audit integrity is preserved and runs are flagged as practice on personal-best. | Csikszentmihalyi (1990); Sweetser & Wyeth (2005) | Implemented | §6.1 |
| 13 | **Achievement-toast copy audit** — Vitest lint (`achievement-defs.test.ts`) enforces `test_no_trait_praise` (banned tokens: `Master`, `Legendary`, `Genius`, `Amazing`) and requires every description to begin with a task-level action verb (`Kill`, `Achieve`, `Score`, `Complete`, `Survive`, `Hold`, `Play`, `Unlock`, `Clear`); `AchievementToast.vue` renders the description rather than a generic superlative. | Hattie & Timperley (2007) | Implemented | §8.2 |
| 14 | **Teacher-dashboard randomisation explainer** — `<details>` element near the top of `TeacherDashboard.vue`, default-open on first visit, persisted as collapsed in `localStorage` after dismissal. Two-paragraph plain-language explanation of the desirable-difficulties literature. | Bjork & Bjork (2011) | Implemented | §4.3 |

### 15.5 Multimedia and Modality

| # | Change | Theory | Status | Anchor |
|---|---|---|---|---|
| 15 | **Audio AssetManager** — `engine/audio/AssetManager.ts` (`load`, `play`, `setVolume`, `mute`); `engine/audio/sfx-defs.ts` slug-to-URL map; assets in `frontend/public/audio/` are CC0 / synthesised in-house via `frontend/scripts/synth-audio.py` (`cast-spell`, `kill`, `wave-end`, `mh-reveal`, `achievement`, plus an `ambient-build` loop). First user gesture unlocks the `AudioContext` per Chromium autoplay policy; mute and master volume persist via `uiStore` and are exposed in `ProfileView.vue`. | Mayer (2014); Plass et al. (2014) | Implemented | §5.1, §5.3, §9.1, §11 |
| 16 | **Tutorial-level palette warming** — `styles/variables.css` defines `[data-star='1']` overrides for `--bg-base` and HUD accent variables; `GameView.vue` writes `data-star` on the root element from `gameStore.starRating`. Static palette change so reduced-motion users still benefit. | Plass et al. (2014) | Implemented | §5.3 |

### 15.6 Equity, Accessibility, and the Matthew Effect

| # | Change | Theory | Status | Anchor |
|---|---|---|---|---|
| 17 | **Concrete-fading on path rendering** — `User.ia_recent_accuracy` (rolling-last-10 IA outcomes; migration `add_ia_rolling_accuracy`) recomputed in `session_service.end_session`; `frontend/src/math/curve-renderer.ts` accepts a `labelOpacity` argument; `GameView.vue` derives it from the rolling accuracy on the schedule `≤30 % → 1.0`, `30–60 % → 0.6`, `60–80 % → 0.3`, `>80 % → 0`. Star ≥ 2 always renders no labels, matching prior behaviour. | Goldstone & Son (2005); Stanovich (1986) | Implemented | §12.6 |
| 18 | **Color-blind tower glyphs** — `tower-defs.ts` adds `glyph: string` per tower (`✦`, `◐`, `◑`, `◒`, `⊞`, `∞`, `∫`); `TowerRenderer.ts` overlays the glyph on the sprite; `TowerBar.vue` renders it next to the label. Greyscale screenshot of canvas keeps all towers distinguishable. | W3C (2023) WCAG SC 1.4.1 | Implemented | §12.3 |
| 19 | **Keyboard navigation of grid intersections** — `frontend/src/composables/useKeyboardPlacement.ts` (arrow keys move a focus cursor across legal positions; Enter places; 1–7 select tower type; Esc cancels; Tab cycles types). `GameView.vue` registers it during BUILD; `TowerRenderer.ts` renders the cursor; cursor invisible during WAVE. Game completable without a mouse at Star-1; visible focus ring complies with WCAG 2.4.7. | W3C (2023) WCAG SC 2.1.1 | Implemented | §12.3 |
| 20 | **Slider-fallback / practice-mode toggle** — `uiStore.sliderFallbackEnabled` re-enables sliders on `MagicModePanel.vue` and `MatrixInputPanel.vue`; the session is created with `practice_mode = true` (migration `add_practice_mode_to_sessions`), excluded from the global leaderboard via `leaderboard_service` filter, surfaced on personal-best with a flag, and tagged in HUD with a "Practice mode — leaderboard ineligible" badge. Achievements still unlock and talent points still award. | Ashcraft & Krause (2007); W3C (2023) | Implemented | §12.3 |
| 21 | **Accessibility statement** — `frontend/src/views/AboutView.vue` at `/about` (no auth) declares the canvas-screen-reader limit, lists supported assistive workflows (keyboard, glyphs, practice mode), and provides a contact link. | W3C (2023) *Understanding* | Implemented | §12.3 |

### 15.7 Long-Horizon Engagement (Anti-Novelty-Effect)

| # | Change | Theory | Status | Anchor |
|---|---|---|---|---|
| 22 | **Seasonal achievement sets** — `domain/season/`, `application/season_service.py`, `routers/admin.py` season endpoint; `achievement/definitions.py` carries `season_id`, `season_starts_at`, `season_ends_at`; `achievement_service.evaluate` applies a 2× talent-point multiplier when `season_active`. `AchievementView.vue` exposes a Seasonal tab with end-date banner; `AdminView.vue` hosts season management; past seasons archived but visible. | Hamari et al. (2014); Connolly et al. (2012) | Implemented | §12.5 |
| 23 | **Generative challenge mode** — `domain/challenge/` (`Challenge` aggregate, `constraint_dsl.py` typed value object with five knobs, `tower_types.py` backend mirror of `TowerType` enum); `application/challenge_service.py` CRUD; `routers/challenge.py` REST endpoints (teacher/admin write, any auth read); migration `add_challenges` provisions table and `challenge_id` columns on `game_sessions` and `leaderboard_entries`. Frontend: `ChallengeBuilder.vue` (teacher), `ChallengeView.vue` (student lobby), `ChallengeLeaderboardView.vue`. Constraints are immutable after the first leaderboard entry (router returns 409); engine soft-enforces forbidden towers and clamped coefficient bounds client-side; `end_session` hard-enforces wave-count override server-side. | Anderson & Krathwohl (2001); Plass et al. (2015) | Implemented | §8.3, §12.5 |
| 24 | **Replay / spectate mode** — `models/session_event.py` and `domain/session/events_log.py` persist `(session_id, ts, event_type, payload_json)` (migration `add_rng_seed_and_session_events`); `application/replay_service.py` reconstructs a session; `engine/replay/EventRecorder.ts` and `EventPlayer.ts` provide the recording and playback halves; `ReplayView.vue` renders a scrubbable timeline; `infrastructure/spectate_hub.py` plus `SpectateView.vue` give live near-real-time spectator scrubbing. Determinism contract (single `SeededRng`, no `Date.now()` / `performance.now()` in game logic, audio explicitly excluded from the replay invariant) is now enforced. Closes the *modelling* step of cognitive apprenticeship and seeds Lave & Wenger's legitimate peripheral participation. | Collins et al. (1989); Lave & Wenger (1991); Squire (2006) | Implemented | §7.4, §12.5 |
| 25 | **Boss-ability trigger randomisation** — `enemy-defs.ts` replaces fixed `triggerHpFraction` with `triggerHpRange: [lo, hi]`; `EnemyAbilitySystem.ts` samples uniformly from `game.rng()` at spawn and stores the sampled fraction on the entity. Across spawns at the same star, ability triggers at different HP fractions; range is bounded so the boss never skips its ability. Preserves the variation-theoretic invariant (boss *type*) while varying the surface (trigger timing). | Marton (2015); Barnett & Ceci (2002) | Implemented | §11 |

### 15.8 Cooperative Learning — The Standing Item

| # | Change | Theory | Status | Anchor |
|---|---|---|---|---|
| 26 | **Build-Phase Pair mode** — two students share a Build Phase: one types parameters, the other reads the rendered curve; roles swap each wave. **Not implemented.** Requires real-time multiplayer state sync (WebSocket or SSE) and an authoritative server-side tick; the existing spectator hub is read-only. The largest unrealised pedagogical addition in the current design; treat as a Phase-2 capstone, not a single-sprint backlog item. | Slavin (2014); Webb (1991) | Standing | §12.4 |

### 15.9 Empirical Validity

| # | Change | Theory | Status | Anchor |
|---|---|---|---|---|
| 27 | **Empirical-validity probe** — `frontend/src/domain/study/probe-items.ts` ships the calibrated item bank (pre / post / delayed-transfer forms re-randomised on surface features); `StudyProbeView.vue` runs the 10-item probe; `AffectSurveyView.vue` collects Ashcraft (2002) anxiety short form plus a Ryan et al. (2006) IMI subset at pre and post; `domain/study/group_assignment.py` provides deterministic two-arm assignment by user-id hash; `application/study_service.py` orchestrates enrolment and submission; `routers/study.py` exposes admin-only `GET /api/study/export` returning one CSV row per participant with `user_id`, `group`, `pre_score`, `post_score`, `delay_score`, `dosage_seconds`, `anxiety_pre`, `anxiety_post`. Migration `add_study_tables` provisions persistence. | Anderson & Shattuck (2012); Barnett & Ceci (2002) | Engineering complete; study run remaining | §13 |

### 15.10 Summary

The current build implements 27 of 28 items. The five highest-leverage items the original audit flagged (1, 2, 7–9 plus the §7.1.3 follow-on at #28) all shipped, as did the two cheapest motivation-and-anxiety wins (10, 11), the Matthew-effect mitigation (17), the full anti-novelty stack (22, 23, 24), and the §13 study substrate (27). The single standing item is **#26** (real-time cooperative pair mode) — best read as a Phase-2 capstone given the WebSocket / authoritative-tick infrastructure it would require — and the single non-engineering follow-on is the actual execution of the §13 empirical study.

---

## References

Abrahamson, D., & Sánchez-García, R. (2016). Learning is moving in new ways: The ecological dynamics of mathematics education. *Journal of the Learning Sciences*, *25*(2), 203–239. https://doi.org/10.1080/10508406.2016.1143370

Ames, C. (1992). Classrooms: Goals, structures, and student motivation. *Journal of Educational Psychology*, *84*(3), 261–271. https://doi.org/10.1037/0022-0663.84.3.261

Anderson, L. W., & Krathwohl, D. R. (Eds.). (2001). *A taxonomy for learning, teaching, and assessing: A revision of Bloom's taxonomy of educational objectives*. Longman.

Anderson, T., & Shattuck, J. (2012). Design-based research: A decade of progress in education research? *Educational Researcher*, *41*(1), 16–25. https://doi.org/10.3102/0013189X11428813

Ashcraft, M. H. (2002). Math anxiety: Personal, educational, and cognitive consequences. *Current Directions in Psychological Science*, *11*(5), 181–185. https://doi.org/10.1111/1467-8721.00196

Ashcraft, M. H., & Krause, J. A. (2007). Working memory, math performance, and math anxiety. *Psychonomic Bulletin & Review*, *14*(2), 243–248. https://doi.org/10.3758/BF03194059

Barnett, S. M., & Ceci, S. J. (2002). When and where do we apply what we learn? A taxonomy for far transfer. *Psychological Bulletin*, *128*(4), 612–637. https://doi.org/10.1037/0033-2909.128.4.612

Bertsch, S., Pesta, B. J., Wiscott, R., & McDaniel, M. A. (2007). The generation effect: A meta-analytic review. *Memory & Cognition*, *35*(2), 201–210. https://doi.org/10.3758/BF03193441

Bjork, E. L., & Bjork, R. A. (2011). Making things hard on yourself, but in a good way: Creating desirable difficulties to enhance learning. In M. A. Gernsbacher, R. W. Pew, L. M. Hough, & J. R. Pomerantz (Eds.), *Psychology and the real world: Essays illustrating fundamental contributions to society* (pp. 56–64). Worth.

Cepeda, N. J., Vul, E., Rohrer, D., Wixted, J. T., & Pashler, H. (2008). Spacing effects in learning: A temporal ridgeline of optimal retention. *Psychological Science*, *19*(11), 1095–1102. https://doi.org/10.1111/j.1467-9280.2008.02209.x

Black, P., & Wiliam, D. (1998). Assessment and classroom learning. *Assessment in Education: Principles, Policy & Practice*, *5*(1), 7–74. https://doi.org/10.1080/0969595980050102

Black, P., & Wiliam, D. (2009). Developing the theory of formative assessment. *Educational Assessment, Evaluation and Accountability*, *21*(1), 5–31. https://doi.org/10.1007/s11092-008-9068-5

Clark, D. B., Tanner-Smith, E. E., & Killingsworth, S. S. (2016). Digital games, design, and learning: A systematic review and meta-analysis. *Review of Educational Research*, *86*(1), 79–122. https://doi.org/10.3102/0034654315582065

Collins, A., Brown, J. S., & Newman, S. E. (1989). Cognitive apprenticeship: Teaching the crafts of reading, writing, and mathematics. In L. B. Resnick (Ed.), *Knowing, learning, and instruction: Essays in honor of Robert Glaser* (pp. 453–494). Lawrence Erlbaum.

Connolly, T. M., Boyle, E. A., MacArthur, E., Hainey, T., & Boyle, J. M. (2012). A systematic literature review of empirical evidence on computer games and serious games. *Computers & Education*, *59*(2), 661–686. https://doi.org/10.1016/j.compedu.2012.03.004

Csikszentmihalyi, M. (1990). *Flow: The psychology of optimal experience*. Harper & Row.

Deci, E. L., & Ryan, R. M. (2000). The "what" and "why" of goal pursuits: Human needs and the self-determination of behavior. *Psychological Inquiry*, *11*(4), 227–268. https://doi.org/10.1207/S15327965PLI1104_01

Deterding, S., Dixon, D., Khaled, R., & Nacke, L. (2011). From game design elements to gamefulness: Defining "gamification." *Proceedings of the 15th International Academic MindTrek Conference*, 9–15. https://doi.org/10.1145/2181037.2181040

Dubinsky, E., & McDonald, M. A. (2002). APOS: A constructivist theory of learning in undergraduate mathematics education research. In D. Holton et al. (Eds.), *The teaching and learning of mathematics at university level: An ICMI study* (pp. 275–282). Springer. https://doi.org/10.1007/0-306-47231-7_25

Dunlosky, J., Rawson, K. A., Marsh, E. J., Nathan, M. J., & Willingham, D. T. (2013). Improving students' learning with effective learning techniques: Promising directions from cognitive and educational psychology. *Psychological Science in the Public Interest*, *14*(1), 4–58. https://doi.org/10.1177/1529100612453266

Elliot, A. J. (1999). Approach and avoidance motivation and achievement goals. *Educational Psychologist*, *34*(3), 169–189. https://doi.org/10.1207/s15326985ep3403_3

Festinger, L. (1954). A theory of social comparison processes. *Human Relations*, *7*(2), 117–140. https://doi.org/10.1177/001872675400700202

Goldstone, R. L., & Son, J. Y. (2005). The transfer of scientific principles using concrete and idealized simulations. *Journal of the Learning Sciences*, *14*(1), 69–110. https://doi.org/10.1207/s15327809jls1401_4

Gravemeijer, K. (1999). How emergent models may foster the constitution of formal mathematics. *Mathematical Thinking and Learning*, *1*(2), 155–177. https://doi.org/10.1207/s15327833mtl0102_4

Habgood, M. P. J., & Ainsworth, S. E. (2011). Motivating children to learn effectively: Exploring the value of intrinsic integration in educational games. *Journal of the Learning Sciences*, *20*(2), 169–206. https://doi.org/10.1080/10508406.2010.508029

Hamari, J., Koivisto, J., & Sarsa, H. (2014). Does gamification work? — A literature review of empirical studies on gamification. *Proceedings of the 47th Hawaii International Conference on System Sciences*, 3025–3034. https://doi.org/10.1109/HICSS.2014.377

Hanus, M. D., & Fox, J. (2015). Assessing the effects of gamification in the classroom: A longitudinal study on intrinsic motivation, social comparison, satisfaction, effort, and academic performance. *Computers & Education*, *80*, 152–161. https://doi.org/10.1016/j.compedu.2014.08.019

Hattie, J., & Timperley, H. (2007). The power of feedback. *Review of Educational Research*, *77*(1), 81–112. https://doi.org/10.3102/003465430298487

Hernández-Sabaté, A., Joanpere, M., Gorgorió, N., & Albarracín, L. (2015). Mathematics learning opportunities when playing a tower defense game. *International Journal of Serious Games*, *2*(4), 57–71. https://doi.org/10.17083/ijsg.v2i4.84

Hunicke, R., LeBlanc, M., & Zubek, R. (2004). MDA: A formal approach to game design and game research. *Proceedings of the AAAI Workshop on Challenges in Game AI*, *4*(1), 1–5.

Jones, B. D. (2009). Motivating students to engage in learning: The MUSIC model of academic motivation. *International Journal of Teaching and Learning in Higher Education*, *21*(2), 272–285.

Kahneman, D., & Tversky, A. (1979). Prospect theory: An analysis of decision under risk. *Econometrica*, *47*(2), 263–291. https://doi.org/10.2307/1914185

Kapur, M. (2008). Productive failure. *Cognition and Instruction*, *26*(3), 379–424. https://doi.org/10.1080/07370000802212669

Kapur, M. (2014). Productive failure in learning math. *Cognitive Science*, *38*(5), 1008–1022. https://doi.org/10.1111/cogs.12107

Kapur, M. (2016). Examining productive failure, productive success, unproductive failure, and unproductive success in learning. *Educational Psychologist*, *51*(2), 289–299. https://doi.org/10.1080/00461520.2016.1155457

Karpicke, J. D., & Roediger, H. L. (2007). Repeated retrieval during learning is the key to long-term retention. *Journal of Memory and Language*, *57*(2), 151–162. https://doi.org/10.1016/j.jml.2006.09.004

Keller, J. M. (1987). Development and use of the ARCS model of instructional design. *Journal of Instructional Development*, *10*(3), 2–10. https://doi.org/10.1007/BF02905780

Landers, R. N. (2014). Developing a theory of gamified learning: Linking serious games and gamification of learning. *Simulation & Gaming*, *45*(6), 752–768. https://doi.org/10.1177/1046878114563660

Lave, J., & Wenger, E. (1991). *Situated learning: Legitimate peripheral participation*. Cambridge University Press. https://doi.org/10.1017/CBO9780511815355

Locke, E. A., & Latham, G. P. (2002). Building a practically useful theory of goal setting and task motivation: A 35-year odyssey. *American Psychologist*, *57*(9), 705–717. https://doi.org/10.1037/0003-066X.57.9.705

Loibl, K., Roll, I., & Rummel, N. (2017). Towards a theory of when and how problem solving followed by instruction supports learning. *Educational Psychology Review*, *29*(4), 693–715. https://doi.org/10.1007/s10648-016-9379-x

Marton, F. (2015). *Necessary conditions of learning*. Routledge. https://doi.org/10.4324/9781315816876

Mayer, R. E. (2014). *The Cambridge handbook of multimedia learning* (2nd ed.). Cambridge University Press. https://doi.org/10.1017/CBO9781139547369

Messick, S. (1995). Validity of psychological assessment: Validation of inferences from persons' responses and performances as scientific inquiry into score meaning. *American Psychologist*, *50*(9), 741–749. https://doi.org/10.1037/0003-066X.50.9.741

Mislevy, R. J., Steinberg, L. S., & Almond, R. G. (2003). On the structure of educational assessments. *Measurement: Interdisciplinary Research and Perspective*, *1*(1), 3–62. https://doi.org/10.1207/S15366359MEA0101_02

Núñez, R. E., & Lakoff, G. (2000). *Where mathematics comes from: How the embodied mind brings mathematics into being*. Basic Books.

Paivio, A. (1991). Dual coding theory: Retrospect and current status. *Canadian Journal of Psychology*, *45*(3), 255–287. https://doi.org/10.1037/h0084295

Papert, S. (1980). *Mindstorms: Children, computers, and powerful ideas*. Basic Books.

Plass, J. L., Heidig, S., Hayward, E. O., Homer, B. D., & Um, E. (2014). Emotional design in multimedia learning: Effects of shape and color on affect and learning. *Learning and Instruction*, *29*, 128–140. https://doi.org/10.1016/j.learninstruc.2013.02.006

Plass, J. L., Homer, B. D., & Kinzer, C. K. (2015). Foundations of game-based learning. *Educational Psychologist*, *50*(4), 258–283. https://doi.org/10.1080/00461520.2015.1122533

Ramirez, G., Shaw, S. T., & Maloney, E. A. (2018). Math anxiety: Past research, promising interventions, and a new interpretation framework. *Educational Psychologist*, *53*(3), 145–164. https://doi.org/10.1080/00461520.2018.1447384

Roediger, H. L., & Karpicke, J. D. (2006). Test-enhanced learning: Taking memory tests improves long-term retention. *Psychological Science*, *17*(3), 249–255. https://doi.org/10.1111/j.1467-9280.2006.01693.x

Rohrer, D., & Taylor, K. (2007). The shuffling of mathematics problems improves learning. *Instructional Science*, *35*(6), 481–498. https://doi.org/10.1007/s11251-007-9015-8

Ryan, R. M., Rigby, C. S., & Przybylski, A. (2006). The motivational pull of video games: A self-determination theory approach. *Motivation and Emotion*, *30*(4), 344–360. https://doi.org/10.1007/s11031-006-9051-8

Sfard, A. (1991). On the dual nature of mathematical conceptions: Reflections on processes and objects as different sides of the same coin. *Educational Studies in Mathematics*, *22*(1), 1–36. https://doi.org/10.1007/BF00302715

Shute, V. J. (2011). Stealth assessment in computer-based games to support learning. In S. Tobias & J. D. Fletcher (Eds.), *Computer games and instruction* (pp. 503–524). Information Age Publishing.

Shute, V. J., & Ventura, M. (2013). *Stealth assessment: Measuring and supporting learning in video games*. MIT Press. https://doi.org/10.7551/mitpress/9589.001.0001

Sitzmann, T. (2011). A meta-analytic examination of the instructional effectiveness of computer-based simulation games. *Personnel Psychology*, *64*(2), 489–528. https://doi.org/10.1111/j.1744-6570.2011.01190.x

Slamecka, N. J., & Graf, P. (1978). The generation effect: Delineation of a phenomenon. *Journal of Experimental Psychology: Human Learning and Memory*, *4*(6), 592–604. https://doi.org/10.1037/0278-7393.4.6.592

Slavin, R. E. (2014). Cooperative learning and academic achievement: Why does groupwork work? *Anales de Psicología*, *30*(3), 785–791. https://doi.org/10.6018/analesps.30.3.201201

Squire, K. (2006). From content to context: Videogames as designed experience. *Educational Researcher*, *35*(8), 19–29. https://doi.org/10.3102/0013189X035008019

Stanovich, K. E. (1986). Matthew effects in reading: Some consequences of individual differences in the acquisition of literacy. *Reading Research Quarterly*, *21*(4), 360–407. https://doi.org/10.1598/RRQ.21.4.1

Sweetser, P., & Wyeth, P. (2005). GameFlow: A model for evaluating player enjoyment in games. *Computers in Entertainment*, *3*(3), Article 3. https://doi.org/10.1145/1077246.1077253

Sweller, J. (1988). Cognitive load during problem solving: Effects on learning. *Cognitive Science*, *12*(2), 257–285. https://doi.org/10.1207/s15516709cog1202_4

Sweller, J., van Merriënboer, J. J. G., & Paas, F. G. W. C. (1998). Cognitive architecture and instructional design. *Educational Psychology Review*, *10*(3), 251–296. https://doi.org/10.1023/A:1022193728205

Sweller, J., van Merriënboer, J. J. G., & Paas, F. (2019). Cognitive architecture and instructional design: 20 year update. *Educational Psychology Review*, *31*(2), 261–292. https://doi.org/10.1007/s10648-019-09465-5

Tatsuoka, K. K. (1983). Rule space: An approach for dealing with misconceptions based on item response theory. *Journal of Educational Measurement*, *20*(4), 345–354. https://doi.org/10.1111/j.1745-3984.1983.tb00212.x

Tomlinson, C. A. (2014). *The differentiated classroom: Responding to the needs of all learners* (2nd ed.). ASCD.

Tversky, A., & Kahneman, D. (1992). Advances in prospect theory: Cumulative representation of uncertainty. *Journal of Risk and Uncertainty*, *5*(4), 297–323. https://doi.org/10.1007/BF00122574

Vogel, J. J., Vogel, D. S., Cannon-Bowers, J., Bowers, C. A., Muse, K., & Wright, M. (2006). Computer gaming and interactive simulations for learning: A meta-analysis. *Journal of Educational Computing Research*, *34*(3), 229–243. https://doi.org/10.2190/FLHV-K4WA-WPVQ-H0YM

Vygotsky, L. S. (1978). *Mind in society: The development of higher psychological processes* (M. Cole, V. John-Steiner, S. Scribner, & E. Souberman, Eds.). Harvard University Press.

W3C. (2023). *Web Content Accessibility Guidelines (WCAG) 2.2*. World Wide Web Consortium. https://www.w3.org/TR/WCAG22/

Webb, N. M. (1991). Task-related verbal interaction and mathematics learning in small groups. *Journal for Research in Mathematics Education*, *22*(5), 366–389. https://doi.org/10.2307/749186

Wood, D., Bruner, J. S., & Ross, G. (1976). The role of tutoring in problem solving. *Journal of Child Psychology and Psychiatry*, *17*(2), 89–100. https://doi.org/10.1111/j.1469-7610.1976.tb00381.x

Wouters, P., van Nimwegen, C., van Oostendorp, H., & van der Spek, E. D. (2013). A meta-analysis of the cognitive and motivational effects of serious games. *Journal of Educational Psychology*, *105*(2), 249–265. https://doi.org/10.1037/a0031311
