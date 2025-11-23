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

// ---------- Helper: build aggregation pipeline for stats ----------
/**
 * buildAggregation(range, dateStr)
 * - range: 'day' | 'month' | 'year'
 * - dateStr: optional filter value (day: 'YYYY-MM-DD', month: 'YYYY-MM', year: 'YYYY')
 *
 * By default the pipeline groups by Booking.createdAt and sums Booking.totalPrice.
 * If you want to base on payment time, replace dateField with '$paidAt' or payment field.
 */
function buildAggregation(range, dateStr) {
  const dateField = '$createdAt'; // change to payment date if desired
  const match = {};

  // Optionally count only paid bookings (recommended)
  match.status = 'paid';

  // If dateStr provided, build a range filter on createdAt
  if (dateStr) {
    if (range === 'day') {
      const start = new Date(dateStr + 'T00:00:00.000Z');
      const end = new Date(dateStr + 'T23:59:59.999Z');
      match.createdAt = { $gte: start, $lte: end };
    } else if (range === 'month') {
      const parts = dateStr.split('-');
      if (parts.length === 2) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
        // end of month:
        const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
        match.createdAt = { $gte: start, $lte: end };
      }
    } else if (range === 'year') {
      const year = parseInt(dateStr, 10);
      if (!Number.isNaN(year)) {
        const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
        const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
        match.createdAt = { $gte: start, $lte: end };
      }
    }
  }

  const pipeline = [];

  // Apply match if any
  if (Object.keys(match).length) pipeline.push({ $match: match });

  // Ensure totalPrice exists and is number
  pipeline.push({ $match: { totalPrice: { $exists: true } } });

  // Project only fields we need (optional)
  pipeline.push({
    $project: {
      totalPrice: 1,
      createdAt: 1
    }
  });

  // Group depending on range
  if (range === 'day') {
    pipeline.push({
      $group: {
        _id: { day: { $dateToString: { format: "%Y-%m-%d", date: dateField } } },
        total: { $sum: { $ifNull: ["$totalPrice", 0] } },
        count: { $sum: 1 }
      }
    });
    pipeline.push({ $sort: { "_id.day": -1 } });
  } else if (range === 'month') {
    pipeline.push({
      $group: {
        _id: { month: { $dateToString: { format: "%Y-%m", date: dateField } } },
        total: { $sum: { $ifNull: ["$totalPrice", 0] } },
        count: { $sum: 1 }
      }
    });
    pipeline.push({ $sort: { "_id.month": -1 } });
  } else { // year
    pipeline.push({
      $group: {
        _id: { year: { $dateToString: { format: "%Y", date: dateField } } },
        total: { $sum: { $ifNull: ["$totalPrice", 0] } },
        count: { $sum: 1 }
      }
    });
    pipeline.push({ $sort: { "_id.year": -1 } });
  }

  return pipeline;
}

// ========== DASHBOARD ==========
// Replaced old dashboard handler with flexible day/month/year stats.
// Route: GET /admin/dashboard?range=month&date=2025-11
router.get('/dashboard', async (req, res, next) => {
  try {
    const range = (req.query.range || 'month').toLowerCase(); // day|month|year
    const date = req.query.date || null; // format depends on range

    // Basic counts
    const [usersCount, roomsCount, bookingsCount] = await Promise.all([
      User.countDocuments({}),
      Room.countDocuments({}),
      Booking.countDocuments({})
    ]);

    // Total revenue: sum totalPrice for paid bookings (recommended)
    const revenueAgg = await Booking.aggregate([
      { $match: { status: 'paid', totalPrice: { $exists: true } } },
      { $group: { _id: null, total: { $sum: '$totalPrice' } } }
    ]).catch(() => []);

    const totalRevenue = (revenueAgg && revenueAgg.length) ? revenueAgg[0].total : 0;

    // Build pipeline and run aggregation on Bookings
    const pipeline = buildAggregation(range, date);
    const stats = await Booking.aggregate(pipeline).catch(() => []);

    // Transform stats into rows for view
    const rows = stats.map(item => {
      const keyObj = item._id || {};
      const key = keyObj.day || keyObj.month || keyObj.year || '/';
      return { key, total: item.total || 0, count: item.count || 0 };
    });

    return res.render('admin-dashboard', {
      title: 'Admin • Dashboard',
      usersCount,
      roomsCount,
      bookingsCount,
      totalRevenue,
      statsRows: rows,
      selectedRange: range,
      selectedDate: date || ''
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
    const discounts = await Discount.find({}).sort({ createdAt: -1 }).lean();
    // If you use flash messages, pass them here; otherwise templates can check req.flash in layout.
    res.render('admin-discounts', { title: 'Admin • Mã giảm giá', discounts, messages: req.flash ? req.flash() : {} });
  } catch (e) {
    next(e);
  }
});

router.post('/discounts', async (req, res, next) => {
  try {
    // hỗ trợ cả form urlencoded, FormData và trường có tên tiếng Việt 'ma' (phòng trường hợp template khác)
    const rawCode = (req.body && (req.body.code || req.body.ma || req.body.MA || req.body.Mã)) ? String(req.body.code || req.body.ma || req.body.MA || req.body.Mã).trim() : '';
    const rawPercent = (req.body && (req.body.percent || req.body.phantram)) ? (req.body.percent || req.body.phantram) : null;
    const startDate = req.body && (req.body.startDate || req.body.tungay) ? (req.body.startDate || req.body.tungay) : null;
    const endDate = req.body && (req.body.endDate || req.body.denday) ? (req.body.endDate || req.body.denday) : null;
    const rawActive = req.body && (req.body.active === 'on' || req.body.active === 'true' || req.body.active === '1' || req.body.active === true);

    // debug logging to server console if something unexpected arrives
    // console.log('/admin/discounts POST body:', req.body);

    if (!rawCode) {
      if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1)) {
        return res.status(400).json({ message: 'Mã là bắt buộc' });
      }
      if (req.flash) req.flash('error', 'Mã là bắt buộc');
      return res.redirect('/admin/discounts');
    }

    const code = rawCode.toUpperCase();
    const percent = Number(rawPercent);
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1)) {
        return res.status(400).json({ message: 'Phần trăm không hợp lệ (1-100)' });
      }
      if (req.flash) req.flash('error', 'Phần trăm không hợp lệ');
      return res.redirect('/admin/discounts');
    }

    // tránh trùng
    const existing = await Discount.findOne({ code });
    if (existing) {
      if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1)) {
        return res.status(409).json({ message: 'Mã đã tồn tại' });
      }
      if (req.flash) req.flash('error', 'Mã đã tồn tại');
      return res.redirect('/admin/discounts');
    }

    const d = new Discount({
      code,
      percent,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      active: !!rawActive
    });
    await d.save();

    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1)) {
      return res.status(201).json({ discount: d });
    }
    if (req.flash) req.flash('success', 'Tạo mã thành công');
    res.redirect('/admin/discounts');
  } catch (e) {
    console.error('POST /admin/discounts error', e);
    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1)) {
      return res.status(500).json({ message: 'Lỗi server khi tạo mã' });
    }
    next(e);
  }
});

