/**
 * Site content — the item list and the tab itself
 *
 * The card rows that list every item, grouped by category, plus the tab's
 * own setup.
 *
 * This used to render twenty-seven separate tables carrying a hundred and
 * sixty-two repeated column headings. It is now one card row per item, with
 * only the first group expanded and a counter reading "۱۱ دسته · ۱۴ آیتم".
 *
 * LOADS LAST: the boot hook at the bottom calls initContentAdmin(), which
 * reaches into the editor and the home-section manager, so both must already
 * be defined.
 *
 * Split out of scripts/admin-content.js, which had grown to 1,784 lines.
 * Every classic <script> shares one global scope, so these four files see
 * each other exactly as one file would. Nothing here runs while the file is
 * being parsed except the boot hook at the end of content-table.js, which is
 * why that file loads last.
 */

let contentEditorState = {
  itemId: null,
  blocks: [],
  downloads: [],
};

let contentAdminInitialized = false;
let contentTableHasRendered = false;
let contentTableActionsBound = false;

function bindContentTableActions(container) {
  if (!container || contentTableActionsBound) return;
  contentTableActionsBound = true;

  // Delegate from the stable container instead of attaching two handlers to
  // every row each time the list is rebuilt.
  container.addEventListener("click", function (event) {
    const target = event.target;
    if (!target || typeof target.closest !== "function") return;

    const editButton = target.closest(".content-edit-btn");
    if (editButton && container.contains(editButton)) {
      openContentEditor(editButton.getAttribute("data-item-id"));
      return;
    }

    const deleteButton = target.closest(".content-delete-btn");
    if (deleteButton && container.contains(deleteButton)) {
      deleteContentItem(deleteButton.getAttribute("data-item-id"));
    }
  });
}

/**
 * Update the "where should this show up?" field for the chosen category.
 *
 * Three states, and the operator has to be able to tell them apart BEFORE
 * filling in a whole item:
 *
 *   1. The category has no home section at all. About thirty categories are
 *      header-menu destinations; only four card sections appear on the home
 *      page. News has no home-card placement, and the option is disabled.
 *
 *   2. The section has a free slot. The hint reports how many.
 *
 *   3. The section is full. The option stays ENABLED — a chosen item always
 *      wins a slot — but the notice names the item that will be pushed off
 *      the home page, so nothing disappears by surprise.
 *
 * State 3 is the normal one, not the exception: every section ships with
 * more built-in items than slots. An earlier version of this function
 * disabled the option whenever a section was full, which made the whole
 * feature unusable — the real sections are full from the very first load.
 */
