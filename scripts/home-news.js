(() => {
  const ticker = document.querySelector("[data-home-news]");
  if (!ticker) return;

  const track = ticker.querySelector(".home-news_track");
  const dots = ticker.querySelector(".home-news_dots");
  const previous = ticker.querySelector("[data-news-prev]");
  const next = ticker.querySelector("[data-news-next]");
  if (!track || !dots || !previous || !next) return;

  const newsCategory = typeof siteData !== "undefined" ? siteData.exams : null;
  const newsItems = newsCategory && Array.isArray(newsCategory.items)
    ? newsCategory.items.slice(0, 10)
    : [];

  function buildNewsCard(item) {
    const link = document.createElement("a");
    link.className = "home-news_item";
    link.href = `single-post.html?id=${encodeURIComponent(String(item.id || ""))}`;

    const thumb = document.createElement("span");
    thumb.className = "home-news_thumb";
    thumb.setAttribute("aria-hidden", "true");
    const icon = document.createElement("i");
    icon.className = "fa-regular fa-newspaper";
    thumb.append(icon);

    const copy = document.createElement("span");
    copy.className = "home-news_copy";

    const title = document.createElement("strong");
    title.textContent = item.title || "خبر بدون عنوان";

    const excerpt = document.createElement("span");
    excerpt.textContent = item.excerpt || "برای مشاهدهٔ جزئیات این خبر وارد مطلب شوید.";

    const label = document.createElement("time");
    label.textContent = "اخبار سایت";

    copy.append(title, excerpt, label);
    link.append(thumb, copy);
    return link;
  }

  track.replaceChildren(...newsItems.map(buildNewsCard));

  if (!newsItems.length) {
    const empty = document.createElement("p");
    empty.className = "home-news_empty";
    empty.textContent = "در حال حاضر خبری برای نمایش وجود ندارد.";
    track.append(empty);
    previous.hidden = true;
    next.hidden = true;
    dots.hidden = true;
    return;
  }

  const cards = [...track.querySelectorAll(".home-news_item")];
  let index = 0;
  let timer;
  const visibleCount = () => window.innerWidth <= 700 ? 1 : window.innerWidth <= 1000 ? 2 : window.innerWidth <= 1120 ? 3 : 4;
  const lastIndex = () => Math.max(0, cards.length - visibleCount());

  function paint() {
    const count = visibleCount();
    index = Math.min(index, lastIndex());
    track.style.transform = `translateX(${index * 100 / count}%)`;
    dots.replaceChildren();
    for (let i = 0; i <= lastIndex(); i++) {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = `home-news_dot${i === index ? " is-active" : ""}`;
      dot.setAttribute("aria-label", `نمایش خبر ${i + 1}`);
      dot.setAttribute("aria-current", String(i === index));
      dot.addEventListener("click", () => { index = i; paint(); restart(); });
      dots.append(dot);
    }
  }

  function move(step) {
    const max = lastIndex();
    index = max ? (index + step + max + 1) % (max + 1) : 0;
    paint();
  }
  function restart() {
    clearInterval(timer);
    if (!window.matchMedia || !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      timer = setInterval(() => move(1), 5000);
    }
  }

  previous.addEventListener("click", () => { move(-1); restart(); });
  next.addEventListener("click", () => { move(1); restart(); });
  ticker.addEventListener("mouseenter", () => clearInterval(timer));
  ticker.addEventListener("mouseleave", restart);
  ticker.addEventListener("focusin", () => clearInterval(timer));
  ticker.addEventListener("focusout", (event) => {
    if (!ticker.contains(event.relatedTarget)) restart();
  });
  window.addEventListener("resize", paint);
  paint();
  restart();
})();
