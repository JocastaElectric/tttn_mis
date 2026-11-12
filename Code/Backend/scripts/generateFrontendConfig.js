const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const configuredApiUrl = process.env.FRONTEND_API_BASE_URL;
if (!configuredApiUrl) {
    throw new Error('FRONTEND_API_BASE_URL must be set before generating frontend configuration.');
}

const apiUrl = new URL(configuredApiUrl);
if (!['http:', 'https:'].includes(apiUrl.protocol) || apiUrl.pathname !== '/' || apiUrl.search || apiUrl.hash) {
    throw new Error('FRONTEND_API_BASE_URL must be an HTTP(S) origin without a path, query, or fragment.');
}

const outputPath = path.join(__dirname, '..', '..', 'Frontend', 'js', 'config.js');
const output = `window.APP_CONFIG = Object.freeze({ API_BASE_URL: ${JSON.stringify(apiUrl.origin)} });\n`;
fs.writeFileSync(outputPath, output, 'utf8');
console.log(`Frontend API configuration generated for ${apiUrl.origin}`);
