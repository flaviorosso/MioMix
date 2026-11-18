import { defineFunction } from '@aws-amplify/backend';

/** getOrderStatus: visão pública de um pedido para a página de confirmação. */
export const orderStatus = defineFunction({
  name: 'order-status',
  entry: './handler.ts',
  timeoutSeconds: 10,
  resourceGroupName: 'data',
});
