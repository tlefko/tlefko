/**
 * Stake money: API amounts are integers with six decimals (1,000,000 = 1 unit of currency).
 * Symbols and their placement follow Stake's currency table. Decimals follow Stake's approval
 * rules: balance and bet amounts always show exactly 2 decimals (in every currency, as Stake's
 * web-sdk does), and win amounts show every decimal needed to display the full win.
 */
export const API_MULT = 1_000_000;

const META: Record<string, { s: string; d?: number; after?: boolean }> = {
  USD: { s: '$', d: 2 }, CAD: { s: 'CA$', d: 2 }, JPY: { s: '¥', d: 0 }, EUR: { s: '€', d: 2 }, RUB: { s: '₽', d: 2 },
  CNY: { s: 'CN¥', d: 2 }, PHP: { s: '₱', d: 2 }, INR: { s: '₹', d: 2 }, IDR: { s: 'Rp', d: 0 }, KRW: { s: '₩', d: 0 },
  BRL: { s: 'R$', d: 2 }, MXN: { s: 'MX$', d: 2 }, DKK: { s: 'KR', d: 2, after: true }, PLN: { s: 'zł', d: 2, after: true },
  VND: { s: '₫', d: 0, after: true }, TRY: { s: '₺', d: 2 }, CLP: { s: 'CLP', d: 0, after: true }, ARS: { s: 'ARS', d: 2, after: true },
  PEN: { s: 'S/', d: 2, after: true }, NGN: { s: '₦', d: 2 }, SAR: { s: 'SAR', d: 2, after: true }, ILS: { s: 'ILS', d: 2, after: true },
  AED: { s: 'AED', d: 2, after: true }, TWD: { s: 'NT$', d: 2 }, NOK: { s: 'kr', d: 2 }, KWD: { s: 'KD', d: 2 }, JOD: { s: 'JD', d: 2 },
  CRC: { s: '₡', d: 2 }, TND: { s: 'TND', d: 2, after: true }, SGD: { s: 'SG$', d: 2 }, MYR: { s: 'RM', d: 2 }, OMR: { s: 'OMR', d: 2, after: true },
  QAR: { s: 'QAR', d: 2, after: true }, BHD: { s: 'BD', d: 2 }, PKR: { s: '₨', d: 2 }, EGP: { s: 'ج.م', d: 2 }, NZD: { s: 'NZ$', d: 2 },
  BOB: { s: 'Bs', d: 2 }, GHS: { s: 'GH₵', d: 2 }, KES: { s: 'KSh', d: 2 }, MAD: { s: 'MAD', d: 2 }, BAM: { s: 'KM', d: 2 },
  ISK: { s: 'kr', d: 2 }, TZS: { s: 'TSh', d: 2 }, UGX: { s: 'USh', d: 2 }, XOF: { s: 'CFA', d: 2 },
  XGC: { s: 'GC', d: 2, after: true }, XSC: { s: 'SC', d: 2, after: true }, XEC: { s: 'SC', d: 2, after: true },
};

export const currency = { code: 'USD' };

/**
 * Format an API amount (six-decimal integer) with between `minDp` and `maxDp` decimal places,
 * working on the integer so no float error can add or drop a digit. Beyond `minDp`, trailing zeros
 * are trimmed; digits beyond `maxDp` are dropped (never rounded up), so a figure is never shown
 * larger than it is.
 */
export function fmtApiDp(apiAmount: number, minDp: number, maxDp: number, code = currency.code): string {
  const m = META[code] ?? { s: code, after: true };
  const neg = apiAmount < 0;
  const abs = Math.abs(Math.trunc(apiAmount));
  const whole = Math.floor(abs / API_MULT);
  let frac = String(abs % API_MULT).padStart(6, '0').slice(0, maxDp);
  while (frac.length > minDp && frac.endsWith('0')) frac = frac.slice(0, -1);
  const n = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(whole) + (frac ? `.${frac}` : '');
  const sign = neg ? '-' : '';
  return m.after ? `${sign}${n} ${m.s}` : `${sign}${m.s}${n}`;
}

/** Balance (and net position): always exactly 2 decimal places, never shown above what is held. */
export const fmtBalance = (apiAmount: number, code = currency.code) => fmtApiDp(apiAmount, 2, 2, code);

/** Bet (play amount), bet levels and prices: exactly 2 decimal places. */
export const fmtBet = (apiAmount: number, code = currency.code) => fmtApiDp(apiAmount, 2, 2, code);

/**
 * Win amounts: every decimal the win actually carries, at least 2 and up to the API's 6, so the
 * full win is always visible and never rounded (0.004 shows as 0.004, 75 as 75.00).
 */
export const fmtWin = (apiAmount: number, code = currency.code) => fmtApiDp(apiAmount, 2, 6, code);

/** Format a value in currency units: 2 decimals, or up to `maxDecimals` when the value needs them. */
export function fmtUnits(units: number, code = currency.code, maxDecimals = 2): string {
  const m = META[code] ?? { s: code, after: true };
  const n = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: Math.max(2, maxDecimals) }).format(Math.abs(units));
  const sign = units < 0 ? '-' : '';
  return m.after ? `${sign}${n} ${m.s}` : `${sign}${m.s}${n}`;
}

/** Win amount for a payout multiple on a base bet given in API units (floored, never rounded up). */
export function winApi(multiple: number, betApi: number): number {
  return Math.floor(Math.round(multiple * 100) * betApi / 100);
}
