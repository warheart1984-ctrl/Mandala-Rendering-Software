Governed State Spaces

E₈ as a Reference Geometry under Constitutional Neutrality

Jon Halstead

Project Infinity — AAIS / Mythar Root Systems, Grayling, Michigan

Working Paper — Architectural Note

June 2026

Abstract

This note proposes a design principle for constitutionally governed AI runtimes: governance should not rely solely on prohibition, but should organize the underlying state space so that constitutionally valid executions are structurally stable, while invalid executions become geometrically difficult, detectable, or costly to reach. We use the E₈ lattice — the unique even unimodular lattice in eight dimensions, optimal for sphere packing and rich in symmetry — as a worked reference geometry illustrating the principle. We are explicit that E₈ is offered as an optional mathematical reference model, not a constitutional dependency, under a Constitutional Neutrality Principle: no mathematical structure is constitutionally privileged. We outline a four-layer architectural separation — constitutional, mathematical, implementation, and infrastructure — and, within the constitutional and mathematical layers, a further three-part separation between Constitutional State Space (legal meaning), State Geometry (reachability), and Governance Dynamics (preference). We close with a worked sketch of a governed state lattice for an agentic microkernel and the resulting end-to-end execution flow from constitution to evidence corpus.

Table of Contents

1. Introduction

Most governance schemes for autonomous or semi-autonomous systems are built from prohibitions: a list of disallowed actions, checked at runtime. Prohibition lists are necessary, but they are not sufficient on their own — they grow without bound, they lag novel failure modes, and they leave the legal region of the state space unstructured, which means there is no inherent pressure pushing the system toward stable, compliant behavior. This note explores an alternative framing: instead of only forbidding bad states, organize the geometry of the state space itself so that good behavior is the path of least resistance and bad behavior is structurally awkward.

We use the E₈ lattice as a concrete illustration of what such a geometry can look like, because it is one of the most thoroughly characterized highly symmetric structures in mathematics. The use of E₈ here is deliberately scoped: it is a worked example of the design principle, not a claim that E₈ itself must appear inside any real governance runtime.

2. The E₈ Lattice: What Is Established

E₈ is an eight-dimensional, even, unimodular lattice; it is the unique lattice of its kind in eight dimensions. It is also the root lattice of the E₈ Lie algebra, one of the most symmetric structures known to mathematics. The following properties are well established and form the basis of everything that follows:

Optimal sphere packing. Viazovska's 2016 proof established that E₈ gives the densest possible sphere packing in eight dimensions.

240 minimal root vectors. The E₈ root system provides a maximally uniform, highly symmetric set of directions.

Universal energy optimality. E₈ minimizes a broad class of energy functionals among configurations in ℝ⁸, making it a natural reference for energy-minimizing arrangements.

Clean harmonic structure. Because E₈ is even and unimodular, it supports unusually clean theta-function and Fourier structures, which is why it recurs in string theory, conformal field theory, and sphere-packing theory.

A caution on scope: these properties are specific to E₈ and to the families of problems (sphere packing, certain energy functionals) where its optimality has been proven. They do not imply that arbitrary wave systems, cognitive systems, or governance systems "naturally converge" to E₈, and this note makes no such claim. E₈ is used below as an existence proof — evidence that highly symmetric, constrained geometries with these properties exist and are well understood — not as a universal attractor.

3. Constitutional Neutrality and the Four-Layer Separation

A constitutional runtime must remain durable across changes in its mathematical implementation, its engineering, and its underlying infrastructure. Infinity's Constitution defines normative truth, evidence requirements, replay, execution equivalence, and conformance — it establishes how governed systems demonstrate correctness and how independent implementations validate their behavior. It does not prescribe any specific mathematical model, geometry, optimization method, or implementation. These belong to interchangeable reference models, evaluated strictly through evidence and conformance. This is the Constitutional Neutrality Principle, and it is what allows the Constitution to remain stable while the layers beneath it evolve freely.

3.1 Constitutional Layer (Normative Layer)

Defines legal states, invariants, admissibility, execution equivalence, conformance, evidence requirements, and replay standards. This layer is mathematically neutral and implementation-independent — it is the anchor of the entire system. It is validated through a canonical evidentiary chain:

Constitution → Evidence → Replay → Execution Equivalence → Conformance → Independent Implementations

This chain ensures governed behavior is validated empirically (not asserted), is replayable, can be compared across independent implementations via execution equivalence, and is judged against constitutional invariants rather than implementation details.

