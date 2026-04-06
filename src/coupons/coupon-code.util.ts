const REFERRAL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function normalizeCouponCode(code: string) {
  return code.trim().toUpperCase();
}

export function isAlphanumericCouponCode(code: string) {
  return /^[A-Z0-9]+$/.test(code);
}

export function generateRandomCode(length: number) {
  let result = '';
  for (let index = 0; index < length; index += 1) {
    const randomIndex = Math.floor(Math.random() * REFERRAL_ALPHABET.length);
    result += REFERRAL_ALPHABET[randomIndex];
  }
  return result;
}

export function generateReferralCode() {
  const length = 6 + Math.floor(Math.random() * 5);
  return generateRandomCode(length);
}

export function generateReferralRewardCode() {
  return `RW${generateRandomCode(8)}`;
}
