/**
 * Grava só as traduções PT/EN dos sabores de exemplo (não mexe em estoque nem nos textos em alemão).
 * Sabores que já têm tradução são mantidos, a menos que se passe --force.
 *
 * Uso: AWS_PROFILE=miomix AWS_REGION=eu-north-1 npx tsx scripts/set-translations.ts <apiId> [--force]
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { FLAVOR_TRANSLATIONS } from './flavor-translations';

const apiId = process.argv[2];
if (!apiId) throw new Error('Uso: npx tsx scripts/set-translations.ts <apiId> [--force]');
const force = process.argv.includes('--force');
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

for (const [id, translations] of Object.entries(FLAVOR_TRANSLATIONS)) {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: `Flavor-${apiId}-NONE`,
        Key: { id },
        UpdateExpression: 'SET translations = :t, updatedAt = :now',
        ConditionExpression: force
          ? 'attribute_exists(id)'
          : 'attribute_exists(id) AND (attribute_not_exists(translations) OR translations = :empty)',
        ExpressionAttributeValues: {
          ':t': JSON.stringify(translations),
          ':now': new Date().toISOString(),
          ...(force ? {} : { ':empty': '{}' }),
        },
      }),
    );
    console.log(`${id}: ok`);
  } catch (err) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') console.log(`${id}: übersprungen`);
    else throw err;
  }
}
