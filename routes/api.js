// routes/api.js
const express = require('express');
const router = express.Router();
const Room = require('../models/Room');

// GET /api/rooms?location=Hà%20Nội&limit=9
router.get('/api/rooms', async (req, res, next) => {
  try {
    const { location = '', limit = 9 } = req.query;
    const filter = { status: 'available' };
    if (location) filter.location = new RegExp(location, 'i');

    const rooms = await Room.find(filter).sort({ price: 1 }).limit(Math.min(+limit || 9, 50)).lean();
    const mapped = rooms.map(r => ({
      _id: r._id,
      name: r.name || (r.type ? `${r.type} - ${r.roomNumber || ''}` : 'Room'),
      price: r.price || 0,
      image: r.image && r.image.startsWith('/images/') ? r.image : (r.image ? `/images/${r.image}` : '/images/room1.jpeg'),
      location: r.location || '',
      type: r.type || '',
      roomNumber: r.roomNumber || '',
      status: r.status || 'available'
    }));

    res.json({ ok: true, rooms: mapped });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