// Cập nhật mã giảm giá (PUT/POST)
router.post('/discounts/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const rawCode = (req.body && (req.body.code || req.body.ma || req.body.Mã)) ? String(req.body.code || req.body.ma || req.body.Mã).trim() : '';
    const rawPercent = (req.body && (req.body.percent || req.body.phantram)) ? (req.body.percent || req.body.phantram) : null;
    const startDate = req.body && (req.body.startDate || req.body.tungay) ? (req.body.startDate || req.body.tungay) : null;
    const endDate = req.body && (req.body.endDate || req.body.denday) ? (req.body.endDate || req.body.denday) : null;
    const rawActive = req.body && (req.body.active === 'on' || req.body.active === 'true' || req.body.active === '1');

    if (!rawCode) {
      if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1)) {
        return res.status(400).json({ message: 'Mã là bắt buộc' });
      }
      if (req.flash) req.flash('error', 'Mã là bắt buộc');
      return res.redirect('/admin/discounts');
    }
    const code = rawCode.toUpperCase();
    const percent = Number(rawPercent);
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1)) {
        return res.status(400).json({ message: 'Phần trăm không hợp lệ (1-100)' });
      }
      if (req.flash) req.flash('error', 'Phần trăm không hợp lệ');
      return res.redirect('/admin/discounts');
    }

    // tránh duplicate (nếu đổi code)
    const conflict = await Discount.findOne({ code, _id: { $ne: id } });
    if (conflict) {
      if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1)) {
        return res.status(409).json({ message: 'Mã đã tồn tại' });
      }
      if (req.flash) req.flash('error', 'Mã đã tồn tại');
      return res.redirect('/admin/discounts');
    }

    const update = {
      code,
      percent,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      active: !!rawActive
    };

    const updated = await Discount.findByIdAndUpdate(id, update, { new: true });
    if (!updated) {
      if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1)) {
        return res.status(404).json({ message: 'Không tìm thấy mã' });
      }
      if (req.flash) req.flash('error', 'Không tìm thấy mã');
      return res.redirect('/admin/discounts');
    }

    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1)) {
      return res.json({ discount: updated });
    }
    if (req.flash) req.flash('success', 'Cập nhật mã thành công');
    res.redirect('/admin/discounts');
  } catch (e) {
    console.error('POST /admin/discounts/:id error', e);
    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1)) {
      return res.status(500).json({ message: 'Lỗi server khi cập nhật mã' });
    }
    next(e);
  }
});

// DELETE (REST) - xóa mã
router.delete('/discounts/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const del = await Discount.findByIdAndDelete(id);
    if (!del) return res.status(404).json({ message: 'Không tìm thấy mã' });
    return res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /admin/discounts/:id error', e);
    return res.status(500).json({ message: 'Lỗi server khi xóa mã' });
  }
});

// For compatibility: support form POST delete (old style)
router.post('/discounts/:id/delete', async (req, res, next) => {
  try {
    await Discount.findByIdAndDelete(req.params.id);
    res.redirect('/admin/discounts');
  } catch (e) { next(e); }
});

module.exports = router;
