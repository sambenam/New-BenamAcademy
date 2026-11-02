/* Admin editor for the public header's navigation labels. */
(function () {
  "use strict";

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => {
      const map = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      return map[char];
    });
  }

  function renderFields() {
    const api = window.BenamHeaderLabels;
    const host = document.getElementById("headerLabelFields");
    if (!api || !host) return;

    const current = api.read();
    const groups = [];
    api.fields.forEach((field) => {
      let group = groups.find((entry) => entry.name === field.group);
      if (!group) {
        group = { name: field.group, fields: [] };
        groups.push(group);
      }
      group.fields.push(field);
    });

    host.innerHTML = groups
      .map(
        (group) => `
          <section class="header-label-editor__group">
            <h2>${escapeHtml(group.name)}</h2>
            <div class="header-label-editor__fields">
              ${group.fields
                .map(
                  (field) => `
                    <label class="form-group" for="header-label-${escapeHtml(field.key)}">
                      <span>${escapeHtml(field.label)}</span>
                      <input class="form-control" id="header-label-${escapeHtml(field.key)}"
                        name="${escapeHtml(field.key)}" maxlength="80" required
                        value="${escapeHtml(current[field.key] || field.value)}" />
                    </label>
                  `,
                )
                .join("")}
            </div>
          </section>
        `,
      )
      .join("");
  }

  function init() {
    const form = document.getElementById("headerLabelsForm");
    const resetButton = document.getElementById("resetHeaderLabelsBtn");
    if (!form || !window.BenamHeaderLabels) return;

    renderFields();

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const values = {};
      window.BenamHeaderLabels.fields.forEach((field) => {
        const input = form.elements.namedItem(field.key);
        values[field.key] = input ? input.value.trim() : "";
      });

      try {
        window.BenamHeaderLabels.save(values);
        if (typeof showToast === "function") {
          showToast("نام‌های منوی هدر در این مرورگر ذخیره شد.", "success");
        }
      } catch (error) {
        if (typeof showToast === "function") {
          showToast(error.message || "ذخیره نام‌های هدر انجام نشد.", "error");
        }
      }
    });

    if (resetButton) {
      resetButton.addEventListener("click", () => {
        window.BenamHeaderLabels.reset();
        renderFields();
        if (typeof showToast === "function") {
          showToast("نام‌های پیش‌فرض منوی هدر بازگردانده شد.", "success");
        }
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
