#!/usr/bin/env node
/**
 * MRS RT4D CDK app — Priority #5 hosted MCP infrastructure.
 * Status: partial (synth/docker milestone; deploy declared until live URL evidence).
 */
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ArtifactStorageStack } from '../lib/artifact-storage-stack';
import { Rt4dEngineStack } from '../lib/rt4d-engine-stack';
import { McpGatewayStack } from '../lib/mcp-gateway-stack';
import { ObservabilityStack } from '../lib/observability-stack';
import { UsageLedgerStack } from '../lib/usage-ledger-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
};

const projectName = 'mrs-rt4d';
const stage = (app.node.tryGetContext('stage') as string | undefined) ?? 'dev';

const artifacts = new ArtifactStorageStack(app, `${projectName}-artifacts-${stage}`, {
  env,
  projectName,
  stage,
  description: 'Artifact storage (S3) for RT4D renders and evidence bundles',
});

const engineStack = new Rt4dEngineStack(app, `${projectName}-engine-${stage}`, {
  env,
  projectName,
  stage,
  description: 'RT4D render engine (ECS Fargate) with content-addressed cache',
  rendersBucketArn: artifacts.rendersBucket.bucketArn,
  rendersBucketName: artifacts.rendersBucket.bucketName,
  evidenceBucketArn: artifacts.evidenceBucket.bucketArn,
  evidenceBucketName: artifacts.evidenceBucket.bucketName,
});

// Priority #7 — durable commercial ledger (DynamoDB). Status: deployed dev.
const usageLedger = new UsageLedgerStack(app, `${projectName}-usage-ledger-${stage}`, {
  env,
  projectName,
  stage,
  description: 'DynamoDB usage + entitlement decision ledger (deployed dev)',
});

const mcpStack = new McpGatewayStack(app, `${projectName}-mcp-${stage}`, {
  env,
  projectName,
  stage,
  description: 'Public HTTPS MCP gateway (API Gateway + Lambda authorizer) for RT4D',
  vpc: engineStack.vpc,
  engineAlbDns: engineStack.loadBalancerDnsName,
  engineSecurityGroups: engineStack.serviceSecurityGroups,
  redisEndpoint: engineStack.redisEndpoint,
  rendersBucketArn: artifacts.rendersBucket.bucketArn,
  rendersBucketName: artifacts.rendersBucket.bucketName,
  evidenceBucketArn: artifacts.evidenceBucket.bucketArn,
  evidenceBucketName: artifacts.evidenceBucket.bucketName,
  usageTable: usageLedger.usageTable,
  decisionsTable: usageLedger.decisionsTable,
});

new ObservabilityStack(app, `${projectName}-observability-${stage}`, {
  env,
  projectName,
  stage,
  description: 'CloudWatch dashboards, X-Ray group, structured-log field contract for RT4D',
  mcpHandlerFunctionName: mcpStack.handlerFunctionName,
  engineLogGroupName: engineStack.logGroupName,
  engineClusterName: engineStack.clusterName,
  engineServiceName: engineStack.serviceName,
});

// Priority #7 — durable commercial ledger (DynamoDB). Status: declared until deploy.
new UsageLedgerStack(app, `${projectName}-usage-ledger-${stage}`, {
  env,
  projectName,
  stage,
  description: 'DynamoDB usage + entitlement decision ledger (declared until deploy)',
});

app.synth();
