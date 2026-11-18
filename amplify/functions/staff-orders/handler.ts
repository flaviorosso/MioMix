import { DynamoDBClient, TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  TransactWriteCommand,
  UpdateCommand,
  type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import type { AppSyncResolverEvent } from 'aws-lambda';
import type { Schema } from '../../data/resource';
import { PFAND_CENTS } from '../../../shared/pricing';

type OrderStatus = 'aguardando_pagamento' | 'pago' | 'pronto' | 'retirado' | 'cancelado';
type TransactItems = NonNullable<TransactWriteCommandInput['TransactItems']>;

const env = {
  stockTable: process.env.STOCK_TABLE!,
  orderTable: process.env.ORDER_TABLE!,
  pfandBoxTable: process.env.PFAND_BOX_TABLE!,
};

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

/** Transições permitidas (retirado e cancelado são finais). */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  aguardando_pagamento: ['pago', 'cancelado'],
  pago: ['pronto', 'cancelado'],
  pronto: ['retirado', 'cancelado'],
  retirado: [],
  cancelado: [],
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  aguardando_pagamento: 'Zahlung offen',
  pago: 'Bezahlt',
  pronto: 'Abholbereit',
  retirado: 'Abgeholt',
  cancelado: 'Storniert',
};

class StaffError extends Error {}

const staffName = (event: AppSyncResolverEvent<unknown>) => {
  const identity = event.identity as { username?: string; claims?: { email?: string } } | null;
  return identity?.claims?.email ?? identity?.username ?? 'staff';
};

// ---------------------------------------------------------------------------
// updateOrderStatus
// ---------------------------------------------------------------------------
type UpdateArgs = Schema['updateOrderStatus']['args'];
type UpdateResult = Schema['updateOrderStatus']['returnType'];

async function updateOrderStatus(
  args: UpdateArgs,
  event: AppSyncResolverEvent<unknown>,
): Promise<UpdateResult> {
  const next = args.status as OrderStatus;
  const { Item: order } = await ddb.send(
    new GetCommand({ TableName: env.orderTable, Key: { id: args.orderId } }),
  );
  if (!order) throw new StaffError('Bestellung nicht gefunden.');

  const current = order.status as OrderStatus;
  if (!TRANSITIONS[current]?.includes(next)) {
    throw new StaffError(
      `Statuswechsel von „${STATUS_LABEL[current]}“ nach „${STATUS_LABEL[next]}“ ist nicht möglich.`,
    );
  }

  const now = new Date().toISOString();
  const email = order.customerEmail as string;
  const declared = order.pfandReturnDeclared === true;
  const extraSets: Record<string, unknown> = {};
  const transact: TransactItems = [];

  // --- Cancelar: devolve potes e desfaz o Pfand -----------------------------
  if (next === 'cancelado') {
    for (const item of order.items as { flavorId: string; quantity: number }[]) {
      transact.push({
        Update: {
          TableName: env.stockTable,
          Key: { flavorId: item.flavorId },
          UpdateExpression: 'SET #q = #q + :n, updatedAt = :now',
          ConditionExpression: 'attribute_exists(flavorId)',
          ExpressionAttributeNames: { '#q': 'quantity' },
          ExpressionAttributeValues: { ':n': item.quantity, ':now': now },
        },
      });
    }

    if (!declared) {
      // O pedido colocou +1 caixa em uso; se usou crédito, devolve o crédito.
      const creditUsed =
        (order.pfandCreditUsedCents as number | undefined) ??
        (order.pfandCharged === false ? PFAND_CENTS : 0);
      const { Item: box } = await ddb.send(
        new GetCommand({ TableName: env.pfandBoxTable, Key: { customerEmail: email } }),
      );
      if (box) {
        const inUse = (box.boxesInUse as number) ?? 0;
        transact.push({
          Update: {
            TableName: env.pfandBoxTable,
            Key: { customerEmail: email },
            UpdateExpression: 'SET boxesInUse = :newInUse, creditCents = creditCents + :credit, updatedAt = :now',
            ConditionExpression: 'boxesInUse = :oldInUse',
            ExpressionAttributeValues: {
              ':newInUse': Math.max(0, inUse - 1),
              ':oldInUse': inUse,
              ':credit': creditUsed,
              ':now': now,
            },
          },
        });
      }
    }
  }

  // --- Retirada com Pfand-Rückgabe declarada: staff confirma a caixa ----------
  if (next === 'retirado' && declared) {
    if (typeof args.pfandBoxReceived !== 'boolean') {
      throw new StaffError('Bitte angeben, ob die Pfand-Box zurückgegeben wurde.');
    }
    extraSets.pfandBoxReceived = args.pfandBoxReceived;
    extraSets.pfandCollectedOnSite = !args.pfandBoxReceived;
    transact.push({
      Update: {
        TableName: env.pfandBoxTable,
        Key: { customerEmail: email },
        UpdateExpression: args.pfandBoxReceived
          ? // troca: caixa devolvida, caixa nova levada → em uso não muda
            'SET boxesReturned = if_not_exists(boxesReturned, :zero) + :one, boxesInUse = if_not_exists(boxesInUse, :zero), creditCents = if_not_exists(creditCents, :zero), #tn = :tn, createdAt = if_not_exists(createdAt, :now), updatedAt = :now'
          : // sem caixa: Pfand cobrado no local → +1 caixa em uso
            'SET boxesInUse = if_not_exists(boxesInUse, :zero) + :one, boxesReturned = if_not_exists(boxesReturned, :zero), creditCents = if_not_exists(creditCents, :zero), #tn = :tn, createdAt = if_not_exists(createdAt, :now), updatedAt = :now',
        ExpressionAttributeNames: { '#tn': '__typename' },
        ExpressionAttributeValues: { ':zero': 0, ':one': 1, ':tn': 'PfandBox', ':now': now },
      },
    });
  }

  // --- Pedido (com controle de concorrência pelo status atual) ---------------
  const setParts = ['#s = :next', 'updatedAt = :now', 'updatedBy = :by'];
  const values: Record<string, unknown> = {
    ':next': next,
    ':current': current,
    ':now': now,
    ':by': staffName(event),
  };
  for (const [key, value] of Object.entries(extraSets)) {
    setParts.push(`${key} = :${key}`);
    values[`:${key}`] = value;
  }
  transact.push({
    Update: {
      TableName: env.orderTable,
      Key: { id: args.orderId },
      UpdateExpression: `SET ${setParts.join(', ')}`,
      ConditionExpression: '#s = :current',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: values,
    },
  });

  try {
    await ddb.send(new TransactWriteCommand({ TransactItems: transact }));
  } catch (err) {
    if (err instanceof TransactionCanceledException) {
      console.warn('updateOrderStatus conflict', err.CancellationReasons);
      throw new StaffError('Die Bestellung wurde gerade geändert. Bitte neu laden und erneut versuchen.');
    }
    throw err;
  }

  return { orderId: args.orderId, status: next };
}

