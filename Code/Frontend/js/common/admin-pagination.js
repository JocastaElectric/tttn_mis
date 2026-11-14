(function () {
    window.renderAdminPagination = function (container, currentPage, totalPages, onPageChange) {
        container.innerHTML = "";
        container.style.display = totalPages > 0 ? "flex" : "none";
        if (totalPages < 1) return;

        const appendButton = (label, page, options) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = `page-btn${options.active ? " active" : ""}`;
            button.disabled = options.disabled;
            button.setAttribute("aria-label", options.ariaLabel);
            if (options.active) button.setAttribute("aria-current", "page");

            if (options.icon) {
                const icon = document.createElement("i");
                icon.className = `fa-solid ${options.icon}`;
                button.appendChild(icon);
            } else {
                button.textContent = label;
            }

            if (!options.disabled && !options.active) {
                button.addEventListener("click", () => onPageChange(page));
            }
            container.appendChild(button);
        };

        appendButton("", currentPage - 1, {
            disabled: currentPage <= 1,
            active: false,
            ariaLabel: "Trang trước",
            icon: "fa-chevron-left"
        });

        const pages = new Set([1, totalPages]);
        for (let page = Math.max(1, currentPage - 1); page <= Math.min(totalPages, currentPage + 1); page++) {
            pages.add(page);
        }

        let previousPage = 0;
        [...pages].sort((a, b) => a - b).forEach(page => {
            if (previousPage && page - previousPage > 1) {
                const ellipsis = document.createElement("span");
                ellipsis.className = "page-ellipsis";
                ellipsis.textContent = "...";
                container.appendChild(ellipsis);
            }
            appendButton(String(page), page, {
                disabled: false,
                active: page === currentPage,
                ariaLabel: `Trang ${page}`
            });
            previousPage = page;
        });

        appendButton("", currentPage + 1, {
            disabled: currentPage >= totalPages,
            active: false,
            ariaLabel: "Trang sau",
            icon: "fa-chevron-right"
        });
    };
})();
