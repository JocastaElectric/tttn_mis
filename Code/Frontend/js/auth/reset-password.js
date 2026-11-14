document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("resetPasswordForm");
    const passwordInput = document.getElementById("newPassword");
    const confirmInput = document.getElementById("confirmPassword");
    const message = document.getElementById("resetPasswordMessage");
    const submitButton = document.getElementById("resetPasswordSubmit");
    const token = new URLSearchParams(window.location.search).get("token");

    const showMessage = (text, success = false) => {
        message.textContent = text;
        message.classList.toggle("success", success);
    };

    if (!token) {
        showMessage("Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.");
        submitButton.disabled = true;
        return;
    }

    form.addEventListener("submit", async event => {
        event.preventDefault();
        const newPassword = passwordInput.value;
        if (newPassword !== confirmInput.value) {
            showMessage("Mật khẩu nhập lại không khớp.");
            return;
        }

        submitButton.disabled = true;
        showMessage("");
        try {
            const response = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/auth/reset-password`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token, new_password: newPassword })
            });
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.message || "Không thể đặt lại mật khẩu.");
            }

            form.hidden = true;
            showMessage(result.message, true);
        } catch (error) {
            showMessage(error.message || "Không thể kết nối đến máy chủ.");
        } finally {
            submitButton.disabled = false;
        }
    });
});
