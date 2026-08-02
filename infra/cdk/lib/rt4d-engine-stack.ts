import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as ecr_assets from 'aws-cdk-lib/aws-ecr-assets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface Rt4dEngineStackProps extends cdk.StackProps {
  projectName: string;
  stage: string;
  /** IAM resource ARN for renders bucket */
  rendersBucketArn: string;
  rendersBucketName: string;
  /** IAM resource ARN for evidence bucket */
  evidenceBucketArn: string;
  evidenceBucketName: string;
}

/**
 * RT4D engine on ECS Fargate (internal ALB) + Redis cache.
 * Status: partial — CDK defined; deploy/live service not proven.
 *
 * Cost note: NAT gateway + Fargate + ElastiCache are not free-tier-safe.
 */
export class Rt4dEngineStack extends cdk.Stack {
  public readonly service: ecs_patterns.ApplicationLoadBalancedFargateService;
  public readonly vpc: ec2.Vpc;
  public readonly redis: elasticache.CfnReplicationGroup;
  public readonly taskRole: iam.Role;
  public readonly executionRole: iam.Role;
  public readonly loadBalancerDnsName: string;
  public readonly redisEndpoint: string;
  public readonly serviceSecurityGroups: ec2.ISecurityGroup[];
  public readonly logGroupName: string;
  public readonly clusterName: string;
  public readonly serviceName: string;

