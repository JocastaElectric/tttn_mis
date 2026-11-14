const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const crypto = require('node:crypto');
process.env.JWT_SECRET = 'test-only-jwt-secret-for-api-authorization-suite';

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Topic = require('../models/Topic');
const { AvailabilitySlot, Meeting, Todo } = require('../models/Schedule');
const { getLecturerQuotaStatus } = require('../services/lecturerQuota');
const { getTopicMilestoneProgress, getMilestoneProgressSeries } = require('../services/milestoneProgress');
const { getAvailablePoolTopicSlot } = require('../services/poolTopicCapacity');
const { createCorsMiddleware } = require('../config/cors');
const authMiddleware = require('../middlewares/authMiddleware');
const authRoutes = require('../routes/authRoutes');
const scheduleRoutes = require('../routes/scheduleRoutes');
const topicRoutes = require('../routes/topicRoutes');
const getJwtSecret = require('../utils/jwtSecret');
const { assertCollectionsEmpty } = require('../seed');
const passwordResetEmail = require('../services/passwordResetEmail');

const secretKey = process.env.JWT_SECRET;
const app = express();
app.use(express.json());
app.use(createCorsMiddleware(['https://frontend.example']));
app.use('/api/auth', authRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/topics', topicRoutes);
app.get('/test/session', authMiddleware, (req, res) => res.json({ role: req.user.role }));
app.post('/test/session', authMiddleware, (req, res) => res.json({ role: req.user.role }));
app.get('/test/identity', authMiddleware, (req, res) => res.json({
    role: req.user.role,
    user_code: req.user.user_code
}));

let server;
let baseUrl;

test('JWT secret configuration rejects missing or placeholder values', () => {
    const originalSecret = process.env.JWT_SECRET;
    try {
        delete process.env.JWT_SECRET;
        assert.throws(getJwtSecret, /JWT_SECRET/);
        process.env.JWT_SECRET = 'secret_key_tttn_2026';
        assert.throws(getJwtSecret, /JWT_SECRET/);
        process.env.JWT_SECRET = 'replace-with-a-long-random-secret';
        assert.throws(getJwtSecret, /JWT_SECRET/);
        process.env.JWT_SECRET = 'a'.repeat(32);
        assert.equal(getJwtSecret(), process.env.JWT_SECRET);
    } finally {
        process.env.JWT_SECRET = originalSecret;
    }
});

test('seed safety check rejects any populated collection and accepts empty collections', async () => {
    const emptyCollection = { countDocuments: async () => 0 };
    const populatedCollection = { countDocuments: async () => 3 };

    await assert.doesNotReject(() => assertCollectionsEmpty([
        { name: 'users', model: emptyCollection },
        { name: 'topics', model: emptyCollection }
    ]));
    await assert.rejects(
        () => assertCollectionsEmpty([
            { name: 'users', model: emptyCollection },
            { name: 'topics', model: populatedCollection }
        ]),
        /topics/
    );
});

test('forgot password sends a one-time email link without revealing whether an account exists', async t => {
    const configKeys = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'FRONTEND_RESET_URL'];
    const originalConfig = new Map(configKeys.map(key => [key, process.env[key]]));
    Object.assign(process.env, {
        SMTP_HOST: 'smtp.example.test',
        SMTP_PORT: '587',
        SMTP_SECURE: 'false',
        SMTP_USER: 'sender@example.test',
        SMTP_PASS: 'test-only-password',
        SMTP_FROM: 'TTTN <sender@example.test>',
        FRONTEND_RESET_URL: 'https://frontend.example/reset-password.html'
    });

    const user = {
        user_code: 'SV01',
        email: 'sv01@example.test',
        async save() {}
    };
    let account = user;
    const sentMessages = [];
    t.mock.method(User, 'findOne', async () => account);
    t.mock.method(passwordResetEmail, 'sendPasswordResetEmail', async message => sentMessages.push(message));

    try {
        const validResponse = await request('/api/auth/forgot-password', {
            method: 'POST',
            body: { user_code: 'SV01', email: 'sv01@example.test' }
        });
        const validResult = await validResponse.json();
        assert.equal(validResponse.status, 202);
        assert.equal(sentMessages.length, 1);
        assert.equal(sentMessages[0].to, user.email);
        assert.match(sentMessages[0].token, /^[a-f0-9]{64}$/);
        assert.equal(user.passwordResetTokenHash, crypto.createHash('sha256').update(sentMessages[0].token).digest('hex'));
        assert.ok(user.passwordResetExpiresAt > new Date());
        assert.equal(JSON.stringify(validResult).includes(sentMessages[0].token), false);

        account = null;
        const unknownResponse = await request('/api/auth/forgot-password', {
            method: 'POST',
            body: { user_code: 'UNKNOWN', email: 'nobody@example.test' }
        });
        assert.equal(unknownResponse.status, 202);
        assert.deepEqual(await unknownResponse.json(), validResult);
        assert.equal(sentMessages.length, 1);
    } finally {
        for (const key of configKeys) {
            if (originalConfig.get(key) === undefined) delete process.env[key];
            else process.env[key] = originalConfig.get(key);
        }
    }
});

