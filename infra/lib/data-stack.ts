import { CfnOutput, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import * as ddb from "aws-cdk-lib/aws-dynamodb";
import * as oss from "aws-cdk-lib/aws-opensearchserverless";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

export const TABLES = ["Company", "Asset", "Ownership", "Disclosure", "Estimate", "ForecastRun", "AgentRun", "Alert"] as const;

export interface DataStackProps extends StackProps {
  tablePrefix: string;
  deployOpenSearch: boolean;
}

/** S3 x3 (raw / curated / reports) + DynamoDB tables (plan §9.1) + optional OpenSearch Serverless vector collection. */
export class DataStack extends Stack {
  readonly raw: s3.Bucket;
  readonly curated: s3.Bucket;
  readonly reports: s3.Bucket;
  readonly tables: Record<string, ddb.Table> = {};

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);
    const bucket = (name: string, versioned: boolean) =>
      new s3.Bucket(this, name, {
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        encryption: s3.BucketEncryption.S3_MANAGED,
        enforceSSL: true,
        versioned,
        removalPolicy: RemovalPolicy.RETAIN,
      });
    this.raw = bucket("Raw", true);
    this.curated = bucket("Curated", true);
    this.reports = bucket("Reports", false);

    for (const name of TABLES) {
      this.tables[name] = new ddb.Table(this, `${name}Table`, {
        tableName: `${props.tablePrefix}${name}`,
        partitionKey: { name: "pk", type: ddb.AttributeType.STRING },
        sortKey: { name: "sk", type: ddb.AttributeType.STRING },
        billingMode: ddb.BillingMode.PAY_PER_REQUEST,
        pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
        removalPolicy: RemovalPolicy.RETAIN,
      });
    }

    // OpenSearch Serverless bills per OCU-hour while it exists: only behind deployOpenSearch=true (AGENTS.md §2.2).
    // Default entity-resolution path uses Titan embeddings in memory / FAISS-style files on S3.
    if (props.deployOpenSearch) {
      const name = "energy-truth-entities";
      const enc = new oss.CfnSecurityPolicy(this, "OssEnc", { name: `${name}-enc`, type: "encryption", policy: JSON.stringify({ Rules: [{ ResourceType: "collection", Resource: [`collection/${name}`] }], AWSOwnedKey: true }) });
      const net = new oss.CfnSecurityPolicy(this, "OssNet", { name: `${name}-net`, type: "network", policy: JSON.stringify([{ Rules: [{ ResourceType: "collection", Resource: [`collection/${name}`] }], AllowFromPublic: true }]) });
      const col = new oss.CfnCollection(this, "Entities", { name, type: "VECTORSEARCH" });
      col.addDependency(enc);
      col.addDependency(net);
      new CfnOutput(this, "OpenSearchEndpoint", { value: col.attrCollectionEndpoint });
      new CfnOutput(this, "OpenSearchCollectionArn", { value: col.attrArn });
    }

    new CfnOutput(this, "S3RawBucket", { value: this.raw.bucketName });
    new CfnOutput(this, "S3CuratedBucket", { value: this.curated.bucketName });
    new CfnOutput(this, "S3ReportsBucket", { value: this.reports.bucketName });
    new CfnOutput(this, "DdbTablePrefix", { value: props.tablePrefix });
  }
}
