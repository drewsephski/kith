/** Native disclosures remain usable before hydration and without JavaScript. */
export function enhanceFaq() {
  const items = Array.from(document.querySelectorAll<HTMLDetailsElement>("[data-faq-item]"));
  const controls = items.map((item, index) => {
    const summary = item.querySelector("summary")!;
    const answer = item.querySelector<HTMLElement>(".journey-faq__answer")!;
    answer.id = `faq-answer-${index}`;
    summary.setAttribute("aria-controls", answer.id);
    let expanded = item.open;
    let animation: Animation | undefined;

    function setExpanded(next: boolean) {
      expanded = next;
      const height = item.open ? answer.getBoundingClientRect().height : 0;
      const opacity = item.open ? getComputedStyle(answer).opacity : "0";
      animation?.cancel();
      summary.setAttribute("aria-expanded", String(next));
      answer.inert = !next;
      answer.setAttribute("aria-hidden", String(!next));
      item.dataset.expanded = String(next);
      if (matchMedia("(prefers-reduced-motion: reduce)").matches || !answer.animate) {
        item.open = next;
        return;
      }
      // Keep the native disclosure open until the closing transition completes.
      item.open = true;
      animation = answer.animate(
        [
          { height: `${height}px`, opacity },
          { height: `${next ? answer.scrollHeight : 0}px`, opacity: next ? 1 : 0 },
        ],
        { duration: 240, easing: "cubic-bezier(0.2, 0, 0, 1)", fill: "both" },
      );
      const current = animation;
      current.onfinish = () => {
        if (animation !== current) return;
        item.open = expanded;
        current.cancel();
        animation = undefined;
      };
    }
    summary.setAttribute("aria-expanded", String(expanded));
    answer.inert = !expanded;
    answer.setAttribute("aria-hidden", String(!expanded));
    summary.addEventListener("click", (event) => {
      event.preventDefault();
      const next = !expanded;
      if (next) for (const control of controls) if (control.item !== item) control.close();
      setExpanded(next);
    });
    return {
      item,
      close: () => {
        if (expanded) setExpanded(false);
      },
    };
  });
}