test('reset password accepts a valid one-time token and consumes it', async t => {
    const rawToken = 'a'.repeat(64);
    const user = {
        password: 'old-hash',
        must_change_password: true,
        passwordResetTokenHash: crypto.createHash('sha256').update(rawToken).digest('hex'),
        passwordResetExpiresAt: new Date(Date.now() + 60_000),
        async save() {}
    };
    t.mock.method(User, 'findOne', async query => {
        assert.equal(query.passwordResetTokenHash, user.passwordResetTokenHash);
        assert.ok(query.passwordResetExpiresAt.$gt <= new Date());
        return user;
    });

    const response = await request('/api/auth/reset-password', {
        method: 'POST',
        body: { token: rawToken, new_password: 'StrongPass1!' }
    });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.success, true);
    assert.equal(user.must_change_password, false);
    assert.equal(user.passwordResetTokenHash, undefined);
    assert.equal(user.passwordResetExpiresAt, undefined);
    assert.equal(await bcrypt.compare('StrongPass1!', user.password), true);
});

test('accounts using the shared initial password are required to change it at first login', async t => {
    const user = {
        _id: 'user-id',
        user_code: 'SV01',
        full_name: 'Student',
        role: 'STUDENT',
        password: 'hashed-password',
        must_change_password: false,
        async save() {}
    };
    t.mock.method(User, 'findOne', async () => user);
    t.mock.method(bcrypt, 'compare', async (_password, _hash) => true);

    const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
            Origin: 'https://frontend.example',
            'Content-Type': 'application/json',
            'X-Auth-Session': 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
        },
        body: JSON.stringify({ user_code: 'SV01', password: '123456' })
    });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.user.must_change_password, true);

    const cookie = response.headers.getSetCookie().find(value => value.startsWith('tttn_session_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb='));
    assert.ok(cookie);
    const token = decodeURIComponent(cookie.split(';')[0].split('=').slice(1).join('='));
    assert.equal(jwt.verify(token, secretKey).must_change_password, true);
    assert.equal(user.must_change_password, true);
});

test('change password rejects the current password and leaves forced change enabled', async t => {
    let saveCalled = false;
    const user = {
        password: 'current-hash',
        must_change_password: true,
        async save() {
            saveCalled = true;
        }
    };
    t.mock.method(User, 'findOne', async () => user);
    t.mock.method(bcrypt, 'compare', async candidate => candidate === 'ValidPassword1!');

    const response = await request('/api/auth/change-password', {
        method: 'PUT',
        role: 'STUDENT',
        userCode: 'SV01',
        body: {
            currentPassword: 'ValidPassword1!',
            newPassword: 'ValidPassword1!'
        }
    });
    const result = await response.json();

    assert.equal(response.status, 400);
    assert.match(result.message, /không được trùng/);
    assert.equal(saveCalled, false);
    assert.equal(user.must_change_password, true);
});

