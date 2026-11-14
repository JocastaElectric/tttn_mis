document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("#pendingTopicsBadge, #pendingBadgeCount").forEach(badge => badge.remove());

    const layout = document.querySelector(".app-container");
    const sidebar = layout?.querySelector(".sidebar");
    const toggleButton = layout?.querySelector(".btn-toggle-sidebar");
    if (!layout || !sidebar || !toggleButton) return;

    const mobileQuery = window.matchMedia("(max-width: 1024px)");
    const backdrop = document.createElement("button");
    backdrop.type = "button";
    backdrop.className = "sidebar-backdrop";
    backdrop.setAttribute("aria-label", "Đóng menu");
    backdrop.hidden = true;
    document.body.appendChild(backdrop);

    const setOpen = isOpen => {
        layout.classList.toggle("sidebar-open", isOpen);
        backdrop.hidden = !isOpen;
        backdrop.classList.toggle("is-visible", isOpen);
        toggleButton.setAttribute("aria-expanded", String(isOpen));
    };

    toggleButton.setAttribute("aria-expanded", "false");
    toggleButton.setAttribute("aria-label", "Mở menu");
    toggleButton.addEventListener("click", () => {
        if (mobileQuery.matches) setOpen(!layout.classList.contains("sidebar-open"));
    });
    backdrop.addEventListener("click", () => setOpen(false));
    sidebar.addEventListener("click", event => {
        if (mobileQuery.matches && event.target.closest("a")) setOpen(false);
    });
    const closeOnDesktop = () => {
        if (!mobileQuery.matches) setOpen(false);
    };
    if (mobileQuery.addEventListener) {
        mobileQuery.addEventListener("change", closeOnDesktop);
    } else {
        mobileQuery.addListener(closeOnDesktop);
    }
});