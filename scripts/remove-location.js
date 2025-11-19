// hotel-website-main/scripts/remove-location.js
// Xóa field `location` khỏi các collection rooms và bookings (nếu có).
// Sử dụng: set MONGO_URI trong .env hoặc export MONGO_URI rồi chạy: node scripts/remove-location.js

const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/mydb';

async function run() {
  try {
    console.log('Connecting to DB...', MONGO_URI);
    await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    const db = mongoose.connection.db;

    // Liệt kê collections có trong DB
    const cols = await db.listCollections().toArray();
    const names = cols.map(c => c.name);
    console.log('Collections:', names.join(', '));

    // 1) Rooms
    if (names.includes('rooms')) {
      const rooms = db.collection('rooms');
      const cnt = await rooms.countDocuments({ location: { $exists: true } });
      console.log(`rooms documents with location: ${cnt}`);
      if (cnt > 0) {
        const res = await rooms.updateMany({}, { $unset: { location: "" } });
        console.log(`Unset location in rooms - modifiedCount: ${res.modifiedCount}`);
      } else {
        console.log('No location field found in rooms.');
      }

      // drop any index containing 'location'
      try {
        const idxs = await rooms.indexes();
        for (const idx of idxs) {
          if (JSON.stringify(idx.key).includes('"location"') || JSON.stringify(idx.key).includes("'location'")) {
            console.log('Dropping rooms index:', idx.name);
            await rooms.dropIndex(idx.name);
          }
        }
      } catch (e) {
        console.log('Error checking/dropping rooms indexes:', e.message);
      }
    } else {
      console.log('rooms collection not found.');
    }

    // 2) Bookings (nếu có)
    if (names.includes('bookings')) {
      const bookings = db.collection('bookings');
      const bc = await bookings.countDocuments({ location: { $exists: true } });
      console.log(`bookings documents with location: ${bc}`);
      if (bc > 0) {
        const resb = await bookings.updateMany({}, { $unset: { location: "" } });
        console.log(`Unset location in bookings - modifiedCount: ${resb.modifiedCount}`);
      } else {
        console.log('No location field found in bookings.');
      }

      try {
        const bidxs = await bookings.indexes();
        for (const idx of bidxs) {
          if (JSON.stringify(idx.key).includes('"location"') || JSON.stringify(idx.key).includes("'location'")) {
            console.log('Dropping bookings index:', idx.name);
            await bookings.dropIndex(idx.name);
          }
        }
      } catch (e) {
        console.log('Error checking/dropping bookings indexes:', e.message);
      }
    } else {
      console.log('bookings collection not found.');
    }

    // 3) Optional: other collections that may contain location field
    const candidates = names.filter(n => !['rooms','bookings','system.indexes'].includes(n));
    for (const c of candidates) {
      try {
        const col = db.collection(c);
        const have = await col.countDocuments({ location: { $exists: true } });
        if (have > 0) {
          console.log(`${c} has ${have} docs with location. Unsetting...`);
          const r = await col.updateMany({}, { $unset: { location: "" } });
          console.log(` - ${c} modified: ${r.modifiedCount}`);
        }
      } catch (e) {
        // ignore
      }
    }

    console.log('Migration finished. Disconnecting...');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Migration error:', err);
    try { await mongoose.disconnect(); } catch(e){}
    process.exit(1);
  }
}

run();
