// middleware/requireAdmin.js
module.exports = (req, res, next) => {
  const user = req.user;

  if (!user) {
    return res.redirect('/auth/login');
  }

  if (user.role !== 'admin') {
    // nếu bạn không có view errors/403.ejs, có thể đổi sang redirect('/')
    return res.status(403).render('errors/403', { message: 'Bạn không có quyền truy cập' });
  }

  // expose user cho views
  res.locals.currentUser = user;
  next();
};
