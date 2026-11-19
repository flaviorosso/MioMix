/** Grava só o horário dos pontos (não mexe em estoque). Uso: npx tsx scripts/set-hours.ts <apiId> */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { formatWeeklyHours, type OpeningDay } from '../shared/hours';

const apiId = process.argv[2];
if (!apiId) throw new Error('apiId fehlt');
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const hours: Record<string, OpeningDay[]> = {
  ciaociao: [1, 2, 3, 4, 5, 6].map((day) => ({ day, open: '11:00', close: '21:00' })),
  racchetta: [0, 2, 3, 4, 5, 6].map((day) => ({ day, open: '16:00', close: '22:00' })),
};
for (const [code, h] of Object.entries(hours)) {
  await ddb.send(
    new UpdateCommand({
      TableName: `PickupPoint-${apiId}-NONE`,
      Key: { code },
      UpdateExpression: 'SET weeklyHours = :h, openingHours = :t, updatedAt = :now',
      ConditionExpression: 'attribute_exists(code)',
      ExpressionAttributeValues: { ':h': JSON.stringify(h), ':t': formatWeeklyHours(h), ':now': new Date().toISOString() },
    }),
  );
  console.log(code, '→', formatWeeklyHours(h));
}
