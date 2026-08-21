# Constitutional Runtime Loop - Close the Loop

## Overview

Connect all components into a self-governing simulation runtime:
Story Forge → Simulation Chamber → AAIS Gate → Certified State → Renderer → Movie Lane

This is the constitutional runtime architecture you described. No subsystem can violate invariants.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Constitutional Laws                   │
│                 (4DCE v1.0 / 4DRS v1.0)                  │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Certified 4D State S(x,y,z,t)              │
│              SHA-256 hash + AAIS signature               │
└────────────────────┬────────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
   Physics Organ  AI/Story    Audio Organ
        │            │            │
        └────────────┼────────────┘
                     │
                     ▼
         ┌───────────────────┐
         │  Constitutional   │
         │      Gate         │
         │  Invariants /     │
         │   Contracts       │
         └─────────┬─────────┘
                   │
         ┌─────────┴─────────┐
         │ Pass    │ Reject  │
         ▼         ▼
   New Certified State
         │
    ┌────┴─────┐
    ▼          ▼
4D Projection Movie Lane
    │
    ▼
Renderer (pure function)
```

---

## Runtime Components

### 1. Simulation Chamber Organ

```typescript
// simulation-chamber.ts

export class SimulationChamber {
  constructor(private stateStore: StateStore) {}
  
  async proposeStateTransition(
    currentStateId: string,
    intentId: string,
    delta: StateDelta
  ): Promise<StateProposal> {
    const currentState = this.stateStore.getState(currentStateId);
    
    // Compute next state via physics simulation
    const nextFields = this.simulate(
      currentState.fields,
      delta
    );
    
    // Compute conserved quantities
    const conserved = this.computeConserved(
      currentState.fields,
      nextFields
    );
    
    // Compute causality bounds
    const causality = this.checkCausality(
      currentState.fields,
      nextFields
    );
    
    return {
      intent_id: intentId,
      world_id: currentState.provenance.world_id,
      previous_state_id: currentStateId,
      simulation_step: currentState.provenance.simulation_step + 1,
      fields: nextFields,
      conserved_quantities: conserved,
      causality_bounds: causality,
      numerical_error_bound: this.computeErrorBound(delta)
    };
  }
  
  private simulate(currentFields: Fields, delta: StateDelta): Fields {
    // Wave equation solver
    // Force field computation
    // Lattice relaxation
    // Defect propagation
  }
}
```

### 2. AAIS Constitutional Gate

```typescript
// constitutional-gate.ts

export class ConstitutionalGate {
  constructor(
    private validator: AAISValidator,
    private stateStore: StateStore
  ) {}
  
  async commitTransition(
    proposal: StateProposal
  ): Promise<CertificationResult> {
    // Step 1: Validate proposal
    const validation = await this.validator.validate(proposal);
    
    if (!validation.valid) {
      // Reject and log violation
      await this.logViolation(proposal, validation.violations);
      return {
        status: 'rejected',
        violations: validation.violations
      };
    }
    
    // Step 2: Certify state
    const certification = await this.stateStore.certifyState(proposal);
    
    // Step 3: Log to provenance ledger
    await this.logCertification(certification);
    
    // Step 4: Notify subscribers
    await this.notifySubscribers(certification);
    
    return certification;
  }
  
  private async logViolation(
    proposal: StateProposal,
    violations: string[]
  ): Promise<void> {
    // Write to evidence ledger
    // Create governance node for violation
    // Trigger alert if critical
  }
}
```

### 3. Renderer Organ (Pure Function)

```typescript
// mandala-renderer-organ.ts

export class MandalaRendererOrgan {
  constructor(
    private stateStore: StateStore,
    private projector: Projector4D,
    private gpuRenderer: RT4DGPURenderer,
    private postProcessor: PostProcessor
  ) {}
  
  async renderFromState(
    stateId: string,
    observationParams: ObservationParams
  ): Promise<RenderArtifact> {
    // Step 1: Fetch certified state
    const state = this.stateStore.getState(stateId);
    if (!state) {
      throw new Error(`State ${stateId} not found or not certified`);
    }
    
    // Step 2: Verify state integrity
    const verification = this.stateStore.verifyState(stateId);
    if (!verification.valid) {
      throw new Error(`State ${stateId} verification failed`);
    }
    
    // Step 3: Project 4D → 3D
    const projection = await this.projector.project(
      state.fields,
      observationParams.camera
    );
    
    // Step 4: Render 3D → pixels
    const render = await this.gpuRenderer.render(
      projection.mesh,
      observationParams.renderParams
    );
    
    // Step 5: Post-process
    const final = await this.postProcessor.process(
      render,
      observationParams.postProcess
    );
    
    // Step 6: Create artifact with provenance
    const artifact = this.createArtifact(
      state,
      projection,
      final,
      observationParams
    );
    
    return artifact;
  }
  
