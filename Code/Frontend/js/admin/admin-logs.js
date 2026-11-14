document.addEventListener("DOMContentLoaded", async () => {
    const baseUrl = window.APP_CONFIG.API_BASE_URL + "/api";
    const pageSize = 50;
    const user = await window.verifyAuthSession("ADMIN");
    if (!user) return;

    const tableBody = document.getElementById("logsTableBody");
    const searchInput = document.getElementById("searchInput");
    const roleFilter = document.getElementById("roleFilter");
    const actionTypeFilter = document.getElementById("actionTypeFilter");
    const resetFilterBtn = document.getElementById("resetFilterBtn");
    const exportLogBtn = document.getElementById("exportLogBtn");
    const pageInfo = document.getElementById("logsPageInfo");
    const previousPageBtn = document.getElementById("previousLogsPage");
    const nextPageBtn = document.getElementById("nextLogsPage");
    const logoutModal = document.getElementById("logoutModal");
    const openLogoutBtn = document.getElementById("openLogoutBtn");
    const cancelLogout = document.getElementById("cancelLogout");
    const confirmLogout = document.getElementById("confirmLogout");

    let currentPage = 1;
    let totalFiltered = 0;
    let logList = [];
    let searchTimer;

    function getFilterParams() {
        const params = new URLSearchParams();
        const role = roleFilter?.value || "";
        const actionType = actionTypeFilter?.value || "";
        const search = searchInput?.value.trim() || "";
        if (role) params.set("role", role);
        if (actionType) params.set("actionType", actionType);
        if (search) params.set("search", search);
        return params;
    }

    function updateSummary(stats = {}) {
        document.getElementById("totalLogs").textContent = stats.total || 0;
        document.getElementById("adminLogs").textContent = stats.ADMIN || 0;
        document.getElementById("lecturerLogs").textContent = stats.LECTURER || 0;
        document.getElementById("studentLogs").textContent = stats.STUDENT || 0;
        document.getElementById("guestLogs").textContent = stats.GUEST || 0;
    }

    function updatePagination() {
        const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
        if (pageInfo) {
            if (!totalFiltered) {
                pageInfo.textContent = "Không có nhật ký phù hợp.";
            } else {
                const first = (currentPage - 1) * pageSize + 1;
                const last = Math.min(currentPage * pageSize, totalFiltered);
                pageInfo.textContent = `Hiển thị ${first}–${last} trên ${totalFiltered} nhật ký (trang ${currentPage}/${totalPages})`;
            }
        }
        if (previousPageBtn) previousPageBtn.disabled = currentPage <= 1;
        if (nextPageBtn) nextPageBtn.disabled = currentPage >= totalPages;
    }

    async function fetchLogs() {
        const params = getFilterParams();
        params.set("page", String(currentPage));
        params.set("limit", String(pageSize));
        try {
            const response = await apiFetch(`${baseUrl}/activity-logs?${params}`);
            const result = await response.json();
            if (!response.ok || !result?.success || !Array.isArray(result.data)) {
                throw new Error(result?.message || "Không tải được nhật ký hoạt động.");
            }

            currentPage = result.page;
            totalFiltered = result.total;
            logList = result.data.map(item => {
                const loggedName = String(item.user_name || "").trim();
                const usesGuestFallback = ["khách", "guest"].includes(loggedName.toLowerCase());
                return {
                    ...item,
                    timestamp: item.createdAt || item.updatedAt,
                    user: usesGuestFallback
                        ? item.user_code || loggedName || "Khách"
                        : loggedName || item.user_code || "Khách",
                    email: item.email || "-",
                    role: item.role || "GUEST",
                    actionType: item.actionType || "OTHER",
                    actionText: item.actionText || `${item.method || ""} ${item.url || ""}`,
                    ip: item.ip || "Không rõ",
                    statusCode: item.statusCode
                };
            });

            updateSummary(result.stats);
            renderLogs(logList);
            updatePagination();
        } catch (error) {
            console.error("Lỗi tải nhật ký hoạt động:", error);
            tableBody.replaceChildren();
            const row = document.createElement("tr");
            const cell = document.createElement("td");
            cell.colSpan = 7;
            cell.className = "text-center";
            cell.style.cssText = "padding:20px;color:#ef4444";
            cell.textContent = error.message || "Không thể tải nhật ký hoạt động.";
            row.appendChild(cell);
            tableBody.appendChild(row);
            totalFiltered = 0;
            updatePagination();
        }
    }

    function formatDate(dateStr) {
        if (!dateStr) return "-";
        const date = new Date(dateStr);
        if (Number.isNaN(date.getTime())) return "-";
        const day = String(date.getDate()).padStart(2, "0");
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, "0");
        const minutes = String(date.getMinutes()).padStart(2, "0");
        const seconds = String(date.getSeconds()).padStart(2, "0");
        return `${hours}:${minutes}:${seconds} - ${day}/${month}/${year}`;
    }

    function createCell(value, className) {
        const cell = document.createElement("td");
        if (className) cell.className = className;
        cell.textContent = value == null || value === "" ? "-" : String(value);
        return cell;
    }

    function createBadge(label, className) {
        const badge = document.createElement("span");
        badge.className = className;
        badge.textContent = label;
        return badge;
    }

    function renderLogs(data) {
        tableBody.replaceChildren();
        if (data.length === 0) {
            const row = document.createElement("tr");
            const cell = createCell("Không tìm thấy nhật ký hoạt động nào.");
            cell.colSpan = 7;
            cell.className = "text-center";
            row.appendChild(cell);
            tableBody.appendChild(row);
            return;
        }

        const rolePresentation = {
            ADMIN: ["ADMIN", "role-admin"],
            LECTURER: ["GIẢNG VIÊN", "role-lecturer"],
            STUDENT: ["SINH VIÊN", "role-student"],
            GUEST: ["KHÁCH", "role-guest"]
        };
        const actionPresentation = {
            CREATE: ["TẠO MỚI", "action-create"],
            UPDATE: ["CẬP NHẬT", "action-update"],
            DELETE: ["XÓA", "action-delete"],
            AUTH: ["XÁC THỰC", "action-auth"],
            READ: ["XEM", "action-read"],
            OTHER: ["KHÁC", "action-other"]
        };

        data.forEach(item => {
            const row = document.createElement("tr");
            const timeCell = document.createElement("td");
            const clockIcon = document.createElement("i");
            clockIcon.className = "fa-regular fa-clock";
            clockIcon.style.cssText = "color:#94a3b8;margin-right:4px";
            timeCell.append(clockIcon, document.createTextNode(formatDate(item.timestamp)));

            const userCell = document.createElement("td");
            userCell.className = "user-cell";
            const name = document.createElement("span");
            name.className = "user-name";
            name.textContent = item.user;
            const email = document.createElement("span");
            email.className = "user-sub";
            email.textContent = item.email;
            userCell.append(name, email);

            const [roleLabel, roleClass] = rolePresentation[item.role] || ["KHÁC", "role-guest"];
            const roleCell = document.createElement("td");
            roleCell.appendChild(createBadge(roleLabel, `role-pill ${roleClass}`));

            const [actionLabel, actionClass] = actionPresentation[item.actionType] || actionPresentation.OTHER;
            const actionCell = document.createElement("td");
            actionCell.appendChild(createBadge(actionLabel, `action-pill ${actionClass}`));

            const statusClass = Number(item.statusCode) >= 400 ? "status-error" : "status-success";
            const statusCell = document.createElement("td");
            statusCell.className = "text-center";
            statusCell.appendChild(createBadge(
                item.statusCode == null ? "-" : String(item.statusCode),
                `status-pill ${statusClass}`
            ));

            const ipCell = document.createElement("td");
            ipCell.className = "text-center";
            ipCell.appendChild(createBadge(item.ip, "ip-code"));

            row.append(
                timeCell,
                userCell,
                roleCell,
                actionCell,
                createCell(item.actionText),
                statusCell,
                ipCell
            );
            tableBody.appendChild(row);
        });
    }

    function reloadFromFirstPage() {
        currentPage = 1;
        fetchLogs();
    }

    searchInput?.addEventListener("input", () => {
        window.clearTimeout(searchTimer);
        searchTimer = window.setTimeout(reloadFromFirstPage, 300);
    });
    roleFilter?.addEventListener("change", reloadFromFirstPage);
    actionTypeFilter?.addEventListener("change", reloadFromFirstPage);
    resetFilterBtn?.addEventListener("click", () => {
        if (searchInput) searchInput.value = "";
        if (roleFilter) roleFilter.value = "";
        if (actionTypeFilter) actionTypeFilter.value = "";
        reloadFromFirstPage();
    });
    previousPageBtn?.addEventListener("click", () => {
        if (currentPage > 1) {
            currentPage--;
            fetchLogs();
        }
    });
    nextPageBtn?.addEventListener("click", () => {
        if (currentPage * pageSize < totalFiltered) {
            currentPage++;
            fetchLogs();
        }
    });

    exportLogBtn?.addEventListener("click", async () => {
        const originalLabel = exportLogBtn.innerHTML;
        exportLogBtn.disabled = true;
        exportLogBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xuất...';
        try {
            const params = getFilterParams();
            const response = await apiFetch(`${baseUrl}/activity-logs/export?${params}`);
            if (!response.ok) {
                const result = await response.json().catch(() => ({}));
                throw new Error(result.message || "Không thể xuất nhật ký hoạt động.");
            }

            const blob = await response.blob();
            if (!blob.size) throw new Error("File nhật ký tải về đang trống.");
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "system-activity-logs.csv";
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
            window.showAppNotification?.("Đã xuất file nhật ký CSV thành công.");
        } catch (error) {
            console.error("Lỗi xuất nhật ký hoạt động:", error);
            window.showAppNotification?.(error.message || "Không thể xuất nhật ký hoạt động.");
        } finally {
            exportLogBtn.disabled = false;
            exportLogBtn.innerHTML = originalLabel;
        }
    });

    openLogoutBtn.onclick = () => logoutModal.style.display = "flex";
    cancelLogout.onclick = () => logoutModal.style.display = "none";
    confirmLogout.onclick = () => {
        localStorage.clear();
        window.location.href = "../auth/index.html";
    };

    await fetchLogs();
});