function refreshPlacementField() {
  const homeOption = document.getElementById("newItemPlacementHomeOption");
  const hint = document.getElementById("newItemPlacementHint");
  const notice = document.getElementById("newItemPlacementNotice");
  const select = document.getElementById("newItemCategory");
  if (!homeOption || !hint || !notice || !select) return;

  const radio = homeOption.querySelector("input");
  const listRadio = document.querySelector(
    'input[name="newItemPlacement"][value="list"]',
  );
  const catKey = select.value;

  /** No home section for this category: the option cannot be honoured. */
  const disable = (hintText, message) => {
    if (radio) {
      radio.disabled = true;
      radio.checked = false;
    }
    if (listRadio) listRadio.checked = true;
    homeOption.classList.add("placement-option--blocked");
    hint.textContent = hintText;
    notice.textContent = message;
    notice.className = "placement-notice";
    notice.hidden = false;
  };

  /** The option is available. `message` is shown only when set. */
  const enable = (hintText, message) => {
    if (radio) radio.disabled = false;
    homeOption.classList.remove("placement-option--blocked");
    hint.textContent = hintText;
    if (message) {
      notice.textContent = message;
      notice.className = "placement-notice placement-notice--full";
      notice.hidden = false;
    } else {
      notice.hidden = true;
    }
  };

  if (!catKey) {
    if (radio) radio.disabled = true;
    homeOption.classList.add("placement-option--blocked");
    hint.textContent = "یک دسته انتخاب کنید تا ظرفیت آن نمایش داده شود";
    notice.hidden = true;
    return;
  }

  if (typeof categoryHasHomeSection !== "function") return;

  if (!categoryHasHomeSection(catKey)) {
    disable(
      "این دسته در صفحه اصلی بخشی ندارد",
      "این دسته یکی از منوهای هدر است و در صفحه اصلی نمایش داده نمی‌شود. آیتم در صفحه دسته‌بندی خودش دیده خواهد شد.",
    );
    return;
  }

  const category = typeof siteData !== "undefined" ? siteData[catKey] : null;
  const items = category ? category.items : [];
  const addedIds = (
    typeof loadAddedItems === "function" ? loadAddedItems() : []
  ).map((item) => item.id);

  const limit = homeSlotLimit(catKey);
  const title = homeSlotTitle(catKey);
  const free = homeSlotsRemaining(items, addedIds, catKey);

  if (free > 0) {
    enable(
      `بخش «${title}» — ${toPersianDigitsSafe(free)} جای خالی از ${toPersianDigitsSafe(limit)}`,
    );
    return;
  }

  // Full, but not blocked: say exactly what moves aside.
  const displaced = homeDisplacedItem(items, addedIds, catKey);
  enable(
    `بخش «${title}» پر است — آیتم شما جای یکی را می‌گیرد`,
    displaced
      ? `بخش «${title}» ${toPersianDigitsSafe(limit)} جا دارد و پر است. اگر این گزینه را انتخاب کنید، آیتم شما اول می‌آید و «${displaced.title || displaced.id}» از صفحه اصلی کنار می‌رود — ولی در صفحه دسته‌بندی همچنان دیده می‌شود.`
      : `بخش «${title}» ${toPersianDigitsSafe(limit)} جا دارد و پر است. آیتم شما جای آخرین آیتم فعلی را می‌گیرد.`,
  );
}

function getUsedContentItemIds() {
  const used = new Set();
  if (typeof siteData !== "undefined") {
    Object.values(siteData).forEach((category) => {
      if (category && Array.isArray(category.items)) {
        category.items.forEach((item) => item && item.id && used.add(String(item.id)));
      }
    });
  }
  if (typeof loadAddedItems === "function") {
    loadAddedItems().forEach((item) => item && item.id && used.add(String(item.id)));
  }
  if (typeof loadDeletedItemIds === "function") {
    loadDeletedItemIds().forEach((id) => used.add(String(id)));
  }
  if (typeof loadContentOverrides === "function") {
    Object.keys(loadContentOverrides()).forEach((id) => used.add(id));
  }
  return used;
}

function generateUniqueContentItemId(categoryKey) {
  const prefix = String(categoryKey || "content")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "content";
  const used = getUsedContentItemIds();

  let sequence = 1;
  let id = `${prefix}-item-${sequence}`;
  while (used.has(id)) {
    sequence += 1;
    id = `${prefix}-item-${sequence}`;
  }
  return id;
}

function refreshGeneratedItemId() {
  const category = document.getElementById("newItemCategory");
  const idField = document.getElementById("newItemId");
  const preview = document.getElementById("newItemIdPreview");
  if (!category || !idField || !preview || !category.value) return;
  const id = generateUniqueContentItemId(category.value);
  idField.value = id;
  preview.value = id;
}

function deleteContentItem(itemId) {
  if (confirm("آیا از حذف این آیتم اطمینان دارید؟ این عمل قابل بازگشت نیست.")) {
    if (typeof addDeletedItemId === "function") {
      addDeletedItemId(itemId);
    }
    if (typeof removeContentOverride === "function") {
      removeContentOverride(itemId);
    }
    if (typeof removeAddedItem === "function") {
      removeAddedItem(itemId);
    }

    if (
      typeof applyContentOverrides === "function" &&
      typeof siteData !== "undefined"
    ) {
      applyContentOverrides(siteData);
    }

    showToast("آیتم با موفقیت حذف شد.", "success");
    renderContentTable();
  }
}

