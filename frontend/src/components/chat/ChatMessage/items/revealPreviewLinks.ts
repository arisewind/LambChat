export function shouldInterceptFilePreviewLink(
  href: string,
  options: { currentOrigin?: string } = {},
): boolean {
  const currentOrigin =
    options.currentOrigin ||
    (typeof window !== "undefined" ? window.location.origin : "");

  if (!currentOrigin) {
    return !/^https?:\/\//i.test(href);
  }

  try {
    const url = new URL(href, currentOrigin);
    return url.origin === currentOrigin;
  } catch {
    return false;
  }
}
