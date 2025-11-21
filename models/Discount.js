const mongoose = require("mongoose");

function parseVNDate(str) {
  if (!str) return null;
  // format dd/mm/yyyy
  const parts = str.split("/");
  if (parts.length !== 3) return null;

  const [d, m, y] = parts.map(Number);
  if (!d || !m || !y) return null;

  return new Date(y, m - 1, d);
}

const DiscountSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true },
    percent: { type: Number, required: true },

    startDate: {
      type: Date,
      set: (val) => {
        if (!val) return null;
        if (val instanceof Date) return val;
        return parseVNDate(val);
      },
    },

    endDate: {
      type: Date,
      set: (val) => {
        if (!val) return null;
        if (val instanceof Date) return val;
        return parseVNDate(val);
      },
    },

    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Discount", DiscountSchema);
