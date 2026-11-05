function getHeaderCustomCategoryRecords() {
  if (typeof window === "undefined") return [];
  const api = window.BenamCustomHeaderMenu;
  if (!api || typeof api.read !== "function") return [];

  const items = api.read();
  const menuDefinitions = api.builtInMenus || [];
  const labelApi = window.BenamHeaderLabels;
  const labelValues = labelApi && typeof labelApi.read === "function" ? labelApi.read() : {};
  const fields = labelApi && Array.isArray(labelApi.fields) ? labelApi.fields : [];
  const categoryOf = (item) => {
    try { return new URL(item.href, window.location.href).searchParams.get("cat") || ""; }
    catch (error) { return ""; }
  };
  const builtinInfo = (key) => {
    const menu = menuDefinitions.find((entry) => entry.key === key);
    if (!menu) return null;
    const title = labelValues[key] || menu.fallback || key;
    const groupIds = {
      forStudents: "group-students",
      courses: "group-courses",
      regulations: "group-regulations",
      news: "group-news",
    };
    return {
      groupId: groupIds[key] || "group-header-" + key,
      groupTitle: "🎛️ منوهای هدر: " + title,
    };
  };
  const rootInfoFor = (item) => {
    if (item.parentKey === api.rootKey && item.kind === "menu") {
      return { groupId: "group-custom-header-" + item.id, groupTitle: "🧭 منوی هدر: " + item.label };
    }
    let parentKey = item.parentKey;
    let steps = 0;
    while (parentKey && steps++ < 5) {
      const builtin = builtinInfo(parentKey);
      if (builtin) return builtin;
      const field = fields.find((entry) => entry.key === parentKey);
      if (field) {
        const parentMenu = menuDefinitions.find((entry) => entry.fallback === field.group);
        if (parentMenu) return builtinInfo(parentMenu.key);
      }
      const parent = items.find((entry) => entry.id === parentKey);
      if (!parent) return null;
      if (parent.kind === "menu" && parent.parentKey === api.rootKey) {
        return { groupId: "group-custom-header-" + parent.id, groupTitle: "🧭 منوی هدر: " + parent.label };
      }
      parentKey = parent.parentKey;
    }
    return null;
  };

  const records = new Map();
  items.forEach((item) => {
    if (item.kind === "group" || !item.href) return;
    const categoryKey = categoryOf(item);
    if (!categoryKey) return;
    const rootInfo = rootInfoFor(item);
    if (!rootInfo || records.has(categoryKey)) return;
    records.set(categoryKey, {
      categoryKey,
      title: item.label,
      itemId: item.id,
      groupId: rootInfo.groupId,
      groupTitle: rootInfo.groupTitle,
    });
  });
  return Array.from(records.values());
}

const HEADER_CUSTOM_CATEGORIES_KEY = "benamacademyHeaderContentCategories";

function readHeaderCustomCategoryRegistry() {
  try {
    const raw = localStorage.getItem(HEADER_CUSTOM_CATEGORIES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((entry) => entry && entry.categoryKey && entry.title) : [];
  } catch (error) {
    return [];
  }
}

function syncHeaderCustomCategories(data) {
  const target = data || (typeof siteData !== "undefined" ? siteData : null);
  if (!target) return [];

  const activeRecords = getHeaderCustomCategoryRecords();
  const registry = new Map(readHeaderCustomCategoryRegistry().map((record) => [record.categoryKey, record]));
  activeRecords.forEach((record) => registry.set(record.categoryKey, record));

  const activeKeys = new Set(activeRecords.map((record) => record.categoryKey));
  const addedItems = typeof loadAddedItems === "function" ? loadAddedItems() : [];
  Array.from(registry.keys()).forEach((categoryKey) => {
    if (activeKeys.has(categoryKey)) return;
    if (addedItems.some((item) => item.categoryKey === categoryKey)) return;
    registry.delete(categoryKey);
    if (target[categoryKey] && target[categoryKey]._headerMenuCategory) delete target[categoryKey];
  });

  registry.forEach((record, categoryKey) => {
    const category = target[categoryKey];
    if (!category) {
      target[categoryKey] = { title: record.title, items: [], _headerMenuCategory: true };
    } else if (category._headerMenuCategory) {
      category.title = record.title;
    }
  });

  try {
    localStorage.setItem(HEADER_CUSTOM_CATEGORIES_KEY, JSON.stringify(Array.from(registry.values())));
  } catch (error) {
    console.warn("data: could not save custom header categories", error);
  }
  return activeRecords;
}

const siteData = (() => {
  const fromHeader =
    typeof headerItems !== "undefined" &&
    typeof flattenHeaderItems === "function"
      ? flattenHeaderItems(headerItems)
      : {};

  const fromMain = typeof mainItems !== "undefined" ? mainItems : {};

  const merged = {
    ...fromHeader,
    ...fromMain,
  };

  // Categories linked from administrator-added header items are valid content
  // destinations too, even before their first article is created.
  syncHeaderCustomCategories(merged);

  // Categories created by custom home sections. Without this the section
  // exists but has nowhere to put its items.
  if (typeof loadHomeSections === "function") {
    loadHomeSections().forEach((section) => {
      if (section && section.key && !merged[section.key]) {
        merged[section.key] = { title: section.title, items: [] };
      }
    });
  }

  return typeof applyContentOverrides === "function"
    ? applyContentOverrides(merged)
    : merged;
})();

function refreshHeaderContentCategories() {
  syncHeaderCustomCategories(siteData);
  if (typeof applyContentOverrides === "function") applyContentOverrides(siteData);
  if (typeof populateCategorySelect === "function") populateCategorySelect();
  if (
    typeof renderContentTable === "function" &&
    (typeof contentTableHasRendered === "undefined" || contentTableHasRendered)
  ) {
    renderContentTable();
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("benam:header-custom-menu-changed", refreshHeaderContentCategories);
  window.addEventListener("benam:header-labels-changed", refreshHeaderContentCategories);
  window.addEventListener("storage", function (event) {
    if (event.key === "benamacademyHeaderCustomItems" || event.key === "benamacademyHeaderLabels") {
      refreshHeaderContentCategories();
    }
  });
}
