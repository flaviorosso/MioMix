import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import outputs from '../../amplify_outputs.json';

Amplify.configure(outputs);

/** Cliente da API no modo visitante (sem login). */
export const client = generateClient<Schema>({ authMode: 'identityPool' });

export type PlaceOrderResult = NonNullable<Schema['placeOrder']['returnType']>;
