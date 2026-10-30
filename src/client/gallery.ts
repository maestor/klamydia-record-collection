(() => {
	const gallery = document.querySelector<HTMLElement>(".gallery");
	if (!gallery || gallery.dataset.ready === "true") return;
	const slides = Array.from(
		gallery.querySelectorAll<HTMLElement>(".gallery-slide"),
	);
	const links = slides.map((slide) =>
		slide.querySelector<HTMLAnchorElement>(".gallery-image"),
	);
	if (!slides.length || links.some((link) => !link)) return;
	const data = gallery.dataset;
	const format = (template: string, current: number) =>
		template
			.replace("{current}", String(current))
			.replace("{total}", String(slides.length));
	const button = (label: string) => {
		const element = document.createElement("button");
		element.type = "button";
		element.textContent = label;
		return element;
	};
	const iconButton = (label: string, path: string) => {
		const element = button("");
		element.className = "gallery-icon";
		element.setAttribute("aria-label", label);
		element.title = label;
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.setAttribute("viewBox", "0 0 24 24");
		svg.setAttribute("aria-hidden", "true");
		const drawing = document.createElementNS(
			"http://www.w3.org/2000/svg",
			"path",
		);
		drawing.setAttribute("d", path);
		svg.append(drawing);
		element.append(svg);
		return element;
	};
	const stage = document.createElement("div");
	stage.className = "gallery-stage";
	const slideList = slides[0].parentElement as HTMLOListElement;
	slideList.before(stage);
	stage.append(slideList);
	let current = 0;
	let suppressClick = false;
	let pointerStart: { x: number; y: number; id: number } | null = null;
	const thumbnails: HTMLButtonElement[] = [];
	const dots: HTMLButtonElement[] = [];
	const count = document.createElement("span");
	count.className = "gallery-count";
	count.setAttribute("aria-hidden", "true");
	const status = document.createElement("p");
	status.className = "gallery-status visually-hidden";
	status.setAttribute("role", "status");
	status.setAttribute("aria-live", "polite");
	status.setAttribute("aria-atomic", "true");
	const update = (index: number) => {
		const moveFocus = slides[current].contains(document.activeElement);
		current = (index + slides.length) % slides.length;
		slides.forEach((slide, position) => {
			slide.hidden = position !== current;
		});
		for (const controls of [thumbnails, dots])
			controls.forEach((control, position) => {
				control.setAttribute("aria-pressed", String(position === current));
			});
		count.textContent = `${current + 1} / ${slides.length}`;
		status.textContent = format(data.status ?? "", current + 1);
		if (moveFocus) links[current]?.focus({ preventScroll: true });
	};
	if (slides.length > 1) {
		const previous = iconButton(data.previous ?? "", "m14 6-6 6 6 6");
		previous.classList.add("gallery-previous");
		const next = iconButton(data.next ?? "", "m10 6 6 6-6 6");
		next.classList.add("gallery-next");
		previous.addEventListener("click", () => update(current - 1));
		next.addEventListener("click", () => update(current + 1));
		stage.append(count, previous, next);
		const pagination = document.createElement("div");
		pagination.className = "gallery-pagination";
		pagination.setAttribute("role", "group");
		pagination.setAttribute("aria-label", data.pagination ?? "");
		const strip = document.createElement("div");
		strip.className = "gallery-thumbnails";
		strip.id = "gallery-thumbnails";
		strip.hidden = true;
		strip.setAttribute("role", "group");
		strip.setAttribute("aria-label", data.thumbnails ?? "");
		const toggle = iconButton(
			data.toggleThumbnails ?? "",
			"M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
		);
		toggle.classList.add("gallery-toggle");
		toggle.setAttribute("aria-controls", strip.id);
		toggle.setAttribute("aria-expanded", "false");
		toggle.addEventListener("click", () => {
			strip.hidden = !strip.hidden;
			toggle.setAttribute("aria-expanded", String(!strip.hidden));
		});
		stage.append(toggle);
		links.forEach((link, index) => {
			if (!link) return;
			const dot = button("");
			dot.className = "gallery-dot";
			dot.setAttribute("aria-label", format(data.thumbnail ?? "", index + 1));
			dot.addEventListener("click", () => update(index));
			dots.push(dot);
			pagination.append(dot);
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
			} else {
				thumb.classList.add("no-preview");
			}
			const number = document.createElement("span");
			number.textContent = String(index + 1);
			thumb.append(number);
			thumb.addEventListener("click", () => update(index));
			thumbnails.push(thumb);
			strip.append(thumb);
		});
		gallery.append(status, pagination, strip);
		gallery.addEventListener("keydown", (event) => {
			if (event.target instanceof Element && event.target.closest("dialog"))
				return;
			if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
				event.preventDefault();
				update(current + (event.key === "ArrowRight" ? 1 : -1));
			}
		});
		gallery.addEventListener("pointerdown", (event) => {
			if (
				event.pointerType === "touch" &&
				event.target instanceof Element &&
				event.target.closest(".gallery-slide")
			)
				pointerStart = {
					x: event.clientX,
					y: event.clientY,
					id: event.pointerId,
				};
		});
		gallery.addEventListener("pointerup", (event) => {
			if (!pointerStart || pointerStart.id !== event.pointerId) return;
			const dx = event.clientX - pointerStart.x,
				dy = event.clientY - pointerStart.y;
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
		gallery.addEventListener(
			"click",
			(event) => {
				if (
					suppressClick &&
					event.target instanceof Element &&
					event.target.closest(".gallery-slide")
				) {
					event.preventDefault();
					event.stopPropagation();
					suppressClick = false;
				}
			},
			true,
		);
	}
	if (
		typeof HTMLDialogElement !== "undefined" &&
		typeof HTMLDialogElement.prototype.showModal === "function"
	) {
		const dialog = document.createElement("dialog");
		dialog.className = "image-viewer";
		dialog.setAttribute("aria-label", data.dialog ?? "");
		const close = iconButton(data.close ?? "", "m6 6 12 12 M18 6 6 18");
		close.classList.add("viewer-close");
		const image = document.createElement("img");
		image.alt = "";
		const error = document.createElement("p");
		error.textContent = data.unavailable ?? "";
		error.hidden = true;
		error.setAttribute("role", "status");
		let opener: HTMLElement | null = null;
		image.addEventListener("error", () => {
			image.hidden = true;
			error.hidden = false;
		});
		close.addEventListener("click", () => dialog.close());
		dialog.addEventListener("keydown", (event) => {
			if (event.key !== "Tab") return;
			event.preventDefault();
			close.focus();
		});
		dialog.addEventListener("close", () => {
			image.removeAttribute("src");
			opener?.focus();
		});
		dialog.append(close, image, error);
		gallery.append(dialog);
		const openViewer = (link: HTMLAnchorElement, trigger: HTMLElement) => {
			opener = trigger;
			image.hidden = false;
			error.hidden = true;
			image.alt = link.dataset.alt ?? "";
			try {
				dialog.showModal();
				image.src = link.href;
				close.focus();
				return true;
			} catch {
				opener = null;
				return false;
			}
		};
		links.forEach((link) => {
			link?.addEventListener("click", (event) => {
				if (
					event.button !== 0 ||
					event.metaKey ||
					event.ctrlKey ||
					event.shiftKey ||
					event.altKey
				)
					return;
				if (openViewer(link, link)) event.preventDefault();
			});
		});
		const enlarge = iconButton(
			data.enlarge ?? "",
			"M8 3H3v5 M16 3h5v5 M21 16v5h-5 M8 21H3v-5",
		);
		enlarge.classList.add("gallery-enlarge");
		enlarge.addEventListener("click", () => {
			const link = links[current];
			if (link && !openViewer(link, enlarge)) window.location.assign(link.href);
		});
		stage.append(enlarge);
	}
	update(0);
	gallery.dataset.ready = "true";
})();
