const Semester = require('../models/Semester');
const Topic = require('../models/Topic');
const { notifyIfRegistrationIsOpen } = require('../services/notificationService');

function parseDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
        ? date
        : null;
}

function parseRegistrationDateTime(value) {
    if (typeof value !== 'string') return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return parseDate(value);

    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if (!match) return null;
    const [, yearText, monthText, dayText, hourText, minuteText] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const hour = Number(hourText);
    const minute = Number(minuteText);
    const calendarDate = parseDate(`${yearText}-${monthText}-${dayText}`);
    if (!calendarDate || hour > 23 || minute > 59) return null;

    return new Date(`${yearText}-${monthText}-${dayText}T${hourText}:${minuteText}:00+07:00`);
}

function validateSemester(body) {
    const name = String(body.name || '').trim();
    const startDate = parseDate(body.start_date);
    const registrationStart = parseRegistrationDateTime(body.registration_start_date);
    const registrationEnd = parseRegistrationDateTime(body.registration_end_date);
    const totalWeeks = Number(body.total_weeks);

    if (!name || !startDate || !registrationStart || !registrationEnd) {
        return { error: 'Vui lòng nhập tên học kỳ, ngày hợp lệ và giờ mở/đóng đăng ký.' };
    }
    if (/T/.test(body.registration_start_date) !== /T/.test(body.registration_end_date)) {
        return { error: 'Vui lòng nhập cả giờ mở và giờ đóng đăng ký.' };
    }
    if (registrationEnd < registrationStart) {
        return { error: 'Thời điểm đóng đăng ký phải bằng hoặc sau thời điểm mở đăng ký.' };
    }
    if (!Number.isInteger(totalWeeks) || totalWeeks < 1 || totalWeeks > 52) {
        return { error: 'Tổng số tuần phải từ 1 đến 52.' };
    }

    return {
        value: {
            name,
            start_date: startDate,
            registration_start_date: registrationStart,
            registration_end_date: registrationEnd,
            registration_window_has_time: /T/.test(body.registration_start_date) && /T/.test(body.registration_end_date),
            total_weeks: totalWeeks
        }
    };
}

function getRegistrationStatus(semester, now = new Date()) {
    if (!semester?.registration_start_date || !semester?.registration_end_date) {
        return { is_open: false, state: 'not_configured' };
    }

    const startDate = new Date(semester.registration_start_date);
    const endDate = new Date(semester.registration_end_date);
    const start = semester.registration_window_has_time
        ? startDate
        : new Date(`${startDate.toISOString().slice(0, 10)}T00:00:00+07:00`);
    const end = semester.registration_window_has_time
        ? endDate
        : new Date(`${endDate.toISOString().slice(0, 10)}T23:59:59.999+07:00`);

    if (now < start) return { is_open: false, state: 'upcoming' };
    if (now > end) return { is_open: false, state: 'closed' };
    return { is_open: true, state: 'open' };
}

exports.getRegistrationStatus = async (req, res) => {
    try {
        const semester = await Semester.findOne({ is_active: true }).lean();
        const studentCode = String(req.user?.user_code || '').trim();
        const escapedStudentCode = studentCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const registeredTopic = studentCode
            ? await Topic.exists({
                status: { $in: ['PENDING', 'APPROVED', 'NEED_REVISION'] },
                $or: [
                    { leader_code: new RegExp(`^${escapedStudentCode}$`, 'i') },
                    { member2_code: new RegExp(`^${escapedStudentCode}$`, 'i') },
                    { member3_code: new RegExp(`^${escapedStudentCode}$`, 'i') }
                ]
            })
            : null;
        return res.json({
            success: true,
            data: {
                semester: semester || null,
                eligible_for_registration_announcement: !registeredTopic,
                ...getRegistrationStatus(semester)
            }
        });
    } catch (error) {
        console.error('Lỗi lấy thời hạn đăng ký học kỳ:', error);
        return res.status(500).json({ success: false, message: 'Không thể tải thời hạn đăng ký.' });
    }
};

exports.listSemesters = async (req, res) => {
    try {
        const semesters = await Semester.find().sort({ start_date: -1 }).lean();
        return res.json({ success: true, data: semesters });
    } catch (error) {
        console.error('Lỗi lấy danh sách học kỳ:', error);
        return res.status(500).json({ success: false, message: 'Không thể tải danh sách học kỳ.' });
    }
};

exports.createSemester = async (req, res) => {
    try {
        const validation = validateSemester(req.body);
        if (validation.error) {
            return res.status(400).json({ success: false, message: validation.error });
        }

        const isActive = req.body.is_active === true;
        if (isActive) await Semester.updateMany({ is_active: true }, { $set: { is_active: false } });
        const semester = await Semester.create({ ...validation.value, is_active: isActive });
        await notifyIfRegistrationIsOpen(semester);
        return res.status(201).json({ success: true, data: semester });
    } catch (error) {
        console.error('Lỗi tạo học kỳ:', error);
        return res.status(500).json({ success: false, message: 'Không thể tạo học kỳ.' });
    }
};

exports.updateSemester = async (req, res) => {
    try {
        const validation = validateSemester(req.body);
        if (validation.error) {
            return res.status(400).json({ success: false, message: validation.error });
        }

        const existingSemester = await Semester.findById(req.params.semesterId);
        if (!existingSemester) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy học kỳ.' });
        }

        if (req.body.is_active === true) {
            await Semester.updateMany(
                { _id: { $ne: existingSemester._id }, is_active: true },
                { $set: { is_active: false } }
            );
        }
        existingSemester.set(validation.value);
        if (typeof req.body.is_active === 'boolean') existingSemester.is_active = req.body.is_active;
        const semester = await existingSemester.save();
        await notifyIfRegistrationIsOpen(semester);
        return res.json({ success: true, data: semester });
    } catch (error) {
        console.error('Lỗi cập nhật học kỳ:', error);
        return res.status(500).json({ success: false, message: 'Không thể cập nhật học kỳ.' });
    }
};

exports.activateSemester = async (req, res) => {
    try {
        const semester = await Semester.findById(req.params.semesterId);
        if (!semester) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy học kỳ.' });
        }
        if (!semester.registration_start_date || !semester.registration_end_date) {
            return res.status(400).json({
                success: false,
                message: 'Hãy cấu hình thời hạn đăng ký trước khi kích hoạt học kỳ.'
            });
        }

        await Semester.updateMany({ is_active: true }, { $set: { is_active: false } });
        semester.is_active = true;
        await semester.save();
        await notifyIfRegistrationIsOpen(semester);
        return res.json({ success: true, data: semester });
    } catch (error) {
        console.error('Lỗi kích hoạt học kỳ:', error);
        return res.status(500).json({ success: false, message: 'Không thể kích hoạt học kỳ.' });
    }
};

exports.deleteSemester = async (req, res) => {
    try {
        const semester = await Semester.findById(req.params.semesterId);
        if (!semester) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy học kỳ.' });
        }
        if (semester.is_active) {
            return res.status(400).json({
                success: false,
                message: 'Không thể xóa học kỳ đang hoạt động. Hãy kích hoạt học kỳ khác trước.'
            });
        }

        await semester.deleteOne();
        return res.json({ success: true, message: 'Đã xóa học kỳ.' });
    } catch (error) {
        console.error('Lỗi xóa học kỳ:', error);
        return res.status(500).json({ success: false, message: 'Không thể xóa học kỳ.' });
    }
};
