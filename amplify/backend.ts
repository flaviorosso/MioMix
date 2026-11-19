import { defineBackend } from '@aws-amplify/backend';
import { FunctionUrlAuthType } from 'aws-cdk-lib/aws-lambda';
import { Policy, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { expireOrders } from './functions/expire-orders/resource';
import { orderStatus } from './functions/order-status/resource';
import { placeOrder } from './functions/place-order/resource';
import { staffOrders } from './functions/staff-orders/resource';
import { stripeWebhook } from './functions/stripe-webhook/resource';

/**
 * Backend do Mio Mix (Amplify Gen 2).
 * @see https://docs.amplify.aws/react/build-a-backend/
 */
const backend = defineBackend({
  auth,
  data,
  placeOrder,
  staffOrders,
  orderStatus,
  stripeWebhook,
  expireOrders,
});

// Sem cadastro público: contas staff são criadas só pelo administrador.
backend.auth.resources.cfnResources.cfnUserPool.adminCreateUserConfig = {
  allowAdminCreateUserOnly: true,
};

const tables = backend.data.resources.tables;

// Cada função acessa só as tabelas de que precisa.
type TableName = 'Flavor' | 'PickupPoint' | 'Stock' | 'Order' | 'PfandBox';
const ENV_NAMES: Record<TableName, string> = {
  Flavor: 'FLAVOR_TABLE',
  PickupPoint: 'PICKUP_POINT_TABLE',
  Stock: 'STOCK_TABLE',
  Order: 'ORDER_TABLE',
  PfandBox: 'PFAND_BOX_TABLE',
};

function grant(
  fn: { resources: { lambda: Parameters<(typeof tables)['Order']['grantReadData']>[0] }; addEnvironment: (k: string, v: string) => void },
  access: Partial<Record<TableName, 'read' | 'readwrite'>>,
) {
  for (const [name, mode] of Object.entries(access) as [TableName, 'read' | 'readwrite'][]) {
    if (mode === 'read') tables[name].grantReadData(fn.resources.lambda);
    else tables[name].grantReadWriteData(fn.resources.lambda);
    fn.addEnvironment(ENV_NAMES[name], tables[name].tableName);
  }
}

// placeOrder: valida, reserva potes, grava pedido, cria sessão Stripe (e desfaz se falhar).
grant(backend.placeOrder, {
  Flavor: 'read',
  PickupPoint: 'read',
  Stock: 'readwrite',
  Order: 'readwrite',
  PfandBox: 'readwrite',
});

// staff-orders: mudança de status, devolução de Pfand.
grant(backend.staffOrders, { PickupPoint: 'read', Stock: 'readwrite', Order: 'readwrite', PfandBox: 'readwrite' });

// order-status: visão pública de um pedido.
grant(backend.orderStatus, { Order: 'read', PickupPoint: 'read' });

// stripe-webhook: marca como pago / cancela sessões expiradas.
grant(backend.stripeWebhook, { PickupPoint: 'read', Stock: 'readwrite', Order: 'readwrite', PfandBox: 'readwrite' });

// expire-orders: limpeza periódica de pedidos não pagos.
grant(backend.expireOrders, { Stock: 'readwrite', Order: 'readwrite', PfandBox: 'readwrite' });

// URL pública do webhook (a autenticidade é garantida pela assinatura do Stripe).
const webhookUrl = backend.stripeWebhook.resources.lambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
});

backend.addOutput({
  custom: {
    stripeWebhookUrl: webhookUrl.url,
  },
});

// Usuários do grupo staff recebem o papel IAM do grupo (não o papel "authenticated"),
// e esse papel não tem permissões. Sem isto, a página do cliente dá 401 num navegador
// com login de staff. Liberamos só o que um visitante também pode fazer.
const api = backend.data.resources.graphqlApi.arn;
const publicFields = [
  'types/Flavor/*',
  'types/Stock/*',
  'types/PickupPoint/*',
  'types/OrderItem/*',
  'types/Query/fields/getFlavor',
  'types/Query/fields/listFlavors',
  'types/Query/fields/getStock',
  'types/Query/fields/listStocks',
  'types/Query/fields/getPickupPoint',
  'types/Query/fields/listPickupPoints',
  'types/Query/fields/getOrderStatus',
  'types/Mutation/fields/placeOrder',
];
const staffGroupRole = backend.auth.resources.groups['staff'].role;
new Policy(backend.data.stack, 'StaffGroupPublicApiAccess', {
  statements: [
    new PolicyStatement({
      actions: ['appsync:GraphQL'],
      resources: publicFields.map((f) => `${api}/${f}`),
    }),
  ],
}).attachToRole(staffGroupRole);
