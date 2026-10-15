import Image from "next/image";
import { Platform } from "@prisma/client";
import { platformLabel } from "@/lib/labels";

const LOGO_SRC: Record<Platform, string> = {
  SHOPEE: "/platforms/shopee.png",
  TIKTOK: "/platforms/tiktok.png",
  LAZADA: "/platforms/lazada.png",
};

/** The channel's round logo. Size it with h-/w- classes; the files are
 * 128px, enough for anything up to a 64px circle on a retina screen. */
export function PlatformLogo({ platform, className = "h-4 w-4" }: { platform: Platform; className?: string }) {
  return (
    <Image
      src={LOGO_SRC[platform]}
      alt={platformLabel[platform]}
      width={128}
      height={128}
      className={`shrink-0 rounded-full ${className}`}
    />
  );
}
