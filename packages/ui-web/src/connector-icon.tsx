import { brandLogoUri, resolveBrandLogo } from "@rakazo/ui-tokens/brand-logos";
import { useState } from "react";
import { cn } from "./lib/utils.js";

/** Decorative brand mark; the adjacent service name supplies the accessible label. */
export function ConnectorIcon({
  name,
  brand,
  logo,
  fallbackName,
  size = 36,
  className,
}: {
  name: string;
  brand?: string;
  logo?: string | null;
  fallbackName?: string;
  size?: number;
  className?: string;
}) {
  const asset = resolveBrandLogo(brand, name, fallbackName);
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const light = asset ? brandLogoUri(asset, "light") : logo;
  const dark = asset ? brandLogoUri(asset, "dark") : light;
  const image = (preferred: string | null | undefined, variant?: string) => {
    const src =
      preferred && !failed.has(preferred) ? preferred : logo && !failed.has(logo) ? logo : null;
    return src ? (
      <img
        src={src}
        alt=""
        decoding="async"
        className={cn("h-full w-full object-contain", variant)}
        onError={() => setFailed((current) => new Set([...current, src]))}
      />
    ) : (
      <span className={variant}>{(name.trim()[0] || "?").toUpperCase()}</span>
    );
  };
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-xl bg-accent p-1 text-sm font-semibold text-foreground",
        className,
      )}
      style={{ width: size, height: size }}
      data-brand={asset?.key}
    >
      {light === dark ? (
        image(light)
      ) : (
        <>
          {image(light, "brand-logo-light")}
          {image(dark, "brand-logo-dark")}
        </>
      )}
    </span>
  );
}