function initContentAdmin() {
  if (contentAdminInitialized) {
    return;
  }

  contentAdminInitialized = true;
  const searchInput = document.getElementById("contentTableSearch");
  const form = document.getElementById("editContentForm");

  const addNewBtn = document.getElementById("addNewContentItemBtn");
  const addNewForm = document.getElementById("addNewItemForm");

  if (searchInput) {
    searchInput.addEventListener("input", function (event) {
      renderContentTable();
    });
  }

  if (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      saveEditedContent();
    });
  }

  if (addNewBtn) {
    addNewBtn.addEventListener("click", function () {
      populateCategorySelect();
      refreshGeneratedItemId();
      refreshPlacementField();
      openModal("addNewItemModal");
    });
  }

  // The placement hint depends on which category is chosen, so it has to be
  // recalculated every time that changes: "دوره‌های محبوب" may be full while
  // "مقالات" still has two slots, and most categories have no home section
  // at all.
  const newItemCategory = document.getElementById("newItemCategory");
  if (newItemCategory) {
    newItemCategory.addEventListener("change", function () {
      refreshGeneratedItemId();
      refreshPlacementField();
    });
  }

  if (addNewForm) {
    addNewForm.addEventListener("submit", function (event) {
      event.preventDefault();

      const idField = document.getElementById("newItemId");
      const preview = document.getElementById("newItemIdPreview");
      const requestedId = idField ? idField.value.trim() : "";
      const catKey = document.getElementById("newItemCategory").value;
      const usedIds = getUsedContentItemIds();
      const id = requestedId && !usedIds.has(requestedId)
        ? requestedId
        : generateUniqueContentItemId(catKey);
      if (idField) idField.value = id;
      if (preview) preview.value = id;
      const title = document.getElementById("newItemTitle").value.trim();
      const image =
        document.getElementById("newItemImage").value.trim() ||
        "../images/ravin.png";
      const excerpt = document.getElementById("newItemExcerpt").value.trim();

      if (!id || !catKey || !title) {
        showToast("لطفاً فیلدهای ضروری را پر کنید.", "error");
        return;
      }

      // Check for duplicates
      if (typeof findSiteItem === "function" && findSiteItem(id)) {
        showToast("خطا: آیتمی با این شناسه (ID) از قبل وجود دارد.", "error");
        return;
      }

      // Where it shows up. The radio defaults to "list", so an operator who
      // does not think about it gets the safe answer: the item goes to its
      // category page and the home page keeps the layout it was designed
      // with. See scripts/home-slots.js for why.
      const placement = document.querySelector(
        'input[name="newItemPlacement"]:checked',
      );
      const wantsHome = !!placement && placement.value === "both";

      // A category with no home section cannot honour the request. The radio
      // is disabled in that case, but a disabled control is a hint, not a
      // rule - and the backend will reach this same path later.
      if (
        wantsHome &&
        typeof categoryHasHomeSection === "function" &&
        !categoryHasHomeSection(catKey)
      ) {
        showToast(
          "این دسته در صفحه اصلی بخشی ندارد. آیتم فقط به صفحه دسته‌بندی اضافه می‌شود.",
          "error",
        );
        return;
      }

      // A full section is NOT refused: a chosen item always wins a slot and
      // pushes the last built-in off the home page. Name it, so the operator
      // sees what changed rather than noticing an absence later.
      let displaced = null;
      if (wantsHome && typeof homeDisplacedItem === "function") {
        const category = siteData[catKey];
        displaced = homeDisplacedItem(
          category ? category.items : [],
          (typeof loadAddedItems === "function" ? loadAddedItems() : []).map(
            (x) => x.id,
          ),
          catKey,
        );
      }

      const newItem = {
        id: id,
        title: title,
        categoryKey: catKey,
        image: image,
        excerpt: excerpt,
        // Explicit boolean, never undefined. An item saved before this field
        // existed reads as visible (see isHomeVisible), which is right for
        // old data but wrong as a default for anything created from now on.
        homeVisible: wantsHome,
        content: {
          blocks: [],
          video: null,
          downloads: [],
        },
      };

      if (typeof moveContentItemToFront === "function") {
        const currentItems = siteData[catKey] && Array.isArray(siteData[catKey].items)
          ? siteData[catKey].items
          : [];
        moveContentItemToFront(catKey, id, currentItems);
      }

      if (typeof saveAddedItem === "function") {
        saveAddedItem(newItem);
      }

      if (
        typeof applyContentOverrides === "function" &&
        typeof siteData !== "undefined"
      ) {
        applyContentOverrides(siteData);
      }

      closeModal("addNewItemModal");
      // Report the displacement in the same breath as the success. Telling
      // the operator afterwards, or not at all, is how a front page quietly
      // loses a card nobody meant to remove.
      showToast(
        displaced
          ? `آیتم اضافه شد و در صفحه اصلی نشست. «${displaced.title || displaced.id}» از صفحه اصلی کنار رفت و حالا فقط در صفحه دسته‌بندی دیده می‌شود.`
          : wantsHome
            ? "آیتم جدید اضافه شد و در صفحه اصلی نمایش داده می‌شود."
            : "آیتم جدید اضافه شد و در صفحه دسته‌بندی خودش نمایش داده می‌شود.",
        "success",
      );
      addNewForm.reset();
      renderContentTable();
    });
  }

  initHomeSections();

  const resetButton = document.getElementById("resetContentBtn");
  if (resetButton) {
    resetButton.addEventListener("click", resetEditedContent);
  }

  document.querySelectorAll("[data-add-block]").forEach(function (button) {
    button.addEventListener("click", function () {
      addContentBlock(button.getAttribute("data-add-block"));
    });
  });

  // Live guidance on the video field, same as the products form.
  const videoUrlInput = document.getElementById("contentVideoUrl");
  if (videoUrlInput && typeof fileSourceAdvice === "function") {
    const refresh = () => {
      renderUrlNotice(
        "contentVideoUrlNotice",
        fileSourceAdvice({
          url: videoUrlInput.value,
          category: "mp4",
          fileSize: "",
        }),
      );
    };
    videoUrlInput.addEventListener("input", refresh);
    videoUrlInput.addEventListener("blur", () => {
      const fixed = normalizeDownloadUrl(videoUrlInput.value);
      if (fixed !== videoUrlInput.value) videoUrlInput.value = fixed;
      // Reflect the detected provider in the dropdown so the operator sees it.
      const select = document.getElementById("contentVideoProvider");
      const detected = videoProviderFor(videoUrlInput.value);
      if (select && detected !== "file") select.value = detected;
      refresh();
    });
  }

  const addDownloadBtn = document.getElementById("addDownloadBtn");
  if (addDownloadBtn) {
    addDownloadBtn.addEventListener("click", addDownloadRow);
  }

  const videoEnabled = document.getElementById("contentVideoEnabled");
  if (videoEnabled) {
    videoEnabled.addEventListener("change", toggleVideoFields);
  }

  // Toggle price visibility for Video in content editor modal
  const contentVideoIsPaid = document.getElementById("contentVideoIsPaid");
  const contentVideoPriceContainer = document.getElementById(
    "contentVideoPriceContainer",
  );
  const contentVideoPrice = document.getElementById("contentVideoPrice");

  if (contentVideoIsPaid && contentVideoPriceContainer) {
    contentVideoIsPaid.addEventListener("change", function () {
      if (contentVideoIsPaid.checked) {
        contentVideoPriceContainer.style.display = "flex";
        if (contentVideoPrice) {
          contentVideoPrice.required = true;
          writePriceInput(contentVideoPrice, 50000);
        }
      } else {
        contentVideoPriceContainer.style.display = "none";
        if (contentVideoPrice) {
          contentVideoPrice.required = false;
          contentVideoPrice.value = "";
        }
      }
    });
  }

  // Toggle price visibility for Files/Downloads in content editor modal
  const contentFilesIsPaid = document.getElementById("contentFilesIsPaid");
  const contentFilesPriceContainer = document.getElementById(
    "contentFilesPriceContainer",
  );
  const contentFilesPrice = document.getElementById("contentFilesPrice");

  if (contentFilesIsPaid && contentFilesPriceContainer) {
    contentFilesIsPaid.addEventListener("change", function () {
      if (contentFilesIsPaid.checked) {
        contentFilesPriceContainer.style.display = "flex";
        if (contentFilesPrice) {
          contentFilesPrice.required = true;
          writePriceInput(contentFilesPrice, 50000);
        }
      } else {
        contentFilesPriceContainer.style.display = "none";
        if (contentFilesPrice) {
          contentFilesPrice.required = false;
          contentFilesPrice.value = "";
        }
      }
    });
  }

  // The content view is hidden on startup for most visits. Build its rows only
  // when the operator first opens it, rather than blocking the dashboard.
}

