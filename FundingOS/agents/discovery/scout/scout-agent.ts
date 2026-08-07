/**
 * FundingOS Scout Agent — Opportunity Discovery.
 */

import { BaseAgent, Intent } from "fundingos-base-agent";

export class ScoutAgent extends BaseAgent {
  constructor(mode = "standard") {
    super("fundingos.scout", "discovery", mode);
  }

  protected async performAction(intent: Intent): Promise<unknown> {
    const { query, filters, limit = 10 } = intent.params as {
      query: string;
      filters?: Record<string, unknown>;
      limit?: number;
    };

    const opportunities = await this.discoverOpportunities(query, filters, limit);

    if (this.mode.mrsCrewAccess) {
      const research = await this.invokeMRS("knowledge", {
        query: `Funding opportunities for: ${query}`,
        intentId: intent.id
      });
      return { opportunities, research: (research as { result?: unknown }).result };
    }

    return { opportunities };
  }

  private async discoverOpportunities(_query: string, _filters: Record<string, unknown> | undefined, limit: number) {
    return [
      {
        id: "opp-001",
        title: "NSF AI Research Grant",
        agency: "National Science Foundation",
        deadline: "2024-03-15",
        amount: "$500,000",
        relevance: 0.92,
        matchReason: "Aligns with AI research focus"
      },
      {
        id: "opp-002",
        title: "DOE Computational Science Fellowship",
        agency: "Department of Energy",
        deadline: "2024-04-01",
        amount: "$300,000",
        relevance: 0.87,
        matchReason: "Computational focus matches query"
      },
      {
        id: "opp-003",
        title: "NIH Data Science Initiative",
        agency: "National Institutes of Health",
        deadline: "2024-02-28",
        amount: "$750,000",
        relevance: 0.78,
        matchReason: "Data science component relevant"
      }
    ].slice(0, limit);
  }
}

export function createScoutAgent(mode?: string) {
  return new ScoutAgent(mode);
}