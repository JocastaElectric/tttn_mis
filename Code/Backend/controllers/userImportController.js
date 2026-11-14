const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');
const User = require('../models/User');

const MAX_ROWS = 1000;
const INITIAL_PASSWORD = '123456';

const fieldsByRole = {
    STUDENT: {
        role: 'STUDENT',
        headers: {
            user_code: ['usercode', 'mssv', 'masinhvien', 'masv', 'studentcode'],
            full_name: ['fullname', 'hoten', 'hovaten', 'tensinhvien'],
            class: ['class', 'lop', 'lophoc'],
            major: ['major', 'chuyennganh', 'nganh'],
            email: ['email', 'emailtruong']
        },
        required: ['user_code', 'full_name', 'class', 'email'],
        templateHeaders: ['MSSV', 'Họ và tên', 'Lớp', 'Chuyên ngành', 'Email']
    },
    LECTURER: {
        role: 'LECTURER',
        headers: {
            user_code: ['usercode', 'msgv', 'magv', 'magiangvien', 'lecturercode'],
            full_name: ['fullname', 'hoten', 'hovaten', 'tengiangvien'],
            degree: ['degree', 'hocvi', 'hochamhocvi'],
            dept: ['dept', 'department', 'bomon', 'khoa'],
            email: ['email', 'emailtruong']
        },
        required: ['user_code', 'full_name', 'degree', 'dept', 'email'],
        templateHeaders: ['MSGV', 'Họ và tên', 'Học vị', 'Bộ môn', 'Email']
    }
};

function normalizeHeader(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/gi, 'd')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

function normalizeCell(value) {
    return String(value ?? '').trim();
}

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function parseImportFile(file, role) {
    if (!file?.buffer?.length) {
        return { error: 'Vui lòng chọn file Excel.' };
    }
    if (!String(file.originalname || '').toLowerCase().endsWith('.xlsx')) {
        return { error: 'Chỉ hỗ trợ file .xlsx.' };
    }

    let worksheet;
    try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(file.buffer, { ignoreNodes: ['tableParts'] });
        worksheet = workbook.worksheets[0];
    } catch (error) {
        console.error('Không thể đọc file Excel:', error);
        return { error: 'File Excel bị lỗi hoặc không đúng định dạng.' };
    }
    if (!worksheet) return { error: 'File Excel không có trang tính dữ liệu.' };

    const config = fieldsByRole[role];
    const headerIndexes = new Map();
    worksheet.getRow(1).eachCell((cell, columnNumber) => {
        const normalized = normalizeHeader(cell.text || cell.value);
        if (normalized) headerIndexes.set(normalized, columnNumber);
    });
    const fieldIndexes = {};
    for (const [field, aliases] of Object.entries(config.headers)) {
        fieldIndexes[field] = aliases
            .map(alias => headerIndexes.get(alias))
            .find(index => index !== undefined);
    }

    const missingHeaders = config.required.filter(field => fieldIndexes[field] === undefined);
    if (missingHeaders.length) {
        return {
            error: `Thiếu cột bắt buộc: ${missingHeaders.map(field => config.templateHeaders[
                Object.keys(config.headers).indexOf(field)
            ]).join(', ')}.`
        };
    }

    const candidates = [];
    worksheet.eachRow({ includeEmpty: false }, (excelRow, rowNumber) => {
        if (rowNumber === 1) return;
        const row = { rowNumber };
        Object.entries(fieldIndexes).forEach(([field, cellIndex]) => {
            row[field] = cellIndex === undefined
                ? ''
                : normalizeCell(excelRow.getCell(cellIndex).text || excelRow.getCell(cellIndex).value);
        });
        if (!Object.values(row).some(value => typeof value === 'string' && value.trim())) return;
        candidates.push(row);
    });
    if (!candidates.length) return { error: 'File Excel chưa có dòng tài khoản nào.' };
    if (candidates.length > MAX_ROWS) {
        return { error: `Mỗi lần chỉ nhập tối đa ${MAX_ROWS} tài khoản.` };
    }

    const errors = [];
    const seenCodes = new Set();
    const codeMatchers = [...new Set(candidates.map(row => row.user_code.toUpperCase()))]
        .filter(Boolean)
        .map(code => ({ user_code: new RegExp(`^${escapeRegex(code)}$`, 'i') }));
    const existingUsers = codeMatchers.length
        ? await User.find({ $or: codeMatchers })
        .select('user_code')
        .lean()
        : [];
    const existingCodes = new Set(existingUsers.map(user => String(user.user_code).trim().toUpperCase()));
    const validRows = [];

    for (const row of candidates) {
        const rowErrors = [];
        const codeKey = row.user_code.toUpperCase();
        if (!row.user_code) rowErrors.push('Thiếu mã tài khoản.');
        if (!row.full_name) rowErrors.push('Thiếu họ và tên.');
        if (config.required.includes('class') && !row.class) rowErrors.push('Thiếu lớp.');
        if (config.required.includes('degree') && !row.degree) rowErrors.push('Thiếu học vị.');
        if (config.required.includes('dept') && !row.dept) rowErrors.push('Thiếu bộ môn.');
        if (!row.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
            rowErrors.push('Email không hợp lệ.');
        }
        if (row.user_code && seenCodes.has(codeKey)) rowErrors.push('Mã tài khoản bị trùng trong file.');
        if (row.user_code && existingCodes.has(codeKey)) rowErrors.push('Mã tài khoản đã tồn tại trong hệ thống.');
        if (row.user_code) seenCodes.add(codeKey);

        if (rowErrors.length) {
            errors.push({ row: row.rowNumber, user_code: row.user_code, message: rowErrors.join(' ') });
        } else {
            validRows.push(row);
        }
    }

    return { validRows, errors, totalRows: candidates.length };
}

