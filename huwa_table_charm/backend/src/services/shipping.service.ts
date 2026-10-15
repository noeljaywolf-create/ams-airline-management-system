import type { ShippingQuote } from '@huwa/shared';

// Development shipping rate estimation. In production this would call Shippo/Easypost
// with live carrier rates. Kept behind an interface for easy replacement.
export interface ShippingLine {
  weightKg: number;
  widthCm: number;
  heightCm: number;
  depthCm: number;
  quantity: number;
}

export async function quoteShipping(lines: ShippingLine[]): Promise<ShippingQuote> {
  const totalWeight = lines.reduce((sum, l) => sum + l.weightKg * l.quantity, 0);
  const hasOversized = lines.some(
    (l) => l.widthCm * l.heightCm * l.depthCm > 100 * 100 * 100, // > 1 cubic meter
  );

  // Simple estimation model: base + weight + oversized surcharge
  const baseCents = 500; // $5.00
  const weightCharge = Math.round(totalWeight * 150); // $1.50 per kg
  const oversizedSurcharge = hasOversized ? 1500 : 0; // $15 if oversized/fragile

  const priceCents = baseCents + weightCharge + oversizedSurcharge;
  return {
    carrier: 'dev-carrier',
    service: hasOversized ? 'fragile-ground' : 'standard-ground',
    priceCents,
    currency: 'USD',
    estimatedDays: hasOversized ? 7 : 4,
  };
}
