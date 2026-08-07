/**
 * FundingOS MRS Director Adapter — Wraps MRS DirectorAgent for FundingOS use.
 */

export interface MRSResult {
  success: boolean;
  result?: unknown;
  tool?: string;
  provenance?: Record<string, unknown>;
}

export class MRSDirectorAdapter {
  private mrsDirector: unknown = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Dynamic import of MRS DirectorAgent - will fail gracefully
      const mod = await import("@mrs/director").catch(() => null);
      if (mod && mod.DirectorAgent) {
        this.mrsDirector = new mod.DirectorAgent();
      } else {
        this.mrsDirector = this.createMockDirector();
      }
      this.initialized = true;
    } catch (error) {
      console.warn("MRS DirectorAgent not available, using mock:", error instanceof Error ? error.message : String(error));
      this.mrsDirector = this.createMockDirector();
      this.initialized = true;
    }
  }

  private createMockDirector() {
    return {
      async execute(_request: Record<string, unknown>): Promise<MRSResult> {
        return {
          success: true,
          result: "Mock MRS Director executed",
          provenance: { mock: true }
        };
      },
      async invokeMCP(toolName: string, params: Record<string, unknown>): Promise<MRSResult> {
        return {
          success: true,
          tool: toolName,
          result: `Mock ${toolName} result`,
          provenance: {
            intentId: params.intentId || "mock-intent",
            toolName,
            params,
            timestamp: Date.now()
          }
        };
      }
    };
  }

  async renderProposalVisualization(params: Record<string, unknown>): Promise<MRSResult> {
    await this.initialize();
    const director = this.mrsDirector as { invokeMCP: (tool: string, params: Record<string, unknown>) => Promise<MRSResult> };
    return director.invokeMCP("render_rt4d_preview", {
      ...params,
      intentId: params.intentId,
      fundingOS: true
    });
  }

  async generateProposalNarrative(params: Record<string, unknown>): Promise<MRSResult> {
    await this.initialize();
    const director = this.mrsDirector as { invokeMCP: (tool: string, params: Record<string, unknown>) => Promise<MRSResult> };
    return director.invokeMCP("storyforge_build_narrative", {
      ...params,
      intentId: params.intentId,
      fundingOS: true
    });
  }

  async generateFullProposalNarrative(params: Record<string, unknown>): Promise<MRSResult> {
    await this.initialize();
    const director = this.mrsDirector as { invokeMCP: (tool: string, params: Record<string, unknown>) => Promise<MRSResult> };
    return director.invokeMCP("storyforge_full_pipeline", {
      ...params,
      intentId: params.intentId,
      fundingOS: true
    });
  }

  async scoreNarrativeBeats(params: Record<string, unknown>): Promise<MRSResult> {
    await this.initialize();
    const director = this.mrsDirector as { invokeMCP: (tool: string, params: Record<string, unknown>) => Promise<MRSResult> };
    return director.invokeMCP("beatbox_score_narrative", {
      ...params,
      intentId: params.intentId,
      fundingOS: true
    });
  }

  async mixPitchAudio(params: Record<string, unknown>): Promise<MRSResult> {
    await this.initialize();
    const director = this.mrsDirector as { invokeMCP: (tool: string, params: Record<string, unknown>) => Promise<MRSResult> };
    return director.invokeMCP("speakers_mix_audio", {
      ...params,
      intentId: params.intentId,
      fundingOS: true
    });
  }

  async computeAdaptiveScore(params: Record<string, unknown>): Promise<MRSResult> {
    await this.initialize();
    const director = this.mrsDirector as { invokeMCP: (tool: string, params: Record<string, unknown>) => Promise<MRSResult> };
    return director.invokeMCP("compute_engine_spiral_state", {
      ...params,
      intentId: params.intentId,
      fundingOS: true
    });
  }

  async researchForProposal(query: string, params: Record<string, unknown> = {}): Promise<MRSResult> {
    await this.initialize();
    const director = this.mrsDirector as { invokeMCP: (tool: string, params: Record<string, unknown>) => Promise<MRSResult> };
    return director.invokeMCP("query_knowledge_platform", {
      query,
      ...params,
      intentId: params.intentId,
      fundingOS: true
    });
  }

  async createProposalWithVisuals(params: Record<string, unknown>): Promise<Record<string, MRSResult>> {
    const results: Record<string, MRSResult> = {};

    results.narrative = await this.generateFullProposalNarrative(params);
    results.beats = await this.scoreNarrativeBeats({
      narrative: (results.narrative.result as string) || "",
      intentId: params.intentId
    });
    results.audio = await this.mixPitchAudio({
      narrative: (results.narrative.result as string) || "",
      beats: results.beats.result,
      intentId: params.intentId
    });
    results.visualization = await this.renderProposalVisualization({
      scene: params.scene || "proposal_visualization",
      parameters: params.visualParams,
      intentId: params.intentId
    });

    return results;
  }

  getDirector(): unknown {
    return this.mrsDirector;
  }

  isReady(): boolean {
    return this.initialized && !!this.mrsDirector;
  }
}

export function createMRSDirectorAdapter(): MRSDirectorAdapter {
  return new MRSDirectorAdapter();
}