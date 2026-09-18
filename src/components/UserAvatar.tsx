export function UserAvatar({ name, className = "h-8 w-8 text-xs" }: { name: string; className?: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-white ${className}`}>
      {initial}
    </span>
  );
}
