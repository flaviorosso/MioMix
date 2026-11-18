import { defineFunction } from '@aws-amplify/backend';

/** Rede de segurança: cancela pedidos não pagos antigos (caso um aviso do Stripe se perca). */
export const expireOrders = defineFunction({
  name: 'expire-orders',
  entry: './handler.ts',
  timeoutSeconds: 60,
  schedule: 'every 15m',
  resourceGroupName: 'data',
});
