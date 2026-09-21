function parseHttpsGonguUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "gongu.copyright.or.kr" ||
      url.username ||
      url.password ||
      url.port ||
      url.hash
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

export function gonguWorkNumberFromLandingUrl(value: string): string | null {
  const url = parseHttpsGonguUrl(value);
  if (!url || url.pathname !== "/gongu/wrt/wrt/view.do") return null;
  const wrtSn = url.searchParams.get("wrtSn");
  if (!wrtSn || !/^\d{6,12}$/u.test(wrtSn)) return null;
  return wrtSn;
}

export function isAllowedGonguTextUrl(
  value: string,
  expectedWrtSn: string
): boolean {
  const url = parseHttpsGonguUrl(value);
  if (!url || url.pathname !== "/gongu/wrt/cmmn/wrtFileDownload.do") {
    return false;
  }
  if (Array.from(url.searchParams.keys()).some((key) => !["wrtSn", "fileSn"].includes(key))) {
    return false;
  }
  return (
    url.searchParams.get("wrtSn") === expectedWrtSn &&
    url.searchParams.get("fileSn") === "4"
  );
}
