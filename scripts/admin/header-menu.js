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
    const menuApi = window.BenamCustomHeaderMenu;
    const host = document.getElementById("headerLabelFields");
    if (!api || !host) return;

    const current = api.read();
    const items = menuApi ? menuApi.read() : [];
    const byKey = new Map(api.fields.map((field) => [field.key, field]));
    const visible = (key) => !menuApi || !menuApi.isHidden(key);
    const dynamicChildren = (key, depth) => renderTree(items, key, depth);
    const input = (key, deleteKind, includeChildren) => {
      if (!visible(key)) return "";
      const field = byKey.get(key);
      const title = deleteKind === "main" ? "حذف کل منو" : "حذف آیتم";
      return `
        <div class="header-label-editor__field-with-action">
          <label class="form-group" for="header-label-${escapeHtml(field.key)}">
            <span>${escapeHtml(field.label)}</span>
            <input class="form-control" id="header-label-${escapeHtml(field.key)}"
              name="${escapeHtml(field.key)}" maxlength="80" required
              value="${escapeHtml(current[field.key] || field.value)}" />
          </label>
          ${deleteKind ? `<button type="button" class="header-delete-action" data-static-delete="${escapeHtml(field.key)}" data-delete-kind="${escapeHtml(deleteKind)}">${title}</button>` : ""}
          ${includeChildren === false ? "" : dynamicChildren(field.key, 3)}
        </div>
      `;
    };
    const fields = (keys, kind, includeChildren) => `<div class="header-label-editor__fields">${keys.map((key) => input(key, kind, includeChildren)).join("")}</div>`;
    const subgroup = (titleKey, title, childKeys) => {
      if (!visible(titleKey)) return "";
      const field = byKey.get(titleKey);
      return `
        <section class="header-label-editor__subgroup">
          <div class="header-label-editor__subgroup-title">
            <label for="header-label-${escapeHtml(field.key)}">${escapeHtml(title)}:</label>
            <input class="form-control" id="header-label-${escapeHtml(field.key)}"
              name="${escapeHtml(field.key)}" maxlength="80" required
              value="${escapeHtml(current[field.key] || field.value)}" />
            <button type="button" class="header-delete-action" data-static-delete="${escapeHtml(field.key)}" data-delete-kind="title">حذف عنوان</button>
          </div>
          ${fields(childKeys, "item")}
          ${dynamicChildren(titleKey, 3)}
        </section>
      `;
    };
    const section = (key, fallback, body) => {
      if (key && !visible(key)) return "";
      const title = key ? (current[key] || fallback) + ":" : fallback;
      return `
        <section class="header-label-editor__group" data-header-section="${escapeHtml(key || "main")}">
          <div class="header-label-editor__group-title">
            <h2>${escapeHtml(title)}</h2>
            ${key ? `<button type="button" class="header-delete-action" data-static-delete="${escapeHtml(key)}" data-delete-kind="main">حذف کل منو</button>` : ""}
          </div>
          ${body}
        </section>
      `;
    };

    const customRootMenus = items.filter((item) => item.parentKey === (menuApi ? menuApi.rootKey : "root") && item.kind === "menu");
    const customRootFields = customRootMenus.map((item) => {
      const id = escapeHtml(item.id);
      const label = escapeHtml(item.label);
      return `
        <div class="header-label-editor__field-with-action" data-custom-main-id="${id}">
          <label class="form-group" for="custom-header-${id}">
            <span>${label}</span>
            <input class="form-control" id="custom-header-${id}" data-custom-field="label" data-id="${id}"
              maxlength="80" required value="${label}" />
          </label>
          <button type="button" class="header-delete-action" data-custom-action="delete" data-id="${id}">حذف کل منو</button>
        </div>
      `;
    }).join("");
    const customRootDetails = customRootMenus.map((item) => {
      const id = escapeHtml(item.id);
      const label = escapeHtml(item.label);
      const children = renderTree(items, item.id, 2);
      return `
        <section class="header-label-editor__group" data-custom-main-details="${id}">
          <div class="header-label-editor__group-title"><h2>${label}:</h2></div>
          ${children || '<p class="header-custom-menu__empty">هنوز عنوان یا زیرگروهی به این منو اضافه نشده است.</p>'}
        </section>
      `;
    }).join("");
    const mainRootFields = `<div class="header-label-editor__fields">${["forStudents", "courses", "regulations"].map((key) => input(key, null, false)).join("")}${customRootFields}</div>`;
    const studentGroups = [
      subgroup("studentsBooks", "عنوان زیرگروه اول", ["diploma", "associate_degree", "bachelor", "master", "phd"]),
      subgroup("studentsExamGroup", "عنوان زیرگروه دوم", ["konkur1", "konkur2", "konkur3"]),
      subgroup("studentsProjects", "عنوان زیرگروه سوم", ["Enterpreneurship_projects", "Enternship-projects", "Financial-project"]),
      dynamicChildren("forStudents", 2),
      `<section class="header-label-editor__subgroup header-label-editor__subgroup--mobile"><h3>گزینهٔ موبایل:</h3>${fields(["allForStudents"], "item")}</section>`,
    ].join("");

    host.innerHTML = [
      section(null, "منوهای اصلی", [
        mainRootFields,
        fields(["news", "aboutUs"], "main", false),
        dynamicChildren("news", 2),
        dynamicChildren("aboutUs", 2),
      ].join("")),
      section("forStudents", current.forStudents, studentGroups),
      section("courses", current.courses, [
        fields(["allCourses", "beginner", "intermediate", "advanced", "videos"], "item"),
        dynamicChildren("courses", 2),
      ].join("")),
      section("regulations", current.regulations, [
        fields(["allRegulations", "constitution", "commercialLaw", "laborLaw", "taxLaw", "socialSecurityLaw"], "item"),
        dynamicChildren("regulations", 2),
      ].join("")),
      customRootDetails,
    ].join("");
  }

  function renderParentOptions() {
    const api = window.BenamCustomHeaderMenu;
    const select = document.getElementById("customMenuParent");
    if (!api || !select) return;
    const previous = select.value;
    select.innerHTML = api.parentOptions().map((option) => `
      <option value="${escapeHtml(option.key)}">${"　".repeat(option.depth)}${escapeHtml(option.label)} — ${escapeHtml(option.action || "افزودن زیرگروه")}</option>
    `).join("");
    if (Array.from(select.options).some((option) => option.value === previous)) select.value = previous;
  }

  function subgroupOrdinal(item, items) {
    const api = window.BenamCustomHeaderMenu;
    const staticOrder = { studentsBooks: 1, studentsExamGroup: 2, studentsProjects: 3 };
    let base = 0;
    if (item.parentKey === "forStudents") {
      Object.entries(staticOrder).forEach(([key, order]) => {
        if (!api.isHidden(key)) base = Math.max(base, order);
      });
    }
    const siblings = items.filter((entry) => entry.parentKey === item.parentKey && entry.kind === "group");
    const position = Math.max(0, siblings.findIndex((entry) => entry.id === item.id));
    const number = base + position + 1;
    const names = ["اول", "دوم", "سوم", "چهارم", "پنجم", "ششم", "هفتم", "هشتم", "نهم", "دهم"];
    return names[number - 1] || `شمارهٔ ${new Intl.NumberFormat("fa-IR").format(number)}`;
  }

  function renderTree(items, parentKey, depth) {
    const api = window.BenamCustomHeaderMenu;
    const children = items.filter((item) => item.parentKey === parentKey && !api.isHidden(item.parentKey));
    const output = [];
    let links = [];
    const flushLinks = () => {
      if (!links.length) return;
      output.push(`<div class="header-label-editor__fields">${links.join("")}</div>`);
      links = [];
    };

    children.forEach((item) => {
      const parent = api.parentOptions().find((option) => option.key === item.parentKey);
      const placement = escapeHtml(item.parentKey === api.rootKey ? "پس از قوانین و مقررات" : parent ? parent.label : "منوی هدر");
      const id = escapeHtml(item.id);
      const label = escapeHtml(item.label);
      const category = (() => {
        try { return new URL(item.href, window.location.href).searchParams.get("cat") || "—"; }
        catch (error) { return "—"; }
      })();
      const nested = depth < 3 ? renderTree(items, item.id, depth + 1) : "";
      const deleteButton = (title) => `<button type="button" class="header-delete-action" data-custom-action="delete" data-id="${id}">${title}</button>`;
      const input = (fieldLabel, inputId) => `
        <label class="form-group" for="${inputId}">
          <span>${fieldLabel}</span>
          <input class="form-control" id="${inputId}" data-custom-field="label" data-id="${id}"
            maxlength="80" required value="${label}" />
        </label>
      `;

      if (item.kind === "link") {
        links.push(`
          <div class="header-label-editor__field-with-action" data-custom-id="${id}">
            ${input("عنوان زیرگروه", `custom-header-${id}`)}
            ${deleteButton("حذف زیرگروه")}
            <div class="header-custom-item__placement">محل قرارگیری: ${placement} · مقصد دسته: ${escapeHtml(category)}</div>
            ${nested}
          </div>
        `);
        return;
      }

      flushLinks();
      if (item.kind === "menu") {
        output.push(`
          <section class="header-label-editor__group" data-custom-id="${id}">
            <div class="header-label-editor__group-title">
              <h2>${label}:</h2>
              ${deleteButton("حذف کل منو")}
            </div>
            <div class="header-label-editor__fields">
              ${input("عنوان منوی اصلی", `custom-header-${id}`)}
            </div>
            <div class="header-custom-item__placement">محل قرارگیری: ${placement} · مقصد دسته: ${escapeHtml(category)}</div>
            ${nested}
          </section>
        `);
        return;
      }

      const ordinal = `عنوان زیرگروه ${subgroupOrdinal(item, items)}`;
      output.push(`
        <section class="header-label-editor__subgroup" data-custom-id="${id}">
          <div class="header-label-editor__subgroup-title">
            <label for="custom-header-${id}">${ordinal}:</label>
            <input class="form-control" id="custom-header-${id}" data-custom-field="label" data-id="${id}"
              maxlength="80" required value="${label}" />
            ${deleteButton("حذف عنوان")}
          </div>
          ${nested}
          <div class="header-custom-item__placement">محل قرارگیری: ${placement} · عنوان گروهی، بدون مقصد لینک</div>
        </section>
      `);
    });

    flushLinks();
    return output.join("");
  }

  function renderCustomItems() {
    renderFields();
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
    const view = document.getElementById("view-header-menu");
    const restoreStructureButton = document.getElementById("restoreHeaderStructureBtn");

    if (labelForm && window.BenamHeaderLabels) {
      renderFields();
      labelForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const values = {};
        const currentLabels = window.BenamHeaderLabels.read();
        window.BenamHeaderLabels.fields.forEach((field) => {
          const input = labelForm.elements.namedItem(field.key);
          values[field.key] = input ? input.value.trim() : currentLabels[field.key] || field.value;
        });
        try {
          const menuApi = window.BenamCustomHeaderMenu;
          if (menuApi) {
            const customItems = menuApi.read();
            labelForm.querySelectorAll('[data-custom-field="label"][data-id]').forEach((input) => {
              const item = customItems.find((entry) => entry.id === input.getAttribute("data-id"));
              if (item) item.label = input.value.trim();
            });
            menuApi.save(customItems);
          }
          window.BenamHeaderLabels.save(values);
          toast("تغییرات منو در این مرورگر ذخیره شد.");
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
          const parentKey = parentInput.value || api.rootKey;
          const kind = api.kindForParent(parentKey, items);
          items.push({
            id: api.createId(),
            label,
            kind,
            href: kind === "group" ? "" : api.createHref(label, items),
            parentKey,
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

    if (view && window.BenamCustomHeaderMenu) {
      view.addEventListener("click", (event) => {
        const api = window.BenamCustomHeaderMenu;
        const staticDelete = event.target.closest("[data-static-delete]");
        if (staticDelete) {
          const key = staticDelete.getAttribute("data-static-delete");
          const kind = staticDelete.getAttribute("data-delete-kind");
          const message = kind === "main"
            ? "کل این منو و همهٔ عنوان‌ها و زیرگروه‌های آن حذف شود؟"
            : kind === "title"
              ? "این عنوان و همهٔ زیرگروه‌های آن حذف شود؟"
              : "فقط این زیرگروه از منو حذف شود؟";
          if (!window.confirm(message)) return;
          try {
            api.hideStatic(key);
            renderCustomItems();
            toast(kind === "main" ? "کل منو و زیرمجموعه‌هایش حذف شد." : kind === "title" ? "عنوان و زیرگروه‌هایش حذف شد." : "زیرگروه حذف شد.");
          } catch (error) {
            toast(error.message || "حذف انجام نشد.", "error");
          }
          return;
        }

        const button = event.target.closest('[data-custom-action="delete"]');
        if (!button) return;
        const items = api.read();
        const id = button.getAttribute("data-id");
        const target = items.find((item) => item.id === id);
        const message = target && target.kind === "group"
          ? "این عنوان و همهٔ زیرگروه‌هایش حذف شود؟"
          : target && target.kind === "menu"
            ? "این منوی اصلی و همهٔ زیرمجموعه‌هایش حذف شود؟"
            : "این زیرگروه حذف شود؟";
        if (!window.confirm(message)) return;
        try {
          api.save(removeTree(items, id));
          renderCustomItems();
          toast(target && target.kind === "group" ? "عنوان و زیرگروه‌هایش حذف شد." : "آیتم و زیرمجموعه‌هایش حذف شدند.");
        } catch (error) {
          toast(error.message || "حذف آیتم انجام نشد.", "error");
        }
      });
    }

    if (restoreStructureButton && window.BenamCustomHeaderMenu) {
      restoreStructureButton.addEventListener("click", () => {
        if (!window.confirm("آیتم‌های افزوده‌شده حذف و منوهای پیش‌فرض بازگردانده شوند؟")) return;
        window.BenamCustomHeaderMenu.restoreStructure();
        renderCustomItems();
        toast("ساختار پیش‌فرض منو بازگردانده شد.");
      });
    }

    window.addEventListener("benam:header-labels-changed", renderCustomItems);
    window.addEventListener("benam:header-custom-menu-changed", renderCustomItems);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
