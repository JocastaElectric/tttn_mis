const jwt = require('jsonwebtoken');
const getJwtSecret = require('../utils/jwtSecret');
const ActivityLog = require('../models/ActivityLog');
const {
    getRoleFromRequest,
    getTabSessionIdFromRequest,
    getTokenFromRequest
} = require('../utils/authCookie');

const ignoredPollingPaths = [
    /^\/api\/notifications\/(?:lecturer\/)?[^/]+$/,
    /^\/api\/topics\/lecturer\/[^/]+\/pending-review$/
];

const shouldIgnoreRequest = (req) => {
    if (!req.path.startsWith('/api/') || req.path.startsWith('/api/activity-logs')) {
        return true;
    }

    if (req.method !== 'GET') return false;

    const path = req.originalUrl.split('?')[0];
    return ignoredPollingPaths.some(pattern => pattern.test(path));
};

const getActionType = req => {
    const path = req.originalUrl.split('?')[0];
    if (['/api/auth/login', '/api/auth/forgot-password'].includes(path)) return 'AUTH';
    if (path === '/api/auth/change-password') return 'UPDATE';

    switch (req.method) {
        case 'POST': return 'CREATE';
        case 'PUT':
        case 'PATCH': return 'UPDATE';
        case 'DELETE': return 'DELETE';
        case 'GET': return 'READ';
        default: return 'OTHER';
    }
};

const parseUserFromToken = (req) => {
    const token = getTokenFromRequest(
        req,
        getRoleFromRequest(req),
        getTabSessionIdFromRequest(req)
    );
    if (!token) return null;
    try {
        return jwt.verify(token, getJwtSecret());
    } catch (error) {
        return null;
    }
};

const getActionText = (req) => {
    const path = req.originalUrl.split('?')[0];
    if (path === '/api/auth/login') {
        return 'Đăng nhập hệ thống';
    }
    if (path === '/api/auth/forgot-password') {
        return 'Yêu cầu đặt lại mật khẩu';
    }
    if (path === '/api/auth/students/export') return 'Xuất danh sách sinh viên';
    if (path === '/api/auth/lecturers/export') return 'Xuất danh sách giảng viên';
    if (path === '/api/auth/students' && req.method === 'GET') return 'Xem danh sách sinh viên';
    if (path === '/api/auth/lecturers' && req.method === 'GET') return 'Xem danh sách giảng viên';
    if (path === '/api/auth/students' && req.method === 'POST') return 'Thêm sinh viên';
    if (path === '/api/auth/lecturers' && req.method === 'POST') return 'Thêm giảng viên';
    if (/^\/api\/auth\/students\/[^/]+$/.test(path) && req.method === 'PUT') return 'Cập nhật sinh viên';
    if (/^\/api\/auth\/students\/[^/]+$/.test(path) && req.method === 'DELETE') return 'Xóa sinh viên';
    if (/^\/api\/auth\/lecturers\/[^/]+$/.test(path) && req.method === 'PUT') return 'Cập nhật giảng viên';
    if (/^\/api\/auth\/lecturers\/[^/]+$/.test(path) && req.method === 'DELETE') return 'Xóa giảng viên';
    if (path.startsWith('/api/topics/admin/assign-lecturer')) {
        return 'Phân công Giảng viên cho đề tài';
    }
    return `${req.method} ${path}`;
};

module.exports = (req, res, next) => {
    if (shouldIgnoreRequest(req)) {
        return next();
    }

    const decodedUser = parseUserFromToken(req);
    const userCode = decodedUser?.user_code || null;
    const userName = decodedUser?.full_name || decodedUser?.fullname || decodedUser?.name || userCode || 'Khách';
    const userEmail = decodedUser?.email || null;
    const userRole = decodedUser?.role ? String(decodedUser.role).toUpperCase() : 'GUEST';
    const url = req.originalUrl.split('?')[0];

    res.on('finish', async () => {
        try {
            const log = new ActivityLog({
                user_code: userCode,
                user_name: userName,
                email: userEmail,
                role: userRole,
                actionType: getActionType(req),
                actionText: getActionText(req),
                method: req.method,
                url,
                statusCode: res.statusCode,
                ip: req.ip || req.connection?.remoteAddress || null,
                userAgent: req.headers['user-agent'] || null,
                metadata: {}
            });
            await log.save();
        } catch (error) {
            console.error('Lỗi lưu nhật ký hoạt động:', error);
        }
    });

    next();
};
