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

function createCorsMiddleware(allowedOrigins = getAllowedOrigins()) {
    const validatedOrigins = [...new Set(allowedOrigins.map(validateOrigin))];
    const allowedOriginSet = new Set(validatedOrigins);
    const corsHandler = cors({ origin: validatedOrigins });

    return (req, res, next) => {
        const origin = req.get('Origin');
        if (origin && !allowedOriginSet.has(origin)) {
            return res.status(403).json({
                success: false,
                message: 'Origin not allowed by CORS policy.'
            });
        }

        return corsHandler(req, res, next);
    };
}

module.exports = { createCorsMiddleware, getAllowedOrigins };
