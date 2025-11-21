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

// ===== View & static =====
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(cookieParser()); // cần cho cookie token

// ===== DB connect =====
require('./config/db');

// ===== Session =====
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

// ===== Attach user (session-first, fallback JWT if you have) =====
try {
  const { attachUser } = require('./middleware/authMiddleware');
  app.use(attachUser);
} catch (e) {
  // nếu không có middleware attachUser thì bỏ qua (để tránh crash)
  console.warn('attachUser middleware not found, skipping attachUser.');
}

// ===== Make current path available to views =====
app.use((req, res, next) => {
  res.locals.currentPath = req.originalUrl || req.path || '/';
  res.locals.currentUser = req.session ? req.session.user : null;
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  next();
});

// ===== Routes (giữ nguyên mounts hiện có) =====
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const userRoutes = require('./routes/user');
const searchRoutes = require('./routes/search');
const paymentRoutes = require('./routes/payment');

app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/user', userRoutes);
app.use('/search', searchRoutes);
app.use('/payment', paymentRoutes);

// ===== Home =====
const Room = require('./models/Room');
app.get('/', async (req, res, next) => {
  try {
    let rooms = [];
    try {
      // Nếu bạn muốn giới hạn số phòng hiện thị trên trang chính,
      // đặt biến môi trường HOMEPAGE_LIMIT (ví dụ 6). Nếu không có, sẽ hiện tất cả.
      const limitEnv = parseInt(process.env.HOMEPAGE_LIMIT || '', 10);
      if (Number.isFinite(limitEnv) && limitEnv > 0) {
        rooms = await Room.find().sort({ createdAt: -1 }).limit(limitEnv).lean();
      } else {
        // Hiển thị tất cả phòng
        rooms = await Room.find().sort({ createdAt: -1 }).lean();
      }
    } catch (e) {
      rooms = [];
    }
    res.render('index', { title: 'Khách sạn Phenikaa', rooms });
  } catch (err) {
    next(err);
  }
});

// ===== Error handler =====
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.stack || err.message);
  res.status(500).send('Something went wrong!');
});

// ===== Start =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server chạy tại http://localhost:${PORT}`);
});
