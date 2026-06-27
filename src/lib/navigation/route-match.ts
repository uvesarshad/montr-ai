type SearchParamsLike =
  | URLSearchParams
  | {
      get(name: string): string | null;
    };

function parseHref(href: string) {
  return new URL(href, 'https://montrai.local');
}

export function isRouteActive(
  pathname: string,
  searchParams: SearchParamsLike | null | undefined,
  href: string,
  options?: { exact?: boolean }
) {
  const { exact = false } = options ?? {};
  const target = parseHref(href);
  const targetPath = target.pathname;
  const hasQuery = target.searchParams.toString().length > 0;

  const pathMatches = exact
    ? pathname === targetPath
    : pathname === targetPath || pathname.startsWith(`${targetPath}/`);

  if (!pathMatches) {
    return false;
  }

  if (!hasQuery) {
    return true;
  }

  if (pathname !== targetPath || !searchParams) {
    return false;
  }

  for (const [key, value] of target.searchParams.entries()) {
    if (searchParams.get(key) !== value) {
      return false;
    }
  }

  return true;
}