/**
 * One row in the item list.
 *
 * Replaces the five-column table that used to be repeated for every category.
 * With 27 categories - most holding one or two items - the header row was
 * taller than the data underneath it. A row carries the same information in a
 * single line, so nothing is lost and the headings stop repeating.
 *
 * The same markup serves the grouped view and the search results; search
 * passes `meta` so the category is still visible when rows are out of context.
 */
function contentItemRow(row) {
  const statusLabel = row.hasOverride
    ? "ذخیره ادمین"
    : row.hasBlocks
      ? "بلوک‌بندی"
      : "پیش‌فرض";
  // "پیش‌فرض" is a healthy state, not a problem. It used to borrow the
  // cancelled pill, which painted a perfectly normal item in alarm red.
  const statusClass = row.hasOverride
    ? "is-saved"
    : row.hasBlocks
      ? "is-blocks"
      : "is-default";

  const image = row.image || "../images/ravin.png";
  const meta = row.meta
    ? '<span class="content-item__cat">' + escapeHtml(row.meta) + "</span>"
    : "";

  return (
    '<article class="content-item">' +
    '  <img class="content-item__thumb" src="' +
    escapeAttr(image) +
    '" alt="" loading="lazy" onerror="this.src=\'../images/ravin.png\'">' +
    '  <div class="content-item__text">' +
    '    <strong class="content-item__title">' +
    escapeHtml(row.title || "بدون عنوان") +
    "</strong>" +
    '    <span class="content-item__meta">' +
    "      <code>" +
    escapeHtml(row.id) +
    "</code>" +
    meta +
    "    </span>" +
    "  </div>" +
    '  <span class="content-status ' +
    statusClass +
    '">' +
    statusLabel +
    "</span>" +
    '  <div class="content-item__actions">' +
    '    <button type="button" class="btn-secondary content-edit-btn" data-item-id="' +
    escapeAttr(row.id) +
    '"><i class="fas fa-pen"></i> ویرایش</button>' +
    '    <button type="button" class="btn-secondary content-delete-btn" data-item-id="' +
    escapeAttr(row.id) +
    '" aria-label="حذف ' +
    escapeAttr(row.title || row.id) +
    '"><i class="fas fa-trash"></i></button>' +
    "  </div>" +
    "</article>"
  );
}