  private createArtifact(
    state: CertifiedState,
    projection: Projection,
    render: RenderOutput,
    params: ObservationParams
  ): RenderArtifact {
    const artifactId = `mandala-shot-${state.state_id}-${Date.now()}`;
    
    return {
      artifact_id: artifactId,
      state_id: state.state_id,
      state_hash: state.certified_hash,
      observation_params: params,
      pixels: render.pixels,
      render_hash: computeRenderHash(render),
      provenance: {
        state_provenance: state.provenance,
        projection_hash: projection.hash,
        shader_version: this.gpuRenderer.shaderVersion,
        post_process_params: params.postProcess
      },
      timestamp: new Date().toISOString()
    };
  }
}
```

### 4. Movie Lane Organ (Observer)

```typescript
// movie-lane.ts

export class MovieLane {
  constructor(
    private renderer: MandalaRendererOrgan,
    private stateStore: StateStore
  ) {}
  
  async renderTimeline(
    timeline: Timeline,
    outputPath: string
  ): Promise<MovieArtifact> {
    const frames: RenderArtifact[] = [];
    
    for (const keyframe of timeline.keyframes) {
      // Each keyframe references a certified state
      const artifact = await this.renderer.renderFromState(
        keyframe.state_id,
        keyframe.observation
      );
      
      frames.push(artifact);
    }
    
    // Assemble movie
    return this.assembleMovie(frames, outputPath);
  }
  
  async generateCameraPath(
    stateId: string,
    path: CameraPath
  ): Promise<RenderArtifact[]> {
    const artifacts: RenderArtifact[] = [];
    
    for (const camera of path.cameras) {
      const artifact = await this.renderer.renderFromState(
        stateId,
        { camera }
      );
      artifacts.push(artifact);
    }
    
    return artifacts;
  }
}
```

---

## Runtime Loop

```typescript
// constitutional-runtime.ts

export class ConstitutionalRuntime {
  constructor(
    private simulationChamber: SimulationChamber,
    private gate: ConstitutionalGate,
    private renderer: MandalaRendererOrgan,
    private movieLane: MovieLane
  ) {}
  
  // Main runtime loop
  async run(
    worldId: string,
    intent: Intent
  ): Promise<RuntimeResult> {
    let currentStateId = this.getGenesisState(worldId);
    
    const results: RuntimeResult[] = [];
    
    for (let step = 0; step < intent.steps; step++) {
      // 1. Propose transition
      const proposal = await this.simulationChamber.proposeStateTransition(
        currentStateId,
        intent.id,
        intent.delta
      );
      
      // 2. Constitutional gate
      const certification = await this.gate.commitTransition(proposal);
      
      if (certification.status === 'rejected') {
        return {
          status: 'halted',
          reason: 'Constitutional violation',
          violations: certification.violations
        };
      }
      
      currentStateId = certification.state_id;
      
      // 3. Render if requested
      if (intent.render) {
        const artifact = await this.renderer.renderFromState(
          currentStateId,
          intent.observation
        );
        results.push({ state: certification, render: artifact });
      } else {
        results.push({ state: certification });
      }
    }
    
    return {
      status: 'completed',
      final_state_id: currentStateId,
      results
    };
  }
  
  // Replay existing certified state
  async replay(
    stateId: string,
    observation: ObservationParams
  ): Promise<RenderArtifact> {
    return this.renderer.renderFromState(stateId, observation);
  }
  
  // Branch from existing state
  async branch(
    stateId: string,
    intent: Intent
  ): Promise<RuntimeResult> {
    // Start from existing certified state
    // Create new branch with different evolution
    return this.runFromState(stateId, intent);
  }
}
```

---

## Constitutional Invariants

```typescript
// invariants.ts

export const CONSTITUTIONAL_INVARIANTS = {
  // Physics invariants
  ENERGY_CONSERVATION: {
    check: (prev, next) => Math.abs(prev.energy - next.energy) < 1e-6,
    severity: 'critical'
  },
  
  CAUSALITY: {
    check: (prev, next) => next.causality_bounds.max_light_speed <= 1.0,
    severity: 'critical'
  },
  
  TOPOLOGY_VALIDITY: {
    check: (state) => ['moebius', 'tesseract'].includes(state.fields.lattice.topology),
    severity: 'critical'
  },
  
  MATH_VALIDITY: {
    check: (state) => !hasNaN(state.fields),
    severity: 'critical'
  },
  
  PROVENANCE_CHAIN: {
    check: (state) => !!state.provenance.intent_id && !!state.provenance.aais_signature,
    severity: 'critical'
  },
  
  REPLAY_DETERMINISM: {
    check: (state1, state2, params) => {
      // Same state + params must produce same pixels
      return state1.id === state2.id && paramsEqual(params);
    },
    severity: 'critical'
  }
};
```

---

## API Endpoints

```typescript
// runtime-api.ts