// ---------------------------------------------------------------------------
// registerPfandReturn
// ---------------------------------------------------------------------------
type ReturnArgs = Schema['registerPfandReturn']['args'];
type ReturnResult = Schema['registerPfandReturn']['returnType'];

async function registerPfandReturn(args: ReturnArgs): Promise<ReturnResult> {
  const email = args.customerEmail.trim().toLowerCase();
  const boxes = args.boxes;
  if (!Number.isInteger(boxes) || boxes < 1 || boxes > 20) {
    throw new StaffError('Bitte eine Anzahl zwischen 1 und 20 angeben.');
  }

  const { Item: box } = await ddb.send(
    new GetCommand({ TableName: env.pfandBoxTable, Key: { customerEmail: email } }),
  );
  if (!box) throw new StaffError('Für diese E-Mail-Adresse sind keine Pfand-Boxen registriert.');
  const inUse = (box.boxesInUse as number) ?? 0;
  if (boxes > inUse) {
    throw new StaffError(`Diese Kundin / dieser Kunde hat nur ${inUse} Box(en) in Benutzung.`);
  }

  try {
    const res = await ddb.send(
      new UpdateCommand({
        TableName: env.pfandBoxTable,
        Key: { customerEmail: email },
        UpdateExpression:
          'SET boxesInUse = :newInUse, boxesReturned = if_not_exists(boxesReturned, :zero) + :n, creditCents = if_not_exists(creditCents, :zero) + :credit, updatedAt = :now',
        ConditionExpression: 'boxesInUse = :oldInUse',
        ExpressionAttributeValues: {
          ':newInUse': inUse - boxes,
          ':oldInUse': inUse,
          ':zero': 0,
          ':n': boxes,
          ':credit': boxes * PFAND_CENTS,
          ':now': new Date().toISOString(),
        },
        ReturnValues: 'ALL_NEW',
      }),
    );
    const a = res.Attributes!;
    return {
      customerEmail: email,
      boxesInUse: a.boxesInUse as number,
      boxesReturned: a.boxesReturned as number,
      creditCents: a.creditCents as number,
    };
  } catch (err) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      throw new StaffError('Die Daten wurden gerade geändert. Bitte erneut versuchen.');
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Roteamento pelas mutations
// ---------------------------------------------------------------------------
export const handler = async (event: AppSyncResolverEvent<Record<string, unknown>>) => {
  switch (event.info.fieldName) {
    case 'updateOrderStatus':
      return updateOrderStatus(event.arguments as unknown as UpdateArgs, event);
    case 'registerPfandReturn':
      return registerPfandReturn(event.arguments as unknown as ReturnArgs);
    default:
      throw new Error(`Unbekannte Operation: ${event.info.fieldName}`);
  }
};
