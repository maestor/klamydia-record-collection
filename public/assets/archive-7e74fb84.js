(() => {
  const htmx = window.htmx;
  if (!htmx) return;
  Object.assign(htmx.config, {allowEval: false, allowScriptTags: false, includeIndicatorStyles: false, historyEnabled: false, selfRequestsOnly: true});
  const results = document.getElementById("archive-results");
  const list = document.getElementById("archive-list");
  const status = document.getElementById("archive-status");
  const more = document.getElementById("archive-more");
  const fallback = document.getElementById("archive-fallback");
  const pageLabel = document.getElementById("archive-page-label");
  if (!results) return;
  status?.classList.add("visually-hidden");
  if (pageLabel) pageLabel.hidden = true;
  const endMessage = document.getElementById("archive-end");
  if (endMessage) endMessage.hidden = true;
  let leavingHistory = false;
  let start = Number(results.dataset.start);
  let end = Number(results.dataset.end);
  const pagination = results.querySelector(".pagination");
  if (!more && start === 1) pagination?.classList.add("archive-nav-empty");
  let countBefore = 0;
  let busy = false;
  const number = new Intl.NumberFormat("fi-FI");
  const render = (template, values) => template.replace(/\{(\w+)\}/g, (_, key) => number.format(values[key]));
  const archiveUrl = () => `/archive?page=${start}&through=${end}`;
  const scrollKey = () => `archive-scroll:${location.pathname}${location.search}`;
  const saveScroll = () => { if (leavingHistory) return; try { sessionStorage.setItem(scrollKey(), String(window.scrollY)); } catch {} };
  const restoreScroll = () => { try { const value = sessionStorage.getItem(scrollKey()); if (value !== null) requestAnimationFrame(() => window.scrollTo(0, Number(value))); } catch {} };
  window.addEventListener("scroll", saveScroll, {passive: true});
  window.addEventListener("pagehide", saveScroll);
  window.addEventListener("pageshow", restoreScroll);
  window.addEventListener("popstate", () => { leavingHistory = true; location.reload(); });
  if (!list || !status || !more || !fallback || !pageLabel || more.dataset.enhance !== "true") return;
  let observer = null;
  let visible = false;
  let autoEnabled = true;
  let downwardAction = false;
  let automaticRequest = false;
  let autoBlocked = false;
  let pointerDown = false;
  let lastScroll = window.scrollY;
  let touchY = 0;
  const tryAutomaticLoad = () => {
    if (!autoEnabled || !visible || !downwardAction || busy || autoBlocked || !more.isConnected) return;
    downwardAction = false;
    automaticRequest = true;
    more.click();
  };
  if ("IntersectionObserver" in window) {
    observer = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      tryAutomaticLoad();
    });
    observer.observe(more);
    window.addEventListener("wheel", (event) => { if (event.deltaY > 0) { downwardAction = true; tryAutomaticLoad(); } }, {passive: true});
    window.addEventListener("touchstart", (event) => { touchY = event.touches[0]?.clientY ?? 0; }, {passive: true});
    window.addEventListener("touchmove", (event) => { const y = event.touches[0]?.clientY ?? touchY; if (y < touchY) { downwardAction = true; tryAutomaticLoad(); } touchY = y; }, {passive: true});
    window.addEventListener("keydown", (event) => { if (["ArrowDown", "PageDown", "End", " "].includes(event.key)) { downwardAction = true; tryAutomaticLoad(); } });
    window.addEventListener("pointerdown", () => { pointerDown = true; });
    window.addEventListener("pointerup", () => { pointerDown = false; });
    window.addEventListener("scroll", () => { if (pointerDown && window.scrollY > lastScroll) { downwardAction = true; tryAutomaticLoad(); } lastScroll = window.scrollY; }, {passive: true});
  }
  const setup = () => {
    more.setAttribute("hx-get", `/archive/fragments?page=${end + 1}&start=${start}`);
    more.setAttribute("hx-target", "#archive-list");
    more.setAttribute("hx-swap", "beforeend");
    more.setAttribute("hx-sync", "this:drop");
    htmx.process(more);
  };
  setup();
  results.addEventListener("htmx:beforeRequest", (event) => {
    if (event.detail.elt !== more) return;
    if (busy) { event.preventDefault(); return; }
    busy = true;
    downwardAction = false;
    countBefore = list.children.length;
    status.classList.add("visually-hidden");
    results.setAttribute("aria-busy", "true");
    more.setAttribute("aria-disabled", "true");
    more.textContent = results.dataset.loading;
    status.textContent = results.dataset.loading;
    fallback.hidden = true;
  });
  results.addEventListener("htmx:afterRequest", (event) => {
    if (event.detail.elt !== more) return;
    busy = false;
    const wasAutomatic = automaticRequest;
    automaticRequest = false;
    results.setAttribute("aria-busy", "false");
    more.removeAttribute("aria-disabled");
    const xhr = event.detail.xhr;
    if (!event.detail.successful) {
      autoBlocked = true;
      status.classList.remove("visually-hidden");
      status.textContent = results.dataset.error;
      more.textContent = results.dataset.retry;
      fallback.hidden = false;
      return;
    }
    autoBlocked = false;
    const added = list.children.length - countBefore;
    const hasMore = xhr.getResponseHeader("X-Archive-Has-More") === "true";
    if (added > 0) {
      saveScroll();
      end += 1;
      history.pushState(null, "", archiveUrl());
      for (const link of list.querySelectorAll(".post-card-link")) {
        const url = new URL(link.href);
        url.search = `?page=${start}&through=${end}`;
        link.href = url.pathname + url.search;
      }
      pageLabel.textContent = render(results.dataset.pageLabel, {page: end});
      status.textContent = `${render(results.dataset.added, {count: added})} ${render(results.dataset.progress, {start, end, count: list.children.length})}`;
      const firstNewLink = list.children[countBefore]?.querySelector(".post-card-link");
      if (!wasAutomatic) firstNewLink?.focus();
    }
    if (!hasMore || end >= 999999) {
      observer?.disconnect();
      more.remove();
      fallback.remove();
      if (start === 1) pagination?.classList.add("archive-nav-empty");
      status.textContent = added > 0 ? `${status.textContent} ${results.dataset.endMessage}` : results.dataset.endMessage;
      if (added === 0 && !wasAutomatic) { status.tabIndex = -1; status.focus(); }
      return;
    }
    more.href = `/archive?page=${end + 1}`;
    fallback.href = more.href;
    if (end - start >= Number(results.dataset.batchLimit) - 1) {
      autoEnabled = false;
      observer?.disconnect();
      more.removeAttribute("hx-get");
      more.removeAttribute("hx-target");
      more.removeAttribute("hx-swap");
      more.removeAttribute("hx-sync");
      htmx.process(more);
      more.textContent = results.dataset.next;
    } else {
      more.textContent = results.dataset.more;
      setup();
    }
  });
  list.addEventListener("click", saveScroll);
})();
