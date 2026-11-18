import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { UNPAID_EXPIRY_MINUTES } from '../../../shared/payment';
import { OrderConflictError, cancelOrder, type OrderTables } from '../_shared/orders';

const tables: OrderTables = {
  orderTable: process.env.ORDER_TABLE!,
  stockTable: process.env.STOCK_TABLE!,
  pfandBoxTable: process.env.PFAND_BOX_TABLE!,
};

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

/**
 * Roda a cada 15 min: cancela pedidos ainda "aguardando_pagamento" criados há mais de
 * UNPAID_EXPIRY_MINUTES (o Stripe expira a sessão em 30 min; isto cobre avisos perdidos).
 */
export const handler = async () => {
  const cutoff = new Date(Date.now() - UNPAID_EXPIRY_MINUTES * 60_000).toISOString();
  let lastKey: Record<string, unknown> | undefined;
  let cancelled = 0;
  let checked = 0;

  do {
    const page = await ddb.send(
      new ScanCommand({
        TableName: tables.orderTable,
        FilterExpression: '#s = :waiting AND createdAt < :cutoff',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':waiting': 'aguardando_pagamento', ':cutoff': cutoff },
        ProjectionExpression: 'id',
        ExclusiveStartKey: lastKey,
      }),
    );
    for (const item of page.Items ?? []) {
      checked++;
      try {
        const ok = await cancelOrder(ddb, tables, item.id as string, {
          allowedFrom: ['aguardando_pagamento'],
          by: 'system',
          reason: 'Nicht rechtzeitig bezahlt',
        });
        if (ok) cancelled++;
      } catch (err) {
        if (!(err instanceof OrderConflictError)) console.error('expire failed', item.id, err);
      }
    }
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);

  console.log(`expire-orders: ${checked} candidate(s), ${cancelled} cancelled`);
  return { checked, cancelled };
};
