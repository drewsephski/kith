import { cn } from "./lib/utils.js";

/** Kith's companion. Decorative; its adjacent name supplies semantics. */
export function KithAvatar({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <img
      src={new URL("../../ui-tokens/assets/kith-companion.webp", import.meta.url).href}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className={cn("shrink-0 object-contain", className)}
      draggable={false}
    />
  );
}
