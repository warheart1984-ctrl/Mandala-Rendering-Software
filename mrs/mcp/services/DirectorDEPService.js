// mrs/mcp/services/DirectorDEPService.js

import { SMEDispatchService } from './SMEDispatchService.js';
import { GovernanceAdapter } from '../governance-adapter.js';
import { ConstitutionalKnowledgeLayer, resolveDecision } from '../../../engine/governance/ConstitutionalKnowledgeLayer.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const policiesPath = path.resolve(__dirname, '../../../engine/governance/policies/default.policies.json');
const policies = JSON.parse(fs.readFileSync(policiesPath, 'utf8'));
const ckl = new ConstitutionalKnowledgeLayer(policies.policies || policies);
const governance = new GovernanceAdapter();
const smeDispatch = new SMEDispatchService();

export class DirectorDEPService {
  constructor() {
    this.ckl = ckl;
    this.governance = governance;
    this.smeDispatch = smeDispatch;
  }

  /**
   * Stage 1: PLAN - Decompose intent into actionable tasks
   */
  async plan({ intentId, intent, timelineId, worldId, parameters, evidence, correlationId, actorIdentity, lattice }) {
    const stage = 'plan';
    const stageId = `${intentId}-${stage}`;

    // Governance check for planning
    const govResult = await this.governance.evaluate({
      toolId: 'mrs.director.dep',
      params: { stage, intentId, intent, timelineId, worldId, parameters },
      context: { actorIdentity, evidence, lattice, correlationId },
    });

    if (!govResult.allowed) {
      return { ok: false, error: `Governance denied at ${stage}: ${govResult.reason}`, evidence: null };
    }

    // CKL decision for planning
    const cklResult = resolveDecision(
      { type: 'plan', actor: '4dce.director', params: { intent, timelineId, worldId, parameters }, evidence },
      evidence || {},
      { policies: this.ckl.policies }
    );

    if (!cklResult.ok) {
      return { ok: false, error: `CKL denied at ${stage}: ${cklResult.reason}`, evidence: null };
    }

    // Generate plan: decompose intent into SME tasks
    const plan = this.generatePlan(intent, parameters);

    const stageEvidence = {
      id: `ev-${stageId}`,
      stage,
      intentId,
      correlationId,
      actor: '4dce.director',
      input: { intent, timelineId, worldId, parameters },
      output: { plan },
      governance: govResult.meta,
      ckl: cklResult,
      timestamp: new Date().toISOString(),
    };

    return {
      ok: true,
      output: { plan, intentId, timelineId, worldId, parameters },
      evidence: stageEvidence,
    };
  }

  /**
   * Stage 2: ROUTE - Assign tasks to SME modules
   */
  async route({ plan, intentId, timelineId, worldId, parameters, evidence, correlationId, actorIdentity, lattice }) {
    const stage = 'route';
    const stageId = `${intentId}-${stage}`;

    const govResult = await this.governance.evaluate({
      toolId: 'mrs.director.dep',
      params: { stage, plan },
      context: { actorIdentity, evidence, lattice, correlationId },
    });

    if (!govResult.allowed) {
      return { ok: false, error: `Governance denied at ${stage}: ${govResult.reason}`, evidence: null };
    }

    // Route each task to appropriate SME
    const routes = [];
    for (const task of plan.tasks) {
      const route = await this.smeDispatch.routeTask(task, { intentId, timelineId, worldId, correlationId, evidence });
      routes.push(route);
    }

    const stageEvidence = {
      id: `ev-${stageId}`,
      stage,
      intentId,
      correlationId,
      actor: '4dce.director',
      input: { plan },
      output: { routes },
      governance: govResult.meta,
      timestamp: new Date().toISOString(),
    };

    return {
      ok: true,
      output: { routes, plan, intentId, timelineId, worldId, parameters },
      evidence: stageEvidence,
    };
  }

  /**
   * Stage 3: SUPERVISE - Execute tasks via SME modules, collect results
   */
  async supervise({ routes, plan, intentId, timelineId, worldId, parameters, evidence, correlationId, actorIdentity, lattice }) {
    const stage = 'supervise';
    const stageId = `${intentId}-${stage}`;

    const govResult = await this.governance.evaluate({
      toolId: 'mrs.director.dep',
      params: { stage, routes },
      context: { actorIdentity, evidence, lattice, correlationId },
    });

    if (!govResult.allowed) {
      return { ok: false, error: `Governance denied at ${stage}: ${govResult.reason}`, evidence: null };
    }

    // Execute each routed task via SME dispatch
    const results = [];
    for (const route of routes) {
      const result = await this.smeDispatch.executeTask(route, { intentId, timelineId, worldId, correlationId, evidence });
      results.push(result);
    }

    // Aggregate results
    const aggregated = this.aggregateResults(results, plan);

    const stageEvidence = {
      id: `ev-${stageId}`,
      stage,
      intentId,
      correlationId,
      actor: '4dce.director',
      input: { routes },
      output: { results: aggregated },
      governance: govResult.meta,
      timestamp: new Date().toISOString(),
    };

    return {
      ok: true,
      output: { results: aggregated, routes, plan, intentId, timelineId, worldId, parameters },
      evidence: stageEvidence,
    };
  }

