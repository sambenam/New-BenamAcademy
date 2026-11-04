/* Admin editor for header labels and administrator-added menu items. */
(function () {
  "use strict";

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => {
      const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
      return map[char];
    });
  }

  function toast(message, type) {
    if (typeof showToast === "function") showToast(message, type || "success");
  }

  function renderFields() {
    const api = window.BenamHeaderLabels;
    const host = document.getElementById("headerLabelFields");
    if (!api || !host) return;

    const current = api.read();
    const byKey = new Map(api.fields.map((field) => [field.key, field]));
    const input = (key) => {
      const field = byKey.get(key);
      return `
        <label class="form-group" for="header-label-${escapeHtml(field.key)}">
          <span>${escapeHtml(field.label)}</span>
          <input class="form-control" id="header-label-${escapeHtml(field.key)}"
            name="${escapeHtml(field.key)}" maxlength="80" required
            value="${escapeHtml(current[field.key] || field.value)}" />
        </label>
      `;
    };
    const fields = (keys) => `<div class="header-label-editor__fields">${keys.map(input).join("")}</div>`;
    const subgroup = (titleKey, title, childKeys) => {
      const field = byKey.get(titleKey);
      return `
        <section class="header-label-editor__subgroup">
          <div class="header-label-editor__subgroup-title">
            <label for="header-label-${escapeHtml(field.key)}">${escapeHtml(title)}:</label>
            <input class="form-control" id="header-label-${escapeHtml(field.key)}"
              name="${escapeHtml(field.key)}" maxlength="80" required
              value="${escapeHtml(current[field.key] || field.value)}" />
          </div>
          ${fields(childKeys)}
        </section>
      `;
    };
    const section = (name, body) => `
      <section class="header-label-editor__group">
        <h2>${escapeHtml(name)}</h2>
        ${body}
      </section>
    `;

    host.innerHTML = [
      section("منوهای اصلی", fields(["forStudents", "courses", "regulations", "news", "aboutUs"])),
      section(current.forStudents + ":", [
        subgroup("studentsBooks", "عنوان زیرگروه اول", ["diploma", "associate_degree", "bachelor", "master", "phd"]),
        subgroup("studentsExamGroup", "عنوان زیرگروه دوم", ["konkur1", "konkur2", "konkur3"]),
        subgroup("studentsProjects", "عنوان زیرگروه سوم", ["Enterpreneurship_projects", "Enternship-projects", "Financial-project"]),
        `<section class="header-label-editor__subgroup header-label-editor__subgroup--mobile"><h3>گزینهٔ موبایل:</h3>${fields(["allForStudents"])}</section>`,
      ].join("")),
      section(current.courses + ":", fields(["allCourses", "beginner", "intermediate", "advanced", "videos"])),
      section(current.regulations + ":", fields(["allRegulations", "constitution", "commercialLaw", "laborLaw", "taxLaw", "socialSecurityLaw"])),
    ].join("");
  }

  function renderParentOptions() {
    const api = window.BenamCustomHeaderMenu;
    const select = document.getElementById("customMenuParent");
    if (!api || !select) return;
    const previous = select.value;
    select.innerHTML = api.parentOptions().map((option) => `
      <option value="${escapeHtml(option.key)}">${"　".repeat(option.depth)}${escapeHtml(option.label)}</option>
    `).join("");
    if (Array.from(select.options).some((option) => option.value === previous)) select.value = previous;
  }

  function renderTree(items, parentKey, depth) {
    const api = window.BenamCustomHeaderMenu;
    return items.filter((item) => item.parentKey === parentKey).map((item) => {
      const parent = api.parentOptions().find((option) => option.key === item.parentKey);
      return `
        <li class="header-custom-item" data-depth="${depth}">
          <div class="header-custom-item__card">
            <div class="header-custom-item__level">سطح ${depth} · ${escapeHtml(item.label)}</div>
            <div class="header-custom-item__placement">محل قرارگیری: ${escapeHtml(parent ? parent.label : "منوی هدر")}</div>
            <div class="header-custom-item__fields">
              <label class="form-group">
                <span>عنوان آیتم</span>
                <input class="form-control" data-custom-field="label" data-id="${escapeHtml(item.id)}"
                  maxlength="80" required value="${escapeHtml(item.label)}" />
              </label>
            </div>
            <div class="header-custom-item__actions">
              <button type="button" class="btn-primary" data-custom-action="save" data-id="${escapeHtml(item.id)}">ذخیره عنوان</button>
              <button type="button" class="btn-secondary" data-custom-action="delete" data-id="${escapeHtml(item.id)}">حذف آیتم</button>
            </div>
          </div>
          ${depth < 3 ? `<ul class="header-custom-item__children">${renderTree(items, item.id, depth + 1)}</ul>` : ""}
        </li>
      `;
    }).join("");
  }

  function renderCustomItems() {
    const api = window.BenamCustomHeaderMenu;
    const host = document.getElementById("headerCustomItems");
    if (!api || !host) return;
    const items = api.read();
    const tree = renderTree(items, api.rootKey, 1);
    host.innerHTML = tree
      ? `<ul class="header-custom-tree">${tree}</ul>`
      : '<p class="header-custom-menu__empty">هنوز آیتم اضافه‌ای ثبت نشده است.</p>';
    renderParentOptions();
  }

  function removeTree(items, id) {
    const descendants = new Set([id]);
    let changed = true;
    while (changed) {
      changed = false;
      items.forEach((item) => {
        if (descendants.has(item.parentKey) && !descendants.has(item.id)) {
          descendants.add(item.id);
          changed = true;
        }
      });
    }
    return items.filter((item) => !descendants.has(item.id));
  }

  function init() {
    const labelForm = document.getElementById("headerLabelsForm");
    const resetButton = document.getElementById("resetHeaderLabelsBtn");
    const addForm = document.getElementById("addHeaderCustomItemForm");
    const listHost = document.getElementById("headerCustomItems");

    if (labelForm && window.BenamHeaderLabels) {
      renderFields();
      labelForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const values = {};
        window.BenamHeaderLabels.fields.forEach((field) => {
          const input = labelForm.elements.namedItem(field.key);
          values[field.key] = input ? input.value.trim() : "";
        });
        try {
          window.BenamHeaderLabels.save(values);
          toast("نام‌های منو در این مرورگر ذخیره شد.");
        } catch (error) {
          toast(error.message || "ذخیره نام‌های منو انجام نشد.", "error");
        }
      });
      if (resetButton) {
        resetButton.addEventListener("click", () => {
          window.BenamHeaderLabels.reset();
          renderFields();
          toast("نام‌های پیش‌فرض منو بازگردانده شد.");
        });
      }
    }

    if (addForm && window.BenamCustomHeaderMenu) {
      renderCustomItems();
      addForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const api = window.BenamCustomHeaderMenu;
        const labelInput = addForm.elements.namedItem("customMenuLabel");
        const parentInput = addForm.elements.namedItem("customMenuParent");
        const label = labelInput.value.trim();
        if (!label) {
          toast("عنوان آیتم را وارد کنید.", "error");
          return;
        }
        try {
          const items = api.read();
          items.push({
            id: api.createId(),
            label,
            href: api.createHref(label, items),
            parentKey: parentInput.value || api.rootKey,
          });
          api.save(items);
          addForm.reset();
          renderCustomItems();
          toast("آیتم به منو اضافه شد.");
        } catch (error) {
          toast(error.message || "افزودن آیتم انجام نشد.", "error");
        }
      });
    }

    if (listHost && window.BenamCustomHeaderMenu) {
      listHost.addEventListener("click", (event) => {
        const button = event.target.closest("[data-custom-action]");
        if (!button) return;
        const api = window.BenamCustomHeaderMenu;
        const items = api.read();
        const id = button.getAttribute("data-id");
        if (button.getAttribute("data-custom-action") === "delete") {
          const next = removeTree(items, id);
          try {
            api.save(next);
            renderCustomItems();
            toast("آیتم و زیرمجموعه‌های آن حذف شدند.");
          } catch (error) {
            toast(error.message || "حذف آیتم انجام نشد.", "error");
          }
          return;
        }
        const item = items.find((entry) => entry.id === id);
        if (!item) return;
        const fields = Array.from(listHost.querySelectorAll("[data-custom-field]"));
        const label = fields.find((field) => field.dataset.id === id && field.dataset.customField === "label");
        item.label = label ? label.value.trim() : "";
        try {
          api.save(items);
          renderCustomItems();
          toast("آیتم به‌روزرسانی شد.");
        } catch (error) {
          toast(error.message || "ذخیره آیتم انجام نشد.", "error");
        }
      });
    }

    window.addEventListener("benam:header-labels-changed", renderCustomItems);
    window.addEventListener("benam:header-custom-menu-changed", renderCustomItems);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
