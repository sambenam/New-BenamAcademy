/* Front-end-only storage and rendering for administrator-added header items. */
(function () {
  "use strict";

  const STORAGE_KEY = "benamacademyHeaderCustomItems";
  const ROOT = "root";
  const MAX_DEPTH = 3;
  const MAX_ITEMS = 150;
  const NONLINK_LABEL_KEYS = new Set(["studentsBooks", "studentsExamGroup", "studentsProjects"]);
  const BUILTIN_MENUS = [
    { key: "forStudents", fallback: "برای دانشجویان" },
    { key: "courses", fallback: "دوره‌ها" },
    { key: "regulations", fallback: "قوانین و مقررات" },
    { key: "news", fallback: "اخبار" },
    { key: "aboutUs", fallback: "درباره ما" },
  ];

  function builtInSubmenuFields() {
    const fields = window.BenamHeaderLabels ? window.BenamHeaderLabels.fields : [];
    return fields.filter((field) =>
      !BUILTIN_MENUS.some((menu) => menu.key === field.key) && !NONLINK_LABEL_KEYS.has(field.key),
    );
  }

  function isBuiltInSubmenuKey(key) {
    return builtInSubmenuFields().some((field) => field.key === key);
  }

  function cleanHref(value) {
    const href = String(value || "").trim();
    if (!href || href.length > 500 || /[\u0000-\u001f]/.test(href)) return "";
    if (/^(javascript|data|vbscript):/i.test(href)) return "";
    try {
      const parsed = new URL(href, window.location.href);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
      return href;
    } catch (error) {
      return "";
    }
  }

  function normalizeItems(raw) {
    if (!Array.isArray(raw)) return [];
    const unique = new Map();
    raw.slice(0, MAX_ITEMS).forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      const id = String(entry.id || "").slice(0, 80);
      const label = String(entry.label || "").trim().slice(0, 80);
      const href = cleanHref(entry.href);
      const parentKey = String(entry.parentKey || "");
      if (!id || !/^[\w-]+$/.test(id) || !label || !href || !parentKey || unique.has(id)) return;
      unique.set(id, { id, label, href, parentKey });
    });

    const depths = new Map();
    const valid = new Map();
    let progressed = true;
    while (progressed) {
      progressed = false;
      unique.forEach((item, id) => {
        if (valid.has(id)) return;
        let depth = null;
        if (item.parentKey === ROOT) depth = 1;
        else if (BUILTIN_MENUS.some((menu) => menu.key === item.parentKey)) depth = 2;
        else if (isBuiltInSubmenuKey(item.parentKey)) depth = 3;
        else if (depths.has(item.parentKey)) depth = depths.get(item.parentKey) + 1;
        if (depth && depth <= MAX_DEPTH) {
          depths.set(id, depth);
          valid.set(id, item);
          progressed = true;
        }
      });
    }
    return Array.from(valid.values());
  }

  function read() {
    try {
      return normalizeItems(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));
    } catch (error) {
      return [];
    }
  }

  function announce(items) {
    window.dispatchEvent(
      new window.CustomEvent("benam:header-custom-menu-changed", { detail: items }),
    );
  }

  function save(items) {
    const normalized = normalizeItems(items);
    if (Array.isArray(items) && items.length !== normalized.length) {
      throw new Error("ساختار منو معتبر نیست؛ لینک، عنوان یا سطح زیرمجموعه را بررسی کنید.");
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    announce(normalized);
    return normalized;
  }

  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return "menu-" + window.crypto.randomUUID();
    }
    return "menu-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }

  function descendants(items, parentKey) {
    return items.filter((item) => item.parentKey === parentKey);
  }

  function itemDepth(item, items) {
    if (!item) return 0;
    if (item.parentKey === ROOT) return 1;
    if (BUILTIN_MENUS.some((menu) => menu.key === item.parentKey)) return 2;
    if (isBuiltInSubmenuKey(item.parentKey)) return 3;
    const parent = items.find((candidate) => candidate.id === item.parentKey);
    return parent ? itemDepth(parent, items) + 1 : MAX_DEPTH + 1;
  }

  function getParentOptions() {
    const items = read();
    const labels = window.BenamHeaderLabels ? window.BenamHeaderLabels.read() : {};
    const options = [{ key: ROOT, label: "منوی اصلی جدید", depth: 0 }];
    BUILTIN_MENUS.forEach((menu) => {
      options.push({ key: menu.key, label: labels[menu.key] || menu.fallback, depth: 1 });
    });
    builtInSubmenuFields().forEach((field) => {
      options.push({
        key: field.key,
        label: (labels[field.group] || field.group) + " ← " + (labels[field.key] || field.value),
        depth: 2,
      });
    });
    const pathFor = (item) => {
      const parent = items.find((candidate) => candidate.id === item.parentKey);
      if (parent) return pathFor(parent) + " ← " + item.label;
      const submenu = builtInSubmenuFields().find((field) => field.key === item.parentKey);
      if (submenu) return (labels[submenu.group] || submenu.group) + " ← " + (labels[submenu.key] || submenu.value) + " ← " + item.label;
      const builtin = BUILTIN_MENUS.find((menu) => menu.key === item.parentKey);
      return (builtin ? (labels[builtin.key] || builtin.fallback) + " ← " : "") + item.label;
    };
    items
      .filter((item) => itemDepth(item, items) < MAX_DEPTH)
      .forEach((item) => {
        options.push({ key: item.id, label: pathFor(item), depth: itemDepth(item, items) });
      });
    return options;
  }

  function makeAnchor(label, href, className) {
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.textContent = label;
    if (className) anchor.className = className;
    return anchor;
  }

  function makeDesktopNode(item, items) {
    const wrapper = document.createElement("div");
    wrapper.className = "custom-nav-entry";
    wrapper.appendChild(makeAnchor(item.label, item.href, "custom-nav-entry__link"));
    const children = descendants(items, item.id);
    if (children.length) {
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "custom-nav-entry__toggle";
      toggle.setAttribute("aria-label", "نمایش زیرمنوی " + item.label);
      toggle.setAttribute("aria-expanded", "false");
      toggle.textContent = "‹";
      toggle.addEventListener("click", () => {
        const open = wrapper.classList.toggle("is-open");
        toggle.setAttribute("aria-expanded", String(open));
      });
      wrapper.appendChild(toggle);

      const submenu = document.createElement("div");
      submenu.className = "custom-nav-submenu";
      children.forEach((child) => submenu.appendChild(makeDesktopNode(child, items)));
      wrapper.appendChild(submenu);
    }
    return wrapper;
  }

  function restoreGeneratedDesktop(nav) {
    nav.querySelectorAll(".custom-menu-injection, .custom-primary-menu").forEach((node) => node.remove());
    nav.querySelectorAll(".custom-nav-existing-parent").forEach((wrapper) => {
      const anchor = wrapper.querySelector(":scope > a[data-header-label]");
      if (anchor) wrapper.replaceWith(anchor);
      else wrapper.remove();
    });
    nav.querySelectorAll(".custom-generated-root-wrapper").forEach((wrapper) => {
      const anchor = wrapper.querySelector(":scope > .home-nav_link");
      if (anchor) wrapper.replaceWith(anchor);
      else wrapper.remove();
    });
  }

  function getDesktopRootLink(nav, key) {
    return Array.from(nav.querySelectorAll("[data-header-label]")).find(
      (node) => node.getAttribute("data-header-label") === key && node.classList.contains("home-nav_link"),
    );
  }

  function ensureDesktopDropdown(nav, key, label) {
    let link = getDesktopRootLink(nav, key);
    if (!link) return null;
    let menuItem = link.closest(".home-nav_item");
    if (!menuItem) {
      menuItem = document.createElement("div");
      menuItem.className = "home-nav_item has-dropdown custom-generated-root-wrapper";
      link.replaceWith(menuItem);
      menuItem.appendChild(link);
    }
    let dropdown = menuItem.querySelector(":scope > .home-nav_dropdown");
    if (!dropdown) {
      dropdown = document.createElement("div");
      dropdown.className = "home-nav_dropdown home-nav_dropdown--compact custom-menu-injection";
      dropdown.setAttribute("aria-label", "زیرمنوی " + label);
      menuItem.appendChild(dropdown);
    }
    return dropdown;
  }

  function renderDesktop(nav, items) {
    if (!nav) return;
    restoreGeneratedDesktop(nav);

    BUILTIN_MENUS.forEach((menu) => {
      const children = descendants(items, menu.key);
      if (!children.length) return;
      const labels = window.BenamHeaderLabels ? window.BenamHeaderLabels.read() : {};
      const dropdown = ensureDesktopDropdown(nav, menu.key, labels[menu.key] || menu.fallback);
      if (!dropdown) return;
      const section = document.createElement("section");
      section.className = "custom-menu-injection";
      children.forEach((item) => section.appendChild(makeDesktopNode(item, items)));
      dropdown.appendChild(section);
    });

    descendants(items, ROOT).forEach((item) => {
      const menuItem = document.createElement("div");
      menuItem.className = "home-nav_item custom-primary-menu";
      const children = descendants(items, item.id);
      if (children.length) menuItem.classList.add("has-dropdown");
      menuItem.appendChild(makeAnchor(item.label, item.href, "home-nav_link"));
      if (children.length) {
        const dropdown = document.createElement("div");
        dropdown.className = "home-nav_dropdown home-nav_dropdown--compact custom-menu-injection";
        const section = document.createElement("section");
        children.forEach((child) => section.appendChild(makeDesktopNode(child, items)));
        dropdown.appendChild(section);
        menuItem.appendChild(dropdown);
      }
      nav.appendChild(menuItem);
    });

    builtInSubmenuFields().forEach((field) => {
      const children = descendants(items, field.key);
      if (!children.length) return;
      const anchor = Array.from(nav.querySelectorAll("a[data-header-label]")).find(
        (node) => node.getAttribute("data-header-label") === field.key,
      );
      if (!anchor) return;
      const wrapper = document.createElement("div");
      wrapper.className = "custom-nav-entry custom-nav-existing-parent";
      anchor.replaceWith(wrapper);
      wrapper.appendChild(anchor);
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "custom-nav-entry__toggle";
      toggle.setAttribute("aria-label", "نمایش زیرمنوی " + anchor.textContent.trim());
      toggle.setAttribute("aria-expanded", "false");
      toggle.textContent = "‹";
      toggle.addEventListener("click", () => {
        const open = wrapper.classList.toggle("is-open");
        toggle.setAttribute("aria-expanded", String(open));
      });
      wrapper.appendChild(toggle);
      const submenu = document.createElement("div");
      submenu.className = "custom-nav-submenu custom-menu-injection";
      children.forEach((child) => submenu.appendChild(makeDesktopNode(child, items)));
      wrapper.appendChild(submenu);
    });
  }

  function toggleMobileNested(li, toggle) {
    const willOpen = !li.classList.contains("active");
    li.parentElement.querySelectorAll(":scope > .mobile-sub-dropdown").forEach((sibling) => {
      if (sibling === li) return;
      sibling.classList.remove("active");
      sibling.querySelectorAll(":scope > .custom-mobile-node__row .custom-mobile-toggle, :scope > .custom-mobile-existing-parent-row .custom-mobile-toggle").forEach((button) => {
        button.setAttribute("aria-expanded", "false");
      });
    });
    li.classList.toggle("active", willOpen);
    toggle.setAttribute("aria-expanded", String(willOpen));
  }

  function makeMobileNode(item, items) {
    const li = document.createElement("li");
    li.className = "mobile-sub-dropdown custom-mobile-node custom-mobile-generated";
    const row = document.createElement("div");
    row.className = "custom-mobile-node__row";
    row.appendChild(makeAnchor(item.label, item.href, "custom-mobile-node__link"));
    const children = descendants(items, item.id);
    if (children.length) {
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "custom-mobile-toggle";
      toggle.setAttribute("aria-label", "نمایش زیرمنوی " + item.label);
      toggle.setAttribute("aria-expanded", "false");
      toggle.innerHTML = '<i class="fa-solid fa-chevron-down" aria-hidden="true"></i>';
      toggle.addEventListener("click", () => toggleMobileNested(li, toggle));
      row.appendChild(toggle);
      const submenu = document.createElement("ul");
      submenu.className = "mobile-sub_menu custom-mobile-generated";
      children.forEach((child) => submenu.appendChild(makeMobileNode(child, items)));
      li.appendChild(row);
      li.appendChild(submenu);
    } else {
      li.appendChild(row);
    }
    return li;
  }

  function removeGeneratedMobile(root) {
    root.querySelectorAll(".custom-mobile-generated, .custom-menu-injection").forEach((node) => node.remove());
    root.querySelectorAll(".custom-mobile-existing-parent-row").forEach((row) => {
      const li = row.closest(".mobile-sub-dropdown");
      const anchor = row.querySelector("a[data-header-label]");
      if (li && anchor) {
        li.classList.remove("custom-mobile-parent");
        row.replaceWith(anchor);
      }
    });
    root.querySelectorAll(".custom-mobile-root-row").forEach((row) => {
      const li = row.closest(".mobile-dropdown");
      const anchor = row.querySelector("a");
      if (li && anchor) {
        anchor.classList.remove("custom-mobile-parent-link");
        anchor.classList.add("mobile-dropdown-btn");
        row.replaceWith(anchor);
      }
    });
  }

  function toggleMobileRoot(li, toggle) {
    const willOpen = !li.classList.contains("active");
    li.parentElement.querySelectorAll(":scope > .mobile-dropdown").forEach((sibling) => {
      if (sibling === li) return;
      sibling.classList.remove("active");
      sibling.querySelectorAll(":scope > .custom-mobile-root-row .custom-mobile-root-toggle").forEach((button) => {
        button.setAttribute("aria-expanded", "false");
      });
    });
    li.classList.toggle("active", willOpen);
    toggle.setAttribute("aria-expanded", String(willOpen));
  }

  function findMobileRoot(root, key) {
    return Array.from(root.querySelectorAll("[data-header-label]")).find((node) =>
      node.getAttribute("data-header-label") === key && node.closest(".mobile-dropdown"),
    )?.closest(".mobile-dropdown") || null;
  }

  function appendMobileChildren(root, key, children, items) {
    const li = findMobileRoot(root, key);
    if (!li) return;
    let menu = li.querySelector(":scope > .mobile-dropdown-menu");
    if (!menu) {
      menu = document.createElement("ul");
      menu.className = "mobile-dropdown-menu custom-menu-injection";
      const link = li.querySelector(":scope > a[data-header-label]");
      if (link) {
        const row = document.createElement("div");
        row.className = "custom-mobile-root-row";
        link.classList.remove("mobile-dropdown-btn");
        link.classList.add("custom-mobile-parent-link");
        link.replaceWith(row);
        row.appendChild(link);
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "custom-mobile-root-toggle";
        toggle.setAttribute("aria-label", "نمایش زیرمنو");
        toggle.setAttribute("aria-expanded", "false");
        toggle.innerHTML = '<i class="fa-solid fa-chevron-down" aria-hidden="true"></i>';
        toggle.addEventListener("click", () => toggleMobileRoot(li, toggle));
        row.appendChild(toggle);
      }
      li.appendChild(menu);
    }
    children.forEach((item) => menu.appendChild(makeMobileNode(item, items)));
  }

  function appendMobileStaticChildren(root, field, children, items) {
    const anchor = Array.from(root.querySelectorAll("a[data-header-label]")).find(
      (node) => node.getAttribute("data-header-label") === field.key,
    );
    const li = anchor && anchor.closest(".mobile-sub-dropdown");
    if (!anchor || !li) return;

    const row = document.createElement("div");
    row.className = "custom-mobile-existing-parent-row";
    anchor.replaceWith(row);
    row.appendChild(anchor);
    li.classList.add("custom-mobile-parent");

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "custom-mobile-toggle";
    toggle.setAttribute("aria-label", "نمایش زیرمنوی " + anchor.textContent.trim());
    toggle.setAttribute("aria-expanded", "false");
    toggle.innerHTML = '<i class="fa-solid fa-chevron-down" aria-hidden="true"></i>';
    toggle.addEventListener("click", () => toggleMobileNested(li, toggle));
    row.appendChild(toggle);

    const submenu = document.createElement("ul");
    submenu.className = "mobile-sub_menu custom-menu-injection";
    children.forEach((item) => submenu.appendChild(makeMobileNode(item, items)));
    li.appendChild(submenu);
  }

  function renderMobile(root, items) {
    if (!root) return;
    removeGeneratedMobile(root);
    BUILTIN_MENUS.forEach((menu) => {
      const children = descendants(items, menu.key);
      if (children.length) appendMobileChildren(root, menu.key, children, items);
    });
    builtInSubmenuFields().forEach((field) => {
      const children = descendants(items, field.key);
      if (children.length) appendMobileStaticChildren(root, field, children, items);
    });
    descendants(items, ROOT).forEach((item) => {
      const li = document.createElement("li");
      li.className = "mobile-dropdown custom-mobile-root custom-mobile-generated";
      const children = descendants(items, item.id);
      const row = document.createElement("div");
      row.className = "custom-mobile-root-row";
      row.appendChild(makeAnchor(item.label, item.href, "custom-mobile-parent-link"));
      if (children.length) {
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "custom-mobile-root-toggle";
        toggle.setAttribute("aria-label", "نمایش زیرمنوی " + item.label);
        toggle.setAttribute("aria-expanded", "false");
        toggle.innerHTML = '<i class="fa-solid fa-chevron-down" aria-hidden="true"></i>';
        toggle.addEventListener("click", () => toggleMobileRoot(li, toggle));
        row.appendChild(toggle);
      }
      li.appendChild(row);
      if (children.length) {
        const menu = document.createElement("ul");
        menu.className = "mobile-dropdown-menu custom-mobile-generated";
        children.forEach((child) => menu.appendChild(makeMobileNode(child, items)));
        li.appendChild(menu);
      }
      root.appendChild(li);
    });
  }

  function apply(root) {
    const host = root || document;
    const items = read();
    renderDesktop(host.querySelector(".home-primary-nav"), items);
    renderMobile(host.querySelector(".mobile-header"), items);
    return items;
  }

  window.BenamCustomHeaderMenu = {
    storageKey: STORAGE_KEY,
    rootKey: ROOT,
    maxDepth: MAX_DEPTH,
    builtInMenus: BUILTIN_MENUS.map((menu) => ({ ...menu })),
    read,
    save,
    createId: makeId,
    parentOptions: getParentOptions,
    apply,
  };

  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) apply(document);
  });
  window.addEventListener("benam:header-custom-menu-changed", () => apply(document));
  window.addEventListener("benam:header-labels-changed", () => apply(document));

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => apply(document));
  } else {
    apply(document);
  }
})();
