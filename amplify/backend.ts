import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { createOrder } from './functions/create-order/resource';

/**
 * Backend do Mio Mix (Amplify Gen 2).
 * @see https://docs.amplify.aws/react/build-a-backend/
 */
const backend = defineBackend({
  auth,
  data,
  createOrder,
});

// Sem cadastro público: contas staff são criadas só pelo administrador.
backend.auth.resources.cfnResources.cfnUserPool.adminCreateUserConfig = {
  allowAdminCreateUserOnly: true,
};

// A função createOrder acessa só as tabelas de que precisa.
const tables = backend.data.resources.tables;
const orderFn = backend.createOrder.resources.lambda;

tables['Flavor'].grantReadData(orderFn);
tables['PickupPoint'].grantReadData(orderFn);
tables['Stock'].grantReadWriteData(orderFn);
tables['Order'].grantWriteData(orderFn);
tables['PfandBox'].grantReadWriteData(orderFn);

backend.createOrder.addEnvironment('FLAVOR_TABLE', tables['Flavor'].tableName);
backend.createOrder.addEnvironment('PICKUP_POINT_TABLE', tables['PickupPoint'].tableName);
backend.createOrder.addEnvironment('STOCK_TABLE', tables['Stock'].tableName);
backend.createOrder.addEnvironment('ORDER_TABLE', tables['Order'].tableName);
backend.createOrder.addEnvironment('PFAND_BOX_TABLE', tables['PfandBox'].tableName);