test('change password returns a success message after saving a different password', async t => {
    let saveCalled = false;
    const user = {
        password: 'current-hash',
        must_change_password: true,
        async save() {
            saveCalled = true;
        }
    };
    t.mock.method(User, 'findOne', async () => user);
    t.mock.method(bcrypt, 'compare', async candidate => candidate === 'ValidPassword1!');
    t.mock.method(bcrypt, 'hash', async () => 'new-password-hash');

    const response = await request('/api/auth/change-password', {
        method: 'PUT',
        role: 'STUDENT',
        userCode: 'SV01',
        body: {
            currentPassword: 'ValidPassword1!',
            newPassword: 'DifferentPassword2@'
        }
    });
    const result = await response.json();

    assert.equal(response.status, 200);
    assert.equal(result.message, 'Đổi mật khẩu thành công!');
    assert.equal(saveCalled, true);
    assert.equal(user.password, 'new-password-hash');
    assert.equal(user.must_change_password, false);
});

test('authentication middleware blocks forced-password accounts from other protected APIs', async () => {
    const token = jwt.sign({
        role: 'STUDENT',
        user_code: 'SV01',
        must_change_password: true
    }, secretKey, { expiresIn: '1m' });

    const response = await fetch(`${baseUrl}/test/identity`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, 'PASSWORD_CHANGE_REQUIRED');
});

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

test('lecturer quota counts only active assigned groups and blocks at the limit', async t => {
    t.mock.method(User, 'findOne', () => ({
        select: () => ({ lean: async () => ({ user_code: 'GV01', max_quota: 2 }) })
    }));
    t.mock.method(Topic, 'countDocuments', async filter => {
        assert.deepEqual(filter.status.$in, ['PENDING', 'NEED_REVISION', 'APPROVED']);
        assert.equal(filter.leader_code.$exists, true);
        assert.deepEqual(filter.leader_code.$nin, [null, '']);
        return 2;
    });

    const status = await getLecturerQuotaStatus('GV01');
    assert.deepEqual(status, { found: true, assigned: 2, quota: 2, available: false });
});

test('per-topic capacity allocates free slots, blocks new groups at the limit, and allows the same group to resubmit', () => {
    const activeGroups = [
        { _id: 'topic-1', leader_code: 'SV01', active_pool_topic_slot: 1 },
        { _id: 'topic-2', leader_code: 'SV02', active_pool_topic_slot: 2 },
        { _id: 'topic-3', leader_code: 'SV03', active_pool_topic_slot: 3 }
    ];

    assert.equal(getAvailablePoolTopicSlot(activeGroups.slice(0, 2), 3, 'SV04'), 3);
    assert.equal(getAvailablePoolTopicSlot(activeGroups, 3, 'SV04'), null);
    assert.equal(getAvailablePoolTopicSlot(activeGroups, 3, 'SV02'), 2);
    assert.equal(getAvailablePoolTopicSlot(activeGroups.slice(0, 1), 1, 'SV04'), null);
    assert.equal(getAvailablePoolTopicSlot(activeGroups.slice(0, 1), 1, 'SV01'), 1);
});

test('milestone progress detects late submissions and overdue missing submissions', () => {
    const topics = [{ _id: 'topic-1', lecturer_code: 'GV01' }];
    const milestones = [
        { step: 1, lecturerCode: 'GV01', startDate: '2025-03-01', endDate: '2025-03-08' },
        { step: 2, lecturerCode: 'GV01', startDate: '2025-03-01', endDate: '2025-03-09' },
        { step: 3, lecturerCode: 'GV01', startDate: '2025-03-15', endDate: '2025-03-20' },
        { step: 4, lecturerCode: 'GV01', startDate: '2025-03-01', endDate: '2025-03-09' }
    ];
    const submissions = [
        { topic_id: 'topic-1', milestone: 1, submitted_at: '2025-03-08T00:00:00Z' },
        { topic_id: 'topic-1', milestone: 2, submitted_at: '2025-03-09T00:00:01Z' },
        { topic_id: 'topic-1', milestone: 3, is_draft: true, submitted_at: '2025-03-09T00:00:00Z' }
    ];
    const progress = getTopicMilestoneProgress(topics, milestones, submissions, new Date('2025-03-10T00:00:00Z'));
    const topicProgress = progress.get('topic-1');

    assert.equal(topicProgress.milestones[0].status, 'completed');
    assert.equal(topicProgress.milestones[1].status, 'late');
    assert.equal(topicProgress.milestones[2].status, 'upcoming');
    assert.equal(topicProgress.milestones[3].status, 'late');
    assert.equal(topicProgress.is_late, true);
    assert.equal(topicProgress.completed_milestones, 2);
});

