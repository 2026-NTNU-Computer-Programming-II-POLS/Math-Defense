# Math Defense — Educational & Gamified-Learning Theory Analysis

> A theory-driven design audit of *Math Defense* (V2 Phase 5 + Phase 6 Grabbing Territory).
> Each section maps a concrete game mechanic to one or more authoritative learning theories, evaluates fit, and flags risks.
> Citations follow APA 7. DOIs are given for every peer-reviewed source.

---

## 1. Executive Summary

*Math Defense* is a tower-defense game in which seven tower types are not merely flavoured by mathematics but **constituted by it**: the slope and intercept of a polynomial determine a Magic-tower zone; the start and end angles of a 1.5×-bonus arc shape every Radar tower's effective firing zone; the dot product of two paired Matrix-tower coordinate vectors produces Matrix-tower damage; a derivative or integral spawns Calculus-tower pets; a multiple-choice limit picks a Limit-tower's effect; a Monty-Hall door choice between waves rewards correct conditional-probability reasoning; and a Boss Type-B fight is gated by a chain-rule challenge. Random function paths, a 1–5 star rating system, an "Initial Answer" pre-wave endpoint identification, time-based spells and buffs, an S1/S2/K/TotalScore formula, a 25-achievement set, a 19-node talent tree, and a teacher-curated *Grabbing Territory* classroom-competition mode complete the loop.

The design is, at the level of intent, a near-canonical implementation of **intrinsic integration** (Habgood & Ainsworth, 2011), layered with **productive failure** (Kapur, 2008, 2014, 2016), **variation-theoretic random instances** (Marton, 2015), **cognitive-load-respecting phase segmentation** (Sweller, van Merriënboer, & Paas, 2019), and **self-determination-aligned progression** (Ryan, Rigby, & Przybylski, 2006). The achievement-and-telemetry layer is, structurally, a **stealth assessment** in the sense of Shute (2011), and the teacher-curated Grabbing Territory mode satisfies most of the cognitive-apprenticeship cycle (Collins, Brown, & Newman, 1989).

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

> **Risk.** The Initial Answer phase rewards endpoint *recognition* with a score multiplier (`TotalScore = K^{1/(1+2+H_o-H_f-IA)}`). Because IA appears as a flat additive in the exponent's denominator, a player can in principle skip the math and absorb the small score penalty. Habgood and Ainsworth's framework predicts that whenever the *math option* has lower expected utility than the *math-free option*, intrinsic integration degrades. Recommended: re-tune IA's weight or make at least one IA correct answer a **prerequisite** for unlocking the highest star ratings.

### 3.2 The Generation Effect — The No-Slider Doctrine

Slamecka and Graf (1978) demonstrated that information *generated* by the learner is better retained than identical information passively read. Bertsch, Pesta, Wiscott, and McDaniel (2007) meta-analysed 86 studies and confirmed a robust generation effect with mean *d* ≈ 0.40, larger when the to-be-generated item is **constrained** (a single correct value) than when it is unconstrained.

The original spec's design rule — *"manual numeric input, not sliders; players must derive each new value by reasoning from the visual outcome"* — is, when honoured, an unusually clean operationalisation of constrained generation. Sliders would convert the task into recognition (pick the right value); typing converts it into recall and construction. The same logic governs:

- the Limit tower's multiple-choice limit (constrained generation among six outcomes: $+\infty,+C,0,\text{const},-C,-\infty$, mapped in `tower-defs.ts` to max-damage, damage, removal, disable, heal, max-heal respectively),
- the Chain-rule challenge (constrained: select correct $f'(g(x))g'(x)$), and
- the Monty-Hall door choice (constrained binary: switch or stay).

> **Partial green flag — and a notable exception.** The Magic tower (`MagicInputPanel`), the Matrix tower's coefficient grid (`MatrixInputPanel`, dead-code variant) and the Calculus tower (function/operator selection) all honour the no-slider rule; the Limit and Monty-Hall paths are constrained multiple-choice. **However, `RadarConfigPanel.vue` uses `<input type="range">` sliders for `arcStart` / `arcEnd` (in 5° steps), affecting all three Radar towers (A/B/C) — i.e. three of seven tower types.** Because Radar arc selection is a *recognition* task ("drag until the green band looks right") rather than a *generation* task, the design's strongest single educational claim has a partial counterexample. The doctrine still holds for the other towers, but should not be presented as a universal invariant.

---

## 4. Learning-Science Foundations

### 4.1 Productive Failure (Kapur, 2008, 2014, 2016)

Kapur's productive-failure (PF) paradigm holds that learners benefit from being asked to generate solutions to problems *before* receiving canonical instruction, even when those initial attempts fail (Kapur, 2008, 2014). The mechanism is twofold: the failed attempt activates relevant prior knowledge and *makes the structure of the canonical solution learnable*, and the affective cost of failure is a precondition for deep encoding (Kapur, 2016).

*Math Defense*'s **Build Phase** is, by construction, a productive-failure environment:

- Manual numeric input forces the learner to commit to a hypothesis (a value of $m$) before seeing whether it works.
- Build allows **unlimited revision**, but each revision requires a fresh inverse-problem step (read the rendered curve, reason backwards to a parameter change). This is the iterative sense-making cycle Kapur (2014) identifies as effective.
- Wave Phase plays the role of "consolidation" in PF: a non-revisable validation of the solution, followed by a return to Build Phase where the structure of *successful* prior attempts can be reused.

The original spec's slogan "allow failure, but every failure has learning value" cites Kapur (2008) directly and is, in our reading, a faithful operationalisation.

> **Risk.** Kapur (2016) is explicit that PF only works when learners are asked to grapple with **the same structural problem** that the canonical instruction will then crystallise. *Math Defense* has no canonical-instruction step: there is no follow-up explanation of *why* the curve worked. Loibl, Roll, and Rummel's (2017) theoretical synthesis argues that PF without consolidation degrades to mere "unproductive failure." Recommend: a brief, optional post-wave overlay surfacing the principle the player just used (e.g. "you used the chain rule: $\frac{d}{dx}f(g(x)) = f'(g(x))g'(x)$, with $g(x) = …$").

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

