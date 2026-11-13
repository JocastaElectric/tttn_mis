const cors = require('cors');

const DEFAULT_ALLOWED_ORIGINS = [
    'http://localhost:5500',
    'http://127.0.0.1:5500'
];

function validateOrigin(origin) {
    let parsedOrigin;
    try {
        parsedOrigin = new URL(origin);
    } catch {
        throw new Error(`Invalid CORS origin: ${origin}`);
    }

    if (!['http:', 'https:'].includes(parsedOrigin.protocol) ||
        parsedOrigin.origin !== origin ||
        parsedOrigin.pathname !== '/' ||
        parsedOrigin.search ||
        parsedOrigin.hash) {
        throw new Error(`CORS entries must be HTTP(S) origins without paths: ${origin}`);
    }

    return origin;
}

function getAllowedOrigins(value = process.env.CORS_ORIGINS) {
    const origins = value
        ? value.split(',').map(origin => origin.trim()).filter(Boolean)
        : DEFAULT_ALLOWED_ORIGINS;
    return [...new Set(origins.map(validateOrigin))];
}

function createCorsMiddleware() {
    return cors({
        origin: true, // Cho phép tất cả origin (localhost, vercel, render...)
        credentials: true
    });
}

module.exports = { createCorsMiddleware, getAllowedOrigins };
