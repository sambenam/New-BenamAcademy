(() => {
  const ticker = document.querySelector("[data-home-news]");
  if (!ticker) return;

  const track = ticker.querySelector(".home-news_track");
  const cards = [...ticker.querySelectorAll(".home-news_item")];
  const dots = ticker.querySelector(".home-news_dots");
  const previous = ticker.querySelector("[data-news-prev]");
  const next = ticker.querySelector("[data-news-next]");
  if (!track || !cards.length || !dots || !previous || !next) return;

  let index = 0;
  let timer;
  const visibleCount = () => window.innerWidth <= 620 ? 1 : window.innerWidth <= 1000 ? 2 : window.innerWidth <= 1120 ? 3 : 4;
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