> **Risk.** The Magic tower lets players choose between polynomial, trigonometric, and logarithmic curve families *and* type coefficients. With Limit/Calculus panels on the same screen, Build-Phase load is high. Sweller et al. (2019) recommend **pre-training** on individual elements before composite tasks. The 1–5 star rating partly serves this function; consider also locking advanced curve families behind early-star achievements.

### 4.3 Desirable Difficulties (Bjork & Bjork, 2011)

Robert and Elizabeth Bjork's *desirable difficulties* framework holds that some kinds of difficulty during learning — variation, spacing, interleaving, and generation — depress short-term performance but improve long-term retention and transfer.

| Desirable difficulty | Math Defense implementation |
|---|---|
| Varied practice | Per-game random function from a level-tagged pool |
| Spacing | Wave intervals + multi-session play |
| Interleaving | Mixed tower types per level rather than blocked single-type levels |
| Generation | Manual numeric input for Magic/Matrix/Calculus; recognition-style sliders on Radar (see §3.2 caveat) |
| Phase-gated re-configuration | The Build → Wave UI gate forces commitment to *one* configuration per wave; effective in practice, though not enforced as a hard domain-level invariant |

A corollary, also emphasised by Bjork and Bjork (2011), is that learners *misjudge* desirable difficulties as bad teaching. Players (and teachers) may rate the random-path system as "unfair." The Teacher Dashboard should therefore surface a brief explanation that randomisation is a learning-effectiveness feature, not a bug.

### 4.4 Retrieval Practice and the Testing Effect

Roediger and Karpicke (2006) showed across multiple experiments that the act of *retrieving* information produces stronger long-term retention than re-studying it. The effect strengthens with delay — the temporal pattern of a multi-wave game.

Mid-wave retrieval events in *Math Defense*:

- **Boss Type-B chain-rule challenge**: WAVE pauses, learner retrieves the chain rule under modest time pressure, resumes WAVE.
- **Limit tower setup**: each placement is a fresh limit problem.
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
| Modality | **Not yet realised** — `assets/audio/` is empty and no audio AssetManager has been landed. The Modality principle (offload some channel from purely-visual presentation) is therefore an opportunity, not a current strength; see §11 (Mayer principles row) for the planned remediation |
| Personalisation | Custom avatars (V2 Phase 5 added 6 preset SVGs) — supports the personalisation-principle motivational gain (Mayer, 2014, social-cues principles) |
| Pre-training | Initial Answer phase functions as pre-training on the wave's path before towers are placed |

### 5.2 Dual Coding Theory

Paivio's (1991) dual-coding theory distinguishes verbal and nonverbal mental representations and predicts that information encoded in *both* channels is retained better than either alone. During Build Phase the parameter panels render the algebraic form (plain-text coefficients in `IntegralPanel` and `MatrixInputPanel`, the operator selector in `CalculusPanel`) alongside a live canvas preview — a textbook verbal+nonverbal pair, although the rich KaTeX typesetting is currently restricted to the Chain-Rule modal (`ChainRulePanel.vue`); see §7.1.2 for the corrected scope of KaTeX use.

### 5.3 Emotional Design in Multimedia

Plass, Heidig, Hayward, Homer, and Um (2014) showed that warm colours, rounded shapes, and human-like features in instructional graphics produce small-to-medium gains on transfer measures (partial η² in the .04–.10 range across their two studies). The pixel-art aesthetic is solidly within Plass et al.'s "engaging without distracting" envelope; the medieval-stone palette is, however, on the cool side, and a modest warming for tutorial levels is a near-zero-cost intervention. (Audio is not yet implemented, so the soundtrack/SFX dimension of emotional design has no current footprint to evaluate.)

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

> **Risk.** Flow requires that *failure* be visible but not punitive enough to break engagement. The current `GAME_OVER → restart` loop has no checkpoint. For star-5 difficulty this risks pushing players out of the flow channel into anxiety. Consider a "wave checkpoint" that lets a star-5 player retry from the last cleared wave with the same talents.

### 6.2 Self-Determination Theory and Player Motivation

Deci and Ryan's (2000) self-determination theory identifies three innate psychological needs whose satisfaction predicts intrinsic motivation: **autonomy**, **competence**, and **relatedness**. Ryan, Rigby, and Przybylski (2006) extended SDT to digital games and showed empirically that the same three needs predict enjoyment and continued play.

| SDT need | Math Defense mechanic |
|---|---|
| Autonomy | Free choice of which towers to build, which talent nodes to allocate, which curve family to use, which Monty-Hall door to switch to |
| Competence | Star rating provides graded challenge; achievements provide explicit competence feedback; the K-formula's S1 (kill efficiency) and S2 (cost efficiency) make competence multidimensional |
| Relatedness | Class system + four leaderboards (Global / Class / Internal / External); teacher-led Class aggregate from V2 Phase 0 |

> **Green flag.** Ryan et al. (2006) report that *meaningful choice* (rather than choice volume) predicts autonomy satisfaction. The talent tree's prerequisite chains (19 nodes across the 7 tower types, gated effects) ensure that each allocation decision has consequences.

> **Risk.** The Global leaderboard is by raw score. SDT (Deci & Ryan, 2000) and the achievement-goal literature (Elliot, 1999) caution that pure social-comparison feedback can shift learners from *mastery goals* to *performance-avoidance goals*. Recommend supplementing with a *personal-best* leaderboard view — self-referential, mastery-oriented climates have been linked in classroom studies (e.g., Ames, 1992) with stronger competence perception and intrinsic motivation than purely social-comparison framing.

### 6.3 ARCS and the MUSIC Model

Keller's (1987) **ARCS** model lists four motivational design dimensions: Attention, Relevance, Confidence, Satisfaction. Jones's (2009) **MUSIC** model proposes a complementary rubric: e**M**powerment, **U**sefulness, **S**uccess, **I**nterest, **C**aring.

| MUSIC dimension | Math Defense surface | Strength |
|---|---|---|
| eMpowerment | Talent tree, free tower placement, Monty-Hall switch | Strong |
| Usefulness | Game does not tell students that the chain rule appears on their actual exam | **Improvable** |
| Success | Star rating choice, achievement progress | Strong |
| Interest | Pixel art + random paths (chiptune audio planned but not yet implemented) | Moderate–Strong |
| Caring | Class system + Teacher Dashboard | Present but passive |

