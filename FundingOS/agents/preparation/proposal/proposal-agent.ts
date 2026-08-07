/**
 * FundingOS Proposal Agent — Grant Writing with MRS Integration.
 */

import { BaseAgent, Intent } from "fundingos-base-agent";

export class ProposalAgent extends BaseAgent {
  constructor(mode = "standard") {
    super("fundingos.proposal", "preparation", mode);
  }

  protected async performAction(intent: Intent): Promise<unknown> {
    const { topic, requirements, budget, useMRS = false } = intent.params as {
      topic: string;
      requirements?: string[];
      budget?: number;
      useMRS?: boolean;
    };

    let narrativeResult: unknown;
    if (useMRS && this.mode.mrsCrewAccess) {
      narrativeResult = await this.invokeMRS("fullNarrative", {
        topic,
        requirements,
        intentId: intent.id
      });
    } else {
      narrativeResult = this.writeNarrativeLocally(topic, requirements);
    }

    let visualizationResult: unknown = null;
    if (useMRS && this.mode.mrsCrewAccess) {
      visualizationResult = await this.invokeMRS("render", {
        scene: "proposal_visualization",
        parameters: { topic, budget },
        intentId: intent.id
      });
    }

    let audioResult: unknown = null;
    if (useMRS && this.mode.mrsCrewAccess) {
      audioResult = await this.invokeMRSFullPipeline({
        topic,
        requirements,
        budget,
        intentId: intent.id
      });
    }

    return {
      narrative: narrativeResult,
      visualization: visualizationResult,
      audio: audioResult,
      metadata: {
        topic,
        requirements,
        budget,
        generatedAt: new Date().toISOString(),
        mrsUsed: useMRS && this.mode.mrsCrewAccess
      }
    };
  }

  private writeNarrativeLocally(topic: string, requirements?: string[]) {
    return {
      title: `Grant Proposal: ${topic}`,
      abstract: `This proposal addresses ${topic} with innovative approaches...`,
      sections: [
        "Introduction",
        "Problem Statement",
        "Objectives",
        "Methodology",
        "Expected Outcomes",
        "Budget Justification",
        "Timeline"
      ],
      requirements: requirements || [],
      wordCount: 5000
    };
  }
}

export function createProposalAgent(mode?: string) {
  return new ProposalAgent(mode);
}