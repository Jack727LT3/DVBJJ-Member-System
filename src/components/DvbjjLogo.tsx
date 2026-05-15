import Image from "next/image";
import Link from "next/link";

type DvbjjLogoProps = {
  /** Use on dark backgrounds (ink header); compact SVG lockup. */
  variant?: "on-light" | "on-dark";
  className?: string;
  /** Larger mark for sign-in cards (raster brand on light only). */
  size?: "header" | "hero";
};

const BRAND_WEBP = "/dvbjj-logo.webp";
const BRAND_W = 1080;
const BRAND_H = 1223;

export default function DvbjjLogo({
  variant = "on-light",
  className = "",
  size = "header",
}: DvbjjLogoProps) {
  const focusRing =
    "rounded-sm outline-none transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-red";

  const mark =
    variant === "on-dark" ? (
      // eslint-disable-next-line @next/next/no-img-element -- light SVG for dark bar; small file.
      <img
        src="/dvbjj-logo-light.svg"
        alt=""
        height={size === "hero" ? 52 : 36}
        aria-hidden
        className={`w-auto ${size === "hero" ? "h-[52px]" : "h-9"}`}
        decoding="async"
      />
    ) : (
      <Image
        src={BRAND_WEBP}
        alt=""
        width={BRAND_W}
        height={BRAND_H}
        priority={size === "hero"}
        className={`w-auto ${size === "hero" ? "h-28 sm:h-32" : "h-10 sm:h-11"}`}
        sizes={size === "hero" ? "(max-width: 640px) 200px, 240px" : "120px"}
      />
    );

  return (
    <Link
      href="/"
      className={`inline-flex shrink-0 items-center justify-center ${focusRing} ${className}`}
      aria-label="DVBJJ — back to home"
    >
      {mark}
    </Link>
  );
}
