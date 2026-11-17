/**
 * Dados de exemplo: 8 sabores + estoque do dia + 2 pontos de retirada.
 *
 * Uso:  AWS_PROFILE=miomix AWS_REGION=eu-north-1 npx tsx scripts/seed.ts <appsyncApiId>
 *
 * Grava direto no DynamoDB (tabelas <Modelo>-<apiId>-NONE). IDs fixos: rodar de novo
 * sobrescreve os mesmos registros (e redefine o estoque).
 *
 * ATENÇÃO: alérgenos, horários e quantidades são EXEMPLOS — a gelateria deve conferir.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BatchWriteCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const apiId = process.argv[2];
if (!apiId) {
  console.error('Uso: npx tsx scripts/seed.ts <appsyncApiId>');
  process.exit(1);
}
const table = (model: string) => `${model}-${apiId}-NONE`;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const now = new Date().toISOString();
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date()); // YYYY-MM-DD

const meta = (typename: string) => ({ __typename: typename, createdAt: now, updatedAt: now });

const flavors = [
  { id: 'vanille', name: 'Vanille', description: 'Cremiges Vanilleeis mit echter Bourbon-Vanille.', allergens: ['Milch', 'Ei'], color: '#F3E5AB', stock: 40 },
  { id: 'schokolade', name: 'Schokolade', description: 'Intensive dunkle Schokolade.', allergens: ['Milch', 'Soja'], color: '#5C3A21', stock: 36 },
  { id: 'pistazie', name: 'Pistazie', description: 'Aus sizilianischen Pistazien.', allergens: ['Milch', 'Schalenfrüchte (Pistazien)'], color: '#93C572', stock: 24 },
  { id: 'erdbeere', name: 'Erdbeere', description: 'Fruchtig, mit frischen Erdbeeren.', allergens: ['Milch'], color: '#F4A6B7', stock: 30 },
  { id: 'stracciatella', name: 'Stracciatella', description: 'Milcheis mit feinen Schokoladenraspeln.', allergens: ['Milch', 'Soja'], color: '#F5F0E6', stock: 32 },
  { id: 'haselnuss', name: 'Haselnuss', description: 'Geröstete Haselnüsse aus dem Piemont.', allergens: ['Milch', 'Schalenfrüchte (Haselnüsse)'], color: '#B08455', stock: 20 },
  { id: 'zitrone', name: 'Zitrone', description: 'Erfrischendes Sorbet aus Amalfi-Zitronen. Vegan.', allergens: [], color: '#FFF59D', stock: 28 },
  { id: 'mango', name: 'Mango', description: 'Sonniges Mangosorbet. Vegan.', allergens: [], color: '#FFB347', stock: 26 },
];

const pickupPoints = [
  { code: 'ciaociao', name: 'Eis Café Ciao Ciao', openingHours: 'Di–So 11:00–21:00' },
  { code: 'racchetta', name: 'Trattoria La Racchetta', openingHours: 'Di–So 12:00–14:30 und 17:30–22:00' },
];

async function batchPut(tableName: string, items: Record<string, unknown>[]) {
  const res = await ddb.send(
    new BatchWriteCommand({
      RequestItems: { [tableName]: items.map((Item) => ({ PutRequest: { Item } })) },
    }),
  );
  const unprocessed = res.UnprocessedItems?.[tableName]?.length ?? 0;
  if (unprocessed > 0) throw new Error(`${unprocessed} itens não gravados em ${tableName}`);
  console.log(`✔ ${items.length} → ${tableName}`);
}

await batchPut(
  table('Flavor'),
  flavors.map(({ stock: _stock, ...f }, i) => ({ ...f, active: true, sortOrder: i + 1, ...meta('Flavor') })),
);
await batchPut(
  table('Stock'),
  flavors.map((f) => ({ flavorId: f.id, quantity: f.stock, stockDate: today, ...meta('Stock') })),
);
await batchPut(
  table('PickupPoint'),
  pickupPoints.map((p) => ({ ...p, active: true, ...meta('PickupPoint') })),
);
console.log(`Seed concluído (estoque do dia ${today}).`);