> **High-leverage gap.** A single sentence per tower ("the chain rule appears on the high-school AP Calculus and on Taiwan's college-entrance subject test") would meaningfully raise the *Usefulness* dimension at near-zero cost.

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

> **Risk.** The leaderboard re-introduces evaluative threat for anxious learners. Ramirez et al.'s (2018) work suggests the personal-best view (recommended in §6.2) is especially important for this subgroup.

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

1. **Star rating 1–5** (task-level differentiation, *not* adaptive scaffolding). Star 1 generates one to four segments of degree-1 or degree-2 polynomial only — *not* a horizontal line as the previous draft asserted (`difficulty-defs.ts` type-1 multisets `[1,1] / [1,2] / [2,2] / [1,1,1] / [1,1,1,1]`; degree-1 in `level-generator.ts:136–140` returns an arbitrary slope). Star 4 produces type-7 segmented paths mixing polynomial, trigonometric, and logarithmic families (`['polynomial', 'trigonometric', 'logarithmic']` in `path-group-defs.ts`). Star also scales enemy composition and spawn rate (`wave-generator.ts`): Star 1 = GENERAL only at 1.5–1.0 s intervals; Star 4–5 = HELPER + STRONG + SPLIT + FAST + BOSS_B with 0.8–0.5 s intervals. This is task-level *differentiation*: the player chooses the star up front (`LevelSelectView.vue`) with **no system recommendation based on prior performance**. See §7.1.3 for why this matters for the ZPD claim.

2. **Chain-rule challenge with KaTeX co-presentation** (representational scaffolding, restricted scope). `ChainRulePanel.vue:88,97` renders the composite expression and each candidate answer with KaTeX (`MathDisplay.vue` → `katex.render({ displayMode: true })`). For an above-syllabus mechanic this is the right call: the rich-typeset $f'(g(x))\,g'(x)$ is the textbook representation the learner has not yet internalised. **Correction from the prior draft:** Build-Phase parameter panels (`IntegralPanel`, `MatrixInputPanel`, `FunctionPanel`, `MagicModePanel`, `CalculusPanel`, `LimitQuestionPanel`) display coefficients and operators as plain HTML text — *not* KaTeX. The doctrine "algebraic form alongside rendered curve" still holds in textual form for those panels (still dual-coded per Paivio, 1991, and still spatially-contiguous per Mayer, 2014), but the rich-typeset form previously implied is not present there.

3. **Monty-Hall doors with progressive disclosure** (decision scaffolding). Implemented in `MontyHallSystem.ts` as an n-door variant — `doorCount: 3 | 4 | 5` by star (`monty-hall-defs.ts`), with `revealCount = doorCount − 2` (`MontyHallSystem.ts:120`). For every n the system reveals exactly enough losing doors to leave a binary switch-or-stay decision while preserving the (n−1)/n vs 1/n probability asymmetry. The reveal step is unconditional: `_revealDoor()` fires after every selection, so the visual scaffold never degrades. **Caveat:** `MontyHallPanel.vue` shows only the door count and revealed-door count — there is no in-game textual explanation of the conditional-probability logic. The visual disclosure mirrors the textbook diagram; the verbal half of the textbook explanation is missing, which limits how much the scaffold can transfer to unaided reasoning.

4. **Talent tree — *not* scaffolding (recategorisation).** A code audit of `talent-defs.ts`, `talent_service.py`, and `talentStore.ts` confirms 19 nodes across 7 root nodes (one per tower type), each providing **purely additive, permanent numerical modifiers** — range, attack speed, damage, target count, duration, HP, AoE strength, ramp. The previous draft's example, "early talents reduce the precision required of player input (e.g. larger hit radii)," is not supported: no early talent reduces input precision, no late talent unlocks a new mechanic, and allocations have no fade or removal step (only an all-or-nothing `reset()` in `TalentTreeView.vue`). Wood, Bruner, and Ross (1976) define scaffolding by *gradual removal* of help; this system moves monotonically in the opposite direction. The talent tree is therefore correctly understood as **player-driven progression** in the SDT-autonomy sense (§6.2) and Locke-and-Latham goal-setting sense (§6.4) — both of which it serves well — but classifying it as Vygotskian scaffolding is a category error and has been removed from this section.

#### 7.1.3 Two Standing ZPD Gaps

> **Risk — diagnostic gap.** Vygotskian scaffolding presupposes that someone (the more-capable other) *diagnoses* where the learner is and supplies help "just above" that point. *Math Defense* currently has no such diagnostic: star rating, talent allocation, and curve-family choice are all player-driven, with no system recommendation based on past performance. The S1 / S2 / K telemetry described in §8.1 is the substrate for closing this gap — a Bayesian competency posterior would let the system suggest, e.g., "try Star 3 with Magic-only" to a learner whose prior runs flag a specific weakness — but the measurement layer (Q-matrix declaration, posterior estimator, teacher-facing surface) is not yet built. Until it is, the scaffolds described above are *static differentiation*, not *targeted ZPD support*. Formally tracked as backlog item **§15.3 #28** (adaptive star/talent recommender), conditional on items 7–9 landing first.

> **Risk — fading direction.** Classical scaffolding fades; Vygotsky's whole point is internalisation. *Math Defense* offers no scaffold that fades: Star 1 always renders a Star 1 path; KaTeX is always rendered for the chain-rule modal; talent buffs are monotonic. The §12.6 concrete-fading recommendation (fade explicit y-axis labels on Star 1 paths once IA accuracy crosses a threshold) is the cleanest fade hook the existing telemetry already supports. A second cheap hook: phase out one tier of the Monty-Hall reveal once a player has switched correctly N times in a row, increasing the working-memory demand toward the unaided textbook version of the puzzle.

#### 7.1.4 Summary

