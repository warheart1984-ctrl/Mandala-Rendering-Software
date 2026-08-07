#!/usr/bin/env node
/**
 * FundingOS CLI — Main entry point for FundingOS operations.
 */

import { Command } from "commander";
import { ScoutAgent } from "../agents/discovery/scout/scout-agent";
import { ProposalAgent } from "../agents/preparation/proposal/proposal-agent";

const program = new Command();

program
  .name("fundingos")
  .description("FundingOS — AI-Operated Funding Department with MRS Crew Integration")
  .version("0.1.0");

program
  .option("--mode <mode>", "Operating mode: standard, sage, full", "standard")
  .option("--mrs-crew", "Enable MRS crew capabilities", false)
  .option("--verbose", "Verbose output", false);

// Helper to get global options
function getGlobalOptions() {
  return program.opts();
}

program
  .command("discover")
  .description("Discover funding opportunities")
  .requiredOption("-q, --query <query>", "Search query")
  .option("-f, --filters <filters>", "JSON filters")
  .option("-l, --limit <limit>", "Result limit", "10")
  .action(async (options) => {
    const globalOpts = getGlobalOptions();
    const mode = globalOpts.mode || (globalOpts.mrsCrew ? "full" : "standard");
    const agent = new ScoutAgent(mode);
    const intent = {
      id: `discover-${Date.now()}`,
      action: "search_opportunities",
      objective: `Discover opportunities for: ${options.query}`,
      params: {
        query: options.query,
        filters: options.filters ? JSON.parse(options.filters) : {},
        limit: parseInt(options.limit)
      },
      timestamp: Date.now()
    };
    const result = await agent.execute(intent);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  });

program
  .command("strategize")
  .description("Develop funding strategy")
  .requiredOption("-o, --objective <objective>", "Strategic objective")
  .option("--portfolio <portfolio>", "Portfolio context")
  .action(async (options) => {
    const globalOpts = getGlobalOptions();
    const mode = globalOpts.mode || (globalOpts.mrsCrew ? "full" : "standard");
    console.log(`[FundingOS] Strategy development for: ${options.objective}`);
    console.log(`[FundingOS] Mode: ${mode}`);
    console.log(JSON.stringify({ objective: options.objective, portfolio: options.portfolio, mode }, null, 2));
  });

program
  .command("prepare")
  .description("Prepare grant proposal")
  .requiredOption("-t, --topic <topic>", "Proposal topic")
  .option("-r, --requirements <requirements>", "Requirements (comma-separated)")
  .option("-b, --budget <budget>", "Budget amount")
  .action(async (options) => {
    const globalOpts = getGlobalOptions();
    const mode = globalOpts.mode || (globalOpts.mrsCrew ? "full" : "standard");
    const agent = new ProposalAgent(mode);
    const intent = {
      id: `prepare-${Date.now()}`,
      action: "write_narrative",
      objective: `Prepare proposal for: ${options.topic}`,
      params: {
        topic: options.topic,
        requirements: options.requirements ? options.requirements.split(",") : [],
        budget: options.budget ? parseFloat(options.budget) : undefined,
        useMRS: globalOpts.mrsCrew
      },
      timestamp: Date.now()
    };
    const result = await agent.execute(intent);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  });

program
  .command("comply")
  .description("Check compliance and eligibility")
  .requiredOption("-p, --proposal-id <proposalId>", "Proposal ID")
  .action(async (options) => {
    const globalOpts = getGlobalOptions();
    const mode = globalOpts.mode || (globalOpts.mrsCrew ? "full" : "standard");
    console.log(`[FundingOS] Compliance check for proposal: ${options.proposalId}`);
    console.log(`[FundingOS] Mode: ${mode}`);
    console.log(JSON.stringify({ proposalId: options.proposalId, mode }, null, 2));
  });

program
  .command("execute")
  .description("Execute submission")
  .requiredOption("-s, --submission-id <submissionId>", "Submission ID")
  .action(async (options) => {
    const globalOpts = getGlobalOptions();
    const mode = globalOpts.mode || (globalOpts.mrsCrew ? "full" : "standard");
    console.log(`[FundingOS] Executing submission: ${options.submissionId}`);
    console.log(`[FundingOS] Mode: ${mode}`);
    console.log(JSON.stringify({ submissionId: options.submissionId, mode }, null, 2));
  });

program
  .command("steward")
  .description("Manage award stewardship")
  .requiredOption("-a, --award-id <awardId>", "Award ID")
  .option("--report", "Generate progress report")
  .action(async (options) => {
    const globalOpts = getGlobalOptions();
    const mode = globalOpts.mode || (globalOpts.mrsCrew ? "full" : "standard");
    console.log(`[FundingOS] Stewardship for award: ${options.awardId}`);
    console.log(`[FundingOS] Mode: ${mode}`);
    console.log(JSON.stringify({ awardId: options.awardId, report: options.report, mode }, null, 2));
  });

program
  .command("mrs")
  .description("Direct MRS crew operations")
  .option("--render <scene>", "Render scene")
  .option("--narrative <topic>", "Generate narrative")
  .option("--full-pipeline <topic>", "Full narrative + audio + visual pipeline")
  .option("--research <query>", "Knowledge platform query")
  .action(async (options) => {
    console.log("[FundingOS] MRS command - capabilities available in full mode");
    console.log(JSON.stringify({
      render: options.render,
      narrative: options.narrative,
      fullPipeline: options.fullPipeline,
      research: options.research
    }, null, 2));
  });

program
  .command("skills")
  .description("List available vendor skills")
  .action(() => {
    console.log("[FundingOS] Vendor skills loaded from .opencode/skill/");
  });

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}