const jwt = require('jsonwebtoken');
const getJwtSecret = require('../utils/jwtSecret');
const {
    AUTH_COOKIE_ROLES,
    getRoleFromRequest,
    getTabSessionIdFromRequest,
    hasInvalidTabSessionId,
    getTokenFromRequest,
    hasAuthCookie
} = require('../utils/authCookie');

const authMiddleware = (req, res, next) => {
    try {
        if (hasInvalidTabSessionId(req)) {
            return res.status(400).json({
                success: false,
                message: 'Mã phiên của tab không hợp lệ.'
            });
        }

        const requestedRole = getRoleFromRequest(req);
        const tabSessionId = getTabSessionIdFromRequest(req);
        if (requestedRole && !AUTH_COOKIE_ROLES.includes(requestedRole)) {
            return res.status(400).json({
                success: false,
                message: 'Vai trò của phiên đăng nhập không hợp lệ.'
            });
        }

        const token = getTokenFromRequest(req, requestedRole, tabSessionId);
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Bạn chưa đăng nhập hoặc phiên làm việc không hợp lệ.'
            });
        }

        if (hasAuthCookie(req, requestedRole, tabSessionId) &&
            !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
            req.get('X-CSRF-Protection') !== '1') {
            return res.status(403).json({
                success: false,
                message: 'Yêu cầu không hợp lệ.'
            });
        }

        // 3. Xác thực Token với chuỗi bí mật JWT_SECRET trong file .env
        const decoded = jwt.verify(token, getJwtSecret());

        // 4. Gán thông tin người dùng đã giải mã vào req.user để các Controller phía sau sử dụng
        // (Ví dụ: req.user.id, req.user.user_code, req.user.role...)
        req.user = decoded;
        if (requestedRole && String(decoded.role || '').toUpperCase() !== requestedRole) {
            return res.status(403).json({
                success: false,
                message: 'Phiên đăng nhập không khớp với vai trò của tab này.'
            });
        }
        const requestPath = req.originalUrl.split('?')[0];
        const allowedDuringPasswordChange = new Set([
            '/api/auth/session',
            '/api/auth/change-password'
        ]);
        if (decoded.must_change_password && !allowedDuringPasswordChange.has(requestPath)) {
            return res.status(403).json({
                success: false,
                code: 'PASSWORD_CHANGE_REQUIRED',
                message: 'Bạn cần đổi mật khẩu trước khi sử dụng hệ thống.'
            });
        }
        req.authRole = String(decoded.role || '').toUpperCase();
        req.authSessionId = tabSessionId;

        // Cho phép đi tiếp vào Controller
        next();
    } catch (error) {
        console.error('Lỗi xác thực Token:', error.message);
        return res.status(401).json({
            success: false,
            message: 'Phiên đăng nhập đã hết hạn hoặc Token không hợp lệ. Vui lòng đăng nhập lại!'
        });
    }
};

module.exports = authMiddleware;