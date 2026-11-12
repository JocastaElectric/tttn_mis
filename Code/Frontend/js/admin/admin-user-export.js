document.addEventListener("DOMContentLoaded", () => {
    const modal = document.getElementById("userImportModal");
    const button = document.getElementById("exportBtn");
    if (!modal || !button) return;

    const kind = modal.dataset.kind;
    const filename = kind === "students"
        ? "danh-sach-sinh-vien.xlsx"
        : "danh-sach-giang-vien.xlsx";

    button.addEventListener("click", async () => {
        let token;
        try {
            const auth = JSON.parse(sessionStorage.getItem("activeAuth") || "null");
            token = auth?.user?.role === "ADMIN" ? auth.token : null;
        } catch (error) {
            console.error("Không thể đọc phiên đăng nhập quản trị viên:", error);
        }

        if (!token) {
            window.showAppNotification?.("Phiên Admin không hợp lệ. Vui lòng đăng nhập lại.");
            return;
        }

        const originalLabel = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xuất...';
        try {
            const response = await fetch(`${window.APP_CONFIG.API_BASE_URL}/api/auth/${kind}/export`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!response.ok) {
                const result = await response.json().catch(() => ({}));
                throw new Error(result.message || "Không thể xuất danh sách Excel.");
            }

            const blob = await response.blob();
            if (!blob.size) throw new Error("File Excel tải về đang trống.");
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            window.showAppNotification?.("Đã xuất danh sách Excel thành công.");
        } catch (error) {
            console.error("Lỗi xuất danh sách Excel:", error);
            window.showAppNotification?.(error.message || "Không thể xuất danh sách Excel.");
        } finally {
            button.disabled = false;
            button.innerHTML = originalLabel;
        }
    });
});
