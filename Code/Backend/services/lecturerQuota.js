const User = require('../models/User');
const Topic = require('../models/Topic');

const ACTIVE_TOPIC_STATUSES = Object.freeze(['PENDING', 'NEED_REVISION', 'APPROVED']);

const codePattern = value => new RegExp(
    `^${String(value || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
    'i'
);

async function getLecturerGroupCount(lecturerCode) {
    return Topic.countDocuments({
        lecturer_code: codePattern(lecturerCode),
        status: { $in: ACTIVE_TOPIC_STATUSES },
        leader_code: { $exists: true, $nin: [null, ''] }
    });
}

async function getLecturerQuotaStatus(lecturerCode, excludeTopicId) {
    const lecturer = await User.findOne({
        user_code: codePattern(lecturerCode),
        role: 'LECTURER'
    }).select('user_code max_quota').lean();

    if (!lecturer) return { found: false, assigned: 0, quota: 0, available: false };

    const filter = {
        lecturer_code: codePattern(lecturerCode),
        status: { $in: ACTIVE_TOPIC_STATUSES },
        leader_code: { $exists: true, $nin: [null, ''] }
    };
    if (excludeTopicId) filter._id = { $ne: excludeTopicId };

    const assigned = await Topic.countDocuments(filter);
    const quotaValue = Number(lecturer.max_quota);
    const quota = Number.isInteger(quotaValue) && quotaValue >= 0 ? quotaValue : 5;

    return {
        found: true,
        assigned,
        quota,
        available: assigned < quota
    };
}

module.exports = {
    ACTIVE_TOPIC_STATUSES,
    getLecturerGroupCount,
    getLecturerQuotaStatus
};
