/**
 * Wording shortcuts used across the UI. Every value comes from the i18n tables (the active
 * language, with social-casino wording on Stake.us), read at call time so it is always current.
 */
import { t, setSocialWording } from '../i18n';

export const copy = {
  get bet() { return t('bet'); },
  get betLower() { return t('betLower'); },
  get balance() { return t('balance'); },
  get demoBalance() { return t('demoBalance'); },
  get buy() { return t('buy'); },
  get buyBonus() { return t('buyBonus'); },
  get buyShort() { return t('buyShort'); },
  get buyTitle() { return t('buyTitle'); },
  buyConfirm: (name: string, price: string) => t('buyConfirm', { name, price }),
  buyFrom: (balance: string) => t('buyFrom', { balance }),
  notEnough: (balance: string) => t('notEnough', { balance }),
  get payouts() { return t('rPayTitle'); },
  get lowerBet() { return t('lowerBet'); },
  get raiseBet() { return t('raiseBet'); },
  get win() { return t('win'); },
  get totalWin() { return t('totalWin'); },
  get spin() { return t('spin'); },
  get insufficient() { return t('insufficient'); },
  get autoLoss() { return t('autoLoss'); },
  get autoWin() { return t('autoWin'); },
};

/** Social wording on or off; true when the language switched to English (Stake.us is English only). */
export function setSocial(on: boolean): boolean {
  return setSocialWording(on);
}
