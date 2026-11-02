/*
 * Editable labels for the public desktop and mobile navigation.
 *
 * Until the backend settings endpoint is connected, labels are stored in this
 * browser's localStorage under benamacademyHeaderLabels. Replace the local
 * persistence in readLabels / saveLabels with the global settings API adapter
 * during backend handoff.
 */
(function () {
  "use strict";

  const STORAGE_KEY = "benamacademyHeaderLabels";
  const FIELDS = [
    { key: "forStudents", group: "منوهای اصلی", label: "برای دانشجویان", value: "برای دانشجویان" },
    { key: "courses", group: "منوهای اصلی", label: "دوره‌ها", value: "دوره‌ها" },
    { key: "regulations", group: "منوهای اصلی", label: "قوانین و مقررات", value: "قوانین و مقررات" },
    { key: "news", group: "منوهای اصلی", label: "اخبار", value: "اخبار" },
    { key: "aboutUs", group: "منوهای اصلی", label: "درباره ما", value: "درباره ما" },

    { key: "studentsBooks", group: "برای دانشجویان", label: "عنوان زیرگروه اول", value: "کتاب و جزوه" },
    { key: "diploma", group: "برای دانشجویان", label: "دروس تخصصی دیپلم", value: "دروس تخصصی دیپلم" },
    { key: "associate_degree", group: "برای دانشجویان", label: "دروس تخصصی کاردانی", value: "دروس تخصصی کاردانی" },
    { key: "bachelor", group: "برای دانشجویان", label: "دروس تخصصی کارشناسی", value: "دروس تخصصی کارشناسی" },
    { key: "master", group: "برای دانشجویان", label: "دروس تخصصی ارشد", value: "دروس تخصصی ارشد" },
    { key: "phd", group: "برای دانشجویان", label: "دروس تخصصی دکتری", value: "دروس تخصصی دکتری" },
    { key: "studentsExamGroup", group: "برای دانشجویان", label: "عنوان زیرگروه کنکور", value: "کنکوری‌ها" },
    { key: "konkur1", group: "برای دانشجویان", label: "سوالات کنکور و پاسخ‌ها", value: "سوالات کنکور و پاسخ‌ها" },
    { key: "konkur2", group: "برای دانشجویان", label: "ضرایب و منابع کنکور", value: "ضرایب و منابع کنکور" },
    { key: "konkur3", group: "برای دانشجویان", label: "روش مطالعه و تست", value: "روش مطالعه و تست" },
    { key: "studentsProjects", group: "برای دانشجویان", label: "عنوان زیرگروه پروژه‌ها", value: "پروژه‌های حسابداری" },
    { key: "Enterpreneurship_projects", group: "برای دانشجویان", label: "پروژه‌های کارآفرینی", value: "پروژه‌های کارآفرینی" },
    { key: "Enternship-projects", group: "برای دانشجویان", label: "پروژه‌های کارآموزی", value: "پروژه‌های کارآموزی" },
    { key: "Financial-project", group: "برای دانشجویان", label: "پروژه‌های مالی و حسابداری", value: "پروژه‌های مالی و حسابداری" },
    { key: "allForStudents", group: "برای دانشجویان", label: "لینک موبایل: همه مطالب دانشجویان", value: "همهٔ مطالب دانشجویان" },

    { key: "allCourses", group: "دوره‌ها", label: "لینک موبایل: همه دوره‌ها", value: "همهٔ دوره‌ها" },
    { key: "beginner", group: "دوره‌ها", label: "دوره‌های مقدماتی حسابداری", value: "دوره‌های مقدماتی حسابداری" },
    { key: "intermediate", group: "دوره‌ها", label: "دوره‌های سطح متوسط", value: "دوره‌های سطح متوسط" },
    { key: "advanced", group: "دوره‌ها", label: "دوره‌های پیشرفته", value: "دوره‌های پیشرفته" },
    { key: "videos", group: "دوره‌ها", label: "فیلم‌های آموزشی", value: "فیلم‌های آموزشی" },

    { key: "allRegulations", group: "قوانین و مقررات", label: "لینک موبایل: همه قوانین", value: "همهٔ قوانین" },
    { key: "constitution", group: "قوانین و مقررات", label: "قانون اساسی جمهوری اسلامی ایران", value: "قانون اساسی جمهوری اسلامی ایران" },
    { key: "commercialLaw", group: "قوانین و مقررات", label: "قانون تجارت", value: "قانون تجارت" },
    { key: "laborLaw", group: "قوانین و مقررات", label: "قانون کار", value: "قانون کار" },
    { key: "taxLaw", group: "قوانین و مقررات", label: "قوانین مالیاتی", value: "قوانین مالیاتی" },
    { key: "socialSecurityLaw", group: "قوانین و مقررات", label: "قانون تأمین اجتماعی", value: "قانون تأمین اجتماعی" },
  ];

  const DEFAULTS = Object.fromEntries(FIELDS.map((field) => [field.key, field.value]));

  function readLabels() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const saved = raw ? JSON.parse(raw) : {};
      if (!saved || typeof saved !== "object" || Array.isArray(saved)) {
        return { ...DEFAULTS };
      }
      const labels = { ...DEFAULTS };
      FIELDS.forEach((field) => {
        const value = saved[field.key];
        if (typeof value === "string" && value.trim()) {
          labels[field.key] = value.trim().slice(0, 80);
        }
      });
      return labels;
    } catch (error) {
      return { ...DEFAULTS };
    }
  }

  function announceChange(labels) {
    if (typeof window.CustomEvent === "function") {
      window.dispatchEvent(
        new window.CustomEvent("benam:header-labels-changed", {
          detail: labels,
        }),
      );
    }
  }

  function saveLabels(nextLabels) {
    const cleaned = {};
    FIELDS.forEach((field) => {
      const value = String((nextLabels && nextLabels[field.key]) || "").trim();
      if (!value) throw new Error("نام «" + field.label + "» نمی‌تواند خالی باشد.");
      cleaned[field.key] = value.slice(0, 80);
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
    announceChange({ ...DEFAULTS, ...cleaned });
    return { ...DEFAULTS, ...cleaned };
  }

  function resetLabels() {
    localStorage.removeItem(STORAGE_KEY);
    const defaults = { ...DEFAULTS };
    announceChange(defaults);
    return defaults;
  }

  function applyLabels(root) {
    const host = root || document;
    const labels = readLabels();
    host.querySelectorAll("[data-header-label]").forEach((node) => {
      const value = labels[node.getAttribute("data-header-label")];
      if (!value) return;

      const directSpan = Array.from(node.children).find(
        (child) => child.tagName === "SPAN",
      );
      if (directSpan) {
        directSpan.textContent = value;
        return;
      }

      const textNode = Array.from(node.childNodes).find(
        (child) => child.nodeType === 3 && child.textContent.trim(),
      );
      if (textNode) {
        textNode.textContent = value;
      } else {
        node.textContent = value;
      }
    });
    return labels;
  }

  window.BenamHeaderLabels = {
    storageKey: STORAGE_KEY,
    fields: FIELDS,
    defaults: { ...DEFAULTS },
    read: readLabels,
    save: saveLabels,
    reset: resetLabels,
    apply: applyLabels,
  };

  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) applyLabels(document);
  });
  window.addEventListener("benam:header-labels-changed", () => applyLabels(document));

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => applyLabels(document));
  } else {
    applyLabels(document);
  }
})();
