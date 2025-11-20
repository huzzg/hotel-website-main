// routes/admin.js
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const requireAdmin = require('../middleware/requireAdmin');
const User = require('../models/User');
const Room = require('../models/Room');
const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const Discount = require('../models/Discount');

// Bảo vệ tất cả route admin
router.use(requireAdmin);

// --- multer cho upload ảnh phòng ---
const multer = require('multer');
const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'rooms');

// đảm bảo thư mục tồn tại
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/\s+/g, '-');
    cb(null, Date.now() + '-' + safe);
  }
});
const upload = multer({ storage });

// ---------- Helper: parse price input ----------
/**
 * Accepts strings like:
 *  "250.000" (thousands dot) -> 250000
 *  "250,000" -> 250000
 *  "250.5"  -> 250.5
 *  "250,5"  -> 250.5
 *  "250000" -> 250000
 */
function parsePriceInput(raw) {
  if (raw === undefined || raw === null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  // Remove spaces
  s = s.replace(/\s+/g, '');
  // If both '.' and ',' present, assume '.' thousands and ',' decimal OR vice versa.
  // Heuristic: remove dots (thousand separators) and convert comma to dot.
  if (s.indexOf('.') !== -1 && s.indexOf(',') !== -1) {
    s = s.replace(/\./g, '').replace(/,/g, '.');
  } else {
    // Otherwise remove dots (thousands) and convert comma to dot (decimal)
    s = s.replace(/\./g, '').replace(/,/g, '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ========== DASHBOARD ==========
router.get('/dashboard', async (req, res, next) => {
  try {
    const [users, rooms, bookings, paidAgg] = await Promise.all([
      User.countDocuments({}),
      Room.countDocuments({}),
      Booking.countDocuments({}),
      Payment.aggregate([
        { $match: { status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]).catch(() => [])
    ]);

    const revenue = paidAgg && paidAgg.length ? paidAgg[0].total : 0;

    const monthly = await Payment.aggregate([
      { $match: { status: 'paid' } },
      {
        $group: {
          _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' } },
          total: { $sum: '$amount' }
        }
      },
      { $sort: { '_id.y': 1, '_id.m': 1 } }
    ]).catch(() => []);

    res.render('admin-dashboard', {
      title: 'Admin • Dashboard',
      stat: { users, rooms, bookings, revenue },
      monthly
    });
  } catch (err) {
    next(err);
  }
});

// ========== ROOMS ==========
router.get('/rooms', async (req, res, next) => {
  try {
    const rooms = await Room.find({}).sort({ createdAt: -1 }).lean();
    res.render('admin-rooms', { title: 'Admin • Quản lý phòng', rooms });
  } catch (e) { next(e); }
});

// POST thêm phòng (có upload ảnh)
router.post('/rooms', upload.single('image'), async (req, res, next) => {
  try {
    const { roomNumber, type, price, status, location } = req.body;
    const parsedPrice = parsePriceInput(price);
    const image = req.file ? '/uploads/rooms/' + req.file.filename : (req.body.existingImage || '');
    await Room.create({ roomNumber, type, price: parsedPrice, status, location, image });
    res.redirect('/admin/rooms');
  } catch (e) { next(e); }
});

// POST cập nhật phòng (có upload ảnh)
router.post('/rooms/:id', upload.single('image'), async (req, res, next) => {
  try {
    const { roomNumber, type, price, status, location } = req.body;
    const parsedPrice = parsePriceInput(price);
    const update = { roomNumber, type, price: parsedPrice, status, location };

    if (req.file) {
      update.image = '/uploads/rooms/' + req.file.filename;
    } else if (req.body.existingImage) {
      update.image = req.body.existingImage;
    }

    await Room.findByIdAndUpdate(req.params.id, update);
    res.redirect('/admin/rooms');
  } catch (e) { next(e); }
});

// PUT cập nhật phòng — hỗ trợ nếu method-override chuyển POST -> PUT
router.put('/rooms/:id', upload.single('image'), async (req, res, next) => {
  try {
    const { roomNumber, type, price, status, location } = req.body;
    const parsedPrice = parsePriceInput(price);
    const update = { roomNumber, type, price: parsedPrice, status, location };

    if (req.file) {
      update.image = '/uploads/rooms/' + req.file.filename;
    } else if (req.body.existingImage) {
      update.image = req.body.existingImage;
    }

    await Room.findByIdAndUpdate(req.params.id, update);
    res.redirect('/admin/rooms');
  } catch (e) { next(e); }
});

// DELETE (theo style cũ nếu bạn đang dùng method-override hoặc POST /:id/delete)
router.post('/rooms/:id/delete', async (req, res, next) => {
  try {
    await Room.findByIdAndDelete(req.params.id);
    res.redirect('/admin/rooms');
  } catch (e) { next(e); }
});

// ========== BOOKINGS ==========
router.get('/bookings', async (req, res, next) => {
  try {
    const bookings = await Booking.find({})
      .populate('userId', 'username email')
      .populate('roomId', 'roomNumber type price')
      .sort({ createdAt: -1 });

    res.render('admin-bookings', {
      title: 'Admin • Đơn đặt phòng',
      bookings
    });
  } catch (e) { next(e); }
});

router.post('/bookings/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body; // pending | checked_in | checked_out | cancelled
    await Booking.findByIdAndUpdate(req.params.id, { status });
    res.redirect('/admin/bookings');
  } catch (e) { next(e); }
});

// ========== USERS ==========
router.get('/users', async (req, res, next) => {
  try {
    const users = await User.find({}).sort({ createdAt: -1 });
    res.render('admin-users', { title: 'Admin • Khách hàng', users });
  } catch (e) { next(e); }
});

router.post('/users/:id/toggle', async (req, res, next) => {
  try {
    const u = await User.findById(req.params.id);
    if (!u) return res.redirect('/admin/users');
    const active = typeof u.active === 'boolean' ? !u.active : false;
    u.active = active;
    await u.save();
    res.redirect('/admin/users');
  } catch (e) { next(e); }
});

// ========== DISCOUNTS ==========
router.get('/discounts', async (req, res, next) => {
  try {
    const discounts = await Discount.find({}).sort({ createdAt: -1 });
    res.render('admin-discounts', { title: 'Admin • Mã giảm giá', discounts });
  } catch (e) { next(e); }
});

router.post('/discounts', async (req, res, next) => {
  try {
    const { code, percent, startDate, endDate, active } = req.body;
    await Discount.create({
      code,
      percent: Number(percent),
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      active: active === 'on'
    });
    res.redirect('/admin/discounts');
  } catch (e) { next(e); }
});

router.post('/discounts/:id', async (req, res, next) => {
  try {
    const { code, percent, startDate, endDate, active } = req.body;
    await Discount.findByIdAndUpdate(req.params.id, {
      code,
      percent: Number(percent),
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      active: active === 'on'
    });
    res.redirect('/admin/discounts');
  } catch (e) { next(e); }
});

router.post('/discounts/:id/delete', async (req, res, next) => {
  try {
    await Discount.findByIdAndDelete(req.params.id);
    res.redirect('/admin/discounts');
  } catch (e) { next(e); }
});

module.exports = router;
