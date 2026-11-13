const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const connectDB = require('./config/db.js');
const { createCorsMiddleware } = require('./config/cors');

// Import Routes
const authRoutes = require('./routes/authRoutes');
const topicRoutes = require('./routes/topicRoutes');
const submissionRoutes = require('./routes/submissionRoutes');
const scheduleRoutes = require('./routes/scheduleRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const activityLogRoutes = require('./routes/activityLogRoutes');
const ActivityLog = require('./models/ActivityLog');
const documentRoutes = require('./routes/documentRoutes');
const milestoneRoutes = require('./routes/milestoneRoutes');
const semesterRoutes = require('./routes/semesterRoutes');
const activityLogger = require('./middlewares/activityLogger');
const authMiddleware = require('./middlewares/authMiddleware');
const submissionController = require('./controllers/submissionController');
const groupController = require('./controllers/groupController');
const Milestone = require('./models/Milestone');
const Topic = require('./models/Topic');
const Semester = require('./models/Semester');
const Notification = require('./models/Notification');
const User = require('./models/User');
const bcrypt = require('bcryptjs');
const {
	startMilestoneReminderJob,
	startSemesterRegistrationNotifier
} = require('./services/notificationService');

dotenv.config();

const app = express();

app.use(createCorsMiddleware());
app.use(express.json());
app.use(activityLogger);

// Hàm tự động khởi tạo tài khoản mẫu nếu DB đang trống
const seedUsersIfEmpty = async () => {
	try {
		const count = await User.countDocuments();
		if (count === 0) {
			const salt = await bcrypt.genSalt(10);
			const hashedPassword = await bcrypt.hash('123456', salt);
			const users = [
				{ user_code: 'ADMIN01', password: hashedPassword, full_name: 'Quản Trị Viên', role: 'ADMIN', email: 'admin01@tttn.edu.vn' },
				{ user_code: 'GV01', password: hashedPassword, full_name: 'TS. Nguyễn Văn An', role: 'LECTURER', max_quota: 5, email: 'gv01@tttn.edu.vn' },
				{ user_code: 'GV02', password: hashedPassword, full_name: 'TS. Lê Thị Bình', role: 'LECTURER', max_quota: 5, email: 'gv02@tttn.edu.vn' },
				{ user_code: 'GV03', password: hashedPassword, full_name: 'TS. Trần Thị Ngọc', role: 'LECTURER', max_quota: 5, email: 'gv03@tttn.edu.vn' },
				{ user_code: 'SV01', password: hashedPassword, full_name: 'Trần Văn Bảo', role: 'STUDENT', email: 'sv01@tttn.edu.vn' },
				{ user_code: 'SV02', password: hashedPassword, full_name: 'Trần Văn Khải', role: 'STUDENT', email: 'sv02@tttn.edu.vn' },
				{ user_code: 'SV03', password: hashedPassword, full_name: 'Nguyễn Thị Chung', role: 'STUDENT', email: 'sv03@tttn.edu.vn' },
				{ user_code: 'SV04', password: hashedPassword, full_name: 'Võ Văn Phụng', role: 'STUDENT', email: 'sv04@tttn.edu.vn' },
				{ user_code: 'SV05', password: hashedPassword, full_name: 'Võ Văn Huy', role: 'STUDENT', email: 'sv05@tttn.edu.vn' },
				{ user_code: 'SV06', password: hashedPassword, full_name: 'Nguyễn Văn Hoàng', role: 'STUDENT', email: 'sv06@tttn.edu.vn' },
				{ user_code: 'SV07', password: hashedPassword, full_name: 'Nguyễn Minh Hoàng', role: 'STUDENT', email: 'sv07@tttn.edu.vn' },
				{ user_code: 'SV08', password: hashedPassword, full_name: 'Võ Văn Hoàng', role: 'STUDENT', email: 'sv08@tttn.edu.vn' },
			];
			await User.insertMany(users);
			console.log('👤 Tự động khởi tạo tài khoản mẫu thành công!');
		}
	} catch (err) {
		console.error('❌ Lỗi tự động seed tài khoản:', err.message);
	}
};

// Route kích hoạt seed qua trình duyệt nếu cần
app.get('/api/seed', async (req, res) => {
	try {
		await seedUsersIfEmpty();
		res.json({ success: true, message: 'Đã kiểm tra và khởi tạo tài khoản mẫu thành công!' });
	} catch (err) {
		res.status(500).json({ success: false, error: err.message });
	}
});
app.get('/uploads/:filename', authMiddleware, (req, res, next) => {
	if (['STUDENT', 'LECTURER'].includes(String(req.user?.role || '').toUpperCase())) return next();
	return res.status(403).json({ success: false, message: 'Bạn không có quyền tải tệp báo cáo.' });
}, submissionController.downloadTopicSubmissionFile);
app.use('/uploads/documents', express.static(path.join(__dirname, 'uploads', 'documents')));

// Routes API
app.use('/api/auth', authRoutes);
app.use('/api/topics', topicRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/notifications', notificationRoutes);

// Khai báo Dashboard Route hỗ trợ cả v1 lẫn route mặc định
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/v1/lecturer/dashboard', dashboardRoutes);
app.use('/api/activity-logs', activityLogRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/milestones', milestoneRoutes);
app.use('/api/semesters', semesterRoutes);

app.get('/api/groups/lecturer/:lecturerCode', groupController.getGroupsByLecturer);

const PORT = process.env.PORT || 5000;
connectDB()
	.then(() => Promise.all([
		Milestone.syncIndexes(),
		Topic.init(),
		Semester.init(),
		Notification.init(),
		ActivityLog.init()
	]))
	.then(() => seedUsersIfEmpty())
	.then(() => {
		startMilestoneReminderJob();
		startSemesterRegistrationNotifier();
		app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
	})
	.catch(error => {
		console.error(`❌ Không thể khởi động máy chủ: ${error.message}`);
		process.exit(1);
	});