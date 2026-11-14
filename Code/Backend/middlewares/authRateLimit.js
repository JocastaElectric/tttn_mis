const { rateLimit } = require('express-rate-limit');

const createLimiter = (limit, windowMs, message) => rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { success: false, message }
});

module.exports = {
    loginRateLimit: createLimiter(10, 15 * 60 * 1000, 'Quá nhiều lần đăng nhập. Vui lòng thử lại sau 15 phút.'),
    passwordResetRequestRateLimit: createLimiter(3, 15 * 60 * 1000, 'Bạn đã yêu cầu quá nhiều lần. Vui lòng thử lại sau 15 phút.'),
    passwordResetSubmitRateLimit: createLimiter(10, 15 * 60 * 1000, 'Quá nhiều lần thử đặt lại mật khẩu. Vui lòng thử lại sau 15 phút.')
};