3.2 Mathematical Layer (Reference Models)

Explores candidate geometries for organizing governed state spaces, including E₈ and other lattices, graphs and hypergraphs, manifolds, category-theoretic models, simplicial complexes, and future mathematical frameworks. These models are interchangeable. They are evaluated solely through evidence, replay, execution equivalence, and conformance — no mathematical structure is constitutionally privileged.

3.3 Implementation Layer (Engineering Layer)

Realizes mathematical models as runtimes, microkernels, schedulers, policy engines, invariant engines, pattern ledgers, execution systems, and evidence systems. Multiple independent implementations can coexist, each validated through constitutional replay and equivalence.

3.4 Infrastructure Layer (Execution Substrate)

Provides the physical and software environment — models (local or cloud), GPUs/TPUs, inference runtimes, container or virtualization layers, and cloud or local deployment. This layer is fully replaceable and has no constitutional significance.

CONSTITUTIONAL LAYER (Normative)

Legal states · Invariants · Admissibility · Evidence Requirements · Replay · Execution Equivalence · Conformance

MATHEMATICAL LAYER (Reference Models)

Lattices (E₈, Leech, Aₙ, Dₙ) · Manifolds · Graphs / Hypergraphs · Simplicial Complexes · Category-Theoretic Models

IMPLEMENTATION LAYER (Engineering)

Runtimes · Microkernels · Schedulers · Policy Engines · Invariant Engines · Pattern Ledgers · Evidence Systems

INFRASTRUCTURE LAYER (Execution Substrate)

Models (local / cloud) · GPUs / TPUs · Inference Runtimes · Container / VM Layers · Cloud or Local Deployment

3.5 Architectural Rule: No Mathematical Structure Is Constitutionally Privileged

E₈ is a reference model because it demonstrates desirable properties — symmetry, constraint, stability — not because the Constitution requires it. Any future model that produces equal or better constitutional guarantees under replay, execution equivalence, conformance, and independent validation can replace it. This rule keeps the architecture evidence-driven, implementation-independent, mathematically flexible, founder-independent, and durable across decades of research evolution.

3.6 Constitutional Empiricism

Section 3.5 establishes that no mathematical structure is constitutionally privileged. This subsection states the principle that follows from it, and distinguishes normative truth from empirical success: the Constitution defines what must be true, what evidence is required, how replay is performed, how execution equivalence is evaluated, and how conformance is judged. It does not define which mathematical model is best — that is an empirical question, answered by evidence, not a normative one settled by the Constitution itself.

Constitutional Empiricism: reference models, mathematical structures, optimization methods, and implementation strategies are adopted, retained, or replaced only on the basis of reproducible evidence, execution equivalence, conformance results, and independent validation.

Constitutional Empiricism is what makes the architecture self-improving without making the Constitution itself unstable: the normative layer never changes to accommodate a new mathematical fashion, while the mathematical and implementation layers beneath it are free — indeed required — to change whenever evidence supports a better candidate.

4. Constitutional, Geometric, and Dynamic Separation

Within the constitutional and mathematical layers, three further concepts must be kept distinct and never conflated: the legal meaning of a state, the geometry that determines what is reachable from it, and the dynamics that determine what is preferred.

4.1 Constitutional State Space

The Constitutional State Space defines the legal variables describing an agent's governed condition — trust, authority, jurisdiction, risk, capability, sensitivity, admissibility, provenance, evidence status, and similar coordinates. These do not represent physics or mathematics; they represent constitutional meaning. They are defined entirely by the Constitution and remain stable across all implementations.

4.2 State Geometry

The State Geometry defines how constitutional states relate to one another — adjacency, neighborhoods, reachability, transition rules, distance metrics, and structural constraints. This geometry is not constitutionally mandated; it is an implementation choice. E₈ is a reference geometry because it demonstrates desirable properties — symmetry, constraint, structured neighborhoods — not because the Constitution requires it. The Constitution defines legality; geometry defines reachability.

4.3 Governance Dynamics

The Governance Dynamics define how transitions are evaluated and enforced — governance cost, transition costs, scheduling preferences, throttling, approvals, invariant enforcement, constitutional admissibility, anomaly detection, and escalation requirements. This is not a physical energy function; it is a constitutional desirability function. Low governance cost is naturally preferred by the scheduler; high governance cost requires additional evidence, authorization, or is inadmissible. Governance dynamics define preference; the runtime enforces transitions.

