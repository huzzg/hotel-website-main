// routes/search.js
const express = require('express');
const router = express.Router();
const Room = require('../models/Room');

// GET /search?q=&type=&minPrice=&maxPrice=&sort=&page=
router.get('/', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const type = (req.query.type || '').trim();
    const minPrice = req.query.minPrice ? Number(req.query.minPrice) : undefined;
    const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : undefined;
    const sort = req.query.sort || 'price_asc';
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const perPage = 12;

    const filter = {};

    if (q) {
      const re = new RegExp(q, 'i');
      filter.$or = [
        { name: { $regex: re } },
        { roomNumber: { $regex: re } },
        { type: { $regex: re } },
        { description: { $regex: re } }
      ];
    }

    if (type) filter.type = type;

    if (typeof minPrice !== 'undefined' || typeof maxPrice !== 'undefined') {
      filter.price = {};
      if (typeof minPrice !== 'undefined' && !Number.isNaN(minPrice)) filter.price.$gte = minPrice;
      if (typeof maxPrice !== 'undefined' && !Number.isNaN(maxPrice)) filter.price.$lte = maxPrice;
    }

    // only active rooms if schema has isActive
    if (Room.schema.paths.isActive) filter.isActive = true;

    let query = Room.find(filter);

    // sorting
    if (sort === 'price_asc') query = query.sort({ price: 1 });
    else if (sort === 'price_desc') query = query.sort({ price: -1 });
    else if (sort === 'name_asc') query = query.sort({ name: 1 });
    else if (sort === 'name_desc') query = query.sort({ name: -1 });
    else query = query.sort({ createdAt: -1 });

    const total = await Room.countDocuments(filter);
    const rooms = await query.skip((page - 1) * perPage).limit(perPage).lean();

    res.render('search', {
      title: 'Kết quả tìm kiếm',
      rooms,
      total,
      page,
      pages: Math.ceil(total / perPage),
      query: req.query
    });
  } catch (err) {
    console.error('Search route error:', err);
    res.status(500).render ? res.render('error', { error: err }) : res.status(500).send('Server error');
  }
});

module.exports = router;
