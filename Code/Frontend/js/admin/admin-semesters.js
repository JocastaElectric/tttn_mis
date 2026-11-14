document.addEventListener("DOMContentLoaded", async () => {
    const user = await window.verifyAuthSession("ADMIN");
    if (!user) return;

    const userName = document.getElementById("userName");
    userName.textContent = user.full_name || user.fullName || "Quản trị viên";

    const logoutModal = document.getElementById("logoutModal");
    document.getElementById("logoutBtn").addEventListener("click", () => {
        logoutModal.style.display = "flex";
    });
    document.getElementById("cancelLogoutBtn").addEventListener("click", () => {
        logoutModal.style.display = "none";
    });
    document.getElementById("confirmLogoutBtn").addEventListener("click", () => {
        sessionStorage.removeItem("activeAuth");
        window.location.href = "../auth/index.html";
    });

    const apiUrl = window.APP_CONFIG.API_BASE_URL + "/api/semesters";
    const form = document.getElementById("semesterForm");
    const list = document.getElementById("semesterList");
    const message = document.getElementById("pageMessage");
    const messageText = document.getElementById("pageMessageText");
    const semesterId = document.getElementById("semesterId");
    const cancelEditBtn = document.getElementById("cancelEditBtn");
    const resetFormBtn = document.getElementById("resetFormBtn");
    const saveBtn = document.getElementById("saveSemesterBtn");
    const showAllSemestersBtn = document.getElementById("showAllSemestersBtn");
    let semesters = [];

    const request = async (url, options = {}) => {
        const response = await apiFetch(url, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                ...options.headers
            }
        });
        const responseText = await response.text();
        let result;
        try {
            result = responseText ? JSON.parse(responseText) : {};
        } catch {
            throw new Error("Máy chủ trả về phản hồi không hợp lệ. Hãy kiểm tra API backend đang chạy.");
        }
        if (!response.ok) {
            if (result.message === "Vui lòng nhập tên học kỳ và đầy đủ các ngày hợp lệ.") {
                throw new Error("Backend đang chạy phiên bản cũ chưa hỗ trợ giờ mở/đóng đăng ký. Hãy khởi động lại backend rồi thử lại.");
            }
            throw new Error(result.message || "Yêu cầu không thành công.");
        }
        return result;
    };

    const showMessage = (text, isError = false) => {
        messageText.textContent = text;
        message.classList.toggle("error", isError);
        message.hidden = false;
    };

    const formatDateTime = value => {
        if (!value) return "Chưa cấu hình";
        return new Date(value).toLocaleString("vi-VN", {
            timeZone: "Asia/Ho_Chi_Minh",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    };

    const formatLegacyDateTime = (value, isEnd = false) => {
        if (!value) return "Chưa cấu hình";
        const date = new Date(value);
        if (date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0) {
            const datePart = date.toLocaleDateString("vi-VN", { timeZone: "UTC" });
            return `${datePart} ${isEnd ? "23:59" : "00:00"}`;
        }
        return formatDateTime(value);
    };

    const registrationDateTimeValue = value => {
        if (!value) return "";
        const date = new Date(value);
        const localParts = new Intl.DateTimeFormat("sv-SE", {
            timeZone: "Asia/Ho_Chi_Minh",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23"
        }).format(date);
        return localParts.replace(" ", "T");
    };

    const renderList = () => {
        list.replaceChildren();
        if (!semesters.length) {
            const empty = document.createElement("div");
            empty.className = "empty-state";
            empty.innerHTML = `
                <div class="empty-illustration" aria-hidden="true">
                    <span class="empty-calendar"><i class="fa-solid fa-calendar-days"></i></span>
                    <span class="empty-clock"><i class="fa-regular fa-clock"></i></span>
                </div>
                <strong>Chưa có học kỳ nào được tạo</strong>
                <span>Hãy tạo học kỳ mới để bắt đầu quản lý.</span>
                <button type="button" class="empty-create-button"><i class="fa-solid fa-plus"></i> Tạo học kỳ ngay</button>`;
            empty.querySelector(".empty-create-button").addEventListener("click", () => {
                document.getElementById("semesterName").focus();
                form.scrollIntoView({ behavior: "smooth", block: "center" });
            });
            list.append(empty);
            return;
        }

        semesters.forEach(semester => {
            const card = document.createElement("article");
            card.className = `semester-item${semester.is_active ? " active" : ""}`;

            const header = document.createElement("div");
            header.className = "semester-item-header";
            const title = document.createElement("h3");
            title.textContent = semester.name;
            const badge = document.createElement("span");
            badge.className = `status-badge${semester.is_active ? " active" : ""}`;
            badge.textContent = semester.is_active ? "ĐANG ÁP DỤNG" : "CHƯA KÍCH HOẠT";
            header.append(title, badge);

            const dates = document.createElement("div");
            dates.className = "semester-dates";
            [
                `Thời gian học kỳ: ${new Date(semester.start_date).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })} · ${semester.total_weeks || 15} tuần`,
                `Đăng ký đề tài: ${semester.registration_window_has_time
                    ? `${formatDateTime(semester.registration_start_date)} – ${formatDateTime(semester.registration_end_date)}`
                    : `${formatLegacyDateTime(semester.registration_start_date)} – ${formatLegacyDateTime(semester.registration_end_date, true)}`}`
            ].forEach(text => {
                const line = document.createElement("span");
                line.textContent = text;
                dates.append(line);
            });

            const actions = document.createElement("div");
            actions.className = "semester-actions";
            const edit = document.createElement("button");
            edit.type = "button";
            edit.className = "action-button";
            edit.textContent = "Chỉnh sửa";
            edit.addEventListener("click", () => beginEdit(semester));
            actions.append(edit);

            if (!semester.is_active) {
                const activate = document.createElement("button");
                activate.type = "button";
                activate.className = "action-button activate";
                activate.textContent = "Kích hoạt";
                activate.addEventListener("click", () => activateSemester(semester._id));
                const remove = document.createElement("button");
                remove.type = "button";
                remove.className = "action-button delete";
                remove.textContent = "Xóa";
                remove.addEventListener("click", () => deleteSemester(semester._id));
                actions.append(activate, remove);
            }

            card.append(header, dates, actions);
            list.append(card);
        });
    };

    const dateInputValue = value => value ? new Date(value).toISOString().slice(0, 10) : "";

    const beginEdit = semester => {
        semesterId.value = semester._id;
        form.elements.name.value = semester.name;
        form.elements.start_date.value = dateInputValue(semester.start_date);
        form.elements.registration_start_date.value = semester.registration_window_has_time
            ? registrationDateTimeValue(semester.registration_start_date)
            : `${dateInputValue(semester.registration_start_date)}T00:00`;
        form.elements.registration_end_date.value = semester.registration_window_has_time
            ? registrationDateTimeValue(semester.registration_end_date)
            : `${dateInputValue(semester.registration_end_date)}T23:59`;
        form.elements.total_weeks.value = semester.total_weeks || 15;
        document.getElementById("activateSemester").checked = semester.is_active;
        document.getElementById("formTitle").textContent = "Cập nhật học kỳ";
        saveBtn.textContent = "Lưu thay đổi";
        cancelEditBtn.hidden = false;
        form.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const resetForm = () => {
        form.reset();
        semesterId.value = "";
        form.elements.total_weeks.value = 15;
        document.getElementById("formTitle").textContent = "Tạo học kỳ mới";
        saveBtn.textContent = "Lưu học kỳ";
        cancelEditBtn.hidden = true;
    };

    const loadSemesters = async () => {
        const result = await request(apiUrl);
        semesters = result.data || [];
        renderList();
    };

    const activateSemester = async id => {
        try {
            await request(`${apiUrl}/${encodeURIComponent(id)}/activate`, { method: "PATCH" });
            await loadSemesters();
            showMessage("Đã kích hoạt học kỳ. Thời hạn đăng ký đã được áp dụng.");
        } catch (error) {
            showMessage(error.message, true);
        }
    };

    const deleteSemester = async id => {
        const confirmed = await window.showConfirmDialog({
            title: "Xác nhận xóa học kỳ",
            message: "Bạn có chắc muốn xóa học kỳ này?",
            confirmText: "Xóa học kỳ",
            danger: true
        });
        if (!confirmed) return;
        try {
            await request(`${apiUrl}/${encodeURIComponent(id)}`, { method: "DELETE" });
            await loadSemesters();
            showMessage("Đã xóa học kỳ.");
        } catch (error) {
            showMessage(error.message, true);
        }
    };

    form.addEventListener("submit", async event => {
        event.preventDefault();
        const body = {
            name: form.elements.name.value.trim(),
            start_date: form.elements.start_date.value,
            registration_start_date: form.elements.registration_start_date.value,
            registration_end_date: form.elements.registration_end_date.value,
            total_weeks: Number(form.elements.total_weeks.value),
            is_active: document.getElementById("activateSemester").checked
        };
        const id = semesterId.value;
        saveBtn.disabled = true;
        try {
            await request(id ? `${apiUrl}/${encodeURIComponent(id)}` : apiUrl, {
                method: id ? "PATCH" : "POST",
                body: JSON.stringify(body)
            });
            resetForm();
            await loadSemesters();
            showMessage(id ? "Đã cập nhật học kỳ." : "Đã tạo học kỳ.");
        } catch (error) {
            showMessage(error.message, true);
        } finally {
            saveBtn.disabled = false;
        }
    });

    cancelEditBtn.addEventListener("click", resetForm);
    resetFormBtn.addEventListener("click", resetForm);
    message.querySelector(".message-close").addEventListener("click", () => {
        message.hidden = true;
    });
    showAllSemestersBtn.addEventListener("click", () => {
        list.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    try {
        await loadSemesters();
    } catch (error) {
        showMessage(error.message, true);
        list.innerHTML = "";
    }
});
