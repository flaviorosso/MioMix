import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { placeOrder } from './functions/place-order/resource';
import { staffOrders } from './functions/staff-orders/resource';

/**
 * Backend do Mio Mix (Amplify Gen 2).
 * @see https://docs.amplify.aws/react/build-a-backend/
 */
const backend = defineBackend({
  auth,
  data,
  placeOrder,
  staffOrders,
});

// Sem cadastro público: contas staff são criadas só pelo administrador.
backend.auth.resources.cfnResources.cfnUserPool.adminCreateUserConfig = {
  allowAdminCreateUserOnly: true,
};

// A função placeOrder acessa só as tabelas de que precisa.
const tables = backend.data.resources.tables;
const orderFn = backend.placeOrder.resources.lambda;

tables['Flavor'].grantReadData(orderFn);
tables['PickupPoint'].grantReadData(orderFn);
tables['Stock'].grantReadWriteData(orderFn);
tables['Order'].grantWriteData(orderFn);
tables['PfandBox'].grantReadWriteData(orderFn);

backend.placeOrder.addEnvironment('FLAVOR_TABLE', tables['Flavor'].tableName);
backend.placeOrder.addEnvironment('PICKUP_POINT_TABLE', tables['PickupPoint'].tableName);
backend.placeOrder.addEnvironment('STOCK_TABLE', tables['Stock'].tableName);
backend.placeOrder.addEnvironment('ORDER_TABLE', tables['Order'].tableName);
backend.placeOrder.addEnvironment('PFAND_BOX_TABLE', tables['PfandBox'].tableName);

// A função staff-orders (mudança de status, devolução de Pfand).
const staffFn = backend.staffOrders.resources.lambda;
tables['Stock'].grantReadWriteData(staffFn);
tables['Order'].grantReadWriteData(staffFn);
tables['PfandBox'].grantReadWriteData(staffFn);
backend.staffOrders.addEnvironment('STOCK_TABLE', tables['Stock'].tableName);
backend.staffOrders.addEnvironment('ORDER_TABLE', tables['Order'].tableName);
backend.staffOrders.addEnvironment('PFAND_BOX_TABLE', tables['PfandBox'].tableName);
