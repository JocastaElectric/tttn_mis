const nodemailer = require('nodemailer');

const getSettings = () => {
    const required = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'FRONTEND_RESET_URL'];
    const missing = required.filter(name => !String(process.env[name] || '').trim());
    if (missing.length) {
        throw new Error(`Thiếu cấu hình email: ${missing.join(', ')}.`);
    }

    const port = Number(process.env.SMTP_PORT || 587);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('SMTP_PORT không hợp lệ.');
    }

    let resetPageUrl;
    try {
        resetPageUrl = new URL(process.env.FRONTEND_RESET_URL);
    } catch (error) {
        throw new Error('FRONTEND_RESET_URL không hợp lệ.');
    }
    if (!['http:', 'https:'].includes(resetPageUrl.protocol) ||
        (process.env.NODE_ENV === 'production' && resetPageUrl.protocol !== 'https:')) {
        throw new Error('FRONTEND_RESET_URL phải dùng HTTPS trong môi trường production.');
    }

    return {
        host: process.env.SMTP_HOST.trim(),
        port,
        secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
        auth: {
            user: process.env.SMTP_USER.trim(),
            pass: process.env.SMTP_PASS
        },
        from: process.env.SMTP_FROM.trim(),
        resetPageUrl
    };
};

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
})[character]);

const sendPasswordResetEmail = async ({ to, token }) => {
    const settings = getSettings();
    const resetUrl = new URL(settings.resetPageUrl);
    resetUrl.searchParams.set('token', token);

    const transporter = nodemailer.createTransport({
        host: settings.host,
        port: settings.port,
        secure: settings.secure,
        auth: settings.auth
    });

    try {
        await transporter.sendMail({
            from: settings.from,
            to,
            subject: 'Đặt lại mật khẩu tài khoản TTTN',
            text: `Mở liên kết sau để đặt lại mật khẩu. Liên kết chỉ dùng một lần và hết hạn sau 15 phút:\n${resetUrl.toString()}`,
            html: `<p>Bạn vừa yêu cầu đặt lại mật khẩu.</p><p><a href="${escapeHtml(resetUrl.toString())}">Đặt lại mật khẩu</a></p><p>Liên kết chỉ dùng một lần và hết hạn sau 15 phút. Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>`
        });
    } finally {
        transporter.close();
    }
};

module.exports = { sendPasswordResetEmail, getSettings };
