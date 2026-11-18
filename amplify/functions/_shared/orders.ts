/**
 * Lógica de pedidos compartilhada entre as Lambdas (staff-orders, stripe-webhook, expire-orders).
 * Cancelar devolve os potes ao estoque e desfaz o efeito do pedido no PfandBox.
 */
import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  GetCommand,
  TransactWriteCommand,
  type DynamoDBDocumentClient,
  type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { PFAND_CENTS } from '../../../shared/pricing';

export type OrderStatus = 'aguardando_pagamento' | 'pago' | 'pronto' | 'retirado' | 'cancelado';
export type TransactItems = NonNullable<TransactWriteCommandInput['TransactItems']>;

export interface OrderTables {
  orderTable: string;
  stockTable: string;
  pfandBoxTable: string;
}

export interface OrderItem {
  flavorId: string;
  quantity: number;
}

/** Erro "esperado" (concorrência, regra de negócio) — a mensagem pode ir para quem chamou. */
export class OrderConflictError extends Error {}

/**
 * Monta as operações que desfazem um pedido: potes de volta ao estoque e PfandBox revertido.
 * Não inclui a atualização do próprio pedido (quem chama adiciona, com sua condição).
 */
export async function buildReleaseItems(
  ddb: DynamoDBDocumentClient,
  tables: OrderTables,
  order: Record<string, unknown>,
  now: string,
): Promise<TransactItems> {
  const items: TransactItems = [];

  for (const item of order.items as OrderItem[]) {
    items.push({
      Update: {
        TableName: tables.stockTable,
        Key: { flavorId: item.flavorId },
        UpdateExpression: 'SET #q = #q + :n, updatedAt = :now',
        ConditionExpression: 'attribute_exists(flavorId)',
        ExpressionAttributeNames: { '#q': 'quantity' },
        ExpressionAttributeValues: { ':n': item.quantity, ':now': now },
      },
    });
  }

  // Sem Pfand-Rückgabe declarada, o pedido somou +1 caixa em uso (e talvez usou crédito).
  if (order.pfandReturnDeclared !== true) {
    const email = order.customerEmail as string;
    const creditUsed =
      (order.pfandCreditUsedCents as number | undefined) ?? (order.pfandCharged === false ? PFAND_CENTS : 0);
    const { Item: box } = await ddb.send(
      new GetCommand({ TableName: tables.pfandBoxTable, Key: { customerEmail: email } }),
    );
    if (box) {
      const inUse = (box.boxesInUse as number) ?? 0;
      items.push({
        Update: {
          TableName: tables.pfandBoxTable,
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

  return items;
}

/**
 * Cancela um pedido de forma atômica, só se o status atual for um dos `allowedFrom`.
 * Retorna false se o pedido não estiver mais num desses status (já pago, já cancelado…).
 */
export async function cancelOrder(
  ddb: DynamoDBDocumentClient,
  tables: OrderTables,
  orderId: string,
  opts: { allowedFrom: OrderStatus[]; by: string; reason?: string },
): Promise<boolean> {
  const { Item: order } = await ddb.send(new GetCommand({ TableName: tables.orderTable, Key: { id: orderId } }));
  if (!order) return false;
  const current = order.status as OrderStatus;
  if (!opts.allowedFrom.includes(current)) return false;

  const now = new Date().toISOString();
  const transact = await buildReleaseItems(ddb, tables, order, now);
  transact.push({
    Update: {
      TableName: tables.orderTable,
      Key: { id: orderId },
      UpdateExpression: 'SET #s = :cancelado, updatedAt = :now, updatedBy = :by, cancelReason = :reason',
      ConditionExpression: '#s = :current',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':cancelado': 'cancelado',
        ':current': current,
        ':now': now,
        ':by': opts.by,
        ':reason': opts.reason ?? null,
      },
    },
  });

  try {
    await ddb.send(new TransactWriteCommand({ TransactItems: transact }));
    return true;
  } catch (err) {
    if (err instanceof TransactionCanceledException) {
      console.warn('cancelOrder conflict', orderId, err.CancellationReasons);
      throw new OrderConflictError('Die Bestellung wurde gerade geändert. Bitte neu laden und erneut versuchen.');
    }
    throw err;
  }
}
