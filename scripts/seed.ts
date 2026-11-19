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
import { formatWeeklyHours, type OpeningDay } from '../shared/hours';
import { FLAVOR_TRANSLATIONS } from './flavor-translations';

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

// Horário: 0 = Mo … 6 = So; dias ausentes = fechado. Editável depois na aba "Orte" do painel staff.
const ciaoHours: OpeningDay[] = [1, 2, 3, 4, 5, 6].map((day) => ({ day, open: '11:00', close: '21:00' })); // provisório
const racchettaHours: OpeningDay[] = [0, 2, 3, 4, 5, 6].map((day) => ({ day, open: '16:00', close: '22:00' }));
const pickupPoints = [
  { code: 'ciaociao', name: 'Eis Café Ciao Ciao', weeklyHours: ciaoHours, openingHours: formatWeeklyHours(ciaoHours) },
  { code: 'racchetta', name: 'Trattoria La Racchetta', weeklyHours: racchettaHours, openingHours: formatWeeklyHours(racchettaHours) },
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
  flavors.map(({ stock: _stock, ...f }, i) => ({
    ...f,
    translations: JSON.stringify(FLAVOR_TRANSLATIONS[f.id] ?? {}),
    active: true,
    sortOrder: i + 1,
    ...meta('Flavor'),
  })),
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
