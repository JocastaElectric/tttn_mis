const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const authMiddleware = require('../middlewares/authMiddleware');
const { uploadMilestone } = require('../controllers/topicController');
const submissionController = require('../controllers/submissionController');

const requireSubmissionRole = (...roles) => (req, res, next) => {
    if (roles.includes(String(req.user?.role || '').toUpperCase())) return next();
    return res.status(403).json({ success: false, message: 'Bạn không có quyền thực hiện thao tác này.' });
};

const requireStudentRole = (req, res, next) => {
    if (String(req.user?.role || '').toUpperCase() === 'STUDENT') return next();
    return res.status(403).json({ success: false, message: 'Chỉ sinh viên mới được nộp báo cáo.' });
};

// Tạo thư mục uploads nếu chưa có
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Cấu hình lưu file đĩa
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage, defParamCharset: 'utf8' });

router.get('/topic/:topic_id', authMiddleware, requireSubmissionRole('STUDENT', 'LECTURER'), submissionController.listTopicSubmissions);
router.get('/file/:filename', authMiddleware, requireSubmissionRole('STUDENT', 'LECTURER'), submissionController.downloadTopicSubmissionFile);
router.patch('/topic/:topic_id/:submissionId/review', authMiddleware, requireSubmissionRole('LECTURER'), submissionController.reviewSubmission);
router.post('/upload', authMiddleware, requireStudentRole, upload.single('file'), uploadMilestone);

module.exports = router;