document.addEventListener("DOMContentLoaded", () => {
    const modal = document.getElementById("userImportModal");
    const openButton = document.getElementById("openImportBtn");
    if (!modal || !openButton) return;

    const kind = modal.dataset.kind;
    const fileInput = document.getElementById("importFile");
    const message = document.getElementById("importMessage");
    const summary = document.getElementById("importSummary");
    const previewTable = document.getElementById("importPreviewTable");
    const errorsList = document.getElementById("importErrors");
    const previewButton = document.getElementById("previewImportBtn");
    const importButton = document.getElementById("confirmImportBtn");

    let previewValidCount = 0;
    const endpoint = `${window.APP_CONFIG.API_BASE_URL}/api/auth/import/${kind}`;
    const columns = kind === "students"
        ? [
            ["user_code", "MSSV"],
            ["full_name", "Họ và tên"],
            ["class", "Lớp"],
            ["major", "Chuyên ngành"],
            ["email", "Email"]
        ]
        : [
            ["user_code", "MSGV"],
            ["full_name", "Họ và tên"],
            ["degree", "Học vị"],
            ["dept", "Bộ môn"],
            ["email", "Email"]
        ];

    function clearResults() {
        previewValidCount = 0;
        summary.textContent = "";
        previewTable.replaceChildren();
        errorsList.replaceChildren();
        importButton.disabled = true;
        message.textContent = "";
        message.className = "import-message";
    }

    function setMessage(text, type) {
        message.textContent = text;
        message.className = `import-message ${type || ""}`;
    }

    function renderRows(rows) {
        previewTable.replaceChildren();
        const head = document.createElement("tr");
        columns.forEach(([, label]) => {
            const cell = document.createElement("th");
            cell.textContent = label;
            head.appendChild(cell);
        });
        previewTable.appendChild(head);

        rows.slice(0, 50).forEach(row => {
            const tr = document.createElement("tr");
            columns.forEach(([key]) => {
                const cell = document.createElement("td");
                cell.textContent = row[key] || "";
                tr.appendChild(cell);
            });
            previewTable.appendChild(tr);
        });
        if (rows.length > 50) {
            const note = document.createElement("tr");
            const cell = document.createElement("td");
            cell.colSpan = columns.length;
            cell.textContent = `Đang hiển thị 50/${rows.length} dòng hợp lệ.`;
            note.appendChild(cell);
            previewTable.appendChild(note);
        }
    }

    function renderErrors(errors) {
        errorsList.replaceChildren();
        errors.forEach(error => {
            const item = document.createElement("li");
            item.textContent = `Dòng ${error.row}${error.user_code ? ` (${error.user_code})` : ""}: ${error.message}`;
            errorsList.appendChild(item);
        });
    }

    async function sendFile(url, method) {
        if (!await window.verifyAuthSession("ADMIN")) {
            throw new Error("Không thể xác minh phiên Admin.");
        }
        if (!fileInput.files[0]) throw new Error("Vui lòng chọn file Excel.");

        const formData = new FormData();
        formData.append("file", fileInput.files[0]);
        const response = await apiFetch(url, {
            method,
            body: formData
        });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || "Không thể xử lý file Excel.");
        return result.data;
    }

    openButton.addEventListener("click", () => {
        clearResults();
        fileInput.value = "";
        modal.style.display = "flex";
    });
    document.getElementById("closeImportModal").addEventListener("click", () => {
        modal.style.display = "none";
    });
    document.getElementById("cancelImportModal").addEventListener("click", () => {
        modal.style.display = "none";
    });
    fileInput.addEventListener("change", clearResults);

    document.getElementById("downloadTemplateBtn").addEventListener("click", async () => {
        try {
            if (!await window.verifyAuthSession("ADMIN")) return;
            const response = await apiFetch(`${endpoint}/template`);
            if (!response.ok) {
                const result = await response.json();
                throw new Error(result.message || "Không tải được file mẫu.");
            }
            const blob = await response.blob();
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = kind === "students" ? "mau-import-sinh-vien.xlsx" : "mau-import-giang-vien.xlsx";
            link.click();
            setTimeout(() => URL.revokeObjectURL(link.href), 0);
        } catch (error) {
            setMessage(error.message, "error");
        }
    });

    previewButton.addEventListener("click", async () => {
        clearResults();
        previewButton.disabled = true;
        try {
            const data = await sendFile(`${endpoint}/preview`, "POST");
            previewValidCount = data.valid_count;
            summary.textContent = `Tổng ${data.total_rows} dòng: ${data.valid_count} hợp lệ, ${data.error_count} có lỗi.`;
            renderRows(data.rows);
            renderErrors(data.errors);
            importButton.disabled = previewValidCount === 0;
            setMessage(
                previewValidCount ? "Hãy kiểm tra dữ liệu trước khi xác nhận import." : "Không có dòng hợp lệ để import.",
                previewValidCount ? "success" : "error"
            );
        } catch (error) {
            setMessage(error.message, "error");
        } finally {
            previewButton.disabled = false;
        }
    });

    importButton.addEventListener("click", async () => {
        if (!previewValidCount) return;
        const confirmed = await window.showConfirmDialog({
            title: "Xác nhận import Excel",
            message: `Bạn có chắc muốn import ${previewValidCount} dòng hợp lệ? Các dòng lỗi sẽ được bỏ qua.`,
            confirmText: "Bắt đầu import"
        });
        if (!confirmed) return;
        importButton.disabled = true;
        previewButton.disabled = true;
        try {
            const data = await sendFile(endpoint, "POST");
            summary.textContent = `Đã nhập ${data.imported_count}/${data.total_rows} tài khoản.`;
            renderErrors(data.errors);
            setMessage(data.message, data.imported_count ? "success" : "error");
            previewValidCount = 0;
            if (data.imported_count) {
                window.dispatchEvent(new CustomEvent("users-imported"));
            }
        } catch (error) {
            setMessage(error.message, "error");
            importButton.disabled = false;
        } finally {
            previewButton.disabled = false;
        }
    });
});
