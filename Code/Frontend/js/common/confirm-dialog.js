(function () {
    function getDialog() {
        let overlay = document.getElementById("adminConfirmOverlay");
        if (overlay) return overlay;

        overlay = document.createElement("div");
        overlay.id = "appConfirmOverlay";
        overlay.className = "confirm-dialog-overlay";
        overlay.hidden = true;
        overlay.innerHTML = `
            <section class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="appConfirmTitle" aria-describedby="appConfirmMessage">
                <div class="confirm-dialog-icon"><i class="fa-solid fa-circle-question"></i></div>
                <h2 id="appConfirmTitle"></h2>
                <p id="appConfirmMessage"></p>
                <div class="confirm-dialog-actions">
                    <button type="button" class="confirm-dialog-cancel">Hủy</button>
                    <button type="button" class="confirm-dialog-accept">Xác nhận</button>
                </div>
            </section>`;
        document.body.appendChild(overlay);
        return overlay;
    }

    function openDialog(options, singleAction) {
        const settings = options || {};
        const overlay = getDialog();
        const cancelButton = overlay.querySelector(".confirm-dialog-cancel");
        const acceptButton = overlay.querySelector(".confirm-dialog-accept");
        const previousFocus = document.activeElement;

        overlay.querySelector("#appConfirmTitle").textContent = settings.title || "Xác nhận";
        overlay.querySelector("#appConfirmMessage").textContent = settings.message || "";
        cancelButton.textContent = settings.cancelText || "Hủy";
        acceptButton.textContent = settings.confirmText || "Xác nhận";
        acceptButton.classList.toggle("danger", Boolean(settings.danger));
        cancelButton.hidden = singleAction;
        overlay.hidden = false;

        return new Promise(resolve => {
            const finish = confirmed => {
                overlay.hidden = true;
                cancelButton.removeEventListener("click", onCancel);
                acceptButton.removeEventListener("click", onAccept);
                overlay.removeEventListener("click", onOverlayClick);
                document.removeEventListener("keydown", onKeyDown);
                if (previousFocus && typeof previousFocus.focus === "function") previousFocus.focus();
                resolve(confirmed);
            };
            const onCancel = () => finish(false);
            const onAccept = () => finish(true);
            const onOverlayClick = event => {
                if (event.target === overlay) finish(false);
            };
            const onKeyDown = event => {
                if (event.key === "Escape") finish(false);
            };

            cancelButton.addEventListener("click", onCancel);
            acceptButton.addEventListener("click", onAccept);
            overlay.addEventListener("click", onOverlayClick);
            document.addEventListener("keydown", onKeyDown);
            cancelButton.focus();
        });
    }

    window.showConfirmDialog = options => openDialog(options, false);
    window.showMessageDialog = (message, title) => openDialog({
        title: title || "Thông báo",
        message,
        confirmText: "Đóng"
    }, true);
})();
