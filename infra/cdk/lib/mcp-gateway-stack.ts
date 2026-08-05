import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as events from 'aws-cdk-lib/aws-events';
import * as lambdaTargets from 'aws-cdk-lib/aws-events-targets';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
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
  usageTable: dynamodb.Table;
  decisionsTable: dynamodb.Table;
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
      usageTable,
      decisionsTable,
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
      entry: path.join(__dirname, '..', 'lambda', 'mcp-handler', 'index.mts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(120),
      // Account 450753703992 us-east-2 Lambda memory ceiling is 512 MiB.
      memorySize: 512,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSg],
      environment: {
        STAGE: stage,
        PROJECT_NAME: projectName,
        ENGINE_ALB_DNS: engineAlbDns,
        ENGINE_PORT: '80',
        RENDERS_BUCKET: rendersBucketName,
        EVIDENCE_BUCKET: evidenceBucketName,
        REDIS_ENDPOINT: redisEndpoint,
        USAGE_TABLE: usageTable.tableName,
        DECISIONS_TABLE: decisionsTable.tableName,
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node20',
        forceDockerBundling: false,
        // SDK ships via node_modules (dynamic imports); do not rely on a missing layer.
        externalModules: ['@modelcontextprotocol/sdk'],
        nodeModules: ['@modelcontextprotocol/sdk'],
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

    usageTable.grantWriteData(mcpHandlerFn);
    decisionsTable.grantWriteData(mcpHandlerFn);

    const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'https://chat.openai.com').split(',').map((o) => o.trim()).filter(Boolean);

    this.api = new apigateway.RestApi(this, 'McpApi', {
      restApiName: `${prefix}-mcp-api`,
      description:
        'MRS RT4D MCP Gateway — public HTTPS front door to RT4D engine (partial until deploy)',
      deployOptions: {
        stageName: stage,
        tracingEnabled: true,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: false,
        metricsEnabled: true,
        cacheClusterEnabled: false,
        throttlingRateLimit: 50,
        throttlingBurstLimit: 100,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: allowedOrigins,
        allowMethods: ['POST', 'GET', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
        maxAge: cdk.Duration.minutes(5),
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
      apiKeyRequired: true,
    });

    const healthResource = this.api.root.addResource('health');
    healthResource.addMethod('GET', proxyIntegration, {
      authorizationType: apigateway.AuthorizationType.NONE,
      apiKeyRequired: false,
    });

    // GPT Action / OpenAPI façade — importable at <mcpUrl>openapi.json.
    const openApiResource = this.api.root.addResource('openapi.json');
    openApiResource.addMethod('GET', proxyIntegration, {
      authorizationType: apigateway.AuthorizationType.NONE,
      apiKeyRequired: false,
    });

    const v1 = this.api.root.addResource('v1');
    const scenes = v1.addResource('scenes');
    scenes.addMethod('POST', proxyIntegration, {
      authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM,
      apiKeyRequired: true,
    });
    const scene = scenes.addResource('{sceneId}');
    scene.addMethod('GET', proxyIntegration, {
      authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM,
      apiKeyRequired: true,
    });
    scene.addMethod('PATCH', proxyIntegration, {
      authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM,
      apiKeyRequired: true,
    });
    scene.addResource('render').addMethod('POST', proxyIntegration, {
      authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM,
      apiKeyRequired: true,
    });
    const renderPrompt = v1.addResource('render-prompt');
    renderPrompt.addMethod('POST', proxyIntegration, {
      authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM,
      apiKeyRequired: true,
    });

    // Usage plan / quota — supporting rate-limit surface with API key enforcement.
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

    // API key rotation Lambda — generates new keys and stores them in Secrets Manager.
    const keyRotatorFn = new lambdaNode.NodejsFunction(this, 'ApiKeyRotator', {
      functionName: `${prefix}-api-key-rotator`,
      entry: path.join(__dirname, '..', 'lambda', 'api-key-rotator', 'index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        STAGE: stage,
        PROJECT_NAME: projectName,
        API_KEYS_SECRET: `${prefix}/api-keys`,
        USAGE_PLAN_ID: plan.usagePlanId,
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node20',
        forceDockerBundling: false,
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    keyRotatorFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'apigateway:CreateApiKey',
          'apigateway:CreateUsagePlanKey',
          'apigateway:DeleteApiKey',
          'apigateway:GetUsagePlan',
          'apigateway:UpdateApiKey',
        ],
        resources: ['*'],
      }),
    );

    new events.Rule(this, 'KeyRotationSchedule', {
      schedule: events.Schedule.rate(cdk.Duration.days(30)),
      targets: [new lambdaTargets.LambdaFunction(keyRotatorFn)],
    });

    this.mcpUrl = this.api.url;

    const webAcl = new wafv2.CfnWebACL(this, 'McpWebAcl', {
      name: `${prefix}-mcp-web-acl`,
      scope: 'REGIONAL',
      defaultAction: { allow: {} },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: `${prefix}-mcp-waf`,
      },
      rules: [
        {
          name: 'AwsManagedRulesCommonRuleSet',
          priority: 1,
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: `${prefix}-waf-common`,
          },
          overrideAction: { none: {} },
        },
        {
          name: 'AwsManagedRulesSQLiRuleSet',
          priority: 2,
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesSQLiRuleSet',
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: `${prefix}-waf-sqli`,
          },
          overrideAction: { none: {} },
        },
        {
          name: 'AwsManagedRulesLinuxRuleSet',
          priority: 3,
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesLinuxRuleSet',
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: `${prefix}-waf-linux`,
          },
          overrideAction: { none: {} },
        },
        {
          name: 'RateLimitRule',
          priority: 4,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: 200,
              aggregateKeyType: 'IP',
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: `${prefix}-waf-rate`,
          },
        },
      ],
    });

    new wafv2.CfnWebACLAssociation(this, 'McpWebAclAssociation', {
      resourceArn: this.api.arnForExecuteApi(stage, '*', '/*'),
      webAclArn: webAcl.attrArn,
    });

    new cdk.CfnOutput(this, 'WebAclArn', {
      value: webAcl.attrArn,
      description: 'WAF Web ACL ARN for the MCP gateway',
      exportName: `${prefix}-waf-acl-arn`,
    });

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
    new cdk.CfnOutput(this, 'OpenApiUrl', {
      value: `${this.mcpUrl}openapi.json`,
      description: 'OpenAPI schema for ChatGPT GPT Action import',
      exportName: `${prefix}-openapi-url`,
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
    new cdk.CfnOutput(this, 'KeyRotatorFunctionArn', {
      value: keyRotatorFn.functionArn,
      description: 'API key rotation Lambda function ARN',
      exportName: `${prefix}-key-rotator-arn`,
    });
  }
}
