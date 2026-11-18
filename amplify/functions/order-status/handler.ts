import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import type { Schema } from '../../data/resource';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ORDER_TABLE = process.env.ORDER_TABLE!;
const PICKUP_POINT_TABLE = process.env.PICKUP_POINT_TABLE!;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Handler = Schema['getOrderStatus']['functionHandler'];

/** Visão pública de um pedido: sem e-mail, telefone ou sobrenome. */
export const handler: Handler = async (event) => {
  const orderId = event.arguments.orderId;
  if (!UUID_RE.test(orderId)) return null;

  const { Item: o } = await ddb.send(new GetCommand({ TableName: ORDER_TABLE, Key: { id: orderId } }));
  if (!o) return null;

  const { Item: point } = await ddb.send(
    new GetCommand({ TableName: PICKUP_POINT_TABLE, Key: { code: o.pickupPointCode } }),
  );

  const stillPayable =
    o.status === 'aguardando_pagamento' &&
    typeof o.checkoutExpiresAt === 'string' &&
    new Date(o.checkoutExpiresAt).getTime() > Date.now();

  return {
    orderId,
    orderCode: o.orderCode,
    status: o.status,
    customerFirstName: String(o.customerName ?? '').split(' ')[0],
    pickupPointCode: o.pickupPointCode,
    pickupPointName: point?.name ?? o.pickupPointCode,
    pickupPointHours: point?.openingHours ?? null,
    pickupDeadline: o.pickupDeadline,
    paid: !!o.paidAt,
    boxSize: o.boxSize,
    items: o.items,
    priceCents: o.priceCents,
    pfandCents: o.pfandCents,
    totalCents: o.totalCents,
    pfandCharged: o.pfandCharged,
    checkoutUrl: stillPayable ? o.checkoutUrl : null,
    checkoutExpiresAt: stillPayable ? o.checkoutExpiresAt : null,
  };
};
