/**
 * FundingOS MRS Capabilities — Exposes 6 MCP tools to FundingOS agents.
 */

import { MRSDirectorAdapter } from "./MRSDirectorAdapter.js";
import { MRSAgentRegistry } from "./MRSAgentRegistry.js";

export class MRSCapabilities {
  private adapter: MRSDirectorAdapter;
  private registry: MRSAgentRegistry;
  private initialized = false;

  constructor() {
    this.adapter = new MRSDirectorAdapter();
    this.registry = new MRSAgentRegistry();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.adapter.initialize();
    this.initialized = true;
  }

  async render(params: Record<string, unknown>): Promise<unknown> {
    await this.initialize();
    return this.adapter.renderProposalVisualization(params);
  }

  async narrative(params: Record<string, unknown>): Promise<unknown> {
    await this.initialize();
    return this.adapter.generateProposalNarrative(params);
  }

  async fullNarrative(params: Record<string, unknown>): Promise<unknown> {
    await this.initialize();
    return this.adapter.generateFullProposalNarrative(params);
  }

  async beats(params: Record<string, unknown>): Promise<unknown> {
    await this.initialize();
    return this.adapter.scoreNarrativeBeats(params);
  }

  async audio(params: Record<string, unknown>): Promise<unknown> {
    await this.initialize();
    return this.adapter.mixPitchAudio(params);
  }

  async spiral(params: Record<string, unknown>): Promise<unknown> {
    await this.initialize();
    return this.adapter.computeAdaptiveScore(params);
  }

  async knowledge(query: string, params: Record<string, unknown> = {}): Promise<unknown> {
    await this.initialize();
    return this.adapter.researchForProposal(query, params);
  }

  async fullProposalPipeline(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    await this.initialize();
    return this.adapter.createProposalWithVisuals(params);
  }

  getAgent(agentType: string) {
    return this.registry.getAgent(agentType);
  }

  getAllAgents() {
    return this.registry.getAllAgents();
  }

  getAgentsWithCapability(capability: string) {
    return this.registry.getAgentsByCapability(capability);
  }

  canAgentPerform(agentType: string, action: string) {
    return this.registry.canPerformAction(agentType, action);
  }

  getAdapter() {
    return this.adapter;
  }

  isReady() {
    return this.initialized && this.adapter.isReady();
  }
}

export function createMRSCapabilities(): MRSCapabilities {
  return new MRSCapabilities();
}

export const MRS_CAPABILITIES = Object.freeze([
  "render_rt4d_preview",
  "storyforge_build_narrative",
  "storyforge_full_pipeline",
  "beatbox_score_narrative",
  "speakers_mix_audio",
  "compute_engine_spiral_state",
  "query_knowledge_platform"
]);