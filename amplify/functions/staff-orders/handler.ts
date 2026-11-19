import { DynamoDBClient, TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { AppSyncResolverEvent } from 'aws-lambda';
import type { Schema } from '../../data/resource';
import { PFAND_CENTS } from '../../../shared/pricing';
import { pickupDeadlineFor } from '../_shared/deadline';
import { buildReleaseItems, type OrderStatus, type TransactItems } from '../_shared/orders';

const env = {
  stockTable: process.env.STOCK_TABLE!,
  orderTable: process.env.ORDER_TABLE!,
  pfandBoxTable: process.env.PFAND_BOX_TABLE!,
  pickupPointTable: process.env.PICKUP_POINT_TABLE!,
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

/** Idiomas do painel staff. */
type StaffLang = 'de' | 'pt';
const staffLang = (v: unknown): StaffLang => (v === 'pt' ? 'pt' : 'de');

const STATUS_LABEL: Record<StaffLang, Record<OrderStatus, string>> = {
  de: {
    aguardando_pagamento: 'Zahlung offen',
    pago: 'Bezahlt',
    pronto: 'Abholbereit',
    retirado: 'Abgeholt',
    cancelado: 'Storniert',
  },
  pt: {
    aguardando_pagamento: 'Pagamento pendente',
    pago: 'Pago',
    pronto: 'Pronto para retirada',
    retirado: 'Retirado',
    cancelado: 'Cancelado',
  },
};

const MSG = {
  notFound: { de: 'Bestellung nicht gefunden.', pt: 'Pedido não encontrado.' },
  transition: {
    de: (a: string, b: string) => `Statuswechsel von „${a}“ nach „${b}“ ist nicht möglich.`,
    pt: (a: string, b: string) => `Não é possível mudar o status de “${a}” para “${b}”.`,
  },
  pfandAnswer: {
    de: 'Bitte angeben, ob die Pfand-Box zurückgegeben wurde.',
    pt: 'Informe se a box (Pfand) foi devolvida.',
  },
  orderChanged: {
    de: 'Die Bestellung wurde gerade geändert. Bitte neu laden und erneut versuchen.',
    pt: 'O pedido acabou de ser alterado. Recarregue e tente de novo.',
  },
  boxCount: { de: 'Bitte eine Anzahl zwischen 1 und 20 angeben.', pt: 'Informe uma quantidade entre 1 e 20.' },
  noBoxes: {
    de: 'Für diese E-Mail-Adresse sind keine Pfand-Boxen registriert.',
    pt: 'Não há boxes (Pfand) registradas para este e-mail.',
  },
  onlyInUse: {
    de: (n: number) => `Diese Kundin / dieser Kunde hat nur ${n} Box(en) in Benutzung.`,
    pt: (n: number) => `Este cliente tem apenas ${n} box(es) em uso.`,
  },
  dataChanged: {
    de: 'Die Daten wurden gerade geändert. Bitte erneut versuchen.',
    pt: 'Os dados acabaram de ser alterados. Tente de novo.',
  },
} satisfies Record<string, Record<StaffLang, unknown>>;

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
  const lang = staffLang(args.language);
  const { Item: order } = await ddb.send(
    new GetCommand({ TableName: env.orderTable, Key: { id: args.orderId } }),
  );
  if (!order) throw new StaffError(MSG.notFound[lang]);

  const current = order.status as OrderStatus;
  if (!TRANSITIONS[current]?.includes(next)) {
    throw new StaffError(MSG.transition[lang](STATUS_LABEL[lang][current], STATUS_LABEL[lang][next]));
  }

  const now = new Date().toISOString();
  const email = order.customerEmail as string;
  const declared = order.pfandReturnDeclared === true;
  const extraSets: Record<string, unknown> = {};
  const transact: TransactItems = [];

  // --- Cancelar: devolve potes e desfaz o Pfand -----------------------------
  if (next === 'cancelado') {
    transact.push(...(await buildReleaseItems(ddb, env, order, now)));
    extraSets.cancelReason = 'Vom Team storniert';
  }

  // --- Marcado como pago à mão: prazo conta a partir de agora ----------------
  if (next === 'pago') {
    const paidAt = new Date(now);
    extraSets.paidAt = now;
    extraSets.pickupDeadline = (
      await pickupDeadlineFor(ddb, env.pickupPointTable, order.pickupPointCode as string, paidAt)
    ).toISOString();
  }

  // --- Retirada com Pfand-Rückgabe declarada: staff confirma a caixa ----------
  if (next === 'retirado' && declared) {
    if (typeof args.pfandBoxReceived !== 'boolean') {
      throw new StaffError(MSG.pfandAnswer[lang]);
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
      throw new StaffError(MSG.orderChanged[lang]);
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
  const lang = staffLang(args.language);
  if (!Number.isInteger(boxes) || boxes < 1 || boxes > 20) {
    throw new StaffError(MSG.boxCount[lang]);
  }

  const { Item: box } = await ddb.send(
    new GetCommand({ TableName: env.pfandBoxTable, Key: { customerEmail: email } }),
  );
  if (!box) throw new StaffError(MSG.noBoxes[lang]);
  const inUse = (box.boxesInUse as number) ?? 0;
  if (boxes > inUse) {
    throw new StaffError(MSG.onlyInUse[lang](inUse));
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
      throw new StaffError(MSG.dataChanged[lang]);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Roteamento pelas mutations
// ---------------------------------------------------------------------------
export const handler = async (event: AppSyncResolverEvent<Record<string, unknown>>) => {
  // No Amplify Gen 2 o nome da operação vem em event.fieldName (não em event.info).
  // Aceitamos os dois formatos e, em último caso, decidimos pelos argumentos.
  const loose = event as unknown as { fieldName?: string; info?: { fieldName?: string } };
  const args = event.arguments ?? {};
  const fieldName =
    loose.info?.fieldName ??
    loose.fieldName ??
    ('orderId' in args ? 'updateOrderStatus' : 'customerEmail' in args ? 'registerPfandReturn' : undefined);

  switch (fieldName) {
    case 'updateOrderStatus':
      return updateOrderStatus(args as unknown as UpdateArgs, event);
    case 'registerPfandReturn':
      return registerPfandReturn(args as unknown as ReturnArgs);
    default:
      throw new Error(`Unbekannte Operation: ${fieldName ?? '–'}`);
  }
};
