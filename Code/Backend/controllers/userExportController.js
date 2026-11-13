const ExcelJS = require('exceljs');
const Topic = require('../models/Topic');
const User = require('../models/User');

async function sendWorkbook(res, { filename, sheetName, columns, rows }) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'QUẢN LÝ TTTN';
    const worksheet = workbook.addWorksheet(sheetName);
    worksheet.columns = columns;
    worksheet.addRows(rows);
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    worksheet.autoFilter = {
        from: 'A1',
        to: `${worksheet.getColumn(columns.length).letter}${rows.length + 1}`
    };

    const header = worksheet.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    header.alignment = { vertical: 'middle' };
    header.height = 24;

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(Buffer.from(buffer));
}

exports.exportStudents = async (req, res) => {
    try {
        const students = await User.find({ role: 'STUDENT' })
            .select('user_code full_name class major email')
            .sort({ createdAt: -1 })
            .lean();
        const topics = await Topic.find({
            $or: [
                { leader_code: { $exists: true, $ne: null } },
                { member2_code: { $exists: true, $ne: null } },
                { member3_code: { $exists: true, $ne: null } }
            ]
        }).select('leader_code member2_code member3_code status').lean();

        const topicStatusByStudent = new Map();
        topics.forEach(topic => {
            [topic.leader_code, topic.member2_code, topic.member3_code].filter(Boolean).forEach(code => {
                const current = topicStatusByStudent.get(code);
                if (!current || (current !== 'APPROVED' && topic.status === 'APPROVED')) {
                    topicStatusByStudent.set(code, topic.status || 'PENDING');
                }
            });
        });

        const rows = students.map(student => {
            const topicStatus = topicStatusByStudent.get(student.user_code) || 'NONE';
            const status = topicStatus === 'APPROVED'
                ? 'Đã có đề tài'
                : ['PENDING', 'NEED_REVISION'].includes(topicStatus)
                    ? 'Chờ phê duyệt'
                    : 'Chưa có nhóm';
            return {
                user_code: student.user_code,
                full_name: student.full_name,
                class: student.class || '',
                major: student.major || '',
                email: student.email || '',
                status
            };
        });

        return await sendWorkbook(res, {
            filename: 'danh-sach-sinh-vien.xlsx',
            sheetName: 'Sinh viên',
            columns: [
                { header: 'MSSV', key: 'user_code', width: 18 },
                { header: 'Họ và tên', key: 'full_name', width: 28 },
                { header: 'Lớp', key: 'class', width: 16 },
                { header: 'Chuyên ngành', key: 'major', width: 30 },
                { header: 'Email', key: 'email', width: 32 },
                { header: 'Trạng thái đề tài', key: 'status', width: 22 }
            ],
            rows
        });
    } catch (error) {
        console.error('Lỗi xuất danh sách sinh viên:', error);
        return res.status(500).json({ success: false, message: 'Không thể xuất danh sách sinh viên.' });
    }
};

exports.exportLecturers = async (req, res) => {
    try {
        const lecturers = await User.find({ role: 'LECTURER' })
            .select('user_code full_name degree dept email')
            .sort({ createdAt: -1 })
            .lean();
        const lecturerCodes = lecturers.map(lecturer => lecturer.user_code);

        const [groupCounts, topicCounts] = await Promise.all([
            Topic.aggregate([
                {
                    $match: {
                        lecturer_code: { $in: lecturerCodes },
                        leader_code: { $exists: true, $ne: null },
                        status: { $ne: 'REJECTED' }
                    }
                },
                { $group: { _id: '$lecturer_code', count: { $sum: 1 } } }
            ]),
            Topic.aggregate([
                {
                    $match: {
                        lecturer_code: { $in: lecturerCodes },
                        status: { $in: ['APPROVED', 'PENDING', 'NEED_REVISION', 'OPEN'] }
                    }
                },
                { $group: { _id: '$lecturer_code', count: { $sum: 1 } } }
            ])
        ]);
        const groupsByLecturer = new Map(groupCounts.map(item => [item._id, item.count]));
        const topicsByLecturer = new Map(topicCounts.map(item => [item._id, item.count]));
        const rows = lecturers.map(lecturer => ({
            user_code: lecturer.user_code,
            full_name: lecturer.full_name,
            degree: lecturer.degree || '',
            dept: lecturer.dept || '',
            email: lecturer.email || '',
            groups_count: groupsByLecturer.get(lecturer.user_code) || 0,
            topics_count: topicsByLecturer.get(lecturer.user_code) || 0
        }));

        return await sendWorkbook(res, {
            filename: 'danh-sach-giang-vien.xlsx',
            sheetName: 'Giảng viên',
            columns: [
                { header: 'MSGV', key: 'user_code', width: 18 },
                { header: 'Họ và tên', key: 'full_name', width: 28 },
                { header: 'Học hàm / Học vị', key: 'degree', width: 22 },
                { header: 'Bộ môn', key: 'dept', width: 30 },
                { header: 'Email', key: 'email', width: 32 },
                { header: 'Số nhóm hướng dẫn', key: 'groups_count', width: 22 },
                { header: 'Số đề tài hướng dẫn', key: 'topics_count', width: 24 }
            ],
            rows
        });
    } catch (error) {
        console.error('Lỗi xuất danh sách giảng viên:', error);
        return res.status(500).json({ success: false, message: 'Không thể xuất danh sách giảng viên.' });
    }
};
