/**
 * Helper function to get the name initials for a user avatar.
 */

const getInitialsFromName = (name?: string) => {
  if (!name) return "U";

  const nameParts = name.trim().split(" ");

  if (nameParts.length === 1) {
    return nameParts[0].substring(0, 2).toUpperCase();
  }

  const firstNameInitial = nameParts[0].charAt(0).toUpperCase();
  const lastNameInitial = nameParts[
    nameParts.length - 1
  ].charAt(0).toUpperCase();

  return firstNameInitial + lastNameInitial;
};

type AvatarSourceUser = {
  image?: string | null;
  githubUsername?: string | null;
  email?: string | null;
};

/** Prefer custom image URL, then GitHub avatar, then unavatar. */
const getUserAvatarSrc = (user: AvatarSourceUser): string | undefined => {
  const custom = user.image?.trim();
  if (custom) return custom;
  if (user.githubUsername?.trim()) {
    return `https://github.com/${user.githubUsername.trim()}.png`;
  }
  if (user.email?.trim()) {
    return `https://unavatar.io/${user.email.trim()}?fallback=false`;
  }
  return undefined;
};

export { getInitialsFromName, getUserAvatarSrc };
