const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const semesterController = require('../controllers/semesterController');

const router = express.Router();

const requireRole = (...roles) => (req, res, next) => {
    const role = String(req.user?.role || '').toUpperCase();
    if (roles.includes(role)) return next();
    return res.status(403).json({ success: false, message: 'Bạn không có quyền thực hiện thao tác này.' });
};

router.get('/registration-status', authMiddleware, requireRole('STUDENT'), semesterController.getRegistrationStatus);
router.get('/', authMiddleware, requireRole('ADMIN'), semesterController.listSemesters);
router.post('/', authMiddleware, requireRole('ADMIN'), semesterController.createSemester);
router.patch('/:semesterId', authMiddleware, requireRole('ADMIN'), semesterController.updateSemester);
router.patch('/:semesterId/activate', authMiddleware, requireRole('ADMIN'), semesterController.activateSemester);
router.delete('/:semesterId', authMiddleware, requireRole('ADMIN'), semesterController.deleteSemester);

module.exports = router;