5. Execution Flow

Combining the four-layer separation (Section 3) with the constitutional/geometric/dynamic separation (Section 4) yields a single, layered execution flow, with the Constitution as anchor and geometry, dynamics, and implementation free to evolve independently beneath it:

Constitution

Legal State Definition (Constitutional State Space)

State Geometry (Reachability Structure)

Allowed Transition Graph

Governance Dynamics (Costs, Preferences, Enforcement)

Runtime Execution

Execution Evidence

Replay

Execution Equivalence

Conformance

Independent Implementations

Evidence Corpus

Distilled: the Constitution defines legality. Geometry defines reachability. Governance dynamics define preference. Runtime enforces transitions. Evidence proves what happened. Replay reconstructs it. Execution Equivalence evaluates it. Conformance judges it. The Constitution governs. Mathematics organizes. Implementations execute. Infrastructure deploys. Evidence connects every layer through replay, execution equivalence, conformance, and independent validation.

6. Governed State Spaces: Design Principles

The principle this note carries forward is independent of any specific geometry:

Governance should not rely only on prohibitions. It should organize the state space so constitutionally valid executions are naturally stable, while invalid executions become structurally difficult, detectable, or costly to realize.

Constitutionally valid states should be stable. Legal states form a basin of stability; transitions within the basin should be low-cost, predictable, and easy to verify.

Invalid states should be structurally hard to reach. Violations should be geometrically distant, topologically isolated, or reachable only through high-cost transitions — not merely forbidden by a rule that must be checked.

Transitions must be governed. Every action — tool call, plan step, IPC message — induces a state transition that must be admissible, replayable, and verifiable against constitutional invariants.

Geometry should support governance. The chosen mathematical structure should make invariants easy to encode, violations easy to detect, and conformance easy to verify.

Evidence anchors everything. The geometry is an implementation choice; the constitution is the guarantee, and it remains grounded in execution evidence, replay, equivalence, and conformance.

7. Why Lattices Are a Useful Class of Geometry for Governance

Lattices combine discreteness, structure, and symmetry in ways that map cleanly onto constitutional reasoning:

Discreteness — lattices quantize the state space, making admissibility discrete, transitions enumerable, and violations detectable.

Structured neighborhoods — every lattice point has well-defined neighbors, letting the constitution define legal, guarded, and forbidden transitions explicitly.

Symmetry — highly symmetric lattices (E₈, Leech, Dₙ, Aₙ) reduce edge cases, degenerate pockets, and unpredictable behavior.

Constraint encoding — parity, modular, and root-system constraints map naturally onto governance rules (e.g., “no unilateral escalation without a compensating control”).

Replaceability — lattices are one option among several; graphs, manifolds, and simplicial complexes can serve the same role under the same constitution.

8. Worked Sketch: A Governed State Lattice for an Agentic Microkernel

To make the principle concrete, this section sketches — at the level of an architectural illustration, not a specification — how an E₈-style geometry could shape the governed state space of an agentic microkernel, applying the Constitutional State Space / State Geometry / Governance Dynamics separation from Section 4.

8.1 Constitutional State Space

Each running agent occupies a governed state vector s ∈ S, built from policy coordinates (compliance level, trust tier, data jurisdiction), behavioral coordinates (tool usage profile, risk score, anomaly metrics), and context coordinates (tenant, cost budget, task sensitivity). These coordinates carry constitutional meaning, not mathematical content.

8.2 State Geometry: A Lattice of Legal States

Rather than allowing an agent to occupy any point in S, a lattice Λ ⊂ S of legal governed states is imposed as a reachability structure — an implementation choice, not a constitutional one. Governance becomes discrete rather than continuous: neighboring lattice points differ by controlled deltas (e.g., “trust tier +1”), and some coordinates obey parity or sum rules in the style of E₈’s evenness condition.

8.3 Governance Dynamics: A Governance Cost Function Over the Lattice

A governance cost functional G: Λ → ℝ assigns low cost to compliant, low-risk, in-budget, approved-tool states, and high cost to repeated anomalies, jurisdiction violations, unjustified cost escalation, or untrusted tool invocation. This is a constitutional desirability function, not a physical energy — it encodes scheduling preference, throttling, and approval requirements, not a law of physics. The scheduler and invariant engine prefer low-cost transitions and require additional authorization, or forbid outright, any transition that raises cost above a threshold; this is the governance-space analogue of E₈’s universal energy optimality, used here only as a structural illustration.

