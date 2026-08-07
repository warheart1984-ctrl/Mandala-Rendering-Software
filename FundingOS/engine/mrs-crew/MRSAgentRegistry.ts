/**
 * FundingOS MRS Agent Registry — Registers 7 MRS crew agents for FundingOS dispatch.
 */

import { CONTRACTS } from "../constitution/contracts.js";
import { CHARTER } from "../constitution/charter.js";

export interface MRSRegisteredAgent {
  type: string;
  contract: typeof CONTRACTS[keyof typeof CONTRACTS];
  division: string;
  capabilities: readonly string[];
  allowedActions: readonly string[];
  forbiddenActions: readonly string[];
  status: string;
}

export class MRSAgentRegistry {
  private agents = new Map<string, MRSRegisteredAgent>();

  constructor() {
    this.registerMRSAgents();
  }

  registerMRSAgents(): void {
    const mrsAgents = CHARTER.agentDivisions.mrsCrew || [];

    for (const agentType of mrsAgents) {
      const contract = CONTRACTS[`contract.mrs.${agentType}.v1` as keyof typeof CONTRACTS];
      if (contract) {
        this.agents.set(agentType, {
          type: agentType,
          contract,
          division: "mrsCrew",
          capabilities: contract.mcpToolAccess || [],
          allowedActions: contract.allowedActions || [],
          forbiddenActions: contract.forbiddenActions || [],
          status: "registered"
        });
      }
    }
  }

  getAgent(agentType: string): MRSRegisteredAgent | undefined {
    return this.agents.get(agentType);
  }

  getAllAgents(): MRSRegisteredAgent[] {
    return Array.from(this.agents.values());
  }

  getAgentsByCapability(capability: string): MRSRegisteredAgent[] {
    return this.getAllAgents().filter(a => a.capabilities.includes(capability));
  }

  canPerformAction(agentType: string, action: string): boolean {
    const agent = this.agents.get(agentType);
    if (!agent) return false;
    return agent.allowedActions.includes(action) && !agent.forbiddenActions.includes(action);
  }

  hasCapability(agentType: string, capability: string): boolean {
    const agent = this.agents.get(agentType);
    if (!agent) return false;
    return agent.capabilities.includes(capability);
  }
}

export function createMRSAgentRegistry(): MRSAgentRegistry {
  return new MRSAgentRegistry();
}