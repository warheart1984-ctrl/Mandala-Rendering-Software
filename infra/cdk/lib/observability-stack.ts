import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as xray from 'aws-cdk-lib/aws-xray';
import { Construct } from 'constructs';

export interface ObservabilityStackProps extends cdk.StackProps {
  projectName: string;
  stage: string;
  mcpHandlerFunctionName: string;
  engineLogGroupName: string;
  engineClusterName: string;
  engineServiceName: string;
}

/**
 * CloudWatch dashboards, X-Ray group, and structured-logging field contract.
 *
 * Status tags:
 * - Dashboard + log-group name alignment: **partial** (infra defined)
 * - Custom metrics RenderCost / ErrorRate / RenderLatency: **declared** until app code emits PutMetricData
 * - Structured fields renderId / failureClass / renderCost|latencyMs: **declared** contract
 */
export class ObservabilityStack extends cdk.Stack {
  public readonly dashboard: cloudwatch.Dashboard;
  /** Contract-only structured log group (not a duplicate of Lambda/ECS groups). */
  public readonly structuredLogGroup: logs.LogGroup;

  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props);

    const {
      projectName,
      stage,
      mcpHandlerFunctionName,
      engineLogGroupName,
      engineClusterName,
      engineServiceName,
    } = props;
    const prefix = `${projectName}-${stage}`;

    // Declared structured-logging sink for future app wiring (avoid clobbering Lambda/ECS groups)
    this.structuredLogGroup = new logs.LogGroup(this, 'StructuredLogGroup', {
      logGroupName: `/mrs/${prefix}/structured`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    new cdk.CfnOutput(this, 'StructuredLoggingContract', {
      value: JSON.stringify({
        status: 'declared',
        requiredFields: ['renderId', 'failureClass', 'renderCost', 'latencyMs'],
        logGroup: this.structuredLogGroup.logGroupName,
        notes:
          'App code must emit these fields; infra only reserves the log group and dashboard queries',
      }),
      description: 'Structured logging fields contract (declared until wired into app)',
    });

    this.dashboard = new cloudwatch.Dashboard(this, 'McpDashboard', {
      dashboardName: `${prefix}-mcp-dashboard`,
    });

    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'API Gateway Metrics',
        width: 12,
        height: 6,
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: 'Count',
            dimensionsMap: { ApiName: `${prefix}-mcp-api`, Stage: stage },
            statistic: 'Sum',
            label: 'Total Requests',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: '4XXError',
            dimensionsMap: { ApiName: `${prefix}-mcp-api`, Stage: stage },
            statistic: 'Sum',
            label: '4XX Errors',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: '5XXError',
            dimensionsMap: { ApiName: `${prefix}-mcp-api`, Stage: stage },
            statistic: 'Sum',
            label: '5XX Errors',
          }),
        ],
        right: [
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: 'Latency',
            dimensionsMap: { ApiName: `${prefix}-mcp-api`, Stage: stage },
            statistic: 'Average',
            label: 'Latency (ms)',
          }),
        ],
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda Metrics',
        width: 12,
        height: 6,
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/Lambda',
            metricName: 'Invocations',
            dimensionsMap: { FunctionName: mcpHandlerFunctionName },
            statistic: 'Sum',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/Lambda',
            metricName: 'Errors',
            dimensionsMap: { FunctionName: mcpHandlerFunctionName },
            statistic: 'Sum',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/Lambda',
            metricName: 'Throttles',
            dimensionsMap: { FunctionName: mcpHandlerFunctionName },
            statistic: 'Sum',
          }),
        ],
        right: [
          new cloudwatch.Metric({
            namespace: 'AWS/Lambda',
            metricName: 'Duration',
            dimensionsMap: { FunctionName: mcpHandlerFunctionName },
            statistic: 'Average',
            label: 'Duration (ms)',
          }),
        ],
      }),
    );

    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'ECS Service Metrics',
        width: 12,
        height: 6,
        left: [
          new cloudwatch.Metric({
            namespace: 'ECS/ContainerInsights',
            metricName: 'CpuUtilized',
            dimensionsMap: {
              ClusterName: engineClusterName,
              ServiceName: engineServiceName,
            },
            statistic: 'Average',
            label: 'CPU',
          }),
          new cloudwatch.Metric({
            namespace: 'ECS/ContainerInsights',
            metricName: 'MemoryUtilized',
            dimensionsMap: {
              ClusterName: engineClusterName,
              ServiceName: engineServiceName,
            },
            statistic: 'Average',
            label: 'Memory',
          }),
        ],
      }),
      new cloudwatch.LogQueryWidget({
        title: 'Engine log sample',
        width: 12,
        height: 6,
        logGroupNames: [engineLogGroupName],
        queryLines: ['fields @timestamp, @message', 'sort @timestamp desc', 'limit 50'],
      }),
    );

    // X-Ray group — tracing hooks enabled on API GW + Lambda; ECS daemon wiring declared/partial
    new xray.CfnGroup(this, 'XrayGroup', {
      groupName: `${prefix}-rt4d`,
      filterExpression: 'service("mrs-rt4d") OR annotation.renderId EXISTS',
    });

    // Declared custom-metric alarms (will stay INSUFFICIENT_DATA until app emits MRS/RT4D metrics)
    new cloudwatch.Alarm(this, 'RenderCostAlarm', {
      alarmName: `${prefix}-render-cost-alarm`,
      alarmDescription:
        'DECLARED: alert when render cost exceeds $10/period — requires app PutMetricData',
      metric: new cloudwatch.Metric({
        namespace: 'MRS/RT4D',
        metricName: 'RenderCost',
        dimensionsMap: { Stage: stage },
        statistic: 'Sum',
      }),
      threshold: 10.0,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new cloudwatch.Alarm(this, 'ErrorRateAlarm', {
      alarmName: `${prefix}-error-rate-alarm`,
      alarmDescription: 'DECLARED: alert when error rate exceeds 5% — requires app metrics',
      metric: new cloudwatch.Metric({
        namespace: 'MRS/RT4D',
        metricName: 'ErrorRate',
        dimensionsMap: { Stage: stage },
        statistic: 'Average',
      }),
      threshold: 0.05,
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new cloudwatch.Alarm(this, 'LatencyAlarm', {
      alarmName: `${prefix}-render-latency-alarm`,
      alarmDescription: 'DECLARED: alert when p99 render latency exceeds 30s — requires app metrics',
      metric: new cloudwatch.Metric({
        namespace: 'MRS/RT4D',
        metricName: 'RenderLatency',
        dimensionsMap: { Stage: stage },
        statistic: 'p99',
      }),
      threshold: 30000,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new cdk.CfnOutput(this, 'DashboardName', {
      value: this.dashboard.dashboardName,
      exportName: `${prefix}-dashboard-name`,
    });
    new cdk.CfnOutput(this, 'StructuredLogGroupName', {
      value: this.structuredLogGroup.logGroupName,
      exportName: `${prefix}-structured-log-group`,
    });
    new cdk.CfnOutput(this, 'EngineLogGroupRef', {
      value: engineLogGroupName,
      description: 'Referenced engine log group (owned by Rt4dEngineStack)',
    });
  }
}
