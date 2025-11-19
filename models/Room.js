const mongoose = require('mongoose');

const RoomSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  type: { type: String, required: true }, // Standard, Superior, Deluxe, Suite
  price: { type: Number, required: true },
  description: { type: String },
  images: [{ type: String }],
  amenities: [{ type: String }],
  capacity: { type: Number, default: 2 },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

RoomSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Room', RoomSchema);
