import { defineFunction } from '@aws-amplify/backend';

/** Ações do staff: updateOrderStatus e registerPfandReturn. */
export const staffOrders = defineFunction({
  name: 'staff-orders',
  entry: './handler.ts',
  timeoutSeconds: 15,
  resourceGroupName: 'data',
});