test('legacy file uploads without timestamps are not classified as on-time or late', () => {
    const topics = [{
        _id: 'topic-2',
        lecturer_code: 'GV01',
        milestone1_file: { name: 'report.pdf' }
    }];
    const milestones = [
        { step: 1, lecturerCode: 'GV01', startDate: '2025-03-01', endDate: '2025-03-08' }
    ];
    const progress = getTopicMilestoneProgress(topics, milestones, [], new Date('2025-03-10T00:00:00Z'));
    const topicProgress = progress.get('topic-2');
    const chart = getMilestoneProgressSeries(topics, progress, [1]);

    assert.equal(topicProgress.milestones[0].status, 'submitted_unknown');
    assert.equal(topicProgress.is_late, false);
    assert.equal(chart.series.find(series => series.name === 'Thiếu thời gian nộp').data[0], 1);
});

test('milestone progress with no configured milestones is not marked late', () => {
    const progress = getTopicMilestoneProgress(
        [{ _id: 'topic-3', lecturer_code: 'GV01' }],
        [],
        [],
        new Date('2025-03-10T00:00:00Z')
    );

    assert.equal(progress.get('topic-3').progress_status, 'Chưa cấu hình mốc');
    assert.equal(progress.get('topic-3').is_late, false);
});

test('account listing requires authentication and admin privileges', async () => {
    const unauthenticated = await request('/api/auth/students');
    assert.equal(unauthenticated.status, 401);

    const student = await request('/api/auth/students', { role: 'STUDENT', userCode: 'SV01' });
    assert.equal(student.status, 403);
});

test('student lecturer list includes current group counts and lecturer quotas', async t => {
    const lecturers = [{
        user_code: 'GV01',
        full_name: 'Giảng viên 1',
        max_quota: 1
    }];
    t.mock.method(User, 'find', () => ({
        select: () => ({ sort: async () => lecturers })
    }));
    t.mock.method(Topic, 'aggregate', async () => [
        { _id: 'GV01', groupsCount: 1 }
    ]);

    const response = await request('/api/auth/lecturers', {
        role: 'STUDENT',
        userCode: 'SV01'
    });
    const result = await response.json();

    assert.equal(response.status, 200);
    assert.equal(result.data[0].groupsCount, 1);
    assert.equal(result.data[0].max_quota, 1);
});

test('bulk lecturer quota updates require admin privileges', async () => {
    const body = { user_codes: ['GV01'], max_quota: 5 };
    const unauthenticated = await request('/api/auth/lecturers/bulk-quota', {
        method: 'PUT',
        body
    });
    assert.equal(unauthenticated.status, 401);

    const studentResponse = await request('/api/auth/lecturers/bulk-quota', {
        method: 'PUT',
        role: 'STUDENT',
        userCode: 'SV01',
        body
    });
    assert.equal(studentResponse.status, 403);
});

test('bulk lecturer quota updates apply to all selected lecturers', async t => {
    const lecturers = [
        { _id: 'lecturer-1', user_code: 'GV01', full_name: 'Giảng viên 1' },
        { _id: 'lecturer-2', user_code: 'GV02', full_name: 'Giảng viên 2' }
    ];
    t.mock.method(User, 'find', () => ({ select: async () => lecturers }));
    t.mock.method(Topic, 'aggregate', async () => [
        { _id: 'GV01', groupsCount: 2 },
        { _id: 'GV02', groupsCount: 1 }
    ]);
    t.mock.method(User, 'updateMany', async (filter, update) => {
        assert.deepEqual(filter, { _id: { $in: ['lecturer-1', 'lecturer-2'] }, role: 'LECTURER' });
        assert.deepEqual(update, { $set: { max_quota: 3 } });
        return { modifiedCount: 2 };
    });

    const response = await request('/api/auth/lecturers/bulk-quota', {
        method: 'PUT',
        role: 'ADMIN',
        userCode: 'AD01',
        body: { user_codes: ['GV01', 'GV02'], max_quota: 3 }
    });
    const result = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(result.data.user_codes, ['GV01', 'GV02']);
    assert.equal(result.data.max_quota, 3);
});

