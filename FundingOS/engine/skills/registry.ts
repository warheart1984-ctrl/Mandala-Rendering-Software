/**
 * FundingOS Skill Registry — Maps skills to agents.
 */

import { Skill } from "./vendor-skills.js";
import type { VendorSkillsLoader } from "./vendor-skills.js";

export class SkillRegistry {
  private agentSkills = new Map<string, Set<string>>();
  private skillMetadata = new Map<string, Skill>();

  constructor(private skillsLoader: VendorSkillsLoader) {
    this.loadSkillMetadata();
  }

  loadSkillMetadata(): void {
    for (const skill of this.skillsLoader.getAllSkills()) {
      this.skillMetadata.set(skill.name, skill);
    }
  }

  assignSkillToAgent(agentType: string, skillName: string): void {
    if (!this.skillMetadata.has(skillName)) {
      throw new Error(`Skill not found: ${skillName}`);
    }
    if (!this.agentSkills.has(agentType)) {
      this.agentSkills.set(agentType, new Set());
    }
    this.agentSkills.get(agentType)!.add(skillName);
  }

  assignSkillsToAgent(agentType: string, skillNames: string[]): void {
    for (const skillName of skillNames) {
      this.assignSkillToAgent(agentType, skillName);
    }
  }

  getAgentSkills(agentType: string): string[] {
    return Array.from(this.agentSkills.get(agentType) || []);
  }

  getAgentsWithSkill(skillName: string): string[] {
    const agents: string[] = [];
    for (const [agentType, skills] of this.agentSkills.entries()) {
      if (skills.has(skillName)) {
        agents.push(agentType);
      }
    }
    return agents;
  }

  hasSkill(agentType: string, skillName: string): boolean {
    return this.agentSkills.get(agentType)?.has(skillName) || false;
  }

  getAllAssignments(): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const [agentType, skills] of this.agentSkills.entries()) {
      result[agentType] = Array.from(skills);
    }
    return result;
  }

  setupDefaultAssignments(): void {
    this.assignSkillsToAgent("scout", ["rag-blueprint", "aws-observability", "amazon-bedrock"]);
    this.assignSkillsToAgent("market-intelligence", ["rag-blueprint", "aws-observability", "aws-billing-and-cost-management"]);
    this.assignSkillsToAgent("policy-watch", ["rag-blueprint", "aws-observability"]);

    this.assignSkillsToAgent("strategy", ["aws-billing-and-cost-management", "rag-blueprint", "launch-with-aws"]);
    this.assignSkillsToAgent("portfolio", ["aws-billing-and-cost-management", "aws-observability"]);
    this.assignSkillsToAgent("priority", ["rag-blueprint", "aws-observability"]);

    this.assignSkillsToAgent("proposal", ["amazon-bedrock", "rag-blueprint", "launch-with-aws"]);
    this.assignSkillsToAgent("budget", ["aws-billing-and-cost-management", "aws-compute"]);
    this.assignSkillsToAgent("documentation", ["rag-blueprint", "aws-blocks", "launch-with-aws"]);

    this.assignSkillsToAgent("eligibility", ["rag-blueprint", "aws-observability"]);
    this.assignSkillsToAgent("compliance", ["rag-blueprint", "aws-observability", "aws-cloudformation"]);
    this.assignSkillsToAgent("audit", ["rag-blueprint", "aws-observability", "aws-cloudformation"]);

    this.assignSkillsToAgent("submission", ["aws-deployment", "launch-with-aws"]);
    this.assignSkillsToAgent("calendar", ["aws-observability"]);
    this.assignSkillsToAgent("communication", ["amazon-bedrock", "aws-messaging-and-streaming"]);

    this.assignSkillsToAgent("award", ["aws-billing-and-cost-management", "aws-observability"]);
    this.assignSkillsToAgent("reporting", ["rag-blueprint", "aws-observability", "amazon-bedrock"]);
    this.assignSkillsToAgent("performance", ["aws-observability", "rag-blueprint"]);

    this.assignSkillsToAgent("mrs.director", ["nvidia-gpu-assist", "hip-rocm", "rag-blueprint"]);
    this.assignSkillsToAgent("mrs.architect", ["aws-cdk", "aws-blocks", "rag-blueprint"]);
    this.assignSkillsToAgent("mrs.builder", ["aws-blocks", "launch-with-aws"]);
    this.assignSkillsToAgent("mrs.implementor", ["tilegym-cutile-python", "tao-run-on-docker", "nvidia-gpu-assist"]);
    this.assignSkillsToAgent("mrs.inspector", ["aws-observability", "dynamo-troubleshoot"]);
    this.assignSkillsToAgent("mrs.reviewer", ["rag-blueprint", "aws-observability"]);
    this.assignSkillsToAgent("mrs.engineer-standards", ["aws-observability", "rag-blueprint"]);
  }
}

export function createSkillRegistry(skillsLoader: VendorSkillsLoader): SkillRegistry {
  const registry = new SkillRegistry(skillsLoader);
  registry.setupDefaultAssignments();
  return registry;
}