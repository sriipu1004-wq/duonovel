export async function loadSitemapWorkFallback<T>(
  loadWorks: () => Promise<T[]>,
  reportError: (message: string, error: unknown) => void = console.warn
): Promise<T[]> {
  try {
    return await loadWorks();
  } catch (error) {
    // A transient database failure must not turn the entire sitemap into a 500.
    // Static and locale landing URLs remain useful to crawlers until revalidation
    // can load the dynamic work entries again.
    reportError("[sitemap] public work entries unavailable", error);
    return [];
  }
}