app.post('/api/mandala/runtime/run', async (req, res) => {
  const { world_id, intent } = await req.json();
  
  const result = await runtime.run(world_id, intent);
  
  if (result.status === 'halted') {
    return res.status(400).json(result);
  }
  
  res.json(result);
});

app.post('/api/mandala/runtime/replay', async (req, res) => {
  const { state_id, observation } = await req.json();
  
  const artifact = await runtime.replay(state_id, observation);
  
  res.json(artifact);
});

app.post('/api/mandala/runtime/branch', async (req, res) => {
  const { state_id, intent } = await req.json();
  
  const result = await runtime.branch(state_id, intent);
  
  res.json(result);
});

app.get('/api/mandala/runtime/state/:id/lineage', async (req, res) => {
  const state = stateStore.getState(req.params.id);
  const lineage = stateStore.getProvenanceChain(req.params.id);
  
  res.json({ state, lineage });
});
```

---

## Testing

```typescript
// constitutional-runtime.test.ts

describe('Constitutional Runtime', () => {
  test('rejects state transition violating energy conservation', async () => {
    const runtime = new ConstitutionalRuntime(...);
    
    const result = await runtime.run('world-1', {
      id: 'intent-violate',
      delta: { energy_delta: 999 }
    });
    
    expect(result.status).toBe('halted');
    expect(result.reason).toBe('Constitutional violation');
  });
  
  test('certified state produces deterministic renders', async () => {
    const runtime = new ConstitutionalRuntime(...);
    
    const artifact1 = await runtime.replay('state-123', params);
    const artifact2 = await runtime.replay('state-123', params);
    
    expect(artifact1.render_hash).toBe(artifact2.render_hash);
    expect(artifact1.pixels).toBe(artifact2.pixels);
  });
  
  test('renderer cannot mutate simulation truth', async () => {
    const runtime = new ConstitutionalRuntime(...);
    
    // Try to render with modified state
    const state = stateStore.getState('state-123');
    state.fields.lattice.dimensions = [999, 999, 999, 999];
    
    await expect(
      runtime.replay('state-123', params)
    ).rejects.toThrow('State verification failed');
  });
  
  test('provenance chain is complete', async () => {
    const runtime = new ConstitutionalRuntime(...);
    
    const result = await runtime.run('world-1', intent);
    
    const lineage = stateStore.getProvenanceChain(result.final_state_id!);
    
    expect(lineage.length).toBeGreaterThan(0);
    expect(lineage[0]).toBe('genesis');
  });
});
```

---

## Implementation Timeline

### Week 1: Core Runtime
- [ ] Create `ConstitutionalRuntime` class
- [ ] Implement `SimulationChamber` proposal logic
- [ ] Implement `ConstitutionalGate` with AAIS validation
- [ ] Integrate with StateStore

### Week 2: Renderer Integration
- [ ] Create `MandalaRendererOrgan` with pure function contract
- [ ] Wire to StateStore (read-only access)
- [ ] Implement verification before render
- [ ] Create artifact with full provenance

### Week 3: Movie Lane + API
- [ ] Implement `MovieLane` for timeline rendering
- [ ] Create runtime API endpoints
- [ ] End-to-end test: intent → simulation → certification → render
- [ ] Replay test: same state produces same pixels

### Week 4: Hardening
- [ ] Performance optimization
- [ ] Error handling and recovery
- [ ] Logging and monitoring
- [ ] Documentation

---

## Constitutional Guarantees

1. **No subsystem can break equilibrium** → Constitutional gate rejects invalid transitions
2. **Renderer receives certified state only** → Renderer cannot mutate simulation truth
3. **Every pixel has provenance** → Full chain from intent to pixels
4. **Replayable reality** → Same state + params = same pixels
5. **Invariant enforcement** → Energy, causality, topology always validated

---

## Success Criteria

- ✅ Simulation proposal → AAIS validation → certified state
- ✅ Renderer renders only certified states
- ✅ Same state produces identical pixels (CPU + GPU)
- ✅ Provenance chain traceable for every frame
- ✅ Invalid transitions rejected with clear violations
- ✅ Runtime is deterministic and replayable

---

## Next Steps

After constitutional runtime loop is closed:
1. Build Mandala IDE for artist interaction
2. Publish SDK for external modules
3. Ship first production render
