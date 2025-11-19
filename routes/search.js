const express = require("express");
const router = express.Router();
const Room = require("../models/Room");
const checkRoomAvailability = require("../utils/checkRoomAvailability");

// SEARCH PAGE
router.get("/", async (req, res) => {
  try {
    const {
      q,
      type,
      price_min,
      price_max,
      checkIn,
      checkOut,
      sort,
      page
    } = req.query;

    const filter = {};

    // TÌM THEO TỪ KHÓA
    if (q && q.trim()) {
      const regex = new RegExp(q.trim(), "i");
      filter.$or = [
        { name: regex },
        { description: regex },
        { code: regex }
      ];
    }

    // LỌC THEO LOẠI PHÒNG (KHÔNG CÒN LOCATION)
    if (type && type.trim()) filter.type = type.trim();

    // GIÁ
    if (price_min) filter.price = { ...(filter.price || {}), $gte: Number(price_min) };
    if (price_max) filter.price = { ...(filter.price || {}), $lte: Number(price_max) };

    // PHÒNG ACTIVE
    filter.isActive = true;

    // SORT
    let sortQuery = {};
    if (sort === "price_asc") sortQuery.price = 1;
    else if (sort === "price_desc") sortQuery.price = -1;
    else if (sort === "name_asc") sortQuery.name = 1;
    else if (sort === "name_desc") sortQuery.name = -1;
    else sortQuery.createdAt = -1;

    // PAGINATION
    const perPage = 9;
    const currentPage = Math.max(1, parseInt(page) || 1);

    const allRooms = await Room.find(filter).sort(sortQuery);

    // CHECK AVAILABILITY (nếu có chọn ngày)
    let availableRooms = [];
    if (checkIn && checkOut) {
      for (let room of allRooms) {
        const free = await checkRoomAvailability(room._id, checkIn, checkOut);
        if (free) availableRooms.push(room);
      }
    } else {
      availableRooms = allRooms;
    }

    const total = availableRooms.length;
    const paginatedRooms = availableRooms.slice(
      (currentPage - 1) * perPage,
      currentPage * perPage
    );

    return res.render("search", {
      rooms: paginatedRooms,
      total,
      page: currentPage,
      pages: Math.ceil(total / perPage),
      query: req.query
    });
  } catch (err) {
    console.error("Search Error:", err);
    return res.status(500).send("Server Error");
  }
});

module.exports = router;
