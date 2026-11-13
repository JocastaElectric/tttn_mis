require('dotenv').config();
const mongoose = require('mongoose');
const ActivityLog = require('../models/ActivityLog');

async function sanitizeActivityLogMetadata() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tttn_db');
        const filter = {
            $or: [
                { 'metadata.body': { $exists: true } },
                { 'metadata.query': { $exists: true } }
            ]
        };
        const result = await ActivityLog.updateMany(filter, {
            $unset: {
                'metadata.body': '',
                'metadata.query': ''
            }
        });
        console.log(`Đã xóa nội dung request/query khỏi ${result.modifiedCount} bản ghi nhật ký.`);
    } catch (error) {
        console.error('Không thể làm sạch metadata nhật ký:', error);
        process.exitCode = 1;
    } finally {
        if (mongoose.connection.readyState) await mongoose.disconnect();
    }
}

sanitizeActivityLogMetadata();