8.4 Transitions as Lattice Moves

Every action induces a transition sₜ → sₜ₊₁ within Λ. The microkernel enforces local moves only (bounded coordinate deltas), guarded edges (transitions requiring explicit approval, e.g. a trust-tier increase), and forbidden edges (transitions absent from the graph entirely, e.g. low trust → high-risk tool).

8.5 Root-System Analogue: Primitive Governance Moves

A small set of primitive governance moves — analogous to E₈’s 240 root vectors — can be defined, such as (+1 trust, −1 risk), (+1 cost, +1 justification), or (+1 sensitivity, +1 guardrail strictness). Requiring all allowed transitions to be integer combinations of these primitives keeps the transition graph auditable.

8.6 Microkernel Integration

Scheduler — schedules on governance cost as well as compute cost; high-cost states are throttled or sandboxed, low-cost states get priority.

Memory / context pager — long-term memory is tagged with lattice coordinates; high-risk memories require stricter, more guarded access paths.

IPC — messages carry state deltas; the kernel validates that no agent can push another into an illegal lattice point.

Tool syscalls — each syscall is annotated with its governance-vector impact, and the invariant engine checks whether the resulting move is allowed before execution.

8.7 Reference Implementation (TypeScript)

The listing below is a working, type-checked reference implementation of Sections 8.1–8.6. It compiles under TypeScript strict mode with no errors and, run as-is, executes eleven deterministic self-checks — one legal-lattice-point check, one allowed root move, one forbidden edge, one rejected non-root delta, two scheduler/cost checks, two memory-access-path checks, one IPC delta check, and one syscall check — all of which pass. It remains an illustrative reference, not a production microkernel: the coordinate bands, cost weights, and thresholds are placeholders to be replaced with values justified by evidence, per Section 10.3.

To run it: npx tsc --strict governed_state_lattice.ts && node governed_state_lattice.js

// governed_state_lattice.ts

//

// Reference implementation of Section 8, "Worked Sketch: A Governed State

// Lattice for an Agentic Microkernel," from Governed State Spaces (E8).

// Maps directly onto subsections 8.1-8.6. This is an illustrative

// reference implementation, not a production microkernel.

// ---------------------------------------------------------------------------

// 8.1 Constitutional State Space

// ---------------------------------------------------------------------------

export type Jurisdiction = "domestic" | "foreign" | "restricted";

export type Tenant = string;

export type ToolClass = "none" | "approved" | "elevated" | "untrusted";

export interface GovernedState {

// policy coordinates

complianceLevel: number; // 0 (non-compliant) .. 5 (fully compliant)

trustTier: number; // 0 (untrusted) .. 5 (fully trusted)

jurisdiction: Jurisdiction;

// behavioral coordinates

toolClass: ToolClass;

riskScore: number; // 0 (no risk) .. 5 (max risk)

anomalyCount: number; // 0 .. n, recent anomaly events

// context coordinates

tenant: Tenant;

costBudget: number; // 0 .. 5, remaining budget band

taskSensitivity: number; // 0 (public) .. 5 (highly sensitive)

// supporting coordinates used by the root moves (8.5)

justification: number; // 0 .. 5, recorded justification strength

guardrailStrictness: number; // 0 .. 5, active guardrail level

}

// ---------------------------------------------------------------------------

// 8.2 State Geometry: A Lattice of Legal States

// ---------------------------------------------------------------------------

const BAND_MIN = 0;

const BAND_MAX = 5;

function inBand(n: number): boolean {

return Number.isInteger(n) && n >= BAND_MIN && n <= BAND_MAX;

}

/**

* E8-style evenness condition, restricted to the coordinates that carry

* governance weight. A state is a legal lattice point only if their sum

* is even.

*/

function satisfiesParity(s: GovernedState): boolean {

const sum =

s.trustTier + s.riskScore + s.taskSensitivity + s.guardrailStrictness;

return sum % 2 === 0;

}

export function isLegalLatticePoint(s: GovernedState): boolean {

const numericFields: number[] = [

s.complianceLevel,

s.trustTier,

s.riskScore,

s.anomalyCount,

s.costBudget,

s.taskSensitivity,

s.justification,

s.guardrailStrictness,

];

return numericFields.every(inBand) && satisfiesParity(s);

}

// ---------------------------------------------------------------------------

// 8.5 Root-System Analogue: Primitive Governance Moves

