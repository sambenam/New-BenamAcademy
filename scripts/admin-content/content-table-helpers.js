/**
 * Content admin helpers — shared by the item form and the content accordion.
 * Loaded before content-table.js, whose boot hook calls initContentAdmin().
 */

/**
 * The admin's primary groups follow the public header menus. Keep this one
 * schema for both the content list and the Add Item category selector.
 * Homepage-only slots and custom homepage sections are included separately.
 * Public About Us policies stay in site data but are intentionally outside
 * admin listing, search, editing, and Add Item workflows.
 */
const ADMIN_HIDDEN_CONTENT_CATEGORIES = [
  // Public About Us policies are static from the admin's point of view.
  "siteTerms",
  "privacyRules",
  "purchaseRules",
  "copyrightRules",
  "aboutUs",
  // Header aggregates are navigation destinations, not editable leaf groups.
  "forStudents",
  "accountingFiles",
  "regulations",
];

function isAdminContentCategory(categoryKey) {
  return ADMIN_HIDDEN_CONTENT_CATEGORIES.indexOf(categoryKey) === -1;
}

const CONTENT_CATEGORY_GROUPS = [
  {
    id: "group-students",
    title: "🎓 منوهای هدر: برای دانشجویان",
    categories: [
      "diploma",
      "associate_degree",
      "bachelor",
      "master",
      "phd",
      "konkur1",
      "konkur2",
      "konkur3",
      "Enterpreneurship_projects",
      "Enternship-projects",
      "Financial-project",
    ],
  },
  {
    id: "group-courses",
    title: "🎬 منوهای هدر: دوره‌ها",
    categories: ["beginner", "intermediate", "advanced", "videos"],
  },
  {
    id: "group-regulations",
    title: "⚖️ منوهای هدر: قوانین و مقررات",
    categories: [
      "constitution",
      "commercialLaw",
      "laborLaw",
      "taxLaw",
      "socialSecurityLaw",
    ],
  },
  {
    id: "group-news",
    title: "📰 منوهای هدر: اخبار",
    categories: ["exams"],
  },
  {
    id: "group-home",
    title: "🏠 سکشن‌های صفحه اصلی",
    categories: ["popularCourses", "newCourses", "specials", "articles"],
  },
];

/** Return copies so callers can add custom/fallback groups safely. */
function getContentCategoryGroups(options) {
  const settings = options || {};
  const groups = CONTENT_CATEGORY_GROUPS.map(function (group) {
    return {
      id: group.id,
      title: group.title,
      categories: group.categories.slice(),
    };
  });

  const headerLabels = typeof window !== "undefined" && window.BenamHeaderLabels && window.BenamHeaderLabels.read
    ? window.BenamHeaderLabels.read()
    : {};
  const menuNames = {
    forStudents: "برای دانشجویان",
    courses: "دوره‌ها",
    regulations: "قوانین و مقررات",
    news: "اخبار",
  };
  const groupNames = {
    forStudents: "group-students",
    courses: "group-courses",
    regulations: "group-regulations",
    news: "group-news",
  };
  Object.keys(groupNames).forEach(function (menuKey) {
    const group = groups.find(function (entry) { return entry.id === groupNames[menuKey]; });
    if (group) group.title = group.title.replace(menuNames[menuKey], headerLabels[menuKey] || menuNames[menuKey]);
  });

  if (typeof getHeaderCustomCategoryRecords === "function") {
    getHeaderCustomCategoryRecords().forEach(function (record) {
      if (typeof siteData === "undefined" || !siteData[record.categoryKey]) return;
      let group = groups.find(function (entry) { return entry.id === record.groupId; });
      if (!group) {
        group = { id: record.groupId, title: record.groupTitle, categories: [] };
        const homeIndex = groups.findIndex(function (entry) { return entry.id === "group-home"; });
        if (homeIndex === -1) groups.push(group);
        else groups.splice(homeIndex, 0, group);
      } else if (record.groupId.indexOf("group-custom-header-") === 0) {
        group.title = record.groupTitle;
      }
      if (group.categories.indexOf(record.categoryKey) === -1) {
        group.categories.push(record.categoryKey);
      }
    });
  }

  if (settings.includeCustom && typeof loadHomeSections === "function") {
    const customCategories = loadHomeSections()
      .map(function (section) {
        return section.key;
      })
      .filter(function (key) {
        return typeof siteData !== "undefined" && Boolean(siteData[key]);
      });
    if (customCategories.length) {
      groups.push({
        id: "group-custom-home",
        title: "✨ سکشن‌های سفارشی",
        categories: customCategories,
      });
    }
  }

  if (settings.includeFallback && typeof siteData !== "undefined") {
    const knownCategories = [];
    groups.forEach(function (group) {
      group.categories.forEach(function (key) {
        knownCategories.push(key);
      });
    });
    const fallbackCategories = Object.keys(siteData).filter(function (key) {
      return (
        isAdminContentCategory(key) &&
        knownCategories.indexOf(key) === -1
      );
    });
    if (fallbackCategories.length) {
      groups.push({
        id: "group-fallback",
        title: "⚙️ سایر دسته‌بندی‌های موجود",
        categories: fallbackCategories,
      });
    }
  }

  return groups;
}

function populateCategorySelect() {
  const select = document.getElementById("newItemCategory");
  if (!select) return;

  if (typeof siteData === "undefined") {
    select.innerHTML = '<option value="">اطلاعات لود نشده است</option>';
    return;
  }

  // Legacy/archive categories and the static About Us policies are
  // intentionally omitted. Add new items only under a header menu or a
  // real/custom homepage section.
  const groups = getContentCategoryGroups({
    includeCustom: true,
    includeFallback: false,
  });

  let htmlOptions = "";
  groups.forEach((group) => {
    htmlOptions += `<optgroup label="${escapeAttr(group.title)}">`;
    group.categories.forEach((catKey) => {
      const category = siteData[catKey];
      if (category) {
        htmlOptions += `<option value="${escapeAttr(catKey)}">${escapeHtml(category.title)} (${escapeHtml(catKey)})</option>`;
      }
    });
    htmlOptions += `</optgroup>`;
  });

  select.innerHTML = htmlOptions;
}
