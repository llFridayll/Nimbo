import Image from "next/image";

/** The user's profile picture, falling back to the first letter of their name
 * when they haven't uploaded one. */
export function UserAvatar({
  name,
  src,
  className = "h-8 w-8 text-xs",
}: {
  name: string;
  /** Served by /api/users/[id]/avatar — see avatarSrc() in src/lib/avatar.ts. */
  src?: string | null;
  className?: string;
}) {
  if (src) {
    return (
      <Image
        src={src}
        alt=""
        width={256}
        height={256}
        // The route behind this URL requires a session, and the image
        // optimizer fetches server-side without the user's cookie — it would
        // get a 401 and the avatar would never render. The file is already
        // downscaled to 256px on upload, so there is nothing to optimize.
        unoptimized
        className={`shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }

  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-white ${className}`}>
      {initial}
    </span>
  );
}
