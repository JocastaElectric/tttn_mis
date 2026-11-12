(() => {
    const logoutBtn = document.getElementById("logoutBtn");
    const logoutModal = document.getElementById("logoutModal");
    const cancelLogoutBtn = document.getElementById("cancelLogoutBtn");
    const confirmLogoutBtn = document.getElementById("confirmLogoutBtn");

    if (!logoutBtn || !logoutModal || !cancelLogoutBtn || !confirmLogoutBtn) return;

    const closeModal = () => {
        logoutModal.style.display = "none";
    };

    logoutBtn.addEventListener("click", event => {
        event.preventDefault();
        logoutModal.style.display = "flex";
    });

    cancelLogoutBtn.addEventListener("click", closeModal);
    confirmLogoutBtn.addEventListener("click", () => {
        localStorage.removeItem("lecturerAuth");
        if (localStorage.getItem("activeRole") === "LECTURER") {
            localStorage.removeItem("activeRole");
        }
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        sessionStorage.clear();
        window.location.href = "../auth/index.html";
    });

    window.addEventListener("click", event => {
        if (event.target === logoutModal) closeModal();
    });

    window.addEventListener("keydown", event => {
        if (event.key === "Escape" && logoutModal.style.display === "flex") closeModal();
    });
})();
