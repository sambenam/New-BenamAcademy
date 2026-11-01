(function () {
  if (typeof siteData === "undefined") {
    console.warn("home-renderer.js: siteData تعریف نشده است.");
    return;
  }

  // Content entered through the admin panel is rendered as text, not markup.
  // Escaping it prevents titles/excerpts from breaking card structure or
  // injecting page styles/scripts into the public homepage.
  function escapeHTML(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[char]);
  }

  function safeImageSource(value) {
    const source = String(value || "../images/ravin.png").trim();
    const safePath = /^(?:https?:\/\/|\/|\.\/|\.\.\/)/i.test(source);
    const safeImageData = /^data:image\/[a-z0-9.+-]+;base64,/i.test(source);
    if ((safePath || safeImageData) && !/[\u0000-\u001f]/.test(source)) {
      return escapeHTML(source);
    }
    return "../images/ravin.png";
  }

  // Load added items to identify custom items
  const addedItemsRaw = localStorage.getItem("benamacademyAddedItems");
  const addedIds = [];
  if (addedItemsRaw) {
    try {
      const parsed = JSON.parse(addedItemsRaw);
      if (Array.isArray(parsed)) {
        parsed.forEach(function (item) {
          if (item && item.id) {
            addedIds.push(item.id);
          }
        });
      }
    } catch (e) {
      console.warn("home-renderer: خطا در خواندن added items", e);
    }
  }

  /**
   * The items one home section should render.
   *
   * Two rules, both in scripts/home-slots.js so the panel and the page can
   * never disagree about them:
   *
   *   1. An operator-created item only appears here if it was marked for the
   *      home page. The default is no: a new item goes to its category page,
   *      which is where a visitor looking for it will actually go.
   *
   *   2. The section is cut to its slot limit. It used to add every custom
   *      item on top of the defaults with no cap, so fifteen new courses
   *      turned a four-card grid into nineteen cards.
   *
   * `defaultCount` remains as a fallback for the original call sites, but
   * the real limit comes from HOME_SLOTS, which the admin panel also reads.
   */
  function getItemsToDisplay(categoryKey, defaultCount) {
    const category = siteData[categoryKey];
    if (!category || !Array.isArray(category.items)) {
      return [];
    }

    if (typeof homeSectionItems === "function") {
      return homeSectionItems(category.items, addedIds, categoryKey);
    }

    // home-slots.js missing: fall back to the old behaviour rather than
    // rendering an empty page.
    const items = category.items;
    return items
      .filter(function (item) {
        return addedIds.indexOf(item.id) === -1;
      })
      .slice(0, defaultCount)
      .concat(
        items.filter(function (item) {
          return addedIds.indexOf(item.id) !== -1;
        }),
      );
  }

  // 1. POPULAR COURSES (Show first 4 defaults + all custom items)
  const popularContainer = document.querySelector(".popular-courses_items");
  if (popularContainer) {
    const itemsToShow = getItemsToDisplay("popularCourses", 4);
    const courseTags = ["مالی و سرمایه‌گذاری", "حسابداری", "تحلیل داده", "برنامه‌نویسی"];
    const courseDurations = ["۱۰ ساعت", "۱۲ فصل", "۱۰ ساعت", "۸ ساعت"];
    const courseLevels = ["متوسط", "مقدماتی", "متوسط", "مقدماتی"];
    if (itemsToShow.length > 0) {
      popularContainer.innerHTML = itemsToShow
        .map(
          (item, index) => `
        <li class="popular-courses_item">
          <div class="popular-courses_banner">
            <img src="${safeImageSource(item.image)}" class="popular-courses_img" alt="${escapeHTML(item.title)}" />
          </div>
          <span class="popular-courses_badge">${courseTags[index % courseTags.length]}</span>
          <div class="popular-courses_content">
            <h3 class="course-title">${escapeHTML(item.title)}</h3>
            <p class="course-description">${escapeHTML(item.excerpt || "توضیحی برای این آیتم ثبت نشده است.")}</p>
            <div class="course-meta">
              <span><i class="far fa-clock" aria-hidden="true"></i>${courseDurations[index % courseDurations.length]}</span>
              <span><i class="fa-solid fa-chart-simple" aria-hidden="true"></i>${courseLevels[index % courseLevels.length]}</span>
            </div>
            <a href="single-post.html?id=${encodeURIComponent(item.id)}" class="popular-courses_link">
              مشاهده دوره <i class="fas fa-chevron-left" aria-hidden="true"></i>
            </a>
          </div>
        </li>
      `,
        )
        .join("");
    } else {
      popularContainer.innerHTML = "";
    }
  }

  // 2. NEW COURSES (Show first 4 defaults + all custom items)
  const newCoursesContainer = document.querySelector(".new-courses_items");
  if (newCoursesContainer) {
    const itemsToShow = getItemsToDisplay("newCourses", 4);
    if (itemsToShow.length > 0) {
      newCoursesContainer.innerHTML = itemsToShow
        .map(
          (item) => `
        <li class="new-courses_item">
          <div class="new-courses_banner">
            <img src="${safeImageSource(item.image)}" class="new-courses_img" alt="${escapeHTML(item.title)}" />
          </div>
          <span class="new-courses_badge"> جدید </span>
          <div class="new-courses_content">
            <h3 class="course-title">${escapeHTML(item.title)}</h3>
            <p class="course-description">${escapeHTML(item.excerpt || "توضیحی برای این آیتم ثبت نشده است.")}</p>
            <a href="single-post.html?id=${encodeURIComponent(item.id)}" class="new-courses_link">
              مشاهده توضیحات <i class="fas fa-chevron-left"></i>
            </a>
          </div>
        </li>
      `,
        )
        .join("");
    } else {
      newCoursesContainer.innerHTML = "";
    }
  }

  // 3. FEATURED CONTENT (specials) - Show first 3 defaults + all custom items
  const featuredGrid = document.querySelector(".featured-grid");
  if (featuredGrid) {
    const itemsToShow = getItemsToDisplay("specials", 3);
    if (itemsToShow.length > 0) {
      const mainItem = itemsToShow[0];
      const smallItems = itemsToShow.slice(1);

      let smallHtml = "";
      if (smallItems.length > 0) {
        smallHtml = `
           <div class="featured-small" style="display: flex; flex-direction: column; gap: 15px; width: 100%;">
            ${smallItems
              .map(
                (item) => `
                <article class="featured-card" style="margin-bottom: 0;">
                <a href="single-post.html?id=${encodeURIComponent(item.id)}" class="featured-content">
                  <span class="content-tag">ویژه</span>
                  <h3 class="featured-title">${escapeHTML(item.title)}</h3>
                </a>
              </article>
            `,
              )
              .join("")}
          </div>
        `;
      }

      featuredGrid.innerHTML = `
        <article class="featured-card large">
          <div class="featured-image">
            <img src="${safeImageSource(mainItem.image)}" alt="${escapeHTML(mainItem.title)}" loading="lazy" />
            <span class="featured-badge">پیشنهادی</span>
          </div>
          <div class="featured-content">
            <span class="content-tag">ویژه</span>
            <a href="single-post.html?id=${encodeURIComponent(mainItem.id)}" class="featured-title">
              ${escapeHTML(mainItem.title)}
            </a>
            <p class="featured-desc">
              ${escapeHTML(mainItem.excerpt || "توضیحی برای این آیتم ثبت نشده است.")}
            </p>
          </div>
        </article>
        ${smallHtml}
      `;
    }
  }

  // 4. LATEST ARTICLES (Show first 4 defaults + all custom items)
  const articleContainer = document.querySelector(".article-items");
  if (articleContainer) {
    const itemsToShow = getItemsToDisplay("articles", 4);
    if (itemsToShow.length > 0) {
      articleContainer.innerHTML = itemsToShow
        .slice(0, 4)
        .map(
          (item) => `
        <li class="article-item">
          <div class="article-image">
            <img src="${safeImageSource(item.image)}" alt="${escapeHTML(item.title)}" />
          </div>
          <div class="article-content">
            <span class="article-category"> حسابداری </span>
            <h3 class="article-title">
              <a href="single-post.html?id=${encodeURIComponent(item.id)}">
                ${escapeHTML(item.title)}
              </a>
            </h3>
            <p class="article-desc">
              ${escapeHTML(item.excerpt || "توضیحی برای این آیتم ثبت نشده است.")}
            </p>
            <a href="single-post.html?id=${encodeURIComponent(item.id)}" class="article-read-more">
              ادامه مطالعه <i class="fas fa-arrow-left"></i>
            </a>
            <div class="article-meta">
              <span>
                <i class="far fa-calendar"></i>
                ۲۶ تیر ۱۴۰۵
              </span>
              <span>
                <i class="far fa-clock"></i>
                ۵ دقیقه مطالعه
              </span>
            </div>
          </div>
        </li>
      `,
        )
        .join("");
    } else {
      articleContainer.innerHTML = "";
    }
  }

  // Custom sections are inserted after the built-in ones so they can sit
  // between them without touching index.html.
  if (typeof renderCustomHomeSections === "function") {
    renderCustomHomeSections();
  }
})();
