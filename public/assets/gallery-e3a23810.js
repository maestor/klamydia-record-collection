"use strict";
(() => {
    const gallery = document.querySelector(".gallery");
    if (!gallery || gallery.dataset.ready === "true")
        return;
    const slides = Array.from(gallery.querySelectorAll(".gallery-slide"));
    const links = slides.map((slide) => slide.querySelector(".gallery-image"));
    if (!slides.length || links.some((link) => !link))
        return;
    const data = gallery.dataset;
    const format = (template, current) => template
        .replace("{current}", String(current))
        .replace("{total}", String(slides.length));
    const button = (label) => {
        const element = document.createElement("button");
        element.type = "button";
        element.textContent = label;
        return element;
    };
    let current = 0;
    let suppressClick = false;
    let pointerStart = null;
    const thumbnails = [];
    const status = document.createElement("p");
    status.className = "gallery-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.setAttribute("aria-atomic", "true");
    const update = (index) => {
        current = (index + slides.length) % slides.length;
        slides.forEach((slide, position) => {
            slide.hidden = position !== current;
        });
        thumbnails.forEach((thumb, position) => {
            thumb.setAttribute("aria-pressed", String(position === current));
        });
        status.textContent = format(data.status ?? "", current + 1);
    };
    if (slides.length > 1) {
        const controls = document.createElement("div");
        controls.className = "gallery-controls";
        const previous = button(data.previous ?? "");
        const next = button(data.next ?? "");
        previous.addEventListener("click", () => update(current - 1));
        next.addEventListener("click", () => update(current + 1));
        controls.append(previous, status, next);
        const strip = document.createElement("div");
        strip.className = "gallery-thumbnails";
        links.forEach((link, index) => {
            if (!link)
                return;
            const thumb = button("");
            thumb.className = "gallery-thumbnail";
            thumb.setAttribute("aria-label", format(data.thumbnail ?? "", index + 1));
            const preview = link.dataset.preview;
            if (preview) {
                const image = document.createElement("img");
                image.alt = "";
                image.loading = "lazy";
                image.src = preview;
                image.addEventListener("error", () => {
                    image.hidden = true;
                });
                thumb.append(image);
            }
            else {
                thumb.classList.add("no-preview");
            }
            const number = document.createElement("span");
            number.textContent = String(index + 1);
            thumb.append(number);
            thumb.addEventListener("click", () => update(index));
            thumbnails.push(thumb);
            strip.append(thumb);
        });
        gallery.append(controls, strip);
        gallery.addEventListener("keydown", (event) => {
            if (event.target instanceof Element && event.target.closest("dialog"))
                return;
            if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                event.preventDefault();
                update(current + (event.key === "ArrowRight" ? 1 : -1));
            }
        });
        gallery.addEventListener("pointerdown", (event) => {
            if (event.pointerType === "touch" &&
                event.target instanceof Element &&
                event.target.closest(".gallery-slide"))
                pointerStart = {
                    x: event.clientX,
                    y: event.clientY,
                    id: event.pointerId,
                };
        });
        gallery.addEventListener("pointerup", (event) => {
            if (!pointerStart || pointerStart.id !== event.pointerId)
                return;
            const dx = event.clientX - pointerStart.x, dy = event.clientY - pointerStart.y;
            pointerStart = null;
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                suppressClick = true;
                update(current + (dx < 0 ? 1 : -1));
                window.setTimeout(() => {
                    suppressClick = false;
                }, 500);
            }
        });
        gallery.addEventListener("pointercancel", () => {
            pointerStart = null;
        });
        gallery.addEventListener("click", (event) => {
            if (suppressClick &&
                event.target instanceof Element &&
                event.target.closest(".gallery-slide")) {
                event.preventDefault();
                event.stopPropagation();
                suppressClick = false;
            }
        }, true);
    }
    if (typeof HTMLDialogElement !== "undefined" &&
        typeof HTMLDialogElement.prototype.showModal === "function") {
        const dialog = document.createElement("dialog");
        dialog.className = "image-viewer";
        dialog.setAttribute("aria-label", data.dialog ?? "");
        const close = button(data.close ?? "");
        close.className = "viewer-close";
        const image = document.createElement("img");
        image.alt = "";
        const error = document.createElement("p");
        error.textContent = data.unavailable ?? "";
        error.hidden = true;
        error.setAttribute("role", "status");
        const fullLink = document.createElement("a");
        fullLink.textContent = data.original ?? "";
        fullLink.className = "viewer-original";
        let opener = null;
        image.addEventListener("error", () => {
            image.hidden = true;
            error.hidden = false;
        });
        close.addEventListener("click", () => dialog.close());
        dialog.addEventListener("keydown", (event) => {
            if (event.key !== "Tab")
                return;
            if (event.shiftKey && document.activeElement === close) {
                event.preventDefault();
                fullLink.focus();
            }
            else if (!event.shiftKey && document.activeElement === fullLink) {
                event.preventDefault();
                close.focus();
            }
        });
        dialog.addEventListener("close", () => {
            image.removeAttribute("src");
            opener?.focus();
        });
        dialog.append(close, image, error, fullLink);
        gallery.append(dialog);
        const openViewer = (link, trigger) => {
            opener = trigger;
            image.hidden = false;
            error.hidden = true;
            image.alt = link.dataset.alt ?? "";
            fullLink.setAttribute("href", link.getAttribute("href") ?? link.href);
            try {
                dialog.showModal();
                image.src = link.href;
                close.focus();
                return true;
            }
            catch {
                opener = null;
                return false;
            }
        };
        links.forEach((link) => {
            link?.addEventListener("click", (event) => {
                if (event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey)
                    return;
                if (openViewer(link, link))
                    event.preventDefault();
            });
        });
        const enlarge = button(data.enlarge ?? "");
        enlarge.className = "gallery-enlarge";
        enlarge.addEventListener("click", () => {
            const link = links[current];
            if (link && !openViewer(link, enlarge))
                window.location.assign(link.href);
        });
        gallery.insertBefore(enlarge, gallery.querySelector(".gallery-controls") ?? dialog);
    }
    update(0);
    gallery.dataset.ready = "true";
})();
