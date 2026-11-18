import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyStructuredResultV2, LambdaFunctionURLEvent } from 'aws-lambda';
import Stripe from 'stripe';
import { PICKUP_WINDOW_HOURS } from '../../../shared/pricing';
import { cancelOrder, type OrderTables } from '../_shared/orders';

const tables: OrderTables = {
  orderTable: process.env.ORDER_TABLE!,
  stockTable: process.env.STOCK_TABLE!,
  pfandBoxTable: process.env.PFAND_BOX_TABLE!,
};

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

let stripeClient: Stripe | undefined;
const stripe = () => (stripeClient ??= new Stripe(process.env.STRIPE_SECRET_KEY!));

const reply = (statusCode: number, body: string): APIGatewayProxyStructuredResultV2 => ({
  statusCode,
  headers: { 'content-type': 'text/plain' },
  body,
});

/** Marca o pedido como pago. O prazo de retirada (24 h) passa a contar do pagamento. */
async function markPaid(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.orderId ?? session.client_reference_id;
  if (!orderId) {
    console.error('session without orderId', session.id);
    return;
  }
  const paymentIntentId =
    typeof session.payment_intent === 'string' ? session.payment_intent : (session.payment_intent?.id ?? null);
  const paidAt = new Date();
  const deadline = new Date(paidAt.getTime() + PICKUP_WINDOW_HOURS * 3600_000);

  try {
    await ddb.send(
      new UpdateCommand({
        TableName: tables.orderTable,
        Key: { id: orderId },
        UpdateExpression:
          'SET #s = :pago, paidAt = :paidAt, pickupDeadline = :deadline, stripePaymentIntentId = :pi, updatedAt = :now, updatedBy = :by',
        ConditionExpression: '#s = :waiting',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':pago': 'pago',
          ':waiting': 'aguardando_pagamento',
          ':paidAt': paidAt.toISOString(),
          ':deadline': deadline.toISOString(),
          ':pi': paymentIntentId,
          ':now': paidAt.toISOString(),
          ':by': 'stripe',
        },
      }),
    );
    console.log('order paid', orderId);
  } catch (err) {
    if ((err as { name?: string }).name !== 'ConditionalCheckFailedException') throw err;
    // Já processado (Stripe reenviou) ou o pedido foi cancelado antes do pagamento.
    const { Item: order } = await ddb.send(new GetCommand({ TableName: tables.orderTable, Key: { id: orderId } }));
    if (order?.status === 'cancelado' && !order.paidAt) {
      console.error('PAYMENT AFTER CANCEL — refund needed', orderId, paymentIntentId);
      await ddb.send(
        new UpdateCommand({
          TableName: tables.orderTable,
          Key: { id: orderId },
          UpdateExpression: 'SET paymentAfterCancel = :t, paidAt = :paidAt, stripePaymentIntentId = :pi, updatedAt = :now',
          ExpressionAttributeValues: {
            ':t': true,
            ':paidAt': paidAt.toISOString(),
            ':pi': paymentIntentId,
            ':now': paidAt.toISOString(),
          },
        }),
      );
    }
  }
}

async function cancelUnpaid(session: Stripe.Checkout.Session, reason: string) {
  const orderId = session.metadata?.orderId ?? session.client_reference_id;
  if (!orderId) return;
  const cancelled = await cancelOrder(ddb, tables, orderId, {
    allowedFrom: ['aguardando_pagamento'],
    by: 'stripe',
    reason,
  });
  console.log(cancelled ? 'order cancelled' : 'order not cancelled (status changed)', orderId, reason);
}

export const handler = async (event: LambdaFunctionURLEvent): Promise<APIGatewayProxyStructuredResultV2> => {
  if (event.requestContext.http.method !== 'POST') return reply(405, 'Method Not Allowed');

  const signature = event.headers['stripe-signature'];
  if (!signature || !event.body) return reply(400, 'Missing signature');
  const rawBody = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;

  let stripeEvent: Stripe.Event;
  try {
    stripeEvent = stripe().webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.warn('invalid signature', (err as Error).message);
    return reply(400, 'Invalid signature');
  }

  try {
    switch (stripeEvent.type) {
      case 'checkout.session.completed': {
        const session = stripeEvent.data.object;
        if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') {
          await markPaid(session);
        } // 'unpaid' = pagamento assíncrono em andamento → aguarda async_payment_succeeded
        break;
      }
      case 'checkout.session.async_payment_succeeded':
        await markPaid(stripeEvent.data.object);
        break;
      case 'checkout.session.async_payment_failed':
        await cancelUnpaid(stripeEvent.data.object, 'Zahlung fehlgeschlagen');
        break;
      case 'checkout.session.expired':
        await cancelUnpaid(stripeEvent.data.object, 'Zahlungszeit abgelaufen');
        break;
      default:
        console.log('ignored event', stripeEvent.type);
    }
  } catch (err) {
    // 500 → o Stripe tenta de novo mais tarde.
    console.error('webhook processing failed', stripeEvent.type, err);
    return reply(500, 'Processing failed');
  }

  return reply(200, 'ok');
};