function getRole(req, res, next) {
    const roleName = String(req.params.role || '').toLowerCase();
    const role = { students: 'STUDENT', lecturers: 'LECTURER' }[roleName];
    if (!fieldsByRole[role]) {
        return res.status(404).json({ success: false, message: 'Loại tài khoản import không hợp lệ.' });
    }
    req.importRole = role;
    return next();
}

exports.downloadTemplate = async (req, res) => {
    const config = fieldsByRole[req.importRole];
    try {
        const workbook = new ExcelJS.Workbook();
        workbook.addWorksheet('Danh sách').addRow(config.templateHeaders);
        const buffer = await workbook.xlsx.writeBuffer();
        const filename = req.importRole === 'STUDENT' ? 'mau-import-sinh-vien.xlsx' : 'mau-import-giang-vien.xlsx';
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(Buffer.from(buffer));
    } catch (error) {
        console.error('Lỗi tạo file mẫu import:', error);
        return res.status(500).json({ success: false, message: 'Không thể tạo file Excel mẫu.' });
    }
};

exports.validateImportFile = async (req, res) => {
    try {
        const result = await parseImportFile(req.file, req.importRole);
        if (result.error) return res.status(400).json({ success: false, message: result.error });
        return res.json({
            success: true,
            data: {
                total_rows: result.totalRows,
                valid_count: result.validRows.length,
                error_count: result.errors.length,
                rows: result.validRows,
                errors: result.errors
            }
        });
    } catch (error) {
        console.error('Lỗi kiểm tra file import tài khoản:', error);
        return res.status(500).json({ success: false, message: 'Không thể kiểm tra file Excel.' });
    }
};

exports.importUsers = async (req, res) => {
    try {
        const result = await parseImportFile(req.file, req.importRole);
        if (result.error) return res.status(400).json({ success: false, message: result.error });

        const password = await bcrypt.hash(INITIAL_PASSWORD, 10);
        const errors = [...result.errors];
        let importedCount = 0;
        for (let offset = 0; offset < result.validRows.length; offset += 40) {
            const batch = result.validRows.slice(offset, offset + 40);
            const outcomes = await Promise.all(batch.map(async row => {
                const user = {
                    user_code: row.user_code,
                    password,
                    must_change_password: true,
                    full_name: row.full_name,
                    email: row.email,
                    role: req.importRole
                };
                if (req.importRole === 'STUDENT') {
                    user.class = row.class;
                    user.major = row.major || '';
                    user.status = 'NONE';
                } else {
                    user.degree = row.degree;
                    user.dept = row.dept;
                }

                try {
                    await User.create(user);
                    return { imported: true };
                } catch (error) {
                    if (error.code === 11000) {
                        return {
                            imported: false,
                            error: { row: row.rowNumber, user_code: row.user_code, message: 'Mã tài khoản vừa được tạo ở nơi khác, dòng này chưa được nhập.' }
                        };
                    }
                    console.error(`Lỗi import tài khoản ở dòng ${row.rowNumber}:`, error);
                    return {
                        imported: false,
                        error: { row: row.rowNumber, user_code: row.user_code, message: 'Không thể lưu tài khoản ở dòng này.' }
                    };
                }
            }));
            outcomes.forEach(outcome => {
                if (outcome.imported) importedCount++;
                else errors.push(outcome.error);
            });
        }

        errors.sort((a, b) => a.row - b.row);
        return res.json({
            success: true,
            message: `Đã nhập ${importedCount}/${result.totalRows} tài khoản. Mật khẩu ban đầu là ${INITIAL_PASSWORD}; người dùng phải đổi mật khẩu ở lần đăng nhập đầu tiên.`,
            data: {
                imported_count: importedCount,
                total_rows: result.totalRows,
                errors
            }
        });
    } catch (error) {
        console.error('Lỗi import tài khoản:', error);
        return res.status(500).json({ success: false, message: 'Không thể nhập danh sách tài khoản.' });
    }
};

exports.getRole = getRole;