  constructor(scope: Construct, id: string, props: Rt4dEngineStackProps) {
    super(scope, id, props);

    const {
      projectName,
      stage,
      rendersBucketArn,
      rendersBucketName,
      evidenceBucketArn,
      evidenceBucketName,
    } = props;
    const prefix = `${projectName}-${stage}`;

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 1,
      restrictDefaultSecurityGroup: true,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          cidrMask: 24,
          name: 'data',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    this.clusterName = `${prefix}-engine-cluster`;
    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc: this.vpc,
      clusterName: this.clusterName,
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
    });

    const redisSubnetGroup = new elasticache.CfnSubnetGroup(this, 'RedisSubnetGroup', {
      description: 'Subnet group for RT4D render cache',
      subnetIds: this.vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_ISOLATED }).subnetIds,
    });

    const redisSecurityGroup = new ec2.SecurityGroup(this, 'RedisSecurityGroup', {
      vpc: this.vpc,
      description: 'Security group for RT4D Redis cache',
      allowAllOutbound: false,
    });

    // Pre-created secret expected at deploy time (not committed). Synth uses token ref.
    const redisAuthSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'RedisAuth',
      `${prefix}/redis/auth`,
    );

    this.redis = new elasticache.CfnReplicationGroup(this, 'Redis', {
      replicationGroupId: `${prefix}-redis`,
      replicationGroupDescription: 'RT4D content-addressed render cache',
      engine: 'redis',
      engineVersion: '7.1',
      cacheNodeType: 'cache.t3.micro',
      numNodeGroups: 1,
      replicasPerNodeGroup: 0,
      automaticFailoverEnabled: false,
      multiAzEnabled: false,
      cacheSubnetGroupName: redisSubnetGroup.ref,
      securityGroupIds: [redisSecurityGroup.securityGroupId],
      atRestEncryptionEnabled: true,
      transitEncryptionEnabled: true,
      authToken: redisAuthSecret.secretValue.unsafeUnwrap(),
      snapshotRetentionLimit: 7,
      snapshotWindow: '03:00-05:00',
      preferredMaintenanceWindow: 'sun:05:00-sun:07:00',
    });

    this.redisEndpoint = this.redis.attrPrimaryEndPointAddress;

    this.executionRole = new iam.Role(this, 'ExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });

    // Execution role needs secrets for container secrets injection
    redisAuthSecret.grantRead(this.executionRole);
    const apiKeySecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'ApiKey',
      `${prefix}/api-key`,
    );
    apiKeySecret.grantRead(this.executionRole);

    this.taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      inlinePolicies: {
        S3Access: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3:GetObject',
                's3:PutObject',
                's3:DeleteObject',
                's3:ListBucket',
              ],
              resources: [
                rendersBucketArn,
                `${rendersBucketArn}/*`,
                evidenceBucketArn,
                `${evidenceBucketArn}/*`,
              ],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['ssm:GetParameter', 'ssm:GetParameters'],
              resources: [
                `arn:aws:ssm:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:parameter/${prefix}/*`,
              ],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['secretsmanager:GetSecretValue'],
              resources: [
                `arn:aws:secretsmanager:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:secret:${prefix}/*`,
              ],
            }),
          ],
        }),
      },
    });

    this.logGroupName = `/aws/ecs/${prefix}-engine`;
    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: this.logGroupName,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Monorepo Docker context: mrs/ with Dockerfile at apps/rt4d-engine/Dockerfile
    const mrsRoot = path.join(__dirname, '..', '..', '..', 'mrs');

    this.serviceName = `${prefix}-engine`;
    this.service = new ecs_patterns.ApplicationLoadBalancedFargateService(this, 'EngineService', {
      cluster,
      serviceName: this.serviceName,
      taskImageOptions: {
        image: ecs.ContainerImage.fromAsset(mrsRoot, {
          file: 'apps/rt4d-engine/Dockerfile',
          platform: ecr_assets.Platform.LINUX_AMD64,
          // Respect mrs/.dockerignore — avoid copying pnpm symlink farms (Windows EPERM)
          ignoreMode: cdk.IgnoreMode.DOCKER,
          exclude: ['**/node_modules', '**/.git', '**/cdk.out'],
        }),
        containerPort: 8020,
        environment: {
          RT4D_ENGINE_PORT: '8020',
          REDIS_HOST: this.redisEndpoint,
          REDIS_PORT: '6379',
          RENDERS_BUCKET: rendersBucketName,
          EVIDENCE_BUCKET: evidenceBucketName,
          AWS_REGION: cdk.Stack.of(this).region,
          RUNTIME_FINGERPRINT_NODE: 'aws-ecs-fargate',
          RUNTIME_FINGERPRINT_ZLIB: 'builtin',
          RUNTIME_FINGERPRINT_PLATFORM: 'linux',
          RUNTIME_FINGERPRINT_ARCH: 'x64',
        },
        secrets: {
          REDIS_AUTH_TOKEN: ecs.Secret.fromSecretsManager(redisAuthSecret),
          RT4D_API_KEY: ecs.Secret.fromSecretsManager(apiKeySecret),
        },
        logDriver: ecs.LogDrivers.awsLogs({
          streamPrefix: 'engine',
          logGroup,
        }),
        executionRole: this.executionRole,
        taskRole: this.taskRole,
      },
      memoryLimitMiB: 2048,
      cpu: 1024,
      desiredCount: 1,
      minHealthyPercent: 50,
      maxHealthyPercent: 200,
      publicLoadBalancer: false,
      taskSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      assignPublicIp: false,
      circuitBreaker: { rollback: true },
      healthCheckGracePeriod: cdk.Duration.seconds(60),
    });

    this.loadBalancerDnsName = this.service.loadBalancer.loadBalancerDnsName;
    this.serviceSecurityGroups = this.service.service.connections.securityGroups;

    this.service.targetGroup.configureHealthCheck({
      path: '/health',
      interval: cdk.Duration.seconds(30),
      timeout: cdk.Duration.seconds(10),
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 3,
    });

    // Allow same-VPC clients (MCP Lambda in private subnets) without cross-stack SG mutation
    this.service.service.connections.allowFrom(
      ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
      ec2.Port.tcp(8020),
      'Allow VPC (MCP gateway Lambda) to engine tasks',
    );

    redisSecurityGroup.addIngressRule(
      this.service.service.connections.securityGroups[0],
      ec2.Port.tcp(6379),
      'Allow ECS tasks to access Redis',
    );

    const scalableTarget = this.service.service.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: 10,
    });

    scalableTarget.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.minutes(5),
      scaleOutCooldown: cdk.Duration.minutes(2),
    });

    scalableTarget.scaleOnMemoryUtilization('MemoryScaling', {
      targetUtilizationPercent: 80,
      scaleInCooldown: cdk.Duration.minutes(5),
      scaleOutCooldown: cdk.Duration.minutes(2),
    });

    new ssm.StringParameter(this, 'RedisEndpointParam', {
      parameterName: `/${prefix}/redis/endpoint`,
      stringValue: this.redisEndpoint,
      description: 'RT4D Redis cache primary endpoint',
    });

    new cdk.CfnOutput(this, 'ServiceName', {
      value: this.service.service.serviceName,
      exportName: `${prefix}-engine-service-name`,
    });
    new cdk.CfnOutput(this, 'LoadBalancerDns', {
      value: this.loadBalancerDnsName,
      exportName: `${prefix}-engine-alb-dns`,
    });
    new cdk.CfnOutput(this, 'RedisEndpoint', {
      value: this.redisEndpoint,
      exportName: `${prefix}-redis-endpoint`,
    });
    new cdk.CfnOutput(this, 'TaskRoleArn', {
      value: this.taskRole.roleArn,
      exportName: `${prefix}-engine-task-role-arn`,
    });
    new cdk.CfnOutput(this, 'ExecutionRoleArn', {
      value: this.executionRole.roleArn,
      exportName: `${prefix}-engine-execution-role-arn`,
    });
  }
}
