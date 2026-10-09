import { useEffect, useRef, useState } from "react";
import { cn } from "./lib/utils.js";

const stillSource = new URL("../../ui-tokens/assets/kith-companion.webp", import.meta.url).href;
const workingSource = new URL("../../ui-tokens/assets/kith-companion-working.webp", import.meta.url)
  .href;

/** Kith's companion. Decorative; its adjacent name supplies semantics. */
export function KithAvatar({
  size = 40,
  className,
  working = false,
}: {
  size?: number;
  className?: string;
  working?: boolean;
}) {
  const image = useRef<HTMLImageElement>(null);
  const [canAnimate, setCanAnimate] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!working || !image.current) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    const update = () => setCanAnimate(visible && !document.hidden && !motion.matches);
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
      update();
    });
    observer.observe(image.current);
    motion.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      observer.disconnect();
      motion.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [working]);

  const animated = working && canAnimate && !failed;
  return (
    <img
      ref={image}
      src={animated ? workingSource : stillSource}
      data-working={working}
      data-animated={animated}
      onError={() => setFailed(true)}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className={cn("shrink-0 object-contain", className)}
      draggable={false}
    />
  );
}
