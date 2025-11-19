// models/User.js
const mongoose = require('mongoose');

const ProfileSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    address: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const UserSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, trim: true, minlength: 3 },
    email:    { type: String, required: true, trim: true, lowercase: true },
    phone:    { type: String, trim: true, default: '' },

    password: { type: String, required: true }, // bcrypt hash
    role:     { type: String, enum: ['user', 'admin'], default: 'user' },
    avatar:   { type: String, default: '' },

    profile:  { type: ProfileSchema, default: () => ({}) },
  },
  { timestamps: true }
);

// Index duy nhất để tránh trùng
UserSchema.index({ email: 1 },    { unique: true, sparse: false });
UserSchema.index({ username: 1 }, { unique: true, sparse: false });

// Giữ email luôn lowercase
UserSchema.pre('save', function (next) {
  if (this.email) this.email = String(this.email).toLowerCase();
  next();
});

module.exports = mongoose.model('User', UserSchema);
