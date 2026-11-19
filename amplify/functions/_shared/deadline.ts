import { GetCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { computePickupDeadline } from '../../../shared/hours';
import { PICKUP_WINDOW_HOURS } from '../../../shared/pricing';

/**
 * Prazo de retirada a partir do pagamento, respeitando o horário do ponto
 * (se cair com o ponto fechado, vale até o fechamento do próximo dia aberto).
 * Se o ponto não puder ser lido, usa simplesmente pagamento + 24 h.
 */
export async function pickupDeadlineFor(
  ddb: DynamoDBDocumentClient,
  pickupPointTable: string,
  pickupPointCode: string,
  paidAt: Date,
): Promise<Date> {
  try {
    const { Item } = await ddb.send(new GetCommand({ TableName: pickupPointTable, Key: { code: pickupPointCode } }));
    return computePickupDeadline(paidAt, Item?.weeklyHours, PICKUP_WINDOW_HOURS);
  } catch (err) {
    console.error('could not read pickup point hours', pickupPointCode, err);
    return computePickupDeadline(paidAt, null, PICKUP_WINDOW_HOURS);
  }
}