test('bulk lecturer quota updates reject the whole batch when a selected lecturer has too many groups', async t => {
    const lecturers = [
        { _id: 'lecturer-1', user_code: 'GV01', full_name: 'Giảng viên 1' },
        { _id: 'lecturer-2', user_code: 'GV02', full_name: 'Giảng viên 2' }
    ];
    let updateAttempted = false;
    t.mock.method(User, 'find', () => ({ select: async () => lecturers }));
    t.mock.method(Topic, 'aggregate', async () => [
        { _id: 'GV01', groupsCount: 2 },
        { _id: 'GV02', groupsCount: 4 }
    ]);
    t.mock.method(User, 'updateMany', async () => {
        updateAttempted = true;
    });

    const response = await request('/api/auth/lecturers/bulk-quota', {
        method: 'PUT',
        role: 'ADMIN',
        userCode: 'AD01',
        body: { user_codes: ['GV01', 'GV02'], max_quota: 3 }
    });
    const result = await response.json();

    assert.equal(response.status, 409);
    assert.match(result.message, /GV02: 4 nhóm/);
    assert.equal(updateAttempted, false);
});

test('admin topic endpoints reject non-admin callers', async () => {
    const student = await request('/api/topics/admin/all', { role: 'STUDENT', userCode: 'SV01' });
    assert.equal(student.status, 403);
});

test('lecturer topic reads are restricted to the signed-in lecturer', async () => {
    const lecturer = await request('/api/topics/lecturer/GV02', { role: 'LECTURER', userCode: 'GV01' });
    assert.equal(lecturer.status, 403);
});

test('direct pool registration rejects students who already have an active topic', async t => {
    t.mock.method(User, 'find', () => ({
        select: async () => [{ user_code: 'SV01' }]
    }));
    t.mock.method(Topic, 'findOne', () => ({
        select: () => ({ lean: async () => ({ _id: 'existing-topic', leader_code: 'SV01' }) })
    }));

    const response = await request('/api/topics/register-pool', {
        method: 'POST',
        role: 'STUDENT',
        userCode: 'SV01',
        body: { leader_code: 'SV01', pool_topic_id: 'invalid-before-the-group-check' }
    });
    const result = await response.json();

    assert.equal(response.status, 409);
    assert.match(result.message, /đã có đề tài đang hoạt động/);
});

test('session endpoint returns the authenticated user profile', async t => {
    const user = {
        _id: 'user-id',
        user_code: 'AD01',
        full_name: 'Admin',
        role: 'ADMIN',
        must_change_password: false
    };
    t.mock.method(User, 'findById', () => ({ select: async () => user }));
    const token = jwt.sign({
        id: user._id,
        user_code: user.user_code,
        role: user.role
    }, secretKey, { expiresIn: '1m' });

    const response = await fetch(`${baseUrl}/api/auth/session`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
        success: true,
        user: {
            id: user._id,
            user_code: user.user_code,
            full_name: user.full_name,
            role: user.role,
            must_change_password: false
        }
    });
});

test('student schedule is scoped to the signed-in student while group members share it', async t => {
    const topic = {
        _id: 'topic-1',
        status: 'APPROVED',
        title: 'Đề tài nhóm',
        leader_code: 'SV01',
        member2_code: 'SV02',
        member3_code: null,
        lecturer_code: 'GV01'
    };
    const meetings = [{ _id: 'meeting-1' }];
    const todos = [{ _id: 'todo-1', title: 'Công việc chung' }];
    let topicFilter;

    t.mock.method(Topic, 'findOne', filter => {
        topicFilter = filter;
        return { sort: async () => topic };
    });
    t.mock.method(Meeting, 'find', () => ({ sort: async () => meetings }));
    t.mock.method(Todo, 'find', () => ({ sort: async () => todos }));
    t.mock.method(require('../models/Semester'), 'findOne', async () => null);

    const otherStudentRequest = await request('/api/schedule/my-schedule/SV02', {
        role: 'STUDENT',
        userCode: 'SV01'
    });
    assert.equal(otherStudentRequest.status, 403);

    const groupMemberRequest = await request('/api/schedule/my-schedule/SV02', {
        role: 'STUDENT',
        userCode: 'SV02'
    });
    assert.equal(groupMemberRequest.status, 200);
    assert.ok(topicFilter.$or.some(condition => Object.values(condition)[0].test('SV02')));
    const body = await groupMemberRequest.json();
    assert.deepEqual(body.meetings, meetings);
    assert.deepEqual(body.todos, todos);
});

