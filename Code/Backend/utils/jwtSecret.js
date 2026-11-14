const PLACEHOLDER_SECRETS = new Set([
    'secret_key_tttn_2026',
    'replace-with-a-long-random-secret'
]);

const getJwtSecret = () => {
    const secret = process.env.JWT_SECRET;
    const normalizedSecret = typeof secret === 'string' ? secret.trim().toLowerCase() : '';
    if (
        typeof secret !== 'string' ||
        secret !== secret.trim() ||
        secret.length < 32 ||
        PLACEHOLDER_SECRETS.has(normalizedSecret)
    ) {
        throw new Error('JWT_SECRET chưa hợp lệ. Hãy cấu hình chuỗi bí mật ngẫu nhiên dài ít nhất 32 ký tự trong file .env.');
    }

    return secret;
};

module.exports = getJwtSecret;
