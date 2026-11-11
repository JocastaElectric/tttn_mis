function getRoleStorageKey(role) {
    return {
        STUDENT: "studentAuth",
        LECTURER: "lecturerAuth",
        ADMIN: "adminAuth"
    }[role] || "auth";
}

function persistAuthForRole(role, token, user) {
    const key = getRoleStorageKey(role);
    const auth = { token, user };

    sessionStorage.setItem("activeAuth", JSON.stringify(auth));
    localStorage.setItem(key, JSON.stringify(auth));
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
    localStorage.setItem("activeRole", role);
}

function clearAuthForRole(role) {
    const key = getRoleStorageKey(role);
    localStorage.removeItem(key);

    const activeRole = localStorage.getItem("activeRole");
    if (activeRole === role) {
        localStorage.removeItem("activeRole");
    }

    const remainingRoleKeys = [
        { role: "STUDENT", key: "studentAuth" },
        { role: "LECTURER", key: "lecturerAuth" },
        { role: "ADMIN", key: "adminAuth" }
    ];

    const activeAuth = remainingRoleKeys
        .map(({ key }) => localStorage.getItem(key))
        .find(Boolean);

    if (activeAuth) {
        try {
            const parsed = JSON.parse(activeAuth);
            if (parsed && parsed.token && parsed.user) {
                localStorage.setItem("token", parsed.token);
                localStorage.setItem("user", JSON.stringify(parsed.user));
                localStorage.setItem("activeRole", remainingRoleKeys.find(({ key }) => localStorage.getItem(key) === activeAuth)?.role || "STUDENT");
            }
        } catch (error) {
            console.warn("Không thể phục hồi auth còn lại:", error);
        }
    } else {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        localStorage.removeItem("activeRole");
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const campusClockHands = document.querySelectorAll("[data-clock-hand]");
    if (campusClockHands.length > 0) {
        const updateCampusClock = () => {
            const now = new Date();
            const seconds = now.getSeconds() + now.getMilliseconds() / 1000;
            const minutes = now.getMinutes() + seconds / 60;
            const hours = (now.getHours() % 12) + minutes / 60;
            const angles = {
                hour: hours * 30,
                minute: minutes * 6,
                second: seconds * 6
            };

            campusClockHands.forEach((hand) => {
                const angle = angles[hand.dataset.clockHand];
                if (angle !== undefined) {
                    hand.setAttribute("transform", `rotate(${angle} 303 570)`);
                }
            });
        };

        const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
        let clockTimer;
        const updateAndScheduleCampusClock = () => {
            updateCampusClock();
            if (!motionPreference.matches) {
                clockTimer = window.setTimeout(
                    updateAndScheduleCampusClock,
                    1000 - (Date.now() % 1000)
                );
            }
        };

        updateAndScheduleCampusClock();
        motionPreference.addEventListener("change", (event) => {
            window.clearTimeout(clockTimer);
            if (!event.matches) updateAndScheduleCampusClock();
        });
    }

    const loginForm = document.getElementById("loginForm");
    const userCodeInput = document.getElementById("userCode");
    const passwordInput = document.getElementById("password");
    const togglePassword = document.getElementById("togglePassword");
    const errorMessage = document.getElementById("errorMessage");
    const submitBtn = document.getElementById("submitBtn");
    const loginLoadingOverlay = document.getElementById("loginLoadingOverlay");

    const setLoginLoading = (isLoading) => {
        submitBtn.disabled = isLoading;
        if (loginLoadingOverlay) loginLoadingOverlay.hidden = !isLoading;
    };

    togglePassword.addEventListener("click", () => {
        const isPasswordHidden = passwordInput.type === "password";
        passwordInput.type = isPasswordHidden ? "text" : "password";
        togglePassword.classList.toggle("is-visible", isPasswordHidden);
        togglePassword.setAttribute(
            "aria-label",
            isPasswordHidden ? "Ẩn mật khẩu" : "Hiện mật khẩu"
        );
        togglePassword.setAttribute(
            "title",
            isPasswordHidden ? "Ẩn mật khẩu" : "Hiện mật khẩu"
        );
    });

    // Hàm hiển thị lỗi
    const showError = (message) => {
        errorMessage.textContent = message;
        errorMessage.style.display = "block";
    };

    // Hàm ẩn lỗi
    const clearError = () => {
        errorMessage.textContent = "";
        errorMessage.style.display = "none";
    };

    // Bắt sự kiện khi Submit Form
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault(); // Chặn hành vi tải lại trang mặc định của Form
        clearError();

        const user_code = userCodeInput.value.trim();
        const password = passwordInput.value.trim();

        if (!user_code || !password) {
            showError("Vui lòng nhập đầy đủ mã định danh và mật khẩu!");
            return;
        }

        setLoginLoading(true);

        try {
            // Gửi request tới Backend API (Đổi cổng thành cổng thực tế của bạn sau này)
            const response = await fetch("http://localhost:5000/api/auth/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ user_code, password })
            });

            const data = await response.json();

            // Nếu Server trả về lỗi (400, 401, 404, 500...)
            if (!response.ok) {
                showError(data.message || "Tài khoản hoặc mật khẩu không chính xác!");
                setLoginLoading(false);
                return;
            }

            // --- NẾU ĐĂNG NHẬP THÀNH CÔNG ---
            
            // 1. Lưu JWT Token và User Info vào LocalStorage theo role riêng
            persistAuthForRole(data.user.role, data.token, data.user);

            // 2. Điều hướng trang theo Role (STUDENT, LECTURER, ADMIN)
            setTimeout(() => {
                const role = data.user.role;
                if (role === "STUDENT") {
                    window.location.href = "../student/student-dashboard.html";
                } else if (role === "LECTURER") {
                    window.location.href = "../lecturer/lecturer-dashboard.html";
                } else if (role === "ADMIN") {
                    window.location.href = "../admin/admin-dashboard.html";
                } else {
                    showError("Quyền truy cập không hợp lệ!");
                    setLoginLoading(false);
                }
            }, 500); // Trễ nửa giây để trải nghiệm chuyển trang mượt hơn

        } catch (error) {
            console.error("Lỗi kết nối:", error);
            showError("Không thể kết nối đến máy chủ. Vui lòng kiểm tra Server!");
            setLoginLoading(false);
        }
    });

    // ===== XỬ LÝ MODAL "QUÊN MẬT KHẨU" =====
    const forgotPasswordModal = document.getElementById("forgotPasswordModal");
    const openForgotPasswordBtn = document.getElementById("openForgotPasswordBtn");
    const closeForgotPasswordBtn = document.getElementById("closeForgotPasswordBtn");
    const forgotPasswordForm = document.getElementById("forgotPasswordForm");
    const fpUserCodeInput = document.getElementById("fpUserCode");
    const fpEmailInput = document.getElementById("fpEmail");
    const forgotPasswordMessage = document.getElementById("forgotPasswordMessage");
    const fpSubmitBtn = document.getElementById("fpSubmitBtn");

    const openForgotModal = () => {
        forgotPasswordMessage.textContent = "";
        forgotPasswordMessage.className = "fp-message";
        forgotPasswordForm.reset();
        forgotPasswordModal.classList.add("active");
    };

    const closeForgotModal = () => {
        forgotPasswordModal.classList.remove("active");
    };

    if (openForgotPasswordBtn) {
        openForgotPasswordBtn.addEventListener("click", (e) => {
            e.preventDefault();
            openForgotModal();
        });
    }

    if (closeForgotPasswordBtn) {
        closeForgotPasswordBtn.addEventListener("click", closeForgotModal);
    }

    window.addEventListener("click", (e) => {
        if (e.target === forgotPasswordModal) closeForgotModal();
    });

    if (forgotPasswordForm) {
        forgotPasswordForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            const user_code = fpUserCodeInput.value.trim();
            const email = fpEmailInput.value.trim();

            forgotPasswordMessage.textContent = "";
            forgotPasswordMessage.className = "fp-message";

            if (!user_code || !email) {
                forgotPasswordMessage.textContent = "Vui lòng nhập đầy đủ Mã định danh và Email!";
                forgotPasswordMessage.classList.add("error");
                return;
            }

            fpSubmitBtn.disabled = true;
            fpSubmitBtn.innerHTML = "<span>Đang xử lý...</span>";

            try {
                const response = await fetch("http://localhost:5000/api/auth/forgot-password", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ user_code, email })
                });

                const data = await response.json();

                if (!response.ok || !data.success) {
                    forgotPasswordMessage.textContent = data.message || "Không thể khôi phục mật khẩu, vui lòng thử lại!";
                    forgotPasswordMessage.classList.add("error");
                    return;
                }

                forgotPasswordMessage.textContent = data.message;
                forgotPasswordMessage.classList.add("success");
                forgotPasswordForm.reset();
            } catch (error) {
                console.error("Lỗi kết nối:", error);
                forgotPasswordMessage.textContent = "Không thể kết nối đến máy chủ. Vui lòng kiểm tra Server!";
                forgotPasswordMessage.classList.add("error");
            } finally {
                fpSubmitBtn.disabled = false;
                fpSubmitBtn.innerHTML = "<span>Xác nhận khôi phục</span>";
            }
        });
    }
});