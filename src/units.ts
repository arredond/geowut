export type Units = 'metric' | 'imperial';

const KM_PER_MILE = 1.609344;
const FEET_PER_MILE = 5280;
const ACRES_PER_SQUARE_MILE = 640;
const HECTARES_PER_KM2 = 100;

/** About three significant digits: enough to read, without a ruler's worth of false precision. */
function formatNumber(value: number): string {
  const decimals = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return value.toLocaleString('en-US', { maximumFractionDigits: decimals });
}

export function formatLength(km: number, units: Units): string {
  if (units === 'metric') return km < 1 ? `${formatNumber(km * 1000)} m` : `${formatNumber(km)} km`;
  const miles = km / KM_PER_MILE;
  return miles < 0.1 ? `${formatNumber(miles * FEET_PER_MILE)} ft` : `${formatNumber(miles)} mi`;
}

/** Land units in between, so mid-sized areas don't run to six digits of m² or ft². */
export function formatArea(km2: number, units: Units): string {
  if (units === 'metric') {
    if (km2 >= 1) return `${formatNumber(km2)} km²`;
    const hectares = km2 * HECTARES_PER_KM2;
    return hectares >= 1 ? `${formatNumber(hectares)} ha` : `${formatNumber(km2 * 1e6)} m²`;
  }
  const squareMiles = km2 / KM_PER_MILE ** 2;
  if (squareMiles >= 0.1) return `${formatNumber(squareMiles)} mi²`;
  const acres = squareMiles * ACRES_PER_SQUARE_MILE;
  return acres >= 1 ? `${formatNumber(acres)} ac` : `${formatNumber(squareMiles * FEET_PER_MILE ** 2)} ft²`;
}

/** For tables that keep one unit per column, like the feature popup. */
export const LENGTH_UNIT: Record<Units, { label: string; perKm: number }> = {
  metric: { label: 'km', perKm: 1 },
  imperial: { label: 'mi', perKm: 1 / KM_PER_MILE },
};