test('group members can add and toggle shared todos; supplied identity is ignored', async t => {
    const topic = {
        _id: 'topic-1',
        status: 'APPROVED',
        title: 'Đề tài nhóm',
        leader_code: 'SV01',
        member2_code: 'SV02',
        member3_code: null
    };
    let createdTodo;
    t.mock.method(Topic, 'findOne', async () => topic);
    t.mock.method(Todo.prototype, 'save', async function () {
        createdTodo = this;
        return this;
    });
    t.mock.method(Todo, 'findById', async () => ({
        topic_id: 'topic-1',
        student_code: 'SV01',
        is_completed: false,
        save: async function () { return this; }
    }));

    const addResponse = await request('/api/schedule/todos/add', {
        method: 'POST',
        role: 'STUDENT',
        userCode: 'SV01',
        body: {
            student_code: 'SV99',
            topic_id: 'topic-1',
            assigned_to: 'SV02',
            title: 'Hoàn thiện báo cáo'
        }
    });
    assert.equal(addResponse.status, 201);
    assert.equal(createdTodo.student_code, 'SV01');
    assert.equal(createdTodo.created_by, 'SV01');
    assert.equal(createdTodo.assigned_to, 'SV02');

    const toggleResponse = await request('/api/schedule/todos/toggle/todo-1', {
        method: 'PATCH',
        role: 'STUDENT',
        userCode: 'SV02'
    });
    assert.equal(toggleResponse.status, 200);
    assert.equal((await toggleResponse.json()).is_completed, true);
});

test('students outside the group cannot add or toggle its todos', async t => {
    t.mock.method(Topic, 'findOne', async () => null);
    t.mock.method(Todo, 'findById', async () => ({
        topic_id: 'topic-1',
        student_code: 'SV01',
        is_completed: false,
        save: async function () { return this; }
    }));

    const addResponse = await request('/api/schedule/todos/add', {
        method: 'POST',
        role: 'STUDENT',
        userCode: 'SV99',
        body: { student_code: 'SV01', topic_id: 'topic-1', title: 'Việc riêng' }
    });
    assert.equal(addResponse.status, 403);

    const toggleResponse = await request('/api/schedule/todos/toggle/todo-1', {
        method: 'PATCH',
        role: 'STUDENT',
        userCode: 'SV99'
    });
    assert.equal(toggleResponse.status, 403);
});

test('lecturer schedule reads are limited to the signed-in lecturer', async t => {
    let findCalled = false;
    t.mock.method(Meeting, 'find', () => {
        findCalled = true;
        return {
            populate() { return this; },
            sort: async () => []
        };
    });

    const otherLecturer = await request('/api/schedule/lecturer/meetings/GV02', {
        role: 'LECTURER',
        userCode: 'GV01'
    });
    assert.equal(otherLecturer.status, 403);
    assert.equal(findCalled, false);

    const ownSchedule = await request('/api/schedule/lecturer/meetings/GV01', {
        role: 'LECTURER',
        userCode: 'GV01'
    });
    assert.equal(ownSchedule.status, 200);
    assert.equal(findCalled, true);
});

