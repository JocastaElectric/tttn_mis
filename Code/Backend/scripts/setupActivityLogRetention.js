require('dotenv').config();
const mongoose = require('mongoose');
const ActivityLog = require('../models/ActivityLog');

const BATCH_SIZE = 500;
const RETENTION_MS = ActivityLog.RETENTION_DAYS * 24 * 60 * 60 * 1000;

async function backfillExpirationDates() {
    const cursor = ActivityLog.collection.find(
        { expiresAt: { $exists: false }, createdAt: { $type: 'date' } },
        { projection: { _id: 1, createdAt: 1 } }
    );
    let operations = [];
    let migratedCount = 0;

    const flush = async () => {
        if (operations.length === 0) return;
        const result = await ActivityLog.collection.bulkWrite(operations, { ordered: false });
        migratedCount += result.modifiedCount;
        operations = [];
    };

    for await (const log of cursor) {
        operations.push({
            updateOne: {
                filter: { _id: log._id, expiresAt: { $exists: false } },
                update: {
                    $set: {
                        expiresAt: new Date(log.createdAt.getTime() + RETENTION_MS)
                    }
                }
            }
        });

        if (operations.length >= BATCH_SIZE) await flush();
    }
    await flush();

    const missingDates = await ActivityLog.collection.countDocuments({
        expiresAt: { $exists: false }
    });
    if (missingDates > 0) {
        throw new Error(`${missingDates} bản ghi nhật ký thiếu createdAt nên chưa thể đặt hạn lưu.`);
    }

    await ActivityLog.collection.createIndex(
        { expiresAt: 1 },
        { expireAfterSeconds: 0, name: 'activity_log_expiry' }
    );

    return migratedCount;
}

async function setupActivityLogRetention() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tttn_db');
        const migratedCount = await backfillExpirationDates();
        console.log(`Đã đặt thời hạn lưu 90 ngày cho ${migratedCount} bản ghi nhật ký cũ.`);
    } catch (error) {
        console.error('Không thể thiết lập thời hạn lưu nhật ký:', error);
        process.exitCode = 1;
    } finally {
        if (mongoose.connection.readyState) await mongoose.disconnect();
    }
}

setupActivityLogRetention();
