import { randomInt, randomUUID } from 'node:crypto';
import { DynamoDBClient, TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  TransactWriteCommand,
  UpdateCommand,
  type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import Stripe from 'stripe';
import type { Schema } from '../../data/resource';
// Preços e regras: fonte única compartilhada com a página (o servidor recalcula sempre).
import { PFAND_CENTS, PICKUP_WINDOW_HOURS, PRICES_CENTS, isBoxSize } from '../../../shared/pricing';
import { ALLOWED_ORIGINS, DEFAULT_ORIGIN, PAYMENT_WINDOW_MINUTES } from '../../../shared/payment';
import { STRIPE_LOCALE, localizeFlavor, normalizeLang, type Lang } from '../../../shared/lang';
import { cancelOrder } from '../_shared/orders';

/** Mensagens mostradas ao cliente, nos três idiomas do site. */
const MSG = {
  name: { de: 'Bitte gib deinen Namen an.', pt: 'Por favor, informe seu nome.', en: 'Please enter your name.' },
  email: {
    de: 'Bitte gib eine gültige E-Mail-Adresse an.',
    pt: 'Por favor, informe um e-mail válido.',
    en: 'Please enter a valid email address.',
  },
  phone: {
    de: 'Bitte gib eine gültige Telefonnummer an.',
    pt: 'Por favor, informe um telefone válido.',
    en: 'Please enter a valid phone number.',
  },
  boxSize: {
    de: 'Ungültige Boxgröße. Erlaubt sind 4, 6 oder 8 Becher.',
    pt: 'Tamanho de box inválido. São permitidos 4, 6 ou 8 potes.',
    en: 'Invalid box size. Allowed are 4, 6 or 8 cups.',
  },
  quantity: { de: 'Ungültige Menge im Warenkorb.', pt: 'Quantidade inválida.', en: 'Invalid quantity.' },
  exactCups: {
    de: (n: number) => `Bitte wähle genau ${n} Becher für deine Box.`,
    pt: (n: number) => `Escolha exatamente ${n} potes para a sua box.`,
    en: (n: number) => `Please choose exactly ${n} cups for your box.`,
  },
  point: { de: 'Unbekannter Abholort.', pt: 'Ponto de retirada desconhecido.', en: 'Unknown pickup location.' },
  unavailable: {
    de: 'Eine der gewählten Sorten ist nicht verfügbar.',
    pt: 'Um dos sabores escolhidos não está disponível.',
    en: 'One of the chosen flavours is not available.',
  },
  soldOut: {
    de: (list: string) => `Leider nicht mehr genug Vorrat: ${list}.`,
    pt: (list: string) => `Infelizmente não há mais estoque suficiente: ${list}.`,
    en: (list: string) => `Sorry, not enough left of: ${list}.`,
  },
  notSaved: {
    de: 'Deine Bestellung konnte nicht gespeichert werden. Bitte versuche es erneut.',
    pt: 'Não foi possível salvar o seu pedido. Tente novamente.',
    en: 'Your order could not be saved. Please try again.',
  },
  internal: {
    de: 'Interner Fehler. Bitte versuche es später erneut.',
    pt: 'Erro interno. Tente novamente mais tarde.',
    en: 'Internal error. Please try again later.',
  },
  payment: {
    de: 'Die Zahlung konnte gerade nicht gestartet werden. Bitte versuche es erneut.',
    pt: 'Não foi possível iniciar o pagamento agora. Tente novamente.',
    en: 'The payment could not be started right now. Please try again.',
  },
  boxName: {
    de: (n: number) => `Gelato-Box mit ${n} Bechern`,
    pt: (n: number) => `Box de gelato com ${n} potes`,
    en: (n: number) => `Gelato box with ${n} cups`,
  },
  pfandName: {
    de: 'Pfand für Mehrweg-Box',
    pt: 'Caução (Pfand) da box reutilizável',
    en: 'Deposit (Pfand) for reusable box',
  },
} satisfies Record<string, Record<Lang, unknown>>;

let stripeClient: Stripe | undefined;
const stripe = () => (stripeClient ??= new Stripe(process.env.STRIPE_SECRET_KEY!));

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

/** Erro de validação: a mensagem (no idioma do cliente) é mostrada na página. */
class OrderError extends Error {}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[0-9 ()/-]{6,25}$/;

type Handler = Schema['placeOrder']['functionHandler'];

export const handler: Handler = async (event) => {
  const args = event.arguments;
  const lang = normalizeLang(args.language);

  // --- 1. Validação dos dados do cliente ------------------------------------
  const customerName = args.customerName.trim();
  const customerEmail = args.customerEmail.trim().toLowerCase();
  const customerPhone = args.customerPhone.trim();
  const pickupPointCode = args.pickupPointCode.trim().toLowerCase();
  const boxSize = args.boxSize;

  if (customerName.length < 2 || customerName.length > 100) {
    throw new OrderError(MSG.name[lang]);
  }
  if (!EMAIL_RE.test(customerEmail) || customerEmail.length > 254) {
    throw new OrderError(MSG.email[lang]);
  }
  if (!PHONE_RE.test(customerPhone)) {
    throw new OrderError(MSG.phone[lang]);
  }

  if (!isBoxSize(boxSize)) {
    throw new OrderError(MSG.boxSize[lang]);
  }
  const priceCents = PRICES_CENTS[boxSize];

  // Junta sabores repetidos e confere as quantidades.
  const quantities = new Map<string, number>();
  for (const item of args.items ?? []) {
    if (!item || !Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new OrderError(MSG.quantity[lang]);
    }
    quantities.set(item.flavorId, (quantities.get(item.flavorId) ?? 0) + item.quantity);
  }
  const totalCups = [...quantities.values()].reduce((sum, q) => sum + q, 0);
  if (quantities.size === 0 || totalCups !== boxSize) {
    throw new OrderError(MSG.exactCups[lang](boxSize));
  }

  // --- 2. Ponto de retirada e sabores (lidos no servidor) -------------------
  const pickup = await ddb.send(
    new GetCommand({ TableName: env.pickupPointTable, Key: { code: pickupPointCode } }),
  );
  if (!pickup.Item || pickup.Item.active === false) {
    throw new OrderError(MSG.point[lang]);
  }

  const flavorIds = [...quantities.keys()];
  const flavors = await Promise.all(
    flavorIds.map((id) => ddb.send(new GetCommand({ TableName: env.flavorTable, Key: { id } }))),
  );
  const items = flavorIds.map((flavorId, i) => {
    const flavor = flavors[i].Item;
    if (!flavor || flavor.active !== true) {
      throw new OrderError(MSG.unavailable[lang]);
    }
    return {
      flavorId,
      flavorName: flavor.name as string, // sempre em alemão (painel staff)
      localName: localizeFlavor({ name: flavor.name as string }, flavor.translations, lang).name,
      quantity: quantities.get(flavorId)!,
    };
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
          items: items.map(({ flavorId, flavorName, quantity }) => ({ flavorId, flavorName, quantity })),
          boxSize,
          priceCents,
          pfandCents,
          totalCents,
          pfandCharged,
          pfandReturnDeclared,
          pfandCreditUsedCents: useCredit ? PFAND_CENTS : 0,
          status,
          pickupDeadline,
          language: lang,
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
        .map((item) => item.localName);
      if (soldOut.length > 0) {
        throw new OrderError(MSG.soldOut[lang](soldOut.join(', ')));
      }
      throw new OrderError(MSG.notSaved[lang]);
    }
    console.error('placeOrder failed', err);
    throw new Error(MSG.internal[lang]);
  }

  // --- 5. Sessão de pagamento no Stripe Checkout ----------------------------
  const origin = args.returnOrigin && ALLOWED_ORIGINS.includes(args.returnOrigin) ? args.returnOrigin : DEFAULT_ORIGIN;
  const expiresAt = Math.floor(now.getTime() / 1000) + PAYMENT_WINDOW_MINUTES * 60;
  let checkoutUrl: string;
  try {
    const session = await stripe().checkout.sessions.create({
      mode: 'payment',
      locale: STRIPE_LOCALE[lang],
      customer_email: customerEmail,
      client_reference_id: orderId,
      metadata: { orderId, orderCode },
      payment_intent_data: {
        metadata: { orderId, orderCode },
        description: `Mio Mix ${orderCode}`,
      },
      expires_at: expiresAt,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'eur',
            unit_amount: priceCents,
            product_data: {
              name: MSG.boxName[lang](boxSize),
              description: items.map((i) => `${i.quantity}× ${i.localName}`).join(', '),
            },
          },
        },
        ...(pfandCents > 0
          ? [
              {
                quantity: 1,
                price_data: {
                  currency: 'eur',
                  unit_amount: pfandCents,
                  product_data: { name: MSG.pfandName[lang] },
                },
              },
            ]
          : []),
      ],
      success_url: `${origin}/bestellung?id=${orderId}`,
      cancel_url: `${origin}/bestellung?id=${orderId}&abgebrochen=1`,
    });
    if (!session.url) throw new Error('Stripe session without url');
    checkoutUrl = session.url;

    await ddb.send(
      new UpdateCommand({
        TableName: env.orderTable,
        Key: { id: orderId },
        UpdateExpression: 'SET stripeSessionId = :sid, checkoutUrl = :url, checkoutExpiresAt = :exp',
        ExpressionAttributeValues: {
          ':sid': session.id,
          ':url': checkoutUrl,
          ':exp': new Date(expiresAt * 1000).toISOString(),
        },
      }),
    );
  } catch (err) {
    // Sem pagamento possível: libera os potes na hora.
    console.error('Stripe checkout failed', err);
    await cancelOrder(ddb, env, orderId, {
      allowedFrom: ['aguardando_pagamento'],
      by: 'system',
      reason: 'Zahlung konnte nicht gestartet werden',
    }).catch((e) => console.error('rollback failed', e));
    throw new OrderError(MSG.payment[lang]);
  }

  return {
    orderId,
    orderCode,
    checkoutUrl,
    status,
    boxSize,
    priceCents,
    pfandCents,
    totalCents,
    pfandCharged,
    pickupDeadline,
  };
};
