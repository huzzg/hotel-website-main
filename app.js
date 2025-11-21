// app.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const cookieParser = require('cookie-parser');

const app = express();

// Views & static
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(cookieParser());

// DB connect (giữ file config/db của bạn)
try {
  require('./config/db');
} catch (e) {
  console.warn('Không tìm thấy ./config/db — đảm bảo bạn có file config kết nối DB nếu cần.');
}

// Session
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'phenikaa_secret_key',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/hotel',
      ttl: 24 * 60 * 60,
    }),
    cookie: { maxAge: 1000 * 60 * 60 * 24 },
  })
);
app.use(flash());

// Attach user middleware (nếu có)
try {
  const { attachUser } = require('./middleware/authMiddleware');
  app.use(attachUser);
} catch (e) {
  // không có middleware thì bỏ qua
  console.warn('attachUser middleware not found, skipping attachUser.');
}

// locals cho views
app.use((req, res, next) => {
  res.locals.currentPath = req.originalUrl || req.path || '/';
  res.locals.currentUser = req.session ? req.session.user : null;
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  next();
});

// Routes mounts (giữ nguyên nếu bạn có file routes)
const adminRoutes = require('./routes/admin');
const userRoutes = require('./routes/user');
const authRoutes = require('./routes/auth');
const searchRoutes = require('./routes/search');
const paymentRoutes = require('./routes/payment');

app.use('/admin', adminRoutes);
app.use('/user', userRoutes);
app.use('/auth', authRoutes);
app.use('/search', searchRoutes);
app.use('/payment', paymentRoutes);

// Models
const Room = require('./models/Room');
const Discount = require('./models/Discount');

// HOME route: lấy rooms (nếu bạn có logic khác, giữ nguyên) + lấy discounts
app.get('/', async (req, res, next) => {
  try {
    // lấy rooms: giữ nguyên logic của bạn nếu có, đây chỉ ví dụ
    let rooms = [];
    try {
      const limitEnv = parseInt(process.env.HOMEPAGE_LIMIT || '', 10);
      if (Number.isFinite(limitEnv) && limitEnv > 0) {
        rooms = await Room.find().sort({ createdAt: -1 }).limit(limitEnv).lean();
      } else {
        rooms = await Room.find().sort({ createdAt: -1 }).lean();
      }
    } catch (e) {
      console.warn('Không lấy được rooms cho homepage:', e);
      rooms = [];
    }

    // LẤY TẤT CẢ discounts đã tạo (nếu bạn chỉ muốn hiển thị mã "còn hiệu lực", đổi query)
    // - để hiện "mọi mã đã tạo" (user yêu cầu): bỏ điều kiện active/date hoặc chỉ active: true
    // - để hiển thị "chỉ mã đang có hiệu lực dùng ngay": uncomment phần filter "active && date range"
    let discounts = [];
    try {
      // Option A: hiển thị tất cả mã (đã tạo) — uncomment if you want all:
      discounts = await Discount.find().sort({ createdAt: -1 }).lean();

      // Option B: chỉ hiển thị mã active & trong ngày (nếu muốn thay behavior)
      // const now = new Date();
      // discounts = await Discount.find({
      //   active: true,
      //   $and: [
      //     { $or: [{ startDate: { $lte: now } }, { startDate: null }] },
      //     { $or: [{ endDate: { $gte: now } }, { endDate: null }] },
      //   ],
      // }).sort({ startDate: 1 }).lean();
    } catch (e) {
      console.error('Error fetching discounts for homepage:', e);
      discounts = [];
    }

    // render index, truyền discounts (mảng)
    res.render('index', { title: 'Khách sạn Phenikaa', rooms, discounts });
  } catch (err) {
    next(err);
  }
});

// mount adminRoutes already above; other routes loaded earlier

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.stack || err.message);
  res.status(500).send('Something went wrong!');
});

// Start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server chạy tại http://localhost:${PORT}`);
});
