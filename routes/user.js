// routes/user.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const User = require('../models/User');

let Booking = null;
try { Booking = require('../models/Booking'); } catch (_) { Booking = null; }

const Room = require('../models/Room');
let Payment = null;
try { Payment = require('../models/Payment'); } catch (_) { Payment = null; }
let Discount = null;
try { Discount = require('../models/Discount'); } catch (_) { Discount = null; }

// requireAuth as in your original file (kept)
function requireAuth(req, res, next) {
  try {
    if (req.session && req.session.user) {
      const s = req.session.user;
      req.user = {
        id: s._id || s.id || s._id || s.userId,
        username: s.username,
        email: s.email,
        role: s.role || 'user'
      };
      return next();
    }

    const token = req.cookies?.token;
    if (token) {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      req.user = payload;
      return next();
    }

    return res.redirect('/auth/login');
  } catch (err) {
    return res.redirect('/auth/login');
  }
}

/* ================== HỒ SƠ (unchanged) ================== */
// ... keep existing profile routes (not reprinted here to keep concise) ...
// For safety, re-add the profile and history handlers from the uploaded file:

router.get(['/profile', '/user/profile'], requireAuth, async (req, res, next) => {
  try {
    const me = await User.findById(req.user.id).lean();
    if (!me) return res.redirect('/auth/login');

    const data = {
      name: me.profile?.name || '',
      email: me.email || '',
      phone: me.phone || me.profile?.phone || '',
      username: me.username || ''
    };
    res.render('profile', { title: 'Hồ sơ cá nhân', error: null, success: null, data });
  } catch (err) { next(err); }
});

router.post(['/profile', '/user/profile'], requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const name  = String(req.body.name  || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const phone = String(req.body.phone || '').trim();

    if (!email) {
      return res.render('profile', {
        title: 'Hồ sơ cá nhân',
        error: 'Email không được để trống.',
        success: null,
        data: { name, email, phone, username: req.user.username || '' }
      });
    }

    const existed = await User.findOne({ email, _id: { $ne: userId } }).lean();
    if (existed) {
      return res.render('profile', {
        title: 'Hồ sơ cá nhân',
        error: 'Email này đã được sử dụng bởi tài khoản khác.',
        success: null,
        data: { name, email, phone, username: req.user.username || '' }
      });
    }

    const updated = await User.findByIdAndUpdate(
      userId,
      { $set: { email, phone, profile: { name, phone } } },
      { new: true }
    ).lean();

    if (req.session && req.session.user) {
      req.session.user.email = updated.email;
      req.session.user.username = updated.username;
    }

    try {
      const payload = {
        id: updated._id,
        email: updated.email,
        name: updated.profile?.name || updated.username || '',
        username: updated.username || '',
        role: updated.role || 'user',
        avatar: updated.avatar || '',
        phone: updated.phone || updated.profile?.phone || ''
      };
      if (process.env.JWT_SECRET) {
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.cookie('token', token, {
          httpOnly: true, sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          maxAge: 7 * 24 * 60 * 60 * 1000
        });
      }
    } catch (e) {}

    res.render('profile', {
      title: 'Hồ sơ cá nhân',
      error: null,
      success: 'Cập nhật thông tin thành công!',
      data: {
        name: updated.profile?.name || '',
        email: updated.email || '',
        phone: updated.phone || '',
        username: updated.username || ''
      }
    });
  } catch (err) { next(err); }
});

// --- Route: lịch sử đặt phòng ---
/**
 * GET /user/history
 * Hiển thị danh sách booking của user đang đăng nhập
 */
router.get('/history', requireAuth, async (req, res) => {
  try {
    // req.user._id hoặc req.user.id tùy middleware attach user
    const userId = req.user && (req.user._id || req.user.id);
    if (!userId) return res.redirect('/auth/login');

    // Tìm tất cả booking của user (sắp xếp mới nhất trước), populate thông tin phòng
    const bookings = await Booking.find({ userId: userId })
      .populate({ path: 'roomId', select: 'roomNumber type price name images' })
      .sort({ createdAt: -1 })
      .lean();

    // render view history.ejs (tạo file dưới views/history.ejs)
    return res.render('history', { title: 'Lịch sử đặt phòng', bookings, user: req.user });
  } catch (err) {
    console.error('GET /user/history error:', err);
    return res.status(500).send('Lỗi server, thử lại sau.');
  }
});

module.exports = router;

/* ================== NEW: Room detail + booking + payment flow ================== */

// GET room detail (public)
router.get('/room/:id', async (req, res, next) => {
  try {
    const room = await Room.findById(req.params.id).lean();
    if (!room) return res.status(404).send('Phòng không tìm thấy');
    res.render('booking', { title: (room.type || 'Phòng') + ' • ' + (room.roomNumber || ''), room });
  } catch (err) { next(err); }
});

// POST create booking (user must be logged in)
router.post('/book', requireAuth, async (req, res, next) => {
  try {
    if (!Booking) return res.status(500).send('Booking model chưa cấu hình');

    const userId = req.user.id;
    const { roomId, checkIn, checkOut, guests, discountCode } = req.body;

    if (!roomId || !checkIn || !checkOut) return res.status(400).send('Thiếu thông tin đặt phòng');

    const room = await Room.findById(roomId).lean();
    if (!room) return res.status(404).send('Phòng không tìm thấy');

    const d1 = new Date(checkIn);
    const d2 = new Date(checkOut);
    let nights = Math.round((d2 - d1) / (1000*60*60*24));
    if (nights < 1) nights = 1;

    let base = Number(room.price || 0);
    let total = base * nights;
    let discountApplied = 0;

    if (discountCode && Discount) {
      try {
        const disc = await Discount.findOne({ code: String(discountCode).trim(), active: true }).lean();
        if (disc && disc.percent) {
          discountApplied = Math.round((total * Number(disc.percent) / 100));
          total = total - discountApplied;
        }
      } catch (e) { /* ignore discount failure */ }
    }

    const booking = await Booking.create({
      userId,
      roomId,
      checkIn: d1,
      checkOut: d2,
      guests: Number(guests) || 1,
      totalPrice: total,
      discountApplied: discountApplied,
      status: 'pending'
    });

    // redirect to booking confirm (which includes a button to go to payment)
    res.redirect('/user/booking-confirm?bookingId=' + booking._id);
  } catch (err) { next(err); }
});

// GET booking confirm page
router.get('/booking-confirm', requireAuth, async (req, res, next) => {
  try {
    const bookingId = req.query.bookingId || req.body.bookingId;
    if (!bookingId) return res.status(400).send('Thiếu bookingId');
    const booking = await Booking.findById(bookingId).populate('roomId').lean();
    if (!booking) return res.status(404).send('Booking không tồn tại');
    res.render('booking-confirm', { title: 'Xác nhận đặt phòng', booking });
  } catch (err) { next(err); }
});

// POST pay (simulate payment) -> create Payment doc (if model exists) and update booking.status
router.post('/pay/:bookingId', requireAuth, async (req, res, next) => {
  try {
    if (!Booking) return res.status(500).send('Booking model chưa cấu hình');
    const bookingId = req.params.bookingId;
    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).send('Booking không tồn tại');

    // create fake payment if model present
    if (Payment) {
      await Payment.create({
        bookingId: booking._id,
        amount: booking.totalPrice || 0,
        method: req.body.method || 'manual',
        status: 'paid'
      });
    }

    booking.status = 'paid';
    await booking.save();

    res.redirect('/user/booking-confirm?bookingId=' + booking._id);
  } catch (err) { next(err); }
});

module.exports = router;