test('lecturers can view their own availability and students can view their supervisor slots', async t => {
    const slots = [{ _id: 'slot-1', lecturer_code: 'GV01' }];
    let topicFilter;
    t.mock.method(Topic, 'findOne', filter => {
        topicFilter = filter;
        return { select: async () => ({ _id: 'topic-1' }) };
    });
    t.mock.method(AvailabilitySlot, 'find', () => ({
        sort() { return this; },
        lean: async () => slots
    }));

    const lecturerResponse = await request('/api/schedule/availability/GV01', {
        role: 'LECTURER',
        userCode: 'GV01'
    });
    assert.equal(lecturerResponse.status, 200);
    assert.deepEqual((await lecturerResponse.json()).data, slots);

    const otherLecturerResponse = await request('/api/schedule/availability/GV02', {
        role: 'LECTURER',
        userCode: 'GV01'
    });
    assert.equal(otherLecturerResponse.status, 403);

    const studentResponse = await request('/api/schedule/availability/GV01', {
        role: 'STUDENT',
        userCode: 'SV02'
    });
    assert.equal(studentResponse.status, 200);
    assert.ok(topicFilter.$or.some(condition => Object.values(condition)[0].test('SV02')));
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
            'Access-Control-Request-Headers': 'content-type,x-auth-role,x-auth-session,x-csrf-protection'
        }
    });
    assert.equal(allowedPreflight.status, 204);
    assert.equal(allowedPreflight.headers.get('access-control-allow-origin'), 'https://frontend.example');
    assert.equal(allowedPreflight.headers.get('access-control-allow-credentials'), 'true');
    assert.match(allowedPreflight.headers.get('access-control-allow-headers'), /x-auth-role/i);
    assert.match(allowedPreflight.headers.get('access-control-allow-headers'), /x-auth-session/i);
    assert.match(allowedPreflight.headers.get('access-control-allow-headers'), /x-csrf-protection/i);

    const denied = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'OPTIONS',
        headers: { Origin: 'https://untrusted.example' }
    });
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get('access-control-allow-origin'), null);
});

test('HttpOnly session cookies authenticate API requests and protect mutations from CSRF', async () => {
    const cookieToken = tokenFor('ADMIN', 'AD01');
    const readResponse = await fetch(`${baseUrl}/test/session`, {
        headers: { Cookie: `tttn_session=${cookieToken}` }
    });
    assert.equal(readResponse.status, 200);
    assert.deepEqual(await readResponse.json(), { role: 'ADMIN' });

    const blockedMutation = await fetch(`${baseUrl}/test/session`, {
        method: 'POST',
        headers: { Cookie: `tttn_session=${cookieToken}` }
    });
    assert.equal(blockedMutation.status, 403);

    const allowedMutation = await fetch(`${baseUrl}/test/session`, {
        method: 'POST',
        headers: {
            Cookie: `tttn_session=${cookieToken}`,
            'X-CSRF-Protection': '1'
        }
    });
    assert.equal(allowedMutation.status, 200);

    const expiredToken = jwt.sign({
        role: 'ADMIN',
        user_code: 'AD01',
        exp: Math.floor(Date.now() / 1000) - 1
    }, secretKey);
    const expiredResponse = await fetch(`${baseUrl}/test/session`, {
        headers: { Cookie: `tttn_session=${expiredToken}` }
    });
    assert.equal(expiredResponse.status, 401);
});

test('role-specific HttpOnly cookies keep sessions isolated while allowing them in one browser', async () => {
    const adminToken = tokenFor('ADMIN', 'AD01');
    const studentToken = tokenFor('STUDENT', 'SV01');
    const cookies = `tttn_session_admin=${adminToken}; tttn_session_student=${studentToken}`;

    const adminResponse = await fetch(`${baseUrl}/test/session`, {
        headers: { Cookie: cookies, 'X-Auth-Role': 'ADMIN' }
    });
    assert.equal(adminResponse.status, 200);
    assert.deepEqual(await adminResponse.json(), { role: 'ADMIN' });

    const studentResponse = await fetch(`${baseUrl}/test/session`, {
        headers: { Cookie: cookies, 'X-Auth-Role': 'STUDENT' }
    });
    assert.equal(studentResponse.status, 200);
    assert.deepEqual(await studentResponse.json(), { role: 'STUDENT' });

    const unselectedResponse = await fetch(`${baseUrl}/test/session`, {
        headers: { Cookie: cookies }
    });
    assert.equal(unselectedResponse.status, 401);

    const wrongRoleResponse = await fetch(`${baseUrl}/test/session`, {
        headers: { Cookie: cookies, 'X-Auth-Role': 'LECTURER' }
    });
    assert.equal(wrongRoleResponse.status, 401);

    const mismatchedCookieResponse = await fetch(`${baseUrl}/test/session`, {
        headers: {
            Cookie: `tttn_session_student=${adminToken}`,
            'X-Auth-Role': 'STUDENT'
        }
    });
    assert.equal(mismatchedCookieResponse.status, 403);

    const blockedMutation = await fetch(`${baseUrl}/test/session`, {
        method: 'POST',
        headers: { Cookie: cookies, 'X-Auth-Role': 'ADMIN' }
    });
    assert.equal(blockedMutation.status, 403);

    const allowedMutation = await fetch(`${baseUrl}/test/session`, {
        method: 'POST',
        headers: {
            Cookie: cookies,
            'X-Auth-Role': 'STUDENT',
            'X-CSRF-Protection': '1'
        }
    });
    assert.equal(allowedMutation.status, 200);
});

