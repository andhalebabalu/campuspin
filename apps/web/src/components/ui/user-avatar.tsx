/** A member's round photo, or their initials when they have none. */
export function UserAvatar({
  name,
  url,
  className = 'size-9 text-sm',
}: {
  name: string;
  url: string | null | undefined;
  /** Size and text size, e.g. `size-16 text-xl`. */
  className?: string;
}) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- uploaded, served by the API.
      <img
        src={url}
        alt=""
        className={`${className} shrink-0 rounded-full bg-subtle object-cover`}
      />
    );
  }
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      aria-hidden
      className={`${className} flex shrink-0 items-center justify-center rounded-full bg-primary-100 font-bold text-primary-700`}
    >
      {initials}
    </span>
  );
}
