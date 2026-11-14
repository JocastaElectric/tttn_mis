document.addEventListener("DOMContentLoaded", async () => {
    const verifiedAdminUser = await window.verifyAuthSession("ADMIN");
    if (!verifiedAdminUser) return;

    let lecturerList = [];
    let currentEditingId = null;
    const selectedLecturerIds = new Set();
    const pageSize = 10;
    let currentPage = 1;
    let filteredLecturers = [];
    let currentPageLecturers = [];

    // DOM ELEMENTS
    const tableBody = document.getElementById("lecturerTableBody");
    const paginationControls = document.getElementById("lecturersPagination");
    const checkAll = document.getElementById("checkAll");
    const bulkQuotaToolbar = document.getElementById("bulkQuotaToolbar");
    const bulkSelectionCount = document.getElementById("bulkSelectionCount");
    const bulkQuotaInput = document.getElementById("bulkQuotaInput");
    const applyBulkQuotaBtn = document.getElementById("applyBulkQuotaBtn");
    const clearLecturerSelectionBtn = document.getElementById("clearLecturerSelectionBtn");
    const searchInput = document.getElementById("searchInput");
    const deptFilter = document.getElementById("deptFilter");
    const degreeFilter = document.getElementById("degreeFilter");
    const resetFilterBtn = document.getElementById("resetFilterBtn");

    const lecturerModal = document.getElementById("lecturerModal");
    const lecturerForm = document.getElementById("lecturerForm");
    const openAddBtn = document.getElementById("openAddBtn");
    const closeLecturerModal = document.getElementById("closeLecturerModal");
    const cancelLecturerModal = document.getElementById("cancelLecturerModal");

    const logoutModal = document.getElementById("logoutModal");
    const openLogoutBtn = document.getElementById("openLogoutBtn");
    const cancelLogout = document.getElementById("cancelLogout");
    const confirmLogout = document.getElementById("confirmLogout");

    function hasAdminSession() {
        return Boolean(verifiedAdminUser);
    }

    async function fetchLecturers() {
        try {
            const response = await apiFetch(window.APP_CONFIG.API_BASE_URL + "/api/auth/lecturers");
            const result = await response.json();

            if (!response.ok || !result || (!Array.isArray(result) && !Array.isArray(result.data))) {
                throw new Error(result?.message || "Không tải được dữ liệu giảng viên");
            }

            const rawList = Array.isArray(result) ? result : result.data || [];

            lecturerList = rawList.map(item => ({
                id: item.user_code || item.id || "",
                name: item.full_name || item.name || "Chưa cập nhật",
                degree: item.degree || "Chưa cập nhật",
                dept: item.dept || "Chưa cập nhật",
                email: item.email || "Chưa cập nhật",
                groupsCount: item.groupsCount || 0,
                topicsCount: item.topicsCount || 0,
                maxQuota: Number(item.max_quota ?? 5)
            }));
            const availableIds = new Set(lecturerList.map(item => item.id));
            selectedLecturerIds.forEach(id => {
                if (!availableIds.has(id)) selectedLecturerIds.delete(id);
            });

            currentPage = 1;
            renderLecturers(lecturerList);
        } catch (error) {
            console.error("Lỗi tải giảng viên thật:", error);
            tableBody.innerHTML = `<tr><td colspan="9" class="text-center" style="padding: 20px; color: #ef4444;">Không thể tải dữ liệu giảng viên từ máy chủ.</td></tr>`;
            document.getElementById("paginationInfo").textContent = "Hiển thị 0 / 0 giảng viên";
            currentPageLecturers = [];
            window.renderAdminPagination(paginationControls, 0, 0, () => {});
            syncSelectionControls();
        }
    }

    function renderLecturers(data) {
        filteredLecturers = data;
        tableBody.innerHTML = "";
        const totalPages = Math.ceil(data.length / pageSize);
        currentPage = Math.max(1, Math.min(currentPage, totalPages || 1));

        if (data.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="9" class="text-center" style="padding: 20px; color: #94a3b8;">Không tìm thấy giảng viên phù hợp</td></tr>`;
            document.getElementById("paginationInfo").textContent = "Hiển thị 0 / 0 giảng viên";
            currentPageLecturers = [];
            window.renderAdminPagination(paginationControls, 0, 0, () => {});
            syncSelectionControls();
            return;
        }

        const startIndex = (currentPage - 1) * pageSize;
        currentPageLecturers = data.slice(startIndex, startIndex + pageSize);
        currentPageLecturers.forEach(item => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><input type="checkbox" class="lecturer-select" data-id="${item.id}" aria-label="Chọn giảng viên ${item.id}" ${selectedLecturerIds.has(item.id) ? "checked" : ""}></td>
                <td><strong>${item.id}</strong></td>
                <td>${item.name}</td>
                <td><span class="badge-degree">${item.degree}</span></td>
                <td>${item.dept}</td>
                <td>${item.email}</td>
                <td class="text-center"><span class="group-count-tag">${item.groupsCount} / ${item.maxQuota} nhóm</span></td>
                <td class="text-center"><span class="topic-count-tag">${item.topicsCount} đề tài</span></td>
                <td class="text-center">
                    <button class="table-action-btn edit-btn" data-id="${item.id}" title="Sửa"><i class="fa-solid fa-pen-to-square"></i></button>
                    <button class="table-action-btn red delete-btn" data-id="${item.id}" title="Xóa"><i class="fa-solid fa-trash-can"></i></button>
                </td>
            `;
            tableBody.appendChild(tr);
        });

        document.getElementById("paginationInfo").textContent =
            `Hiển thị ${startIndex + 1} - ${startIndex + currentPageLecturers.length} trên tổng số ${data.length} giảng viên`;
        window.renderAdminPagination(paginationControls, currentPage, totalPages, page => {
            currentPage = page;
            renderLecturers(filteredLecturers);
        });
        syncSelectionControls();
        attachEvents();
    }

    function syncSelectionControls() {
        const selectedVisibleCount = currentPageLecturers.filter(item => selectedLecturerIds.has(item.id)).length;
        if (checkAll) {
            checkAll.checked = currentPageLecturers.length > 0 && selectedVisibleCount === currentPageLecturers.length;
            checkAll.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < currentPageLecturers.length;
        }
        const hasSelection = selectedLecturerIds.size > 0;
        if (bulkQuotaToolbar) bulkQuotaToolbar.hidden = !hasSelection;
        if (bulkSelectionCount) bulkSelectionCount.textContent = `Đã chọn ${selectedLecturerIds.size} giảng viên`;
        if (!hasSelection && bulkQuotaInput) bulkQuotaInput.value = "";
    }

    function handleFilter(resetPage = true) {
        const query = searchInput.value.toLowerCase().trim();
        const selectedDept = deptFilter.value;
        const selectedDegree = degreeFilter.value;

        const filtered = lecturerList.filter(l => {
            const matchQuery = (l.id || "").toLowerCase().includes(query) || (l.name || "").toLowerCase().includes(query) || (l.email || "").toLowerCase().includes(query);
            const matchDept = selectedDept === "" || (l.dept || "").toLowerCase().includes(selectedDept.toLowerCase());
            const matchDegree = selectedDegree === "" || (l.degree || "") === selectedDegree;

            return matchQuery && matchDept && matchDegree;
        });

        if (resetPage) currentPage = 1;
        renderLecturers(filtered);
    }

    if (searchInput) searchInput.addEventListener("input", handleFilter);
    if (deptFilter) deptFilter.addEventListener("change", handleFilter);
    if (degreeFilter) degreeFilter.addEventListener("change", handleFilter);

    if (resetFilterBtn) {
        resetFilterBtn.addEventListener("click", () => {
            searchInput.value = "";
            deptFilter.value = "";
            degreeFilter.value = "";
            handleFilter();
        });
    }

    if (checkAll) {
        checkAll.addEventListener("change", () => {
            currentPageLecturers.forEach(item => {
                if (checkAll.checked) selectedLecturerIds.add(item.id);
                else selectedLecturerIds.delete(item.id);
            });
            renderLecturers(filteredLecturers);
        });
    }

    if (clearLecturerSelectionBtn) {
        clearLecturerSelectionBtn.addEventListener("click", () => {
            selectedLecturerIds.clear();
            renderLecturers(filteredLecturers);
        });
    }

    if (applyBulkQuotaBtn) {
        applyBulkQuotaBtn.addEventListener("click", async () => {
            const userCodes = [...selectedLecturerIds];
            const quotaText = bulkQuotaInput.value.trim();
            const maxQuota = Number(quotaText);
            if (userCodes.length === 0) {
                showAppNotification("Hãy chọn ít nhất một giảng viên.");
                return;
            }
            if (!quotaText || !Number.isInteger(maxQuota) || maxQuota < 0) {
                showAppNotification("Số nhóm tối đa phải là số nguyên không âm.");
                return;
            }

            const confirmed = await window.showConfirmDialog({
                title: "Cập nhật chỉ tiêu hàng loạt",
                message: `Đặt chỉ tiêu tối đa ${maxQuota} nhóm cho ${userCodes.length} giảng viên đã chọn? Thao tác sẽ bị từ chối nếu chỉ tiêu thấp hơn số nhóm họ đang hướng dẫn.`,
                confirmText: "Cập nhật"
            });
            if (!confirmed) return;

            try {
                const response = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/auth/lecturers/bulk-quota`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ user_codes: userCodes, max_quota: maxQuota })
                });
                const result = await response.json();
                if (!response.ok || !result.success) {
                    throw new Error(result.message || "Không thể cập nhật chỉ tiêu hàng loạt.");
                }

                await fetchLecturers();
                const allUpdated = userCodes.every(code =>
                    lecturerList.some(item => item.id === code && item.maxQuota === maxQuota)
                );
                if (!allUpdated) {
                    throw new Error("Máy chủ chưa cập nhật đủ chỉ tiêu. Hãy tải lại trang rồi kiểm tra.");
                }

                selectedLecturerIds.clear();
                bulkQuotaInput.value = "";
                handleFilter(false);
                showAppNotification(result.message || "Đã cập nhật chỉ tiêu giảng viên.");
            } catch (error) {
                console.error("Lỗi cập nhật chỉ tiêu hàng loạt:", error);
                showAppNotification(error.message || "Không thể cập nhật chỉ tiêu hàng loạt.");
            }
        });
    }

    if (openAddBtn) {
        openAddBtn.onclick = () => {
            currentEditingId = null;
            document.getElementById("modalTitle").textContent = "Thêm Giảng viên mới";
            lecturerForm.reset();
            document.getElementById("lecturerIdInput").disabled = false;
            lecturerModal.style.display = "flex";
        };
    }

    if (lecturerForm) {
        lecturerForm.onsubmit = async (e) => {
            e.preventDefault();

            const id = document.getElementById("lecturerIdInput").value.trim();
            const name = document.getElementById("lecturerNameInput").value.trim();
            const degree = document.getElementById("lecturerDegreeInput").value;
            const dept = document.getElementById("lecturerDeptInput").value;
            const email = document.getElementById("lecturerEmailInput").value.trim();
            const maxQuota = Number(document.getElementById("lecturerQuotaInput").value);

            if (!id || !name || !degree || !dept || !email) {
                showAppNotification("Vui lòng điền đầy đủ thông tin giảng viên.");
                return;
            }
            if (!Number.isInteger(maxQuota) || maxQuota < 0) {
                showAppNotification("Số nhóm tối đa phải là số nguyên không âm.");
                return;
            }

            try {
                const payload = {
                    user_code: id,
                    full_name: name,
                    degree,
                    dept,
                    email,
                    max_quota: maxQuota
                };

                let response;
                if (currentEditingId) {
                    response = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/auth/lecturers/${currentEditingId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                } else {
                    response = await apiFetch(window.APP_CONFIG.API_BASE_URL + "/api/auth/lecturers", {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                }

                const result = await response.json();
                if (!response.ok || !result.success) {
                    throw new Error(result.message || 'Lỗi khi lưu dữ liệu giảng viên.');
                }

                await fetchLecturers();
                const savedLecturer = lecturerList.find(item => item.id === id);
                if (!savedLecturer || savedLecturer.maxQuota !== maxQuota) {
                    throw new Error("Máy chủ chưa cập nhật chỉ tiêu. Hãy khởi động lại backend rồi thử lưu lại.");
                }

                lecturerModal.style.display = "none";
                showAppNotification(result.message || "Đã lưu thông tin giảng viên.");
            } catch (error) {
                console.error('Lỗi lưu giảng viên:', error);
                showAppNotification(error.message || 'Không thể lưu giảng viên.');
            }
        };
    }

    function attachEvents() {
        document.querySelectorAll(".lecturer-select").forEach(checkbox => {
            checkbox.addEventListener("change", event => {
                const id = event.currentTarget.getAttribute("data-id");
                if (!id) return;
                if (event.currentTarget.checked) selectedLecturerIds.add(id);
                else selectedLecturerIds.delete(id);
                syncSelectionControls();
            });
        });

        document.querySelectorAll(".edit-btn").forEach(btn => {
            btn.onclick = (e) => {
                const id = e.currentTarget.getAttribute("data-id");
                const item = lecturerList.find(l => l.id === id);
                if (item) {
                    currentEditingId = id;
                    document.getElementById("modalTitle").textContent = "Chỉnh sửa giảng viên";
                    document.getElementById("lecturerIdInput").value = item.id;
                    document.getElementById("lecturerIdInput").disabled = true;
                    document.getElementById("lecturerNameInput").value = item.name;
                    document.getElementById("lecturerDegreeInput").value = item.degree;
                    document.getElementById("lecturerDeptInput").value = item.dept;
                    document.getElementById("lecturerEmailInput").value = item.email;
                    document.getElementById("lecturerQuotaInput").value = item.maxQuota;

                    lecturerModal.style.display = "flex";
                }
            };
        });

        document.querySelectorAll(".delete-btn").forEach(btn => {
            btn.onclick = async (e) => {
                const id = e.currentTarget.getAttribute("data-id");
                const confirmed = await window.showConfirmDialog({
                    title: "Xác nhận xóa giảng viên",
                    message: `Bạn có chắc chắn muốn xóa giảng viên mã ${id}?`,
                    confirmText: "Xóa giảng viên",
                    danger: true
                });
                if (!confirmed) return;

                if (!hasAdminSession()) {
                    showAppNotification("Phiên đăng nhập Admin không hợp lệ. Vui lòng đăng nhập lại.");
                    return;
                }

                try {
                    const response = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/auth/lecturers/${encodeURIComponent(id)}`, {
                        method: "DELETE"
                    });
                    const result = await response.json();

                    if (!response.ok || !result.success) {
                        throw new Error(result.message || "Xóa giảng viên thất bại.");
                    }

                    lecturerList = lecturerList.filter(lecturer => lecturer.id !== id);
                    selectedLecturerIds.delete(id);
                    handleFilter(false);
                    showAppNotification(result.message || "Xóa giảng viên thành công!");
                } catch (error) {
                    console.error("Lỗi xóa giảng viên:", error);
                    showAppNotification(error.message || "Không thể xóa giảng viên.");
                }
            };
        });
    }

    if (closeLecturerModal) closeLecturerModal.onclick = () => lecturerModal.style.display = "none";
    if (cancelLecturerModal) cancelLecturerModal.onclick = () => lecturerModal.style.display = "none";

    if (openLogoutBtn) openLogoutBtn.onclick = () => logoutModal.style.display = "flex";
    if (cancelLogout) cancelLogout.onclick = () => logoutModal.style.display = "none";
    if (confirmLogout) {
        confirmLogout.onclick = () => {
            localStorage.clear();
            window.location.href = "../auth/index.html";
        };
    }

    window.addEventListener("users-imported", fetchLecturers);
    fetchLecturers();
});