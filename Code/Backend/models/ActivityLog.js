const mongoose = require('mongoose');

const RETENTION_DAYS = 90;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

const activityLogSchema = new mongoose.Schema({
    user_code: { type: String, default: null },
    user_name: { type: String, default: 'Khách' },
    email: { type: String, default: null },
    role: { type: String, default: 'GUEST' },
    actionType: { type: String, default: 'UNKNOWN' },
    actionText: { type: String, required: true },
    method: { type: String, required: true },
    url: { type: String, required: true },
    statusCode: { type: Number, required: true },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + RETENTION_MS),
        select: false
    },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ role: 1, actionType: 1, createdAt: -1 });
activityLogSchema.index(
    { expiresAt: 1 },
    { expireAfterSeconds: 0, name: 'activity_log_expiry' }
);
activityLogSchema.statics.RETENTION_DAYS = RETENTION_DAYS;

module.exports = mongoose.model('ActivityLog', activityLogSchema);