The ZPD reading of *Math Defense* survives strongly at the **curricular** layer (§7.1.1, anchored in §12.2) and at three of the four **mechanism** layers previously listed (§7.1.2). The talent tree is recategorised as progression rather than scaffolding. Two structural gaps — no per-learner diagnosis, no fading scaffolds — convert the present implementation from *adaptive ZPD support* into *static differentiated instruction*; both gaps are tractable, and both already have substrate in the codebase (telemetry for the first, see §8.1; concrete-fading hooks for the second, see §12.6).

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
| Modelling | Teacher can play and demonstrate; a replay system would close this loop fully |
| Coaching | Teacher Dashboard sees per-student S1/S2 and can intervene |
| Scaffolding | Star rating differentiation + Monty-Hall reveal + chain-rule KaTeX modal (see §7.1.2; the talent tree is *not* scaffolding — it is progression, see §6.2 / §6.4) |
| Articulation | **Missing** — no in-game prompt to explain a tactic |
| Reflection | Score Result View shows S1/S2/K breakdown |
| Exploration | Free play + talent reset |

> **High-leverage gap.** A simple post-wave textbox ("describe the strategy that worked") would close the apprenticeship cycle. Webb's (1991) classic study of small-group mathematics learning showed that *giving elaborated explanations* is the single peer-talk behaviour most strongly correlated with learning gains — making this the highest-yield single addition for class-mode learning.

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

The 25-achievement structure across six categories (combat, scoring, survival, efficiency, exploration, territory) can be *interpreted* as a coarse **Q-matrix** (Tatsuoka, 1983) — each achievement is implicitly produced by a particular bundle of skills — but the project does not yet declare an explicit Q-matrix mapping. Shute and Ventura (2013) show that competency posteriors estimated from such telemetry can rival traditional tests in reliability while preserving the engagement of gameplay.

> **Recommended use.** Wire the existing telemetry into a Bayesian-network competency estimator and surface its output to a teacher view. The data substrate exists — `record_scoring_context()` (in `application/session_service.py`) records the V2 scoring inputs (kill_value, time_total, time_exclude_prepare, cost_total, health_origin, health_final, initial_answer) — but the *measurement* layer (Q-matrix declaration, Bayesian network, competency posterior, teacher-facing dashboard surfacing per-student S1/S2/competency) is not yet built. Estimate: scoring-evidence capture is in place; ECD competency-model and evidence-model code, and the dedicated teacher dashboard view, remain to be written.

### 8.2 Formative Assessment and the Hattie–Timperley Feedback Model

Black and Wiliam's (1998, 2009) formative-assessment programme synthesised >250 studies and concluded that learning gains from well-designed formative-assessment cycles are among the largest in education research (effect sizes typically *d* > 0.4). Hattie and Timperley (2007) decomposed feedback into three questions: *Where am I going?* (feed-up), *How am I going?* (feed-back), *Where to next?* (feed-forward), and identified four feedback levels (task, process, self-regulation, self).

| H–T question | Level | Math Defense surface |
|---|---|---|
| Feed-up | Task | Star-rating selection screen + IA pre-game prompt |
| Feed-up | Self-regulation | Talent tree shows where future allocations lead |
| Feed-back | Task | Real-time curve preview in Build Phase |
| Feed-back | Process | Score breakdown screen (S1 vs S2 isolates *efficiency* vs *cost-control* skill) |
| Feed-forward | Process | Achievement near-misses ("you killed 9 helpers — kill 1 more for X") |
| Feed-forward | Self-regulation | Personal-best deltas (proposed; see §6.2) |

> **Risk.** Hattie and Timperley (2007) report that *self*-level feedback ("great job!") has the smallest learning effect and can even be detrimental. The achievement-toast UI should keep copy at task or process level ("you maintained ≥80% Magic-tower uptime") and avoid trait praise.

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

The design exercises five of the six Bloom levels (Remember through Evaluate, plus a partial Create at the talent-build-strategy layer). Genuine "Create" — generating a *novel* mathematical object rather than selecting from a predefined set — is currently weak; this is consistent with the design philosophy of avoiding rote arithmetic and the meta-analytic finding by Wouters, van Nimwegen, van Oostendorp, and van der Spek (2013) that serious games produce larger effects on higher-order skills than on declarative recall, but the absence of a strong Create surface is a real gap, not a feature.

### 8.4 Score Validity Infrastructure

