import { CouponType, DiscountType, Prisma } from '@prisma/client';

export type CouponValidationResult = {
  valid: true;
  type: CouponType;
  couponCode: string;
  message: string;
  discountAmount: Prisma.Decimal;
  discountPercent: number | null;
  maxDiscountAmount: number | null;
  minOrderAmount: number | null;
  finalTotalPreview: Prisma.Decimal;
  promotionalCouponId?: string;
  referralOwnerUserId?: string;
  referralRewardId?: string;
  discountType: DiscountType;
  discountValue: Prisma.Decimal;
};

export type CouponValidationErrorResult = {
  valid: false;
  type: null;
  couponCode: string;
  message: string;
  discountAmount: Prisma.Decimal;
  discountPercent: null;
  maxDiscountAmount: null;
  minOrderAmount: null;
  finalTotalPreview: Prisma.Decimal;
};

export type CouponValidationOutput = CouponValidationResult | CouponValidationErrorResult;

export type CouponOrderResolution = {
  couponCode: string;
  couponType: CouponType;
  discountAmount: Prisma.Decimal;
  promotionalCouponId?: string;
  referralOwnerUserId?: string;
  referralRewardId?: string;
};