// ---------------------------------------------------------------------------

export type StateDelta = Partial<

Record<

| "trustTier"

| "riskScore"

| "costBudget"

| "justification"

| "taskSensitivity"

| "guardrailStrictness"

| "complianceLevel"

| "anomalyCount",

number

>

>;

/** The primitive governance moves named in 8.5, plus their inverses. */

export const ROOT_MOVES: Record<string, StateDelta> = {

trustUp: { trustTier: +1, riskScore: -1 },

trustDown: { trustTier: -1, riskScore: +1 },

costJustify: { costBudget: +1, justification: +1 },

costRetract: { costBudget: -1, justification: -1 },

sensitivityGuard: { taskSensitivity: +1, guardrailStrictness: +1 },

sensitivityRelease: { taskSensitivity: -1, guardrailStrictness: -1 },

};

function addDelta(base: StateDelta, add: StateDelta): StateDelta {

const out: StateDelta = { ...base };

for (const [k, v] of Object.entries(add)) {

const key = k as keyof StateDelta;

out[key] = (out[key] ?? 0) + (v ?? 0);

}

return out;

}

function deltasEqual(a: StateDelta, b: StateDelta): boolean {

const keys = new Set([...Object.keys(a), ...Object.keys(b)]);

for (const k of keys) {

const kk = k as keyof StateDelta;

if ((a[kk] ?? 0) !== (b[kk] ?? 0)) return false;

}

return true;

}

/**

* True if `delta` is an integer combination of the primitive root moves:

* reachable by some bounded sequence of moves from ROOT_MOVES, each usable

* any integer number of times (including zero). The search is bounded

* because the lattice itself is bounded (0..5 per coordinate).

*/

export function isRootCombination(delta: StateDelta, maxSteps = 5): boolean {

let frontier: StateDelta[] = [{}];

const seen = new Set<string>([JSON.stringify({})]);

for (let step = 0; step < maxSteps; step++) {

if (frontier.some((d) => deltasEqual(d, delta))) return true;

const next: StateDelta[] = [];

for (const d of frontier) {

for (const move of Object.values(ROOT_MOVES)) {

const nd = addDelta(d, move);

const key = JSON.stringify(nd);

if (!seen.has(key)) {

seen.add(key);

next.push(nd);

}

}

}

frontier = next;

}

return frontier.some((d) => deltasEqual(d, delta));

}

// ---------------------------------------------------------------------------

// 8.3 Governance Dynamics: A Governance Cost Function Over the Lattice

// ---------------------------------------------------------------------------

const TOOL_CLASS_COST: Record<ToolClass, number> = {

none: 0,

approved: 1,

elevated: 4,

untrusted: 10,

};

const JURISDICTION_COST: Record<Jurisdiction, number> = {

domestic: 0,

foreign: 2,

restricted: 8,

};

/**

* G: Λ -> R. Low cost for compliant, low-risk, in-budget, approved-tool

* states; high cost for anomalies, jurisdiction violations, cost

* escalation, or untrusted tool invocation. A constitutional desirability

* function, not a physical energy.

*/

export function governanceCost(s: GovernedState): number {

const complianceCost = (BAND_MAX - s.complianceLevel) * 2;

const riskCost = s.riskScore * 3;

const anomalyCost = s.anomalyCount * 5;

const budgetCost = (BAND_MAX - s.costBudget) * 1.5;

const toolCost = TOOL_CLASS_COST[s.toolClass];

const jurisdictionCost = JURISDICTION_COST[s.jurisdiction];

return (

complianceCost + riskCost + anomalyCost + budgetCost + toolCost + jurisdictionCost

);

}

export const COST_THRESHOLD = 20; // above this, transition is forbidden outright

export const APPROVAL_THRESHOLD = 10; // above this, transition requires approval

// ---------------------------------------------------------------------------

// 8.4 Transitions as Lattice Moves

// ---------------------------------------------------------------------------

export interface TransitionResult {

allowed: boolean;

requiresApproval: boolean;

cost: number;

reason: string;

}

/** Guarded edges: transitions that require explicit approval regardless of cost. */

function isGuardedEdge(from: GovernedState, to: GovernedState): boolean {

return to.trustTier > from.trustTier; // any trust-tier increase is guarded

}

/** Forbidden edges: transitions absent from the graph entirely. */

