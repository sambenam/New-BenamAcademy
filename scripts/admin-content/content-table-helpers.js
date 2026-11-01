/**
 * Content admin helpers — shared by the item form and the content accordion.
 * Loaded before content-table.js, whose boot hook calls initContentAdmin().
 */

/**
 * The admin's primary groups follow the public header menus. Keep this one
 * schema for both the content list and the Add Item category selector.
 * Homepage-only slots and custom homepage sections are included separately;
 * legacy categories stay visible in the content list, but are not offered for
 * new items unless they belong to a menu or homepage section.
 */
const CONTENT_CATEGORY_GROUPS = [
  {
    id: "group-students",
    title: "🎓 منوی هدر: برای دانشجویان",
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
    title: "🎬 منوی هدر: دوره‌ها",
    categories: ["beginner", "intermediate", "advanced", "videos"],
  },
  {
    id: "group-regulations",
    title: "⚖️ منوی هدر: قوانین و مقررات",
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
    title: "📰 منوی هدر: اخبار",
    categories: ["exams"],
  },
  {
    id: "group-about-us",
    title: "ℹ️ درباره ما",
    categories: ["siteTerms", "privacyRules", "purchaseRules", "copyrightRules"],
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
      return knownCategories.indexOf(key) === -1;
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

  // Legacy/archive categories are intentionally omitted from this selector;
  // only the public menus, About Us policies, and real/custom home sections
  // are valid destinations for a new item.
  const groups = getContentCategoryGroups({
    includeCustom: true,
    includeFallback: false,
  });

  let htmlOptions = "";
  groups.forEach((group) => {
    htmlOptions += `<optgroup label="${group.title}">`;
    group.categories.forEach((catKey) => {
      const category = siteData[catKey];
      if (category) {
        htmlOptions += `<option value="${catKey}">${category.title} (${catKey})</option>`;
      }
    });
    htmlOptions += `</optgroup>`;
  });

  select.innerHTML = htmlOptions;
}
