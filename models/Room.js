// models/Room.js
const mongoose = require('mongoose');

const RoomSchema = new mongoose.Schema({
  roomNumber: { type: String, required: true },
  name: { type: String },
  type: { type: String, required: true }, // e.g. Standard, Deluxe...
  price: { type: Number, default: 0 },
  status: { type: String, default: 'available' },
  image: { type: String },
  description: { type: String },
  isActive: { type: Boolean, default: true }
  // NOTE: field `location` intentionally removed
}, { timestamps: true });

module.exports = mongoose.model('Room', RoomSchema);
