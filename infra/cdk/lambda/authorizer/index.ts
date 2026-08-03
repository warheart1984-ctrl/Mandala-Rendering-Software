/**
 * API Gateway Token authorizer for RT4D_API_KEY (Bearer).
 * Fail-closed: missing/invalid/secret-error → Unauthorized (401).
 * Status: partial (synth/bundled); live auth proven only after deploy + secret seed.
 */
import type {
  APIGatewayAuthorizerResult,
  APIGatewayTokenAuthorizerEvent,
  PolicyDocument,
} from 'aws-lambda';
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';

interface ApiKeyRecord {
  keys?: string[];
  /** Alternate single-key shape used by some operators */
  api_key?: string;
}

const secretsManager = new SecretsManagerClient({});

function denyUnauthorized(): never {
  // API Gateway maps this to HTTP 401
  throw new Error('Unauthorized');
}

function stageWildcardResource(methodArn: string): string {
  // arn:aws:execute-api:<region>:<acct>:<api>/<stage>/<METHOD>/<path...>
  // → arn:aws:execute-api:<region>:<acct>:<api>/<stage>/*/*
  // Scoped to this API+stage so cached policies cover every method/route
  // under the 5-minute resultsCacheTtl without per-route re-authorization.
  const arnParts = methodArn.split('/');
  const base = arnParts.slice(0, 2).join('/');
  return `${base}/*/*`;
}

function allowPolicy(
  principalId: string,
  methodArn: string,
  context: Record<string, string>,
): APIGatewayAuthorizerResult {
  const policyDocument: PolicyDocument = {
    Version: '2012-10-17',
    Statement: [
      {
        Action: 'execute-api:Invoke',
        Effect: 'Allow',
        Resource: stageWildcardResource(methodArn),
      },
    ],
  };
  return {
    principalId,
    policyDocument,
    context,
  };
}

export async function handler(
  event: APIGatewayTokenAuthorizerEvent,
): Promise<APIGatewayAuthorizerResult> {
  const token = event.authorizationToken;
  if (!token) {
    denyUnauthorized();
  }

  const match = /^Bearer\s+(.+)$/i.exec(token);
  if (!match?.[1]) {
    denyUnauthorized();
  }

  const providedKey = match[1].trim();
  if (!providedKey) {
    denyUnauthorized();
  }

  const secretName = process.env.API_KEYS_SECRET;
  if (!secretName) {
    console.error('API_KEYS_SECRET env missing — fail closed');
    denyUnauthorized();
  }

  try {
    const secretResponse = await secretsManager.send(
      new GetSecretValueCommand({ SecretId: secretName }),
    );
    const secret = JSON.parse(secretResponse.SecretString || '{}') as ApiKeyRecord;
    const allowed = new Set<string>([
      ...(Array.isArray(secret.keys) ? secret.keys : []),
      ...(secret.api_key ? [secret.api_key] : []),
    ]);

    if (!allowed.has(providedKey)) {
      denyUnauthorized();
    }

    // Do not echo the raw key into context (avoid log/leak surfaces)
    return allowPolicy('rt4d-mcp-client', event.methodArn, {
      stage: process.env.STAGE || 'unknown',
      projectName: process.env.PROJECT_NAME || 'unknown',
      auth: 'bearer-api-key',
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      throw err;
    }
    console.error('Secret retrieval or parse failed — fail closed:', err);
    denyUnauthorized();
  }
}
