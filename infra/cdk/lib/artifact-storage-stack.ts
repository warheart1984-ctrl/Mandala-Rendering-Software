import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface ArtifactStorageStackProps extends cdk.StackProps {
  projectName: string;
  stage: string;
}

/**
 * S3 artifact storage for RT4D renders and evidence bundles.
 * Status: partial — buckets defined; lifecycle/cors ready; no deploy evidence yet.
 */
export class ArtifactStorageStack extends cdk.Stack {
  public readonly rendersBucket: s3.Bucket;
  public readonly evidenceBucket: s3.Bucket;
  public readonly logsBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: ArtifactStorageStackProps) {
    super(scope, id, props);

    const { projectName, stage } = props;
    const prefix = `${projectName}-${stage}`;

    this.rendersBucket = new s3.Bucket(this, 'RendersBucket', {
      bucketName: `${prefix}-renders`,
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      lifecycleRules: [
        {
          id: 'expire-incomplete-multipart',
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
        },
        {
          id: 'transition-to-ia',
          transitions: [
            { storageClass: s3.StorageClass.INFREQUENT_ACCESS, transitionAfter: cdk.Duration.days(30) },
            { storageClass: s3.StorageClass.GLACIER, transitionAfter: cdk.Duration.days(90) },
          ],
        },
        {
          id: 'expire-old-versions',
          noncurrentVersionExpiration: cdk.Duration.days(365),
        },
      ],
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.HEAD],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
          maxAge: 3600,
        },
      ],
    });

    this.evidenceBucket = new s3.Bucket(this, 'EvidenceBucket', {
      bucketName: `${prefix}-evidence`,
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      lifecycleRules: [
        {
          id: 'expire-incomplete-multipart',
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
        },
        {
          id: 'transition-to-ia',
          transitions: [
            { storageClass: s3.StorageClass.INFREQUENT_ACCESS, transitionAfter: cdk.Duration.days(30) },
            { storageClass: s3.StorageClass.GLACIER, transitionAfter: cdk.Duration.days(90) },
          ],
        },
        {
          id: 'expire-old-versions',
          noncurrentVersionExpiration: cdk.Duration.days(2555),
        },
      ],
    });

    this.logsBucket = new s3.Bucket(this, 'LogsBucket', {
      bucketName: `${prefix}-logs`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      lifecycleRules: [
        {
          id: 'expire-logs',
          expiration: cdk.Duration.days(90),
        },
      ],
    });

    new cdk.CfnOutput(this, 'RendersBucketName', {
      value: this.rendersBucket.bucketName,
      exportName: `${prefix}-renders-bucket`,
    });
    new cdk.CfnOutput(this, 'EvidenceBucketName', {
      value: this.evidenceBucket.bucketName,
      exportName: `${prefix}-evidence-bucket`,
    });
    new cdk.CfnOutput(this, 'LogsBucketName', {
      value: this.logsBucket.bucketName,
      exportName: `${prefix}-logs-bucket`,
    });
    new cdk.CfnOutput(this, 'RendersBucketArn', {
      value: this.rendersBucket.bucketArn,
      exportName: `${prefix}-renders-bucket-arn`,
    });
    new cdk.CfnOutput(this, 'EvidenceBucketArn', {
      value: this.evidenceBucket.bucketArn,
      exportName: `${prefix}-evidence-bucket-arn`,
    });
  }
}
