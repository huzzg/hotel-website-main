// utils/checkRoomAvailability.js
const Booking = require('../models/Booking');

/**
 * Trả về true nếu room còn trống trong khoảng [checkIn, checkOut)
 * Lưu ý: đảm bảo checkIn/checkOut là ISO date strings hoặc Date
 */
async function isRoomAvailable(roomId, checkIn, checkOut) {
  const ci = new Date(checkIn);
  const co = new Date(checkOut);
  if (isNaN(ci) || isNaN(co) || ci >= co) {
    throw new Error('Invalid checkIn/checkOut dates');
  }

  // Tìm booking overlap: existing.checkIn < new.checkOut && existing.checkOut > new.checkIn
  const existing = await Booking.findOne({
    roomId,
    $and: [
      { checkIn: { $lt: co } },
      { checkOut: { $gt: ci } }
    ],
    status: { $in: ['pending', 'confirmed', 'paid'] } // các trạng thái chiếm chỗ
  });

  return existing ? false : true;
}

module.exports = isRoomAvailable;
