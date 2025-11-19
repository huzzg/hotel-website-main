// routes/user.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const User = require('../models/User');

// Thử nạp Booking (nếu dự án chưa có model này thì trang lịch sử sẽ báo "chưa có dữ liệu")
let Booking = null;
try { Booking = require('../models/Booking'); } catch (_) { Booking = null; }

//
// requireAuth: hỗ trợ cả session-based (req.session.user) và JWT cookie (token)
// Nếu user đã login bằng session (req.session.user) thì dùng đó.
// Nếu dùng JWT (cookie 'token') thì verify token.
// Nếu không có cả 2 -> redirect /auth/login
//
function requireAuth(req, res, next) {
  try {
    // 1) session-based (ưu tiên)
    if (req.session && req.session.user) {
      // chuẩn hoá req.user giống payload JWT để các route dùng sau không cần thay đổi
      const s = req.session.user;
      req.user = {
        id: s._id || s.id || s._id || s.userId,
        username: s.username,
        email: s.email,
        role: s.role || 'user'
      };
      return next();
    }

    // 2) jwt cookie
    const token = req.cookies?.token;
    if (token) {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      req.user = payload;
      return next();
    }

    // 3) không có gì -> redirect login
    return res.redirect('/auth/login');
  } catch (err) {
    return res.redirect('/auth/login');
  }
}

/* ================== HỒ SƠ ================== */
// GET /profile  (và /user/profile nếu router được mount ở '/user')
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

// POST /profile (cập nhật) - hỗ trợ cả /profile và /user/profile
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

    // nếu bạn dùng session, cập nhật lại session.user để hiển thị tên/email mới
    if (req.session && req.session.user) {
      req.session.user.email = updated.email;
      req.session.user.username = updated.username;
      // _id giữ nguyên
    }

    // Nếu bạn có JWT cookie hệ thống (optional) — update token cookie
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
    } catch (e) {
      // ignore if JWT not configured
    }

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

/* ============== LỊCH SỬ ĐẶT PHÒNG ============== */
// GET /history  (và /user/history)
router.get(['/history', '/user/history'], requireAuth, async (req, res, next) => {
  try {
    if (!Booking) {
      // Nếu chưa có model Booking, hiển thị trang trống có hướng dẫn
      return res.render('history', {
        title: 'Lịch sử đặt phòng',
        bookings: [],
        note: 'Chưa tích hợp model Booking nên chưa có dữ liệu hiển thị.'
      });
    }

    // hỗ trợ nhiều tên field ngày để tương thích DB cũ
    const bookings = await Booking
      .find({ user: req.user.id })
      .populate('room')
      .sort({ createdAt: -1 })
      .lean();

    // chuẩn hoá dữ liệu để view dễ render
    const mapped = bookings.map(b => ({
      _id: b._id,
      code: b.code || b.bookingCode || ('BK' + String(b._id).slice(-6).toUpperCase()),
      roomName: b.room?.name || (b.room?.type ? `${b.room.type} - ${b.room?.roomNumber || ''}` : 'Phòng'),
      location: b.room?.location || '',
      price: b.room?.price || 0,
      totalPrice: b.totalPrice || b.amount || 0,
      status: b.status || 'pending',
      createdAt: b.createdAt,
      checkIn:  b.checkIn  || b.startDate || b.fromDate || b.from,
      checkOut: b.checkOut || b.endDate   || b.toDate   || b.to,
    }));

    res.render('history', {
      title: 'Lịch sử đặt phòng',
      bookings: mapped,
      note: null
    });
  } catch (err) { next(err); }
});

module.exports = router;
