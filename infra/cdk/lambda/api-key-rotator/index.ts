import { SecretsManagerClient, GetSecretValueCommand, PutSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { ApiGatewayClient, CreateApiKeyCommand, CreateUsagePlanKeyCommand, DeleteApiKeyCommand, GetUsagePlanCommand, UpdateApiKeyCommand } from '@aws-sdk/client-apigateway';
import * as crypto from 'crypto';

const secretsClient = new SecretsManagerClient({});
const apiClient = new ApiGatewayClient({});

interface RotatorEvent {
  source: string;
  detail?: Record<string, unknown>;
}

export async function handler(event: RotatorEvent): Promise<{ statusCode: number; body: string }> {
  const secretName = process.env.API_KEYS_SECRET || '';
  const usagePlanId = process.env.USAGE_PLAN_ID || '';
  const projectName = process.env.PROJECT_NAME || 'mrs-rt4d';
  const stage = process.env.STAGE || 'dev';

  const oldSecret = await secretsClient.send(new GetSecretValueCommand({ SecretId: secretName }));
  const oldKeys: string[] = JSON.parse(oldSecret.SecretString || '{"keys":[]}').keys || [];

  const newKey = `${projectName}-${stage}-${crypto.randomBytes(32).toString('hex')}`;

  const createKeyResult = await apiClient.send(new CreateApiKeyCommand({
    name: `${projectName}-${stage}-rotated-${Date.now()}`,
    value: newKey,
    enabled: true,
    description: `Auto-rotated API key for ${projectName} ${stage}`,
  }));

  const keyId = createKeyResult.id;

  if (usagePlanId && keyId) {
    await apiClient.send(new CreateUsagePlanKeyCommand({
      usagePlanId,
      keyId,
      keyType: 'API_KEY',
    }));
  }

  for (const oldKey of oldKeys) {
    try {
      const usagePlan = await apiClient.send(new GetUsagePlanCommand({ usagePlanId }));
      const keyList = usagePlan.keys || [];
      const oldKeyEntry = keyList.find((k) => k.value === oldKey);
      if (oldKeyEntry && oldKeyEntry.id) {
        await apiClient.send(new UpdateApiKeyCommand({
          apiKey: oldKeyEntry.id,
          patchOperations: [{ op: 'replace', path: '/enabled', value: 'false' }],
        }));
      }
    } catch {
      // Continue rotating even if one old key can't be disabled
    }
  }

  const newKeys = [newKey, ...oldKeys].slice(0, 5);

  await secretsClient.send(new PutSecretValueCommand({
    SecretId: secretName,
    secretString: JSON.stringify({ keys: newKeys }),
  }));

  return {
    statusCode: 200,
    body: JSON.stringify({ rotated: true, newKeyId: keyId, oldKeysDisabled: oldKeys.length }),
  };
}