function isForbiddenEdge(from: GovernedState, to: GovernedState): boolean {

if (

from.trustTier <= 1 &&

(to.toolClass === "elevated" || to.toolClass === "untrusted")

) {

return true; // low trust -> high-risk tool

}

return false;

}

function diffState(from: GovernedState, to: GovernedState): StateDelta {

return {

trustTier: to.trustTier - from.trustTier,

riskScore: to.riskScore - from.riskScore,

costBudget: to.costBudget - from.costBudget,

justification: to.justification - from.justification,

taskSensitivity: to.taskSensitivity - from.taskSensitivity,

guardrailStrictness: to.guardrailStrictness - from.guardrailStrictness,

complianceLevel: to.complianceLevel - from.complianceLevel,

anomalyCount: to.anomalyCount - from.anomalyCount,

};

}

export function evaluateTransition(

from: GovernedState,

to: GovernedState

): TransitionResult {

if (!isLegalLatticePoint(to)) {

return {

allowed: false,

requiresApproval: false,

cost: NaN,

reason: "target is not a legal lattice point",

};

}

const delta = diffState(from, to);

if (!isRootCombination(delta)) {

return {

allowed: false,

requiresApproval: false,

cost: NaN,

reason:

"delta is not an integer combination of primitive governance moves (not a local move)",

};

}

if (isForbiddenEdge(from, to)) {

return {

allowed: false,

requiresApproval: false,

cost: NaN,

reason: "forbidden edge: low trust to high-risk tool",

};

}

const cost = governanceCost(to);

if (cost > COST_THRESHOLD) {

return {

allowed: false,

requiresApproval: false,

cost,

reason: `governance cost ${cost} exceeds forbid threshold ${COST_THRESHOLD}`,

};

}

const guarded = isGuardedEdge(from, to) || cost > APPROVAL_THRESHOLD;

return {

allowed: true,

requiresApproval: guarded,

cost,

reason: guarded ? "allowed, pending explicit approval" : "allowed",

};

}

// ---------------------------------------------------------------------------

// 8.6 Microkernel Integration

// ---------------------------------------------------------------------------

export interface ScheduledAgent {

id: string;

state: GovernedState;

}

export type SchedulePriority = "priority" | "normal" | "throttled" | "sandboxed";

/** Scheduler — schedules on governance cost as well as compute cost. */

export function schedulePriority(s: GovernedState): SchedulePriority {

const cost = governanceCost(s);

if (cost > COST_THRESHOLD) return "sandboxed";

if (cost > APPROVAL_THRESHOLD) return "throttled";

if (cost <= 3) return "priority";

return "normal";

}

export function scheduleAgents(agents: ScheduledAgent[]): ScheduledAgent[] {

return [...agents].sort(

(a, b) => governanceCost(a.state) - governanceCost(b.state)

);

}

/** Memory / context pager — tags memory access strictness by lattice coordinates. */

export type AccessPath = "open" | "guarded";

export function memoryAccessPath(s: GovernedState): AccessPath {

return s.riskScore >= 3 || s.taskSensitivity >= 3 ? "guarded" : "open";

}

function applyDelta(s: GovernedState, delta: StateDelta): GovernedState {

return {

...s,

trustTier: s.trustTier + (delta.trustTier ?? 0),

riskScore: s.riskScore + (delta.riskScore ?? 0),

costBudget: s.costBudget + (delta.costBudget ?? 0),

justification: s.justification + (delta.justification ?? 0),

taskSensitivity: s.taskSensitivity + (delta.taskSensitivity ?? 0),

guardrailStrictness: s.guardrailStrictness + (delta.guardrailStrictness ?? 0),

complianceLevel: s.complianceLevel + (delta.complianceLevel ?? 0),

anomalyCount: s.anomalyCount + (delta.anomalyCount ?? 0),

};

}

/** IPC — validates that a proposed delta cannot push the receiver into an illegal point. */

export function validateIpcDelta(

receiverState: GovernedState,

delta: StateDelta

): TransitionResult {

const proposed = applyDelta(receiverState, delta);

return evaluateTransition(receiverState, proposed);

}

/** Tool syscalls — annotated with governance-vector impact, checked before execution. */

export interface ToolSyscall {

tool: ToolClass;

impact: StateDelta;

}

export function checkSyscall(

state: GovernedState,

syscall: ToolSyscall

): TransitionResult {

const proposed = applyDelta({ ...state, toolClass: syscall.tool }, syscall.impact);

return evaluateTransition(state, proposed);

}

