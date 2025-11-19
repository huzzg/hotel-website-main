// scripts/seedRooms.js
require('dotenv').config();
const mongoose = require('mongoose');
const Room = require('../models/Room');

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hotel';

const seedRooms = [
  { name:'Standard - 201', type:'Standard', roomNumber:'201', location:'Hà Nội', price:600000, status:'available', image:'/images/room1.jpeg', images:['/images/room1.jpeg','/images/001.jpg'], capacity:2, amenities:['WiFi','Điều hoà','TV'], description:'Phòng tiêu chuẩn, phù hợp ngân sách.' },
  { name:'Superior - 305', type:'Superior', roomNumber:'305', location:'Đà Nẵng', price:800000, status:'available', image:'/images/room2.jpeg', images:['/images/room2.jpeg','/images/002.jpg'], capacity:2, amenities:['WiFi','Điều hoà','TV'], description:'Superior rộng hơn, tầng giữa.' },
  { name:'Deluxe - 102', type:'Deluxe', roomNumber:'102', location:'TP.HCM', price:1500000, status:'available', image:'/images/room3.jpeg', images:['/images/room3.jpeg','/images/005.jpg'], capacity:3, amenities:['WiFi','Smart TV','Bồn tắm'], description:'Deluxe tầng cao, view đẹp.' },
  { name:'Suite - 803', type:'Suite', roomNumber:'803', location:'Phú Quốc', price:2200000, status:'available', image:'/images/room4.jpeg', images:['/images/room4.jpeg','/images/006.jpg'], capacity:4, amenities:['WiFi','Smart TV','Phòng khách riêng'], description:'Suite sang trọng, có phòng khách.' },
  { name:'Deluxe - 110', type:'Deluxe', roomNumber:'110', location:'Hà Nội', price:1400000, status:'available', image:'/images/room1.jpeg', images:['/images/room1.jpeg','/images/001.jpg'], capacity:3, amenities:['WiFi','Smart TV'], description:'Deluxe thoáng, nội thất hiện đại.' },
  { name:'Superior - 212', type:'Superior', roomNumber:'212', location:'Đà Nẵng', price:900000, status:'available', image:'/images/room2.jpeg', images:['/images/room2.jpeg','/images/002.jpg'], capacity:2, amenities:['WiFi','Điều hoà'], description:'Superior gần bãi biển.' }
];

(async () => {
  try {
    await mongoose.connect(uri);
    console.log('✅ Connected:', uri);
    await Room.deleteMany({});
    const docs = await Room.insertMany(seedRooms);
    console.log('🌿 Seeded:', docs.length);
  } catch (e) {
    console.error('❌', e);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
})();
