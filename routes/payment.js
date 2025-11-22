// routes/payment.js
const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const Payment = require('../models/Payment'); // model bạn đã upload
const { requireAuth } = require('../middleware/authMiddleware');

// giữ phần Stripe / checkout cũ (nếu bạn cần)
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  try {
    const Stripe = require('stripe');
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  } catch (e) {
    console.warn('[payment] Stripe init failed, falling back to mock.', e?.message || e);
    stripe = null;
  }
}

function calcNights(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 1;
  const inDate = new Date(checkIn);
  const outDate = new Date(checkOut);
  const ms = outDate - inDate;
  const nights = Math.ceil(ms / (1000 * 60 * 60 * 24));
  return Number.isFinite(nights) && nights > 0 ? nights : 1;
}

/**
 * POST /payment/checkout  (kept from original)
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

    let total = Number(amount);
    if (!Number.isFinite(total) || total <= 0) {
      const nights = calcNights(checkIn, checkOut);
      const price = Number(pricePerNight) || 0;
      total = Math.max(price * nights, 0);
    }

    if (!stripe) {
      return res.json({
        ok: true,
        mode: 'mock',
        currency: rawCurrency || 'vnd',
        amount: total,
        message: 'Thanh toán mock thành công (Stripe chưa cấu hình).'
      });
    }

    const currency = (rawCurrency || 'usd').toLowerCase();
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

/**
 * GET /payment/user?bookingId=...
 * Hiển thị trang thanh toán có 2 QR (Momo / VNPAY)
 */
router.get('/user', requireAuth, async (req, res) => {
  try {
    const bookingId = req.query.bookingId;
    if (!bookingId) return res.status(400).send('Missing bookingId');

    const booking = await Booking.findById(bookingId).populate('roomId').lean();
    if (!booking) return res.status(404).send('Booking not found');

    // Nếu đã thanh toán -> redirect về trang xác nhận
    if (booking.status === 'paid') {
      return res.redirect(`/user/booking-confirm?bookingId=${bookingId}`);
    }

    // Đường dẫn ảnh QR mẫu (bạn đã upload vào public/images/qrcodes/)
    const momoQRCode = '/images/qrcodes/momo-sample.jpg';
    const vnpayQRCode = '/images/qrcodes/vnpay-sample.jpg';

    res.render('payment', {
      title: 'Thanh toán',
      booking,
      momoQRCode,
      vnpayQRCode
    });
  } catch (err) {
    console.error('GET /payment/user error', err);
    res.status(500).send('Server error');
  }
});

/**
 * POST /payment/user/confirm
 * Body (form-url-encoded): bookingId, method, transactionId (tuỳ chọn)
 * Hành động: tạo payment record nếu model Payment có, cập nhật booking.status -> 'paid', redirect về booking-confirm
 */
router.post('/user/confirm', requireAuth, async (req, res) => {
  try {
    const bookingId = req.body.bookingId || req.query.bookingId;
    const method = req.body.method || req.body.paymentMethod || 'momo';
    const transactionId = req.body.transactionId || req.body.txn || null;

    if (!bookingId) {
      return res.status(400).send('Missing bookingId');
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).send('Booking not found');

    // Nếu đã thanh toán rồi -> redirect
    if (booking.status === 'paid') {
      return res.redirect(`/user/booking-confirm?bookingId=${bookingId}`);
    }

    // Tạo bản ghi Payment (nếu model tồn tại)
    try {
      if (Payment) {
        const pay = await Payment.create({
          bookingId: booking._id,
          amount: booking.totalPrice || 0,
          method,
          status: 'paid',
          transactionId: transactionId || `SIM-${Date.now()}`,
          paidAt: new Date()
        });
        // optionally: attach payment id to booking (schema không khai báo, nhưng lưu thêm field là OK)
        booking.paymentId = pay._id;
      }
    } catch (e) {
      // nếu không thể lưu payment, log nhưng vẫn tiếp tục đổi trạng thái booking để UX không bị block
      console.warn('Could not create Payment doc:', e);
    }

    booking.status = 'paid';
    await booking.save();

    // redirect về trang xác nhận booking (lịch sử sẽ hiển thị trạng thái paid)
    return res.redirect(`/user/booking-confirm?bookingId=${bookingId}`);
  } catch (err) {
    console.error('POST /payment/user/confirm error', err);
    return res.status(500).send('Server error');
  }
});

module.exports = router;
