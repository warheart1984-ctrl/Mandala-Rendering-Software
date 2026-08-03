import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface UsageLedgerStackProps extends cdk.StackProps {
  projectName: string;
  stage: string;
}

/**
 * DynamoDB usage / entitlement ledger for commercial metering.
 *
 * Status: **declared** — synthable construct; no deploy/live evidence yet.
 * PK=tenantId, SK=renderId for exactly-once usage rows.
 */
export class UsageLedgerStack extends cdk.Stack {
  public readonly usageTable: dynamodb.Table;
  public readonly decisionsTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: UsageLedgerStackProps) {
    super(scope, id, props);

    const { projectName, stage } = props;
    const prefix = `${projectName}-${stage}`;

    this.usageTable = new dynamodb.Table(this, 'UsageTable', {
      tableName: `${prefix}-usage-ledger`,
      partitionKey: { name: 'tenantId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'renderId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.usageTable.addGlobalSecondaryIndex({
      indexName: 'byUserId',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'recordedAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    this.decisionsTable = new dynamodb.Table(this, 'EntitlementDecisionsTable', {
      tableName: `${prefix}-entitlement-decisions`,
      partitionKey: { name: 'tenantId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'decisionSk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    new cdk.CfnOutput(this, 'UsageTableName', {
      value: this.usageTable.tableName,
      description: 'Durable usage ledger table (declared until deploy)',
    });
    new cdk.CfnOutput(this, 'EntitlementDecisionsTableName', {
      value: this.decisionsTable.tableName,
      description: 'Entitlement decision audit table (declared until deploy)',
    });
  }
}
