import { randomInt, randomUUID } from 'node:crypto';
import { DynamoDBClient, TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  TransactWriteCommand,
  type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import type { Schema } from '../../data/resource';
// Preços e regras: fonte única compartilhada com a página (o servidor recalcula sempre).
import { PFAND_CENTS, PICKUP_WINDOW_HOURS, PRICES_CENTS, isBoxSize } from '../../../shared/pricing';

/** Código curto para o balcão, sem caracteres ambíguos (0/O, 1/I/L). Ex.: MM-7K4Q2X */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const makeOrderCode = () =>
  'MM-' + Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');

const env = {
  flavorTable: process.env.FLAVOR_TABLE!,
  pickupPointTable: process.env.PICKUP_POINT_TABLE!,
  stockTable: process.env.STOCK_TABLE!,
  orderTable: process.env.ORDER_TABLE!,
  pfandBoxTable: process.env.PFAND_BOX_TABLE!,
};

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

/** Erro de validação: a mensagem (em alemão) é mostrada ao cliente. */
class OrderError extends Error {}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[0-9 ()/-]{6,25}$/;

type Handler = Schema['placeOrder']['functionHandler'];

export const handler: Handler = async (event) => {
  const args = event.arguments;

  // --- 1. Validação dos dados do cliente ------------------------------------
  const customerName = args.customerName.trim();
  const customerEmail = args.customerEmail.trim().toLowerCase();
  const customerPhone = args.customerPhone.trim();
  const pickupPointCode = args.pickupPointCode.trim().toLowerCase();
  const boxSize = args.boxSize;

  if (customerName.length < 2 || customerName.length > 100) {
    throw new OrderError('Bitte gib deinen Namen an.');
  }
  if (!EMAIL_RE.test(customerEmail) || customerEmail.length > 254) {
    throw new OrderError('Bitte gib eine gültige E-Mail-Adresse an.');
  }
  if (!PHONE_RE.test(customerPhone)) {
    throw new OrderError('Bitte gib eine gültige Telefonnummer an.');
  }

  if (!isBoxSize(boxSize)) {
    throw new OrderError('Ungültige Boxgröße. Erlaubt sind 4, 6 oder 8 Becher.');
  }
  const priceCents = PRICES_CENTS[boxSize];

  // Junta sabores repetidos e confere as quantidades.
  const quantities = new Map<string, number>();
  for (const item of args.items ?? []) {
    if (!item || !Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new OrderError('Ungültige Menge im Warenkorb.');
    }
    quantities.set(item.flavorId, (quantities.get(item.flavorId) ?? 0) + item.quantity);
  }
  const totalCups = [...quantities.values()].reduce((sum, q) => sum + q, 0);
  if (quantities.size === 0 || totalCups !== boxSize) {
    throw new OrderError(`Bitte wähle genau ${boxSize} Becher für deine Box.`);
  }

  // --- 2. Ponto de retirada e sabores (lidos no servidor) -------------------
  const pickup = await ddb.send(
    new GetCommand({ TableName: env.pickupPointTable, Key: { code: pickupPointCode } }),
  );
  if (!pickup.Item || pickup.Item.active === false) {
    throw new OrderError('Unbekannter Abholort.');
  }

  const flavorIds = [...quantities.keys()];
  const flavors = await Promise.all(
    flavorIds.map((id) => ddb.send(new GetCommand({ TableName: env.flavorTable, Key: { id } }))),
  );
  const items = flavorIds.map((flavorId, i) => {
    const flavor = flavors[i].Item;
    if (!flavor || flavor.active !== true) {
      throw new OrderError('Eine der gewählten Sorten ist nicht verfügbar.');
    }
    return { flavorId, flavorName: flavor.name as string, quantity: quantities.get(flavorId)! };
  });

  // --- 3. Pfand -------------------------------------------------------------
  // a) Cliente declarou que devolveu uma caixa → sem Pfand; staff confere na retirada
  //    (troca: caixas em uso não aumentam).
  // b) Senão, usa o crédito do cliente, se houver; senão cobra o Pfand.
  const pfandReturnDeclared = args.pfandBoxReturned === true;
  let useCredit = false;
  if (!pfandReturnDeclared) {
    const pfandBox = await ddb.send(
      new GetCommand({ TableName: env.pfandBoxTable, Key: { customerEmail } }),
    );
    const creditCents = (pfandBox.Item?.creditCents as number | undefined) ?? 0;
    useCredit = creditCents >= PFAND_CENTS;
  }
  const pfandCharged = !pfandReturnDeclared && !useCredit;
  const pfandCents = pfandCharged ? PFAND_CENTS : 0;
  const totalCents = priceCents + pfandCents;

  // --- 4. Transação: reserva potes + grava pedido + atualiza Pfand ----------
  const now = new Date();
  const nowIso = now.toISOString();
  const pickupDeadline = new Date(now.getTime() + PICKUP_WINDOW_HOURS * 3600_000).toISOString();
  const orderId = randomUUID();
  const orderCode = makeOrderCode();
  const status = 'aguardando_pagamento' as const;

  const transactItems: NonNullable<TransactWriteCommandInput['TransactItems']> = [
    ...items.map((item) => ({
      Update: {
        TableName: env.stockTable,
        Key: { flavorId: item.flavorId },
        UpdateExpression: 'SET #q = #q - :n, updatedAt = :now',
        ConditionExpression: 'attribute_exists(flavorId) AND #q >= :n',
        ExpressionAttributeNames: { '#q': 'quantity' },
        ExpressionAttributeValues: { ':n': item.quantity, ':now': nowIso },
      },
    })),
    {
      Put: {
        TableName: env.orderTable,
        Item: {
          id: orderId,
          orderCode,
          __typename: 'Order',
          customerName,
          customerEmail,
          customerPhone,
          pickupPointCode,
          items,
          boxSize,
          priceCents,
          pfandCents,
          totalCents,
          pfandCharged,
          pfandReturnDeclared,
          status,
          pickupDeadline,
          createdAt: nowIso,
          updatedAt: nowIso,
        },
        ConditionExpression: 'attribute_not_exists(id)',
      },
    },
    {
      Update: {
        TableName: env.pfandBoxTable,
        Key: { customerEmail },
        UpdateExpression:
          'SET boxesInUse = if_not_exists(boxesInUse, :zero) + :newBoxes, ' +
          'boxesReturned = if_not_exists(boxesReturned, :zero), ' +
          'creditCents = if_not_exists(creditCents, :zero) - :creditUsed, ' +
          '#tn = :tn, createdAt = if_not_exists(createdAt, :now), updatedAt = :now',
        // Se for usar crédito, garante que ele ainda existe (evita uso duplo).
        ...(useCredit ? { ConditionExpression: 'creditCents >= :creditUsed' } : {}),
        ExpressionAttributeNames: { '#tn': '__typename' },
        ExpressionAttributeValues: {
          ':zero': 0,
          ':newBoxes': pfandReturnDeclared ? 0 : 1,
          ':creditUsed': useCredit ? PFAND_CENTS : 0,
          ':tn': 'PfandBox',
          ':now': nowIso,
        },
      },
    },
  ];

  try {
    await ddb.send(new TransactWriteCommand({ TransactItems: transactItems }));
  } catch (err) {
    if (err instanceof TransactionCanceledException) {
      const reasons = err.CancellationReasons ?? [];
      const soldOut = items
        .filter((_, i) => reasons[i]?.Code === 'ConditionalCheckFailed')
        .map((item) => item.flavorName);
      if (soldOut.length > 0) {
        throw new OrderError(`Leider nicht mehr genug Vorrat: ${soldOut.join(', ')}.`);
      }
      throw new OrderError('Deine Bestellung konnte nicht gespeichert werden. Bitte versuche es erneut.');
    }
    console.error('placeOrder failed', err);
    throw new Error('Interner Fehler. Bitte versuche es später erneut.');
  }

  return {
    orderId,
    orderCode,
    status,
    boxSize,
    priceCents,
    pfandCents,
    totalCents,
    pfandCharged,
    pickupDeadline,
  };
};