The backend re-computes the S1/S2/K formula in `backend/app/domain/scoring/score_calculator.py` (the `recompute_total_score()` pure function) and the application service `backend/app/application/session_service.py::_verify_score()` calls it on every session completion, logging mismatches that exceed a fixed absolute tolerance of `0.0005` (chosen as a 10× safety margin over the frontend's 4-decimal rounding) and **always overwriting the client-submitted `total_score` with the server-recomputed value**. Mathematical validity in *measurement* terms (Messick, 1995) requires that scores actually reflect the construct they claim to measure. For a leaderboard that supplies competence feedback under SDT and that drives talent points, client-side score reporting alone would fail Messick's *substantive* validity check. The server-side mirror is therefore not just an anti-cheating guard — it is the assessment-validity foundation that lets the achievement and talent systems function as legitimate competence signals at all.

---

## 9. Game-Design Lenses

### 9.1 Mechanics–Dynamics–Aesthetics

Hunicke, LeBlanc, and Zubek's (2004) MDA framework decomposes a game into **Mechanics** (rules), **Dynamics** (run-time behaviour), and **Aesthetics** (player-experienced emotion). Designers think mechanics → aesthetics; players experience aesthetics → mechanics. Misalignment is the most common failure mode in serious games.

*Math Defense* MDA layering:

- **Mechanics**: tower placement, parameter input, intersection solver (WASM), DoT/shield/aura systems, scoring formula, Monty-Hall RNG, talent modifiers.
- **Dynamics**: emergent build orders ("Magic + Radar-A combo"), risk/reward in Monty Hall, territory-contestation patterns.
- **Aesthetics** (per the eight aesthetics): *Challenge*, *Discovery* (random paths), *Narrative* (medieval framing), *Expression* (talent build), *Submission* (wave repetition), *Fellowship* (class), *Sensation* (pixel art only — chiptune audio is planned but not yet implemented; `assets/audio/` is currently empty).

The aesthetic of **Challenge** dominates, with *Discovery* second. *Fellowship* and *Expression* are present but underweighted — the missing pieces (peer collaboration, custom-build sharing) align with the gaps identified above.

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

The system does not yet *prompt* teachers to differentiate (e.g. "Student X has 80% S1 but 35% S2 — assign a frugal-run challenge"). This is the same articulation gap as in §7.4.

### 10.3 Server-Side Score Verification as Validity Substrate

Covered above (§8.4). Worth restating in this section: the assessment-validity guarantee that Messick (1995) requires is *infrastructure*, not content; without it, every motivational feature that depends on score (talent, achievements, leaderboards, GT) would fail substantive validity. The project's decision to mirror the formula on the server is therefore load-bearing for the entire pedagogical design, not merely an anti-cheat measure.

### 10.4 Programming-Pedagogy Layer for the Authors

The project is a Programming-II final by three students of different seniorities (大一 / 大二 / 大三, per the spec's §XIV). The architectural ambition (Vue 3 strict TypeScript, FastAPI DDD, ECS engine, C → WASM, Alembic, optimistic locking, Pydantic v2, JWT + bcrypt + TOTP, slowapi rate limiting, role-based middleware, server-side score verification) is, by any reasonable rubric, a *capstone-level* software-engineering syllabus. The pedagogy here is **Vygotskian for the authors**: the senior partitioned the work so each junior operates inside their ZPD with scaffolded interfaces (`Tower` base class, `MathEngine.sectorCoverage()`, `game.on('buildPhaseStart', cb)`).

This satisfies the conditions the cognitive-apprenticeship literature (Collins et al., 1989) lays out for *productive* mixed-skill collaboration:

- Interface contracts are explicit and minimal (modelling step).
- Each contributor's territory is bounded but non-trivial (legitimate peripheral participation à la Lave & Wenger, 1991).
- The senior member commits the architecture *first*, forcing all juniors to learn against a real codebase rather than a toy (Squire's (2006) "designed experience" applied to a CS team).

> **Note.** This dimension belongs in the Report's *reflection* section — both because it is unusual and because it is the part most directly assessable by the course instructor.

---

## 11. Cross-Cutting Audit

| Theme | Strength | Risk | Recommended action |
|---|---|---|---|
| Intrinsic integration | Math is the input, not a quiz gate | IA's score weight is small enough to skip | Re-weight IA or gate star-5 unlock on IA correctness |
| Generation | Manual numeric input on Magic / Matrix-coefficient / Calculus / Limit / Chain-rule / Monty-Hall | **All three Radar towers (A/B/C) already use sliders** for arc selection — partial counterexample to the doctrine | Replace Radar sliders with typed-degree inputs, or accept Radar as recognition-mode and keep the doctrine for the other towers |
| Productive failure | Build-phase iteration is structurally PF | No consolidation/explanation step | Add post-wave principle-surfacing overlay |
| Cognitive load | Phase segmentation + UI-pause exclusion | Magic tower combines 3 curve families at once | Gate curve-family unlock by talent or star |
| Desirable difficulties | Random path + locked-after-build | Players misread randomness as unfairness | Surface explanation in Teacher Dashboard |
| Retrieval | Chain-rule challenge mid-wave | Only one retrieval task type | Add Limit-tower retrieval prompts at higher stars |
| Variation / transfer | Random path pool from level-tagged set | Boss patterns may become memorisable | Randomise boss ability triggers within wave |
| Mayer principles | Spatial contiguity + signalling honoured | Audio is currently optional/missing | Land Phase 5 audio AssetManager |
| Flow | Wave flow is uninterrupted | No checkpoint; loss restarts level | Wave-checkpoint for star-5 |
| SDT | Talent-tree autonomy + class relatedness | Leaderboard pushes performance-avoidance | Add personal-best view |
| MUSIC – Usefulness | All other dimensions strong | No real-world hook | One-line "where you'll meet this on the exam" per tower |
| Stealth assessment | All ECD substrate present | Not yet surfaced as competency estimates | Bayesian competency estimator → Teacher Dashboard |
| ZPD (curricular) | Above-syllabus towers (Limit / Calculus / Chain-rule) place the hardest content in the learner's ZPD — the design's strongest Vygotskian claim | Mechanism-level scaffolds are static (no diagnosis, no fading) | Wire stealth-assessment posterior (§8.1) into a star/talent recommender; add fade hooks per §7.1.3 |
| Cognitive apprenticeship | 5 of 6 steps present | Articulation step missing | Post-wave free-text strategy prompt |
| Bloom coverage | All six levels exercised | "Create" only at Calculus tower | Allow custom achievements / class-built waves |

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

| Disability area | Current state | Mitigation cost |
|---|---|---|
| Color-blindness (~8% of male players) | Tower colours encode type; no patterns | Low (add icon overlays) |
| Screen reader | Canvas-rendered game state is opaque to assistive tech | High (out of scope for a final, but a brief acknowledgement is owed) |
| Dyscalculia | Manual input is high-cost for this group | Medium (a slider-fallback toggle that visibly disables leaderboard eligibility) |
| Motor impairment | Mouse-only tower placement | Medium (keyboard navigation of grid intersections) |

W3C WCAG 2.2 (W3C, 2023) Level AA is the minimum a published serious-learning artefact should support. The project would currently fail several AA criteria.

### 12.4 Single-Player Only

Slavin's (2014) review, summarising decades of meta-analytic evidence on cooperative learning (typical effect sizes around *d* ≈ 0.25–0.40 across hundreds of studies), shows reliable transfer gains for *structured* peer cooperation. *Math Defense* has all the *technical* substrate (class system, real-time score sync) for a co-op mode where two students share a Build Phase but does not use it. A "Build-Phase Pair" mode where one student types parameters while the other reads the rendered curve is a 2-week add that would unlock a substantial body of cooperative-learning literature.

### 12.5 Long-Horizon Engagement

Hamari et al. (2014) and Connolly et al. (2012) both flag *novelty effects* as the dominant threat to gamified-learning evidence. After a semester of *Math Defense* a student has unlocked all 25 achievements and probably most of the 19 talent nodes. Recommended mitigations:

- **Seasonal achievement sets** rotated by the teacher (low-cost; backend already supports definition registries).
- **Generative challenge mode**: a teacher specifies constraints ("only Magic towers, $b \in [0,2]$") and the system generates derivative challenges.
- **Replay/spectate** to seed apprenticeship modelling.

### 12.6 Equity and the Matthew Effect

Stanovich's (1986) Matthew-effect mechanism predicts that learners with stronger graph-reading fluency benefit *more* from any graph-rich environment, widening achievement gaps. Random function paths are a *desirable difficulty* for fluent readers but may be a *prohibitive* one for dis-fluent readers. Concrete-fading (Goldstone & Son, 2005) prescribes the mitigation: in early Star-1 sessions, render the path with explicit y-value labels on a discrete grid; fade these labels as the player's IA accuracy improves. The system already tracks IA correctness, so the trigger is in hand.

### 12.7 Other Standing Threats

1. **Affective interference** — Plass et al. (2015) and Wouters et al. (2013) note that high-stakes scoring can crowd out learning. *Math Defense*'s S1/S2/K formula is publicly displayed and tied to leaderboards; under cognitive load, players may default to memorised "build orders" rather than reasoning. The random function path is the principal mitigation.
2. **Productive failure without consolidation** (Loibl, Roll, & Rummel, 2017) — see §4.1.
3. **Selection bias in playtesting** — empirical claims should be hedged. Existing meta-analyses on serious games (Clark, Tanner-Smith, & Killingsworth, 2016; Sitzmann, 2011; Vogel et al., 2006) report moderate effect sizes (roughly *g* ≈ 0.30–0.50) with substantial heterogeneity, and the small body of work specifically on mathematics learning in tower-defense games (Hernández-Sabaté, Joanpere, Gorgorió, & Albarracín, 2015) is encouraging but exploratory.

---

## 13. Empirical-Validity Plan

A minimum defensible evaluation, drawn from design-based-research practice (Anderson & Shattuck, 2012):

1. **Pre/post knowledge probe** (10 items) drawn from the Taiwan high-school subject-test bank, covering the seven concept areas. Items target the *deep structure* the design claims to teach, not the surface form a player would memorise.
2. **Dosage tracking** via the existing `time_exclude_prepare[]` field, summing only productive-time buckets per student.
3. **Comparison group** — the same students on a non-game intervention of equal duration (e.g. textbook practice on the same item bank).
4. **Transfer measure** at one-week delay (Barnett & Ceci, 2002), with surface features re-randomised so memorised exemplars do not transfer.
5. **Affective measures** — short Likert scales for math anxiety (Ashcraft, 2002) and intrinsic motivation (Ryan et al., 2006) at pre and post.
6. **Sample size** — even *N* = 20 per group is enough to cross the threshold from "theoretically aligned" to "empirically defensible" for a course final.

Without this, every theory citation in this document is hypothesis, not evidence.

---

## 14. Conclusion — Highest-Leverage Refinements

*Math Defense* is, at the level of design intent, a strong implementation of intrinsic integration (Habgood & Ainsworth, 2011) layered with productive failure (Kapur, 2008, 2016), generation (Slamecka & Graf, 1978; with the Radar-slider exception noted in §3.2), variation-theoretic random instances (Marton, 2015), CLT-respecting phase segmentation (Sweller et al., 2019), SDT-aligned progression (Ryan et al., 2006), and the *scoring-evidence* substrate that an ECD-style stealth assessment (Shute & Ventura, 2013) would need as input. The teacher-curated Grabbing Territory mode realises bounded social comparison and three of the six cognitive-apprenticeship steps. Above all of these sits the design's **curricular ZPD** (§7.1.1, Vygotsky, 1978; Plass, Homer, & Kinzer, 2015): three of the seven tower types and the Boss Type-B challenge place the hardest mathematics *deliberately* beyond the audience's unaided reach — making the design Vygotskian by content selection, not merely by mechanism.

The five highest-leverage refinements identified in this analysis are, in priority order:

1. **Build the stealth-assessment measurement layer and surface it to a teacher view** (§8.1). The *evidence capture* (`record_scoring_context()`) is in place; the Q-matrix declaration, Bayesian competency model, and teacher-facing per-student dashboard all still need to be written.
2. **Add an articulation channel** — a post-wave free-text "describe your strategy" prompt (§7.4). Closes the cognitive-apprenticeship cycle and unlocks the peer-explanation evidence base (Webb, 1991).
3. **Run a minimum empirical-validity probe** (§13). Without it, every theoretical claim above is aspirational.
4. **Add a personal-best leaderboard view** (§6.2). Reduces performance-goal orientation and helps math-anxious learners (Ramirez et al., 2018).
5. **Add a post-wave principle-surfacing overlay** (§4.1). Converts productive failure into productive learning (Loibl et al., 2017).

Two further low-cost refinements are worth bundling:

- **Gate star-5 difficulty on IA correctness** to close the only known loophole around intrinsic integration (Habgood & Ainsworth, 2011).
- **Add one "you'll meet this on the exam" sentence per tower** to raise the *Usefulness* dimension of the MUSIC model (Jones, 2009).

Once items 1 (measurement layer) and the recommended bundle (§15.10) are in place, the natural Phase-2 follow-on is **§15.3 #28 — an adaptive star/talent recommender** that consumes the competency posterior to close §7.1.3's diagnostic-ZPD gap. This converts the present implementation from *static differentiated instruction* into *targeted ZPD support* without giving up the curricular-ZPD claim that makes the design Vygotskian to begin with.

None of these requires re-architecting the V2 Phase 5/6 system; all are tractable in a single sprint or as a concurrent measurement study.

---

## 15. Potentially Valuable Changes (Pedagogical Backlog)

This section consolidates every "not-yet-done but pedagogically defensible" addition surfaced in §§3–13 into a single backlog. Items are grouped by the learning function they serve, then ranked **High / Medium / Low leverage** based on (a) the strength of the empirical literature behind the underlying principle and (b) how exposed the current design is to the failure mode the change addresses. **Cost** is a rough engineering estimate (S = ≤ 1 day, M = ≤ 1 sprint, L = multi-sprint). All items are *additive* — none requires re-architecting V2 Phase 5/6.

### 15.1 Closing the Productive-Failure Loop

| # | Change | Theory | Leverage | Cost | Source |
|---|---|---|---|---|---|
| 1 | **Post-wave principle-surfacing overlay** — a brief, optional card after each wave that names the principle the player just used ("you used the chain rule: …, with $g(x)=\dots$"). Converts productive failure into *productive* learning rather than unproductive failure. | Kapur (2014, 2016); Loibl et al. (2017) | **High** | S | §4.1 |
| 2 | **Articulation prompt** — a post-wave free-text box ("describe the strategy that worked"). Optional; teacher-visible. Closes the missing 4th step of cognitive apprenticeship and unlocks Webb's "elaborated explanations" effect — the single highest-yield peer-talk behaviour for math learning gains. | Collins et al. (1989); Webb (1991) | **High** | S–M | §7.4, §10.2 |
| 3 | **Limit-tower retrieval prompt at higher stars** — at Star ≥ 4, ask the player to *type* the limit value instead of multiple-choice, before the tower fires its first effect. Diversifies the retrieval task type so retrieval practice does not all collapse to "chain-rule challenge." | Roediger & Karpicke (2006); Karpicke & Roediger (2007) | Medium | S | §11 |

### 15.2 Restoring the Generation-Effect Doctrine

| # | Change | Theory | Leverage | Cost | Source |
|---|---|---|---|---|---|
| 4 | **Replace Radar A/B/C arc sliders with typed-degree inputs** (e.g., two number fields snapping to the existing 5° grid). Currently three of seven tower types violate the no-slider doctrine, converting *generation* into *recognition* on the most-used towers. Either replace, or accept Radar as recognition-mode and stop claiming the doctrine is universal. | Slamecka & Graf (1978); Bertsch et al. (2007) | **High** | S | §3.2, §11 |
| 5 | **Gate star-5 unlock on IA correctness** — require ≥ 1 correct Initial-Answer pick to unlock star-5 difficulty. Closes the only known loophole around intrinsic integration (right now IA is bypassable for a small score penalty). | Habgood & Ainsworth (2011) | **High** | S | §3.1, §14 |
| 6 | **Curve-family unlock by talent or early-star achievement** — Magic tower currently exposes polynomial / trig / log on Build-Phase load 1; CLT pre-training principle recommends unlocking advanced families only after success with simpler ones. | Sweller et al. (2019) | Medium | S–M | §4.2 |

### 15.3 Building the Stealth-Assessment Measurement Layer

| # | Change | Theory | Leverage | Cost | Source |
|---|---|---|---|---|---|
| 7 | **Declare an explicit Q-matrix** mapping each of the 25 achievements (and Limit / Calculus / Chain-rule events) to the seven tower-type competencies. Today the Q-structure is implicit. | Tatsuoka (1983); Mislevy et al. (2003) | **High** | M | §8.1 |
| 8 | **Bayesian competency estimator** consuming `record_scoring_context()` evidence. The data substrate exists; the measurement layer does not. Even a simple Beta-binomial per competency would suffice for a course final. | Shute & Ventura (2013) | **High** | M | §8.1 |
| 9 | **Teacher dashboard view surfacing per-student competency posteriors** with prompts like *"Student X has 80% S1 but 35% S2 — assign a frugal-run challenge."* Makes the differentiated-instruction infrastructure of §10.2 actually *prompt* differentiation. | Tomlinson (2014); Hattie & Timperley (2007) | **High** | M | §8.1, §10.2 |
| 28 | **Adaptive star / talent recommender driven by the competency posterior** — once items 7–9 are in place, surface a per-learner steer at the two existing self-selection surfaces: in `LevelSelectView`, suggest a star band ("your Magic-tower posterior is 0.78 — try Star 4"); in `TalentTreeView`, surface a single highlighted node tied to the lowest-posterior competency. Closes the §7.1.3 *diagnostic* ZPD gap: today the player picks both star and talent without any data-driven steer, so above-grade content can land *below* or *above* the player's actual ZPD. Vygotsky's ZPD is relative to the learner, not the curriculum — a recommender is what converts above-grade *availability* into per-learner *adaptivity*. Optional / dismissible to preserve learner autonomy (SDT). | Vygotsky (1978); Shute & Ventura (2013); Tomlinson (2014) | **High** | M | §7.1.3, §11 |

### 15.4 Motivation, Affect, and Anxiety

| # | Change | Theory | Leverage | Cost | Source |
|---|---|---|---|---|---|
| 10 | **Personal-best leaderboard view** — toggle on the existing four leaderboards. Shifts mastery-anxious learners from social-comparison to self-referential framing. Especially load-bearing for math-anxious students. | Ames (1992); Ramirez et al. (2018); Ryan et al. (2006) | **High** | S | §6.2, §6.6 |
| 11 | **One-line "you'll meet this on the exam" per tower** — a single sentence in the tower-pick UI: e.g. *"The chain rule appears on the AP Calculus AB exam and on Taiwan's General Scholastic Ability Test (學測), Math B paper."* Raises MUSIC's *Usefulness* dimension at near-zero cost. | Jones (2009); Keller (1987) | **High** | S | §6.3, §14 |
| 12 | **Wave checkpoint for star-5** — let a star-5 player retry from the last cleared wave with the same talents intact. The current `GAME_OVER → restart` loop pushes high-difficulty players out of the flow channel into anxiety. | Csikszentmihalyi (1990); Sweetser & Wyeth (2005) | Medium | M | §6.1 |
| 13 | **Achievement-toast copy audit** — restrict copy to task or process level ("you maintained ≥ 80% Magic-tower uptime"). Avoid trait/self praise ("amazing!"), which Hattie & Timperley find has the smallest learning effect and can be detrimental. | Hattie & Timperley (2007) | Medium | S | §8.2 |
| 14 | **Teacher Dashboard explainer for randomisation** — surface a one-paragraph explanation that random function paths are a learning-effectiveness feature, not a bug. Bjork & Bjork explicitly note learners and teachers misjudge desirable difficulties as bad teaching. | Bjork & Bjork (2011) | Low–Medium | S | §4.3 |

### 15.5 Multimedia and Modality

| # | Change | Theory | Leverage | Cost | Source |
|---|---|---|---|---|---|
| 15 | **Land Phase 5 audio AssetManager** — no audio assets currently ship with the frontend (no `assets/audio/` tree under `frontend/src`, no `.mp3`/`.wav` files outside the `emsdk` dependency). Even a minimal SFX set (cast-spell, kill, wave-end, Monty-Hall reveal) would activate Mayer's Modality principle and Plass's emotional-design dimension. | Mayer (2014); Plass et al. (2014) | Medium | M | §5.1, §5.3, §9.1, §11 |
| 16 | **Tutorial-level palette warming** — modest hue shift on Star-1 only. Plass et al.'s emotional-design effect is small-to-medium and engineering cost is near zero. | Plass et al. (2014) | Low | S | §5.3 |

### 15.6 Equity, Accessibility, and the Matthew Effect

| # | Change | Theory | Leverage | Cost | Source |
|---|---|---|---|---|---|
| 17 | **Concrete-fading on path rendering** — at Star-1, render the path with explicit y-value labels on a discrete grid; fade as the player's IA accuracy crosses a threshold. The IA telemetry already exists; only the renderer trigger is missing. Mitigates the Matthew effect for graph-dis-fluent readers. | Goldstone & Son (2005); Stanovich (1986) | **High** | M | §12.6 |
| 18 | **Color-blind icon overlays on towers** — currently colour alone encodes type. ~ 8 % of male players cannot disambiguate cleanly. WCAG 2.2 SC 1.4.1 ("Use of Color"). | W3C (2023) | Medium | S | §12.3 |
| 19 | **Keyboard navigation of grid intersections** — mouse-only placement currently excludes motor-impaired players. WCAG 2.2 SC 2.1.1 ("Keyboard"). | W3C (2023) | Medium | M | §12.3 |
| 20 | **Slider-fallback toggle for dyscalculic and high-anxiety learners** — opt-in, with a visible badge that disables leaderboard eligibility (preserves assessment validity per §8.4). For the dyscalculic the slider lowers numeric-input cost (an accessibility argument, WCAG 2.2 *Adaptable* family); for high-anxiety learners it lowers working-memory load on input under evaluative pressure — Ashcraft & Krause (2007) document precisely this working-memory deficit on demanding math tasks. | Ashcraft & Krause (2007); W3C (2023) | Low–Medium | M | §12.3 |
| 21 | **Brief accessibility statement in `/about`** — acknowledges current Canvas-rendering limits for screen readers. Cheap honesty; the W3C's WCAG 2.2 *Understanding* documents endorse declared limits over silent failure. | W3C (2023) | Low | S | §12.3 |

### 15.7 Long-Horizon Engagement (Anti-Novelty-Effect)

| # | Change | Theory | Leverage | Cost | Source |
|---|---|---|---|---|---|
| 22 | **Seasonal achievement sets** — teacher- or admin-rotatable. The backend already has a definition registry pattern; this is mostly a UI + admin surface. Directly addresses the dominant threat to gamified-learning evidence. | Hamari et al. (2014); Connolly et al. (2012) | **High** | M | §12.5 |
| 23 | **Generative challenge mode** — teacher specifies constraints ("only Magic towers, $b \in [0,2]$, no Calculus pets") and the system generates derivative challenges. Combines Bloom-Create (the design's weakest level) with teacher curation. | Anderson & Krathwohl (2001); Plass et al. (2015) | **High** | L | §8.3, §12.5 |
| 24 | **Replay / spectate mode** — record a session's input + RNG-seed stream and replay it deterministically. The runtime already routes state changes through an event bus, which lowers the cost relative to a non-event-driven engine, but a true event-sourced log (persisted, replayable from any point) is *not* in place today and would still need building. Closes the *modelling* step of cognitive apprenticeship and seeds Lave & Wenger's legitimate peripheral participation in Grabbing Territory. | Collins et al. (1989); Lave & Wenger (1991); Squire (2006) | Medium | L | §7.4, §12.5 |
| 25 | **Boss-ability trigger randomisation within a wave** — currently boss patterns risk becoming memorisable. Randomising trigger thresholds preserves the variation-theoretic invariant (boss *type*) while varying the surface (trigger timing). | Marton (2015); Barnett & Ceci (2002) | Medium | S | §11 |

### 15.8 Cooperative Learning

| # | Change | Theory | Leverage | Cost | Source |
|---|---|---|---|---|---|
| 26 | **Build-Phase Pair mode** — two students share a Build Phase: one types parameters, the other reads the rendered curve; roles swap each wave. The class membership + per-class leaderboard substrate exists, but real-time multiplayer state sync is **not** in place today and would need to be added (WebSocket or Server-Sent Events on top of the existing FastAPI surface). Unlocks the cooperative-learning literature (Slavin reports *d* ≈ 0.25–0.40). | Slavin (2014); Webb (1991) | **High** | L | §12.4 |

### 15.9 Empirical Validity (Restated for Completeness)

| # | Change | Theory | Leverage | Cost | Source |
|---|---|---|---|---|---|
| 27 | **Run the §13 minimum probe** — pre/post knowledge probe + dosage tracking + comparison group + 1-week-delayed transfer + Likert affect measures, *N* = 20/group. Without this, every theory citation in this document is hypothesis, not evidence. | Anderson & Shattuck (2012); Barnett & Ceci (2002) | **High** | M (study design) | §13 |

### 15.10 Recommended Bundling

For a single-semester capstone push, the highest combined-leverage bundle is items **1, 2, 4, 5, 7–11, 17, 22, 27**. Together they:

- close the productive-failure loop (1) and the cognitive-apprenticeship cycle (2),
- restore the generation-effect doctrine on Radar (4) and seal the IA loophole (5),
- promote the existing telemetry into a real measurement layer (7–9),
- add the two cheapest motivation-and-anxiety wins (10, 11),
- mitigate the Matthew effect via concrete-fading (17),
- protect against novelty-effect decay (22), and
- produce the empirical evidence the analysis would otherwise lack (27).

Item **28** (adaptive star/talent recommender) is the natural extension *after* items 7–9 land — it converts the competency posterior into a learner-facing steer and closes §7.1.3's diagnostic-ZPD gap. List it as a Phase-2 follow-on rather than part of the first bundle, since it has 7–9 as hard prerequisites.

Items 4, 5, 10, 11, 17 are individually small (S–M) and together would land in a single sprint while shifting the design from *theoretically aligned* toward *empirically defensible*. Items 23, 24, 26 are the high-payoff multi-sprint bets; they are listed for completeness but are likely out of scope for a Programming-II final.

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