test('tab-specific cookies keep two accounts with the same role isolated', async () => {
    const sv01Session = '11111111111111111111111111111111';
    const sv02Session = '22222222222222222222222222222222';
    const cookies = [
        `tttn_session_${sv01Session}=${tokenFor('STUDENT', 'SV01')}`,
        `tttn_session_${sv02Session}=${tokenFor('STUDENT', 'SV02')}`
    ].join('; ');

    for (const [sessionId, userCode] of [[sv01Session, 'SV01'], [sv02Session, 'SV02']]) {
        const response = await fetch(`${baseUrl}/test/identity`, {
            headers: {
                Cookie: cookies,
                'X-Auth-Role': 'STUDENT',
                'X-Auth-Session': sessionId
            }
        });
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { role: 'STUDENT', user_code: userCode });
    }

    const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
        method: 'POST',
        headers: {
            'X-CSRF-Protection': '1',
            'X-Auth-Role': 'STUDENT',
            'X-Auth-Session': sv01Session
        }
    });
    assert.equal(logoutResponse.status, 200);
    const clearedCookies = logoutResponse.headers.getSetCookie().join(';');
    assert.match(clearedCookies, new RegExp(`tttn_session_${sv01Session}=;`));
    assert.doesNotMatch(clearedCookies, new RegExp(`tttn_session_${sv02Session}=;`));
});

test('logout clears the HttpOnly session cookie and requires the CSRF header', async () => {
    const blocked = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST' });
    assert.equal(blocked.status, 403);

    const response = await fetch(`${baseUrl}/api/auth/logout`, {
        method: 'POST',
        headers: { 'X-CSRF-Protection': '1' }
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('set-cookie'), /tttn_session=;/);
    assert.match(response.headers.get('set-cookie'), /HttpOnly/i);
    assert.match(response.headers.get('set-cookie'), /SameSite=Lax/i);
});

test('role-specific logout clears only the selected account session', async () => {
    const response = await fetch(`${baseUrl}/api/auth/logout`, {
        method: 'POST',
        headers: {
            'X-CSRF-Protection': '1',
            'X-Auth-Role': 'ADMIN'
        }
    });
    assert.equal(response.status, 200);
    const setCookies = response.headers.getSetCookie().join(';');
    assert.match(setCookies, /tttn_session_admin=;/);
    assert.doesNotMatch(setCookies, /tttn_session_student=;/);
});

test('login issues an HttpOnly cookie without returning the JWT to JavaScript', async t => {
    const sessionId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    t.mock.method(User, 'findOne', async () => ({
        _id: 'user-id',
        user_code: 'AD01',
        full_name: 'Admin',
        role: 'ADMIN',
        password: 'hashed-password'
    }));
    t.mock.method(bcrypt, 'compare', async () => true);

    const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
            Origin: 'https://frontend.example',
            'Content-Type': 'application/json',
            'X-Auth-Session': sessionId
        },
        body: JSON.stringify({ user_code: 'AD01', password: 'ValidPassword1!' })
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
    const setCookies = response.headers.getSetCookie();
    const adminCookie = setCookies.find(cookie => cookie.startsWith(`tttn_session_${sessionId}=`));
    assert.ok(adminCookie);
    assert.match(adminCookie, /HttpOnly/i);
    assert.match(adminCookie, /SameSite=Lax/i);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(body.user.role, 'ADMIN');
    assert.equal('token' in body, false);

    const sessionResponse = await fetch(`${baseUrl}/test/session`, {
        headers: {
            Cookie: adminCookie.split(';')[0],
            'X-Auth-Role': 'ADMIN',
            'X-Auth-Session': sessionId
        }
    });
    assert.equal(sessionResponse.status, 200);
    assert.deepEqual(await sessionResponse.json(), { role: 'ADMIN' });
});
