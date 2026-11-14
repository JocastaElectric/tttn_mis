document.addEventListener("DOMContentLoaded", async () => {

    // =========================================================================
    // 1. KIỂM TRA PHIÊN ĐĂNG NHẬP & QUYỀN ADMIN
    // =========================================================================
    const user = await window.verifyAuthSession("ADMIN");
    if (!user) return;
    const token = "";

    // Hiển thị tên Admin
    const userNameElem = document.getElementById("userName");
    const welcomeAdminElem = document.getElementById("welcomeAdminName");
    const fullName = user.full_name || user.fullName || "Quản trị viên";

    if (userNameElem) userNameElem.textContent = fullName;
    if (welcomeAdminElem) welcomeAdminElem.textContent = fullName;

    // =========================================================================
    // 2. BIẾN QUẢN LÝ THỂ HIỆN BIỂU ĐỒ
    // =========================================================================
    let registrationChartInstance = null;
    let statusChartInstance = null;
    let latestDashboardReport = null;
    const exportReportBtn = document.getElementById("exportReportBtn");
    
    // Cấu hình URL API Backend (Sửa port nếu backend chạy port khác)
    const API_BASE_URL = window.APP_CONFIG.API_BASE_URL + "/api";

    // =========================================================================
    // 3. HÀM FETCH DỮ LIỆU TỪ BACKEND
    // =========================================================================
    async function fetchDashboardData(semester = "all") {
        latestDashboardReport = null;
        if (exportReportBtn) exportReportBtn.disabled = true;

        try {
            const params = new URLSearchParams({ semester });
            const url = `${API_BASE_URL}/dashboard/admin?${params}`;
            console.log("Đang gọi API Dashboard tại:", url);

            const res = await apiFetch(url, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            });

            if (!res.ok) {
                console.error(`Lỗi gọi API: Mã lỗi ${res.status} - ${res.statusText}`);
                const errorData = await res.json().catch(() => ({}));
                window.showAppNotification?.(errorData.message || "Không thể tải dữ liệu dashboard.");
                if (res.status === 401 || res.status === 403) {
                    showAppNotification("Phiên đăng nhập hết hạn hoặc bạn không có quyền truy cập!");
                    // Có thể thực hiện tự động đăng xuất ở đây
                }
                return;
            }

            const responseData = await res.json();
            console.log("Dữ liệu trả về từ Backend:", responseData); // KIỂM TRA LOG NÀY ĐỂ XEM DATA CÓ BỊ RỖNG KHÔNG

            if (responseData.success) {
                // Hỗ trợ trường hợp data được bọc trong object "data" hoặc nằm trực tiếp ngoài response
                const kpiData = responseData.kpi || responseData.data?.kpi;
                const chartData = responseData.chart || responseData.data?.chart;
                const pendingTopics = responseData.pendingTopicsList || responseData.data?.pendingTopicsList;

                if (kpiData) {
                    const selectedSemester = document.getElementById("semesterSelect");
                    latestDashboardReport = {
                        semesterName: responseData.selectedSemester?.name ||
                            (semester === "all"
                                ? "Toàn bộ học kỳ"
                                : selectedSemester?.selectedOptions?.[0]?.textContent?.trim() || "Học kỳ được chọn"),
                        kpi: kpiData,
                        chart: chartData || {},
                        pendingTopics: Array.isArray(pendingTopics) ? pendingTopics : []
                    };
                    if (exportReportBtn) exportReportBtn.disabled = false;
                    renderKPIs(kpiData);
                    renderDoughnutChart(kpiData);
                } else {
                    console.warn("Không tìm thấy object 'kpi' trong dữ liệu trả về.");
                }

                if (chartData) {
                    renderLineChart(chartData);
                }

                renderPendingTable(pendingTopics || []);
            } else {
                console.error("API trả về thành công nhưng success = false:", responseData.message);
                showAppNotification("Không thể tải dữ liệu: " + responseData.message);
            }
        } catch (error) {
            console.error("Không thể kết nối đến máy chủ Backend:", error);
            window.showAppNotification?.("Không thể kết nối đến máy chủ để tải dashboard.");
        }
    }

    async function loadSemesterOptions(select) {
        select.disabled = true;
        select.replaceChildren();
        const loadingOption = document.createElement("option");
        loadingOption.textContent = "Đang tải học kỳ...";
        loadingOption.value = "";
        select.append(loadingOption);

        try {
            const response = await apiFetch(`${API_BASE_URL}/semesters`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const result = await response.json();
            if (!response.ok || !result.success || !Array.isArray(result.data)) {
                throw new Error(result.message || "Không thể tải danh sách học kỳ.");
            }

            const semesters = result.data.filter(semester => semester?._id && semester.name);
            select.replaceChildren();
            const allOption = document.createElement("option");
            allOption.value = "all";
            allOption.textContent = "Toàn bộ học kỳ";
            select.append(allOption);

            semesters.forEach(semester => {
                const option = document.createElement("option");
                option.value = semester._id;
                option.textContent = semester.name;
                select.append(option);
            });

            const activeSemester = semesters.find(semester => semester.is_active);
            select.value = activeSemester?._id || "all";
            select.disabled = false;
            if (semesters.length && !activeSemester) {
                window.showAppNotification?.(
                    "Chưa có học kỳ đang hoạt động; dashboard đang hiển thị toàn bộ học kỳ."
                );
            }
            return select.value;
        } catch (error) {
            const errorOption = document.createElement("option");
            errorOption.value = "";
            errorOption.textContent = "Không tải được học kỳ";
            select.replaceChildren(errorOption);
            console.error("Không thể tải danh sách học kỳ:", error);
            window.showAppNotification?.(error.message || "Không thể tải danh sách học kỳ.");
            return null;
        }
    }

    // =========================================================================
    // 4. CÁC HÀM CẬP NHẬT GIAO DIỆN HTML
    // =========================================================================

    // A. Cập nhật 5 Thẻ KPI
    function renderKPIs(kpi) {
        const updateElement = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = Number(value || 0).toLocaleString('vi-VN');
        };

        updateElement("kpiStudents", kpi.totalStudents);
        updateElement("kpiLecturers", kpi.totalLecturers);
        updateElement("kpiTotalTopics", kpi.totalTopics);
        updateElement("kpiApprovedTopics", kpi.approvedTopics);
        updateElement("kpiPendingTopics", kpi.pendingTopics);

        const ratioEl = document.getElementById("kpiApprovedRatio");
        if (ratioEl) {
            const lecturerApproved = Number(kpi.approvedBySource?.lecturer || 0);
            const studentApproved = Number(kpi.approvedBySource?.student || 0);

            if (lecturerApproved === 0 && studentApproved === 0) {
                ratioEl.innerHTML = '<span class="mini-stat"><i class="fa-solid fa-chalkboard-user"></i> GV: 0</span><span class="mini-stat"><i class="fa-solid fa-user-graduate"></i> SV: 0</span>';
            } else {
                ratioEl.innerHTML = `
                    <span class="mini-stat"><i class="fa-solid fa-chalkboard-user"></i> GV: ${lecturerApproved}</span>
                    <span class="mini-stat"><i class="fa-solid fa-user-graduate"></i> SV: ${studentApproved}</span>
                `;
            }
        }
    }

    // B. Vẽ Biểu đồ đường (Đăng ký theo tháng)
    function renderLineChart(chartData) {
        const ctxRegElem = document.getElementById('registrationChart');
        if (!ctxRegElem) return;

        if (registrationChartInstance) {
            registrationChartInstance.destroy();
        }

        const labels = chartData?.monthLabels || ['Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8'];
        const values = chartData?.monthlyRegistrations || [0, 0, 0, 0, 0, 0];

        const ctxReg = ctxRegElem.getContext('2d');
        registrationChartInstance = new Chart(ctxReg, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Số đề tài đăng ký',
                    data: values,
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.08)',
                    borderWidth: 2.5,
                    pointBackgroundColor: '#2563eb',
                    pointRadius: 4,
                    tension: 0.3,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { precision: 0 } },
                    x: { grid: { display: false } }
                }
            }
        });
    }

    // C. Vẽ Biểu đồ Tròn (Tỷ lệ trạng thái đề tài)
    function renderDoughnutChart(kpi) {
        const ctxStatusElem = document.getElementById('statusChart');
        if (!ctxStatusElem || !kpi) return;

        if (statusChartInstance) {
            statusChartInstance.destroy();
        }

        const total = Number(kpi.totalTopics || 0);
        const approved = Number(kpi.approvedTopics || 0);
        const pending = Number(kpi.pendingTopics || 0);
        const rejected = Number(kpi.rejectedTopics || 0);
        const inProgress = Number(kpi.inProgressTopics || 0); // Thêm field nếu DB bạn có

        const doughnutTotalEl = document.getElementById("doughnutTotal");
        if (doughnutTotalEl) doughnutTotalEl.textContent = total;

        const calcPercent = (val) => total > 0 ? ((val / total) * 100).toFixed(1) + '%' : '0%';

        const statusData = {
            labels: ['Đã phê duyệt', 'Chờ phê duyệt', 'Bị từ chối', 'Đang thực hiện'],
            values: [approved, pending, rejected, inProgress],
            percentages: [
                calcPercent(approved),
                calcPercent(pending),
                calcPercent(rejected),
                calcPercent(inProgress)
            ],
            colors: ['#10b981', '#f59e0b', '#ef4444', '#3b82f6']
        };

        const ctxStatus = ctxStatusElem.getContext('2d');
        statusChartInstance = new Chart(ctxStatus, {
            type: 'doughnut',
            data: {
                labels: statusData.labels,
                datasets: [{
                    data: statusData.values,
                    backgroundColor: statusData.colors,
                    borderWidth: 0,
                    cutout: '72%'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } }
            }
        });

        // Tạo Legend tùy chỉnh bên dưới biểu đồ
        const legendContainer = document.getElementById('statusLegend');
        if (legendContainer) {
            legendContainer.innerHTML = '';
            statusData.labels.forEach((label, index) => {
                if (statusData.values[index] > 0 || total === 0) { // Tối ưu: Chỉ hiển thị các trạng thái có dữ liệu
                    const item = document.createElement('div');
                    item.className = 'legend-item';
                    item.innerHTML = `
                        <div class="legend-left">
                            <span class="dot" style="background-color: ${statusData.colors[index]}"></span>
                            <span>${label}</span>
                        </div>
                        <strong>${statusData.values[index]} (${statusData.percentages[index]})</strong>
                    `;
                    legendContainer.appendChild(item);
                }
            });
        }
    }

    // D. Đổ dữ liệu vào bảng đề tài nhóm chờ giảng viên xử lý
    function renderPendingTable(pendingList) {
        const tbody = document.getElementById("pendingTopicsTable");
        if (!tbody) return;

        if (!Array.isArray(pendingList) || pendingList.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; color: #6b7280; padding: 20px;">
                        Hiện không có đề tài nhóm nào đang chờ giảng viên xử lý.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = pendingList.map(t => `
            <tr>
                <td><strong>${t.topic_code || 'Chưa có'}</strong></td>
                <td>${t.title || 'N/A'}</td>
                <td>MSSV: ${t.leader_code || 'N/A'}</td>
                <td>GV: ${t.lecturer_code || t.lecturer_name || 'N/A'}</td>
            </tr>
        `).join('');
    }

    // =========================================================================
    // 5. LẮP SỰ KIỆN VÀ KHỞI CHẠY TẢI DỮ LIỆU
    // =========================================================================

    function csvCell(value) {
        let text = value == null ? "" : String(value);
        if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
        return `"${text.replace(/"/g, '""')}"`;
    }

    if (exportReportBtn) {
        exportReportBtn.addEventListener("click", () => {
            if (!latestDashboardReport) {
                window.showAppNotification?.("Chưa có dữ liệu dashboard để xuất báo cáo.");
                return;
            }

            try {
                const { semesterName, kpi, chart, pendingTopics } = latestDashboardReport;
                const rows = [
                    ["BÁO CÁO TỔNG QUAN HỆ THỐNG"],
                    ["Học kỳ", semesterName],
                    ["Thời điểm xuất", new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })],
                    [],
                    ["Chỉ số", "Số lượng"],
                    ["Sinh viên", kpi.totalStudents],
                    ["Giảng viên", kpi.totalLecturers],
                    ["Đề tài đăng ký", kpi.totalTopics],
                    ["Đã phê duyệt", kpi.approvedTopics],
                    ["Chờ phê duyệt", kpi.pendingTopics],
                    ["Bị từ chối", kpi.rejectedTopics],
                    ["Yêu cầu chỉnh sửa", kpi.needRevisionTopics],
                    ["Đề tài đang thực hiện", kpi.inProgressTopics],
                    ["Đề tài duyệt từ giảng viên", kpi.approvedBySource?.lecturer],
                    ["Đề tài duyệt từ sinh viên", kpi.approvedBySource?.student],
                    [],
                    ["Đăng ký theo tháng"],
                    ["Tháng", "Số đề tài"]
                ];

                (chart.monthLabels || []).forEach((label, index) => {
                    rows.push([label, chart.monthlyRegistrations?.[index] ?? 0]);
                });

                rows.push(
                    [],
                    ["5 đề tài gần nhất chờ xử lý"],
                    ["Mã đề tài", "Tên đề tài", "MSSV trưởng nhóm", "Giảng viên hướng dẫn"]
                );
                pendingTopics.forEach(topic => {
                    rows.push([
                        topic.topic_code || "",
                        topic.title || "",
                        topic.leader_code || "",
                        topic.lecturer_name || topic.lecturer_code || ""
                    ]);
                });

                const csv = `\uFEFF${rows.map(row => row.map(csvCell).join(",")).join("\r\n")}`;
                const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
                const downloadUrl = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = downloadUrl;
                link.download = `bao-cao-tong-quan-${new Date().toISOString().slice(0, 10)}.csv`;
                document.body.appendChild(link);
                link.click();
                link.remove();
                window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
                window.showAppNotification?.("Đã tải báo cáo tổng quan dạng CSV.");
            } catch (error) {
                console.error("Không thể tạo báo cáo dashboard:", error);
                window.showAppNotification?.("Không thể tạo báo cáo. Vui lòng thử lại.");
            }
        });
    }

    // Tải dữ liệu ban đầu
    const semesterSelect = document.getElementById("semesterSelect");
    if (semesterSelect) {
        const initialSemester = await loadSemesterOptions(semesterSelect);
        if (initialSemester) await fetchDashboardData(initialSemester);
        semesterSelect.addEventListener("change", event => {
            if (event.target.value) fetchDashboardData(event.target.value);
        });
    } else {
        await fetchDashboardData("all");
    }

    // Xử lý Modal Đăng xuất
    const logoutBtn = document.getElementById("logoutBtn");
    const logoutModal = document.getElementById("logoutModal");
    const cancelLogoutBtn = document.getElementById("cancelLogoutBtn");
    const confirmLogoutBtn = document.getElementById("confirmLogoutBtn");

    if (logoutBtn && logoutModal) {
        logoutBtn.addEventListener("click", (e) => {
            e.preventDefault();
            logoutModal.classList.add("active"); // Thường sử dụng class để trigger CSS animation
            logoutModal.style.display = "flex"; // Fallback nếu không dùng class
        });
    }

    if (cancelLogoutBtn && logoutModal) {
        cancelLogoutBtn.addEventListener("click", () => {
            logoutModal.classList.remove("active");
            logoutModal.style.display = "none";
        });
    }

    if (confirmLogoutBtn) {
        confirmLogoutBtn.addEventListener("click", () => {
            localStorage.removeItem("adminAuth");
            
            // Xóa luôn các token chuẩn nếu admin dùng chung luồng
            if (localStorage.getItem("token") && localStorage.getItem("user")) {
                const tempUser = JSON.parse(localStorage.getItem("user") || "{}");
                if (tempUser.role === "ADMIN") {
                    localStorage.removeItem("token");
                    localStorage.removeItem("user");
                }
            }

            if (localStorage.getItem("activeRole") === "ADMIN") {
                localStorage.removeItem("activeRole");
            }
            
            sessionStorage.clear();
            window.location.href = "../auth/index.html";
        });
    }

    window.addEventListener("click", (e) => {
        if (logoutModal && e.target === logoutModal) {
            logoutModal.classList.remove("active");
            logoutModal.style.display = "none";
        }
    });
});