function renderContentTable() {
  const container = document.getElementById("groupedContentContainer");
  if (!container) {
    return;
  }
  bindContentTableActions(container);

  try {
    if (
      typeof getAllSiteItems !== "function" ||
      typeof siteData === "undefined"
    ) {
      container.innerHTML =
        '<div class="alert alert-error">اطلاعات محتوا بارگذاری نشده است. صفحه را دوباره بارگذاری کنید.</div>';
      return;
    }

    const searchQuery = document.getElementById("contentTableSearch")
      ? document.getElementById("contentTableSearch").value.trim().toLowerCase()
      : "";

    // 1. Search Mode
    if (searchQuery) {
      const items = getAllSiteItems().filter(function (row) {
        if (!isAdminContentCategory(row.categoryKey)) return false;
        return (
          String(row.id).toLowerCase().includes(searchQuery) ||
          String(row.title).toLowerCase().includes(searchQuery) ||
          String(row.categoryTitle).toLowerCase().includes(searchQuery)
        );
      });

      if (!items.length) {
        container.innerHTML =
          '<div style="text-align: center; padding: 2rem; color: var(--text-muted);">نتیجه‌ای برای جستجوی شما پیدا نشد.</div>';
        contentTableHasRendered = true;
        return;
      }

      container.innerHTML =
        '<div class="content-group__head content-group__head--search">' +
        '  <span class="content-group__title">نتایج جستجو</span>' +
        '  <span class="content-count">' +
        toPersianDigitsSafe(items.length) +
        " آیتم</span>" +
        "</div>" +
        '<div class="content-item-list">' +
        items
          .map(function (row) {
            return contentItemRow({
              id: row.id,
              title: row.title,
              image: row.image,
              hasOverride: row.hasOverride,
              hasBlocks: row.hasBlocks,
              meta: row.categoryTitle,
            });
          })
          .join("") +
        "</div>";
      contentTableHasRendered = true;

      return;
    }

    // 2. Normal Grouped Accordion Mode. The four header-menu groups share
    // one schema with the Add Item selector; public site policies are hidden.
    const groups = getContentCategoryGroups({
      includeCustom: true,
      includeFallback: true,
    });
    const contentOverrides =
      typeof loadContentOverrides === "function" ? loadContentOverrides() : {};

    let htmlContent = "";

    groups.forEach(function (group, groupIdx) {
      let groupCategoriesHtml = "";
      let groupItemCount = 0;
      let groupCategoryCount = 0;

      group.categories.forEach(function (catKey) {
        const category = siteData[catKey];
        if (!category) return;

        const categoryItems = category.items || [];
        groupCategoryCount += 1;
        groupItemCount += categoryItems.length;

        let itemsHtml;
        if (categoryItems.length === 0) {
          itemsHtml =
            '<p class="content-empty">هیچ آیتمی در این دسته وجود ندارد.</p>';
        } else {
          itemsHtml =
            '<div class="content-item-list">' +
            categoryItems
              .map(function (item) {
                const hasBlocks =
                  typeof getContentBlocks === "function"
                    ? getContentBlocks(item).length > 0
                    : Boolean(item.content);
                return contentItemRow({
                  id: item.id,
                  title: item.title,
                  image: item.image,
                  hasOverride: Boolean(contentOverrides[item.id]),
                  hasBlocks: hasBlocks,
                });
              })
              .join("") +
            "</div>";
        }

        groupCategoriesHtml +=
          '<section class="content-category">' +
          '  <header class="content-category__head">' +
          '    <i class="fa-solid fa-folder-open"></i>' +
          "    <h4>" +
          escapeHtml(category.title) +
          "</h4>" +
          '    <code class="content-category__key">' +
          escapeHtml(catKey) +
          "</code>" +
          '    <span class="content-count">' +
          toPersianDigitsSafe(categoryItems.length) +
          " آیتم</span>" +
          "  </header>" +
          itemsHtml +
          "</section>";
      });

      // Only the first group starts open. Every group used to be forced open,
      // which meant all 85 rows rendered at once and the operator had to
      // scroll past everything to reach the group they wanted.
      const isOpen = groupIdx === 0 ? " open" : "";

      htmlContent +=
        '<details class="content-group"' +
        isOpen +
        ' data-group="' +
        escapeAttr(group.id) +
        '">' +
        '  <summary class="content-group__head">' +
        '    <i class="fa-solid fa-chevron-down content-group__chevron"></i>' +
        '    <span class="content-group__title">' +
        escapeHtml(group.title) +
        "</span>" +
        '    <span class="content-group__stats">' +
        '      <span class="content-count">' +
        toPersianDigitsSafe(groupCategoryCount) +
        " دسته</span>" +
        '      <span class="content-count content-count--primary">' +
        toPersianDigitsSafe(groupItemCount) +
        " آیتم</span>" +
        "    </span>" +
        "  </summary>" +
        '  <div class="content-group__body">' +
        groupCategoriesHtml +
        "</div>" +
        "</details>";
    });

    container.innerHTML = htmlContent;
    contentTableHasRendered = true;

    // The chevron is controlled by CSS and row actions are delegated from
    // the stable container, so rebuilding rows installs no extra listeners.
  } catch (err) {
    console.error("Error inside renderContentTable:", err);
    container.innerHTML = `<div class="alert alert-error" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); padding: 1rem; border-radius: 8px;">خطا در لود دسته‌بندی‌ها: ${err.message}</div>`;
  }
}

function bootContentAdmin() {
  if (document.getElementById("view-site-content")) {
    initContentAdmin();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootContentAdmin);
} else {
  bootContentAdmin();
}