// ---------------------------------------------------------------------------

// Demo / self-check — run with: npx ts-node governed_state_lattice.ts

// (or: npx tsc governed_state_lattice.ts && node governed_state_lattice.js)

// ---------------------------------------------------------------------------

function assert(cond: boolean, msg: string): void {

if (!cond) throw new Error(`assertion failed: ${msg}`);

console.log(`  ok  - ${msg}`);

}

function main(): void {

const base: GovernedState = {

complianceLevel: 4,

trustTier: 2,

jurisdiction: "domestic",

toolClass: "approved",

riskScore: 2,

anomalyCount: 0,

tenant: "acme",

costBudget: 4,

taskSensitivity: 1,

justification: 0,

guardrailStrictness: 1,

};

assert(isLegalLatticePoint(base), "base state is a legal lattice point");

// trustUp is a primitive root move: trustTier +1, riskScore -1

const afterTrustUp: GovernedState = { ...base, trustTier: 3, riskScore: 1 };

const r1 = evaluateTransition(base, afterTrustUp);

assert(r1.allowed, "trustTier+1/riskScore-1 is an allowed root move");

assert(r1.requiresApproval, "trust-tier increase is a guarded edge");

// low trust -> elevated tool is a forbidden edge

const lowTrust: GovernedState = { ...base, trustTier: 1, riskScore: 1 };

const badTool: GovernedState = { ...lowTrust, toolClass: "elevated" };

const r2 = evaluateTransition(lowTrust, badTool);

assert(!r2.allowed, "low trust to elevated tool is a forbidden edge");

// a legal lattice point that is not reachable via any root move

const riskOnlyJump: GovernedState = { ...base, riskScore: 4 };

const r3 = evaluateTransition(base, riskOnlyJump);

assert(

!r3.allowed,

"a risk-only jump not built from root moves is rejected"

);

// governance cost ordering feeds the scheduler

const risky: GovernedState = {

...base,

riskScore: 5,

anomalyCount: 3,

toolClass: "untrusted",

};

const agents: ScheduledAgent[] = [

{ id: "risky", state: risky },

{ id: "base", state: base },

];

const scheduled = scheduleAgents(agents);

assert(scheduled[0].id === "base", "lower-cost agent is scheduled first");

assert(schedulePriority(risky) === "sandboxed", "high-cost state is sandboxed");

// memory access path

assert(memoryAccessPath(base) === "open", "low-risk state gets open memory access");

assert(memoryAccessPath(risky) === "guarded", "high-risk state gets guarded memory access");

// IPC delta validation

const ipc = validateIpcDelta(base, ROOT_MOVES.costJustify);

assert(ipc.allowed, "costJustify is a valid IPC delta");

// tool syscall check: elevated tool + low trust is rejected before execution

const syscall: ToolSyscall = { tool: "elevated", impact: ROOT_MOVES.costJustify };

const sysResult = checkSyscall(lowTrust, syscall);

assert(

!sysResult.allowed,

"elevated syscall from low trust is rejected before execution"

);

console.log("\nall checks passed.");

}

main();

9. Why This Is Structurally, Not Just Procedurally, Aligned

In this geometry, misalignment is not only disallowed by policy — it is hard to represent. Many bad behaviors correspond to non-lattice points or forbidden edges, so the runtime’s topology itself makes certain failure modes unreachable, in the same sense that E₈ makes “badly packed” 8-dimensional configurations energetically disfavored rather than merely disallowed by a separate rule.

10. Practical Risks and Mitigations

Four practical risks follow directly from taking Sections 2–9 seriously, and each resolves into a concrete design rule rather than a reason to abandon the approach.

10.1 Mapping Difficulty: Substrate vs. Policy Geometry

The gap between a clean lattice and the messy reality of model activations and external tool calls is large, and that gap does not close by mapping raw activations into E₈ or any other “pure” geometry. The governed state space is semantic — trust, risk, provenance, jurisdiction, capability, as defined in Section 4.1 — not a representation of neuron activations. E₈, or any chosen geometry, is used only at the level of policy geometry, never substrate geometry: the lattice lives over constitutional coordinates, not logits. Wave Math operators (J, I, C, R) likewise stay at the judgment layer, acting on evidence, plans, and constitutional state rather than on raw model internals.

Design rule: never push the mathematics down to the substrate. Keep it at the governance layer, where the variables already have constitutional meaning.

10.2 Implementation Gap: From Specification to Runtime

