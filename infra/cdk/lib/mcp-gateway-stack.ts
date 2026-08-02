import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface McpGatewayStackProps extends cdk.StackProps {
  projectName: string;
  stage: string;
  vpc: ec2.IVpc;
  engineAlbDns: string;
  engineSecurityGroups: ec2.ISecurityGroup[];
  redisEndpoint: string;
  rendersBucketArn: string;
  rendersBucketName: string;
  evidenceBucketArn: string;
  evidenceBucketName: string;
}

/**
 * Public HTTPS front door for RT4D hosted MCP path.
 *
 * Honesty: this gateway fronts the **RT4D engine HTTP API** via Lambda proxy
 * (not a second renderer; not a re-host of the ChatGPT plugin MCP process).
 * Status: partial until deploy + live McpUrl proven.
 */
export class McpGatewayStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;
  public readonly mcpUrl: string;
  public readonly handlerFunctionName: string;

  constructor(scope: Construct, id: string, props: McpGatewayStackProps) {
    super(scope, id, props);

    const {
      projectName,
      stage,
      vpc,
      engineAlbDns,
      engineSecurityGroups,
      redisEndpoint,
      rendersBucketArn,
      rendersBucketName,
      evidenceBucketArn,
      evidenceBucketName,
    } = props;
    const prefix = `${projectName}-${stage}`;

    const lambdaSg = new ec2.SecurityGroup(this, 'McpLambdaSg', {
      vpc,
      description: 'MCP gateway Lambda to private engine ALB',
      allowAllOutbound: true,
    });

    // Engine stack allows VPC CIDR:8020 (avoids cross-stack SG ingress mutation).
    void engineSecurityGroups;

    const authorizerFn = new lambdaNode.NodejsFunction(this, 'Authorizer', {
      functionName: `${prefix}-mcp-authorizer`,
      entry: path.join(__dirname, '..', 'lambda', 'authorizer', 'index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      environment: {
        STAGE: stage,
        PROJECT_NAME: projectName,
        API_KEYS_SECRET: `${prefix}/api-keys`,
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node20',
        // Avoid Docker bundling on Windows synth hosts when esbuild is local
        forceDockerBundling: false,
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    const apiKeysSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'ApiKeysSecret',
      `${prefix}/api-keys`,
    );
    apiKeysSecret.grantRead(authorizerFn);

    const authorizer = new apigateway.TokenAuthorizer(this, 'McpAuthorizer', {
      handler: authorizerFn,
      identitySource: apigateway.IdentitySource.header('Authorization'),
      resultsCacheTtl: cdk.Duration.minutes(5),
      authorizerName: `${prefix}-mcp-authorizer`,
    });

    this.handlerFunctionName = `${prefix}-mcp-handler`;
    const mcpHandlerFn = new lambdaNode.NodejsFunction(this, 'McpHandler', {
      functionName: this.handlerFunctionName,
      entry: path.join(__dirname, '..', 'lambda', 'mcp-handler', 'index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(120),
      memorySize: 1024,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSg],
      environment: {
        STAGE: stage,
        PROJECT_NAME: projectName,
        ENGINE_ALB_DNS: engineAlbDns,
        ENGINE_PORT: '8020',
        RENDERS_BUCKET: rendersBucketName,
        EVIDENCE_BUCKET: evidenceBucketName,
        REDIS_ENDPOINT: redisEndpoint,
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node20',
        forceDockerBundling: false,
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
      tracing: lambda.Tracing.ACTIVE,
    });

    mcpHandlerFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject', 's3:ListBucket'],
        resources: [
          rendersBucketArn,
          `${rendersBucketArn}/*`,
          evidenceBucketArn,
          `${evidenceBucketArn}/*`,
        ],
      }),
    );

    this.api = new apigateway.RestApi(this, 'McpApi', {
      restApiName: `${prefix}-mcp-api`,
      description:
        'MRS RT4D MCP Gateway — public HTTPS front door to RT4D engine (partial until deploy)',
      deployOptions: {
        stageName: stage,
        tracingEnabled: true,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
        metricsEnabled: true,
        cacheClusterEnabled: false,
        // Stage-level throttle (primary rate limit surface)
        throttlingRateLimit: 50,
        throttlingBurstLimit: 100,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
        maxAge: cdk.Duration.hours(1),
      },
      endpointConfiguration: {
        types: [apigateway.EndpointType.REGIONAL],
      },
      cloudWatchRole: true,
    });

    const proxyIntegration = new apigateway.LambdaIntegration(mcpHandlerFn, {
      proxy: true,
      allowTestInvoke: false,
    });

    const mcpResource = this.api.root.addResource('mcp');
    mcpResource.addMethod('POST', proxyIntegration, {
      authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM,
    });

    const healthResource = this.api.root.addResource('health');
    healthResource.addMethod('GET', proxyIntegration, {
      authorizationType: apigateway.AuthorizationType.NONE,
    });

    const v1 = this.api.root.addResource('v1');
    const renders = v1.addResource('renders');
    const renderId = renders.addResource('{renderId}');
    renderId.addResource('evidence').addMethod('GET', proxyIntegration, {
      authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM,
    });
    renderId.addResource('png').addMethod('GET', proxyIntegration, {
      authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM,
    });
    renders.addMethod('POST', proxyIntegration, {
      authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM,
    });

    // Usage plan / quota — supporting rate-limit surface (partial: methods do not require x-api-key)
    const plan = this.api.addUsagePlan('McpUsagePlan', {
      name: `${prefix}-mcp-usage-plan`,
      throttle: {
        rateLimit: 50,
        burstLimit: 100,
      },
      quota: {
        limit: 10000,
        period: apigateway.Period.DAY,
      },
    });
    plan.addApiStage({ stage: this.api.deploymentStage });

    this.mcpUrl = this.api.url;

    new cdk.CfnOutput(this, 'McpUrl', {
      value: this.mcpUrl,
      description: 'Public HTTPS MCP gateway base URL (append /mcp)',
      exportName: `${prefix}-mcp-url`,
    });
    new cdk.CfnOutput(this, 'McpPostUrl', {
      value: `${this.mcpUrl}mcp`,
      description: 'POST target for hosted MCP path',
      exportName: `${prefix}-mcp-post-url`,
    });
    new cdk.CfnOutput(this, 'ApiId', {
      value: this.api.restApiId,
      exportName: `${prefix}-mcp-api-id`,
    });
    new cdk.CfnOutput(this, 'AuthorizerFunctionArn', {
      value: authorizerFn.functionArn,
      exportName: `${prefix}-mcp-authorizer-arn`,
    });
    new cdk.CfnOutput(this, 'HandlerFunctionArn', {
      value: mcpHandlerFn.functionArn,
      exportName: `${prefix}-mcp-handler-arn`,
    });
  }
}