  /**
   * Stage 4: ENFORCE GOVERNANCE - Validate all outputs against policies
   */
  async enforceGovernance({ results, routes, plan, intentId, timelineId, worldId, parameters, evidence, correlationId, actorIdentity, lattice }) {
    const stage = 'enforce_governance';
    const stageId = `${intentId}-${stage}`;

    const govResult = await this.governance.evaluate({
      toolId: 'mrs.director.dep',
      params: { stage, results },
      context: { actorIdentity, evidence, lattice, correlationId },
    });

    if (!govResult.allowed) {
      return { ok: false, error: `Governance denied at ${stage}: ${govResult.reason}`, evidence: null };
    }

    // Verify evidence chain completeness
    const evidenceCheck = this.verifyEvidenceChain(results);

    // Final CKL decision on complete DEP execution
    const cklResult = resolveDecision(
      { type: 'dep_complete', actor: '4dce.director', params: { results, plan }, evidence: null },
      evidenceCheck,
      { policies: this.ckl.policies }
    );

    if (!cklResult.ok) {
      return { ok: false, error: `Final CKL denied: ${cklResult.reason}`, evidence: null };
    }

    const stageEvidence = {
      id: `ev-${stageId}`,
      stage,
      intentId,
      correlationId,
      actor: '4dce.director',
      input: { results },
      output: { final: true, evidenceCheck, ckl: cklResult },
      governance: govResult.meta,
      timestamp: new Date().toISOString(),
    };

    return {
      ok: true,
      output: { finalResult: results, plan, evidenceCheck },
      evidence: stageEvidence,
    };
  }

  generatePlan(intent, parameters) {
    // Decompose intent into SME tasks based on intent type
    const taskTemplates = {
      'render': [
        { sme: 'sme.vis', action: 'encode_image', params: { scene: parameters.scene } },
        { sme: 'sme.gen', action: 'generate_image', params: { prompt: intent.prompt } },
        { sme: 'sme.log', action: 'store_evidence', params: {} },
      ],
      'pipeline': [
        { sme: 'sme.core', action: 'dispatch', params: { subIntents: parameters.subIntents } },
        { sme: 'sme.log', action: 'write_audit', params: {} },
      ],
      'optimize': [
        { sme: 'sme.txt', action: 'generate_text', params: { prompt: 'optimization analysis' } },
        { sme: 'sme.log', action: 'verify_merkle', params: {} },
      ],
      'evidence': [
        { sme: 'sme.log', action: 'index_replay', params: { timelineId: parameters.timelineId } },
        { sme: 'sme.log', action: 'verify_merkle', params: {} },
      ],
    };

    const tasks = taskTemplates[intent.type] || taskTemplates['render'];

    return {
      intentId: intent.id || `intent-${Date.now()}`,
      intentType: intent.type,
      tasks: tasks.map((t, i) => ({ id: `task-${i}`, ...t })),
      createdAt: new Date().toISOString(),
    };
  }

  async routeTask(task, context) {
    return {
      taskId: task.id,
      sme: task.sme,
      action: task.action,
      params: task.params,
      status: 'routed',
      routedAt: new Date().toISOString(),
    };
  }

  aggregateResults(results, plan) {
    return {
      planId: plan.intentId,
      taskCount: results.length,
      succeeded: results.filter(r => r.ok).length,
      failed: results.filter(r => !r.ok).length,
      results: results.map(r => ({
        taskId: r.taskId,
        ok: r.ok,
        output: r.output,
        evidence: r.evidence,
      })),
      aggregatedAt: new Date().toISOString(),
    };
  }

  verifyEvidenceChain(results) {
    // Handle both array of results and aggregated results object
    const resultArray = Array.isArray(results) ? results : (results.results || []);
    const evidenceItems = [];
    for (const result of resultArray) {
      if (result.evidence) evidenceItems.push(result.evidence);
    }
    return {
      complete: evidenceItems.length > 0,
      count: evidenceItems.length,
      items: evidenceItems,
    };
  }

  computeMerkleRoot(evidenceArray) {
    // Simplified Merkle root computation
    const leaves = evidenceArray.map(e => JSON.stringify(e));
    if (leaves.length === 0) return 'empty';
    if (leaves.length === 1) return leaves[0];
    // In production, use proper Merkle tree
    return `merkle-${leaves.length}-${Date.now()}`;
  }
}