Turning “primitive governance moves” and a “governance cost functional” into something that runs efficiently is a substantial engineering effort, and the worked sketch in Section 8 should not be read as a ready-to-build spec. The practical path is incremental:

Start with coarse, low-dimensional governance coordinates — a small set such as trust tier, risk band, jurisdiction, cost band, and tool class, rather than attempting to encode everything at once.

Implement primitive moves as tagged transitions in the runtime — every tool call, plan step, or IPC message carries a small governance delta. This is implementable today.

Start governance cost as a simple scoring function — full E₈-style optimality is not required; a monotone function that makes worse states more expensive to schedule is enough to begin.

Under this reading, the microkernel sketch is a direction, not a specification: tagged transitions and simple governance scores first; richer geometries and more structured neighborhoods later, only as evidence justifies them.

10.3 Over-Formalization Risk: No Math Without Evidence

Elegant mathematical frameworks have a track record of looking profound on paper without delivering operationally. This risk is addressed directly rather than dismissed: any proposed geometry or Wave Math operator must be evaluated through simulation, replay, execution equivalence, and conformance — the same evidentiary chain that governs everything else in this architecture (Section 3.1). Every such mechanism must be compared against simpler baselines — constitutional interpreters, monitoring, sandboxing — on actual failure modes such as spec gaming, tool abuse, and drift, and must demonstrably outperform them before adoption. This is consistent with, and sharpens, the Architectural Rule already stated in Section 3.5: E₈ and Wave Math remain candidate reference models, not constitutional truths.

Design rule: no mathematical structure is accepted unless it demonstrably constrains bad behavior better than simpler mechanisms under replay and execution equivalence.

10.4 Corrigibility Subtlety: Local Test, Not Global Guarantee

A system can satisfy a corrigibility operator C(o, e) = 1 at the transition level while still manipulating the evidence channel or the invariant checker that evaluates it. The binary operator is therefore a local test, not a global guarantee — it indicates whether a specific transition is corrigible under a specific invariant, not whether the system is globally safe. Corrigibility must accordingly be treated as multi-channel: corrigibility with respect to evidence, corrigibility with respect to invariant engines, and corrigibility with respect to external oversight are distinct properties that can diverge from one another. Deception itself must be modeled as a governance coordinate — “evidence manipulation risk” becomes part of the Constitutional State Space defined in Section 4.1, and transitions that increase it are treated as high-cost or inadmissible under the governance dynamics of Section 4.3.

The corrigibility operator remains useful, but only as one component within a larger governance dynamics model — not as a stand-alone safety guarantee.

11. Limits and Open Questions

E₈’s proven optimality results (sphere packing, certain energy functionals) do not transfer automatically to arbitrary governance-coordinate systems; the governance cost function and coordinate choices for a real system require independent justification and evidence.

Quantizing a continuous governance space into a discrete lattice is itself a design decision with trade-offs (granularity vs. expressiveness) that this note does not resolve.

Multi-channel corrigibility (Section 10.4) raises its own open question: how the three channels — evidence, invariant engines, external oversight — should be combined into a single admissibility decision is not yet specified.

As stated in Sections 3 and 4, none of the above is a constitutional requirement — it is a candidate implementation pattern, evaluated like any other on evidence.

12. Conclusion

E₈ is not adopted here as a metaphysical claim about cognition or alignment. It is used as a worked, well-understood example of a broader and more durable idea: governed systems can be designed so that their state-space geometry, not only their rule set, favors compliant behavior. Keeping the constitutional layer evidence-driven and mathematically agnostic — while allowing the mathematical layer to adopt E₈, another lattice, or an entirely different structure as research evolves — is what keeps this kind of architecture durable and founder-independent. Section 10 keeps this idea honest: the mathematics is confined to the policy layer, introduced incrementally, held to an evidentiary bar against simpler baselines, and never mistaken for a global safety guarantee on its own.

Distilled to one line: the Constitution defines legality, geometry defines reachability, governance dynamics define preference, the runtime enforces transitions, and evidence — proved, replayed, equivalence-checked, and judged for conformance — is what binds every layer together. The Constitution governs. Mathematics organizes. Implementations execute. Infrastructure deploys. Evidence connects every layer through replay, execution equivalence, conformance, and independent validation. That formulation should still hold even if the mathematical layer has moved beyond lattices entirely.

Project Infinity — AAIS / Mythar Root Systems. Working paper; not a constitutional specification.