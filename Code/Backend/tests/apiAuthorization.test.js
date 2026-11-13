const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const express = require('express');
const jwt = require('jsonwebtoken');
const { createCorsMiddleware } = require('../config/cors');
const authRoutes = require('../routes/authRoutes');
const topicRoutes = require('../routes/topicRoutes');

const secretKey = process.env.JWT_SECRET || 'secret_key_tttn_2026';
const app = express();
app.use(express.json());
app.use(createCorsMiddleware(['https://frontend.example']));
app.use('/api/auth', authRoutes);
app.use('/api/topics', topicRoutes);

let server;
let baseUrl;

before(async () => {
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    if (server) await new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
    });
});

function tokenFor(role, userCode) {
    return jwt.sign({ role, user_code: userCode }, secretKey, { expiresIn: '1m' });
}

async function request(path, { method = 'GET', role, userCode, body } = {}) {
    const headers = {};
    if (role && userCode) headers.Authorization = `Bearer ${tokenFor(role, userCode)}`;
    if (body) headers['Content-Type'] = 'application/json';

    return fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
    });
}

test('account listing requires authentication and admin privileges', async () => {
    const unauthenticated = await request('/api/auth/students');
    assert.equal(unauthenticated.status, 401);

    const student = await request('/api/auth/students', { role: 'STUDENT', userCode: 'SV01' });
    assert.equal(student.status, 403);
});

test('admin topic endpoints reject non-admin callers', async () => {
    const student = await request('/api/topics/admin/all', { role: 'STUDENT', userCode: 'SV01' });
    assert.equal(student.status, 403);
});

test('lecturer topic reads are restricted to the signed-in lecturer', async () => {
    const lecturer = await request('/api/topics/lecturer/GV02', { role: 'LECTURER', userCode: 'GV01' });
    assert.equal(lecturer.status, 403);
});

test('students cannot update another student profile or cancel another group', async () => {
    const profile = await request('/api/auth/students/SV02/profile', {
        method: 'PUT',
        role: 'STUDENT',
        userCode: 'SV01',
        body: { email: 'sv02@example.test' }
    });
    assert.equal(profile.status, 403);

    const cancellation = await request('/api/topics/cancel/SV02', {
        method: 'DELETE',
        role: 'STUDENT',
        userCode: 'SV01'
    });
    assert.equal(cancellation.status, 403);
});

test('CORS allows configured frontend origins and rejects other origins', async () => {
    const allowedPreflight = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'OPTIONS',
        headers: {
            Origin: 'https://frontend.example',
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'content-type'
        }
    });
    assert.equal(allowedPreflight.status, 204);
    assert.equal(allowedPreflight.headers.get('access-control-allow-origin'), 'https://frontend.example');

    const denied = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'OPTIONS',
        headers: { Origin: 'https://untrusted.example' }
    });
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get('access-control-allow-origin'), null);
});
