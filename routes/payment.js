// routes/payment.js
const express = require('express');
const router = express.Router();

let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  try {
    // Stripe v12+ dùng ESM import; với CJS có thể require như dưới:
    const Stripe = require('stripe');
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  } catch (e) {
    console.warn('[payment] Không khởi tạo được Stripe, sẽ dùng chế độ mock.', e?.message || e);
    stripe = null;
  }
}

/**
 * Helper: tính số đêm từ checkIn/checkOut (YYYY-MM-DD)
 */
function calcNights(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 1;
  const inDate = new Date(checkIn);
  const outDate = new Date(checkOut);
  const ms = outDate - inDate;
  const nights = Math.ceil(ms / (1000 * 60 * 60 * 24));
  return Number.isFinite(nights) && nights > 0 ? nights : 1;
}

/**
 * POST /payment/checkout
 * Body có thể gửi:
 * - amount: số tiền *VND* (hoặc *USD cents* nếu dùng Stripe thật)
 * - HOẶC: pricePerNight + checkIn + checkOut  -> hệ thống tự tính amount
 * - currency: mặc định 'usd' khi dùng Stripe, 'vnd' khi mock
 * - metadata (tuỳ chọn)
 */
router.post('/checkout', async (req, res, next) => {
  try {
    const {
      amount,
      pricePerNight,
      checkIn,
      checkOut,
      currency: rawCurrency,
      metadata = {}
    } = req.body || {};

    // Tính amount nếu chưa truyền
    let total = Number(amount);
    if (!Number.isFinite(total) || total <= 0) {
      const nights = calcNights(checkIn, checkOut);
      const price = Number(pricePerNight) || 0;
      total = Math.max(price * nights, 0);
    }

    // Nếu không khởi tạo được Stripe -> mock thanh toán (cho luồng test)
    if (!stripe) {
      return res.json({
        ok: true,
        mode: 'mock',
        currency: rawCurrency || 'vnd',
        amount: total,
        message: 'Thanh toán mock thành công (Stripe chưa cấu hình).'
      });
    }

    // Stripe: dùng USD cho chắc chắn (VND không phải lúc nào cũng được hỗ trợ)
    const currency = (rawCurrency || 'usd').toLowerCase();

    // Stripe tính theo "cents" -> nhân 100 nếu đang gửi số tiền đơn vị "USD"
    const amountInSmallestUnit = currency === 'usd' ? Math.round(total * 100) : Math.round(total);

    const intent = await stripe.paymentIntents.create({
      amount: amountInSmallestUnit,
      currency,
      metadata
    });

    return res.json({
      ok: true,
      mode: 'stripe',
      clientSecret: intent.client_secret,
      currency,
      amount: amountInSmallestUnit
    });
  } catch (err) {
    console.error('[payment] checkout error:', err);
    next(err);
  }
});

module.exports = router;
