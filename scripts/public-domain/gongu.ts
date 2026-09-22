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

export function gonguDownloadPopupUrlFromLandingUrl(
  value: string
): string | null {
  const url = parseHttpsGonguUrl(value);
  const wrtSn = gonguWorkNumberFromLandingUrl(value);
  if (!url || !wrtSn) return null;
  const menuNo = url.searchParams.get("menuNo");
  if (menuNo && !/^\d{6}$/u.test(menuNo)) return null;
  const popup = new URL(
    "/gongu/wrt/wrt/wrtDownPopup.do",
    "https://gongu.copyright.or.kr"
  );
  popup.searchParams.set("viewType", "BODY");
  popup.searchParams.set("wrtSn", wrtSn);
  if (menuNo) popup.searchParams.set("menuNo", menuNo);
  return popup.toString();
}

export type GonguTxtSource = {
  fileSn: string;
  fileName: string;
  byteLength: number;
  downloadUrl: string;
};

export function parseGonguTxtSourcesFromPopupHtml(
  html: string,
  expectedWrtSn: string
): GonguTxtSource[] {
  const result: GonguTxtSource[] = [];
  const pattern =
    /\/\/DEXT5UPLOAD\.AddUploadedFile\(\s*["'](\d+)["']\s*,\s*["']([^"'\r\n]+\.txt)["']\s*,\s*["'](\/gongu\/wrt\/cmmn\/wrtFileDownload\.do\?wrtSn=(\d+)&fileSn=(\d+))["']\s*,\s*["'](\d+)["']/giu;

  for (const match of html.matchAll(pattern)) {
    const [, declaredFileSn, fileName, relativeUrl, wrtSn, urlFileSn, size] =
      match;
    if (
      !declaredFileSn ||
      !fileName ||
      !relativeUrl ||
      wrtSn !== expectedWrtSn ||
      declaredFileSn !== urlFileSn ||
      !size
    ) {
      continue;
    }
    const byteLength = Number(size);
    if (
      !Number.isSafeInteger(byteLength) ||
      byteLength <= 0 ||
      byteLength > 20_000_000
    ) {
      continue;
    }
    result.push({
      fileSn: declaredFileSn,
      fileName,
      byteLength,
      downloadUrl: new URL(
        relativeUrl,
        "https://gongu.copyright.or.kr"
      ).toString(),
    });
  }

  return result.sort((a, b) => b.byteLength - a.byteLength);
}

export function chooseGonguTxtSourceFromPopupHtml(
  html: string,
  expectedWrtSn: string
): GonguTxtSource | null {
  return parseGonguTxtSourcesFromPopupHtml(html, expectedWrtSn)[0] ?? null;
}

export function isAllowedGonguTextUrl(
  value: string,
  expectedWrtSn: string
): boolean {
  const url = parseHttpsGonguUrl(value);
  if (!url || url.pathname !== "/gongu/wrt/cmmn/wrtFileDownload.do") {
    return false;
  }
  if (
    Array.from(url.searchParams.keys()).some(
      (key) => !["wrtSn", "fileSn"].includes(key)
    )
  ) {
    return false;
  }
  const fileSn = url.searchParams.get("fileSn");
  return (
    url.searchParams.get("wrtSn") === expectedWrtSn &&
    Boolean(fileSn && /^\d{1,4}$/u.test(fileSn))
  );
}


export function detectGonguTextEncoding(
  source: Uint8Array
): "utf-8" | "euc-kr" | null {
  for (const encoding of ["utf-8", "euc-kr"] as const) {
    try {
      new TextDecoder(encoding, { fatal: true }).decode(source);
      return encoding;
    } catch {
      // Try the next explicitly supported legacy encoding.
    }
  }
  return null;
}
