"use client";

import { useState, useSyncExternalStore } from "react";
import type { UiLocale } from "@/i18n/config";
import { shareDictionaries } from "@/i18n/dictionaries/share";
import {
  buildShareIntentUrl,
  buildShareTargetUrl,
  buildShareText,
  type ShareChannel,
  type SharePlacement,
} from "@/lib/share/shareLinks";

type ShareButtonsProps = {
  /** Relative path of the page to share (no origin, no UTM). */
  path: string;
  placement: SharePlacement;
  locale: UiLocale;
  title: string;
  authorName?: string | null;
  className?: string;
};

const noopSubscribe = () => () => {};

function canUseNativeShare(): boolean {
  return (
    typeof navigator !== "undefined" && typeof navigator.share === "function"
  );
}

const linkClassName =
  "inline-flex items-center rounded-full border border-black/10 bg-white px-3.5 py-2 text-xs font-medium text-neutral-800 transition hover:border-sky-200 hover:bg-sky-50 sm:text-sm";

/**
 * Share buttons (P9). Uses only each service's public intent URL: no external
 * script, SDK, pixel or iframe is loaded. The caller decides visibility
 * (shouldShowShareButtons) on the server, so R18 and non-public pages never
 * render this component.
 */
export default function ShareButtons({
  path,
  placement,
  locale,
  title,
  authorName,
  className,
}: ShareButtonsProps) {
  const dictionary = shareDictionaries[locale];
  const nativeShareAvailable = useSyncExternalStore(
    noopSubscribe,
    canUseNativeShare,
    () => false
  );
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle"
  );

  const text = buildShareText({
    title,
    authorName,
    quote: dictionary.quoteTitle,
  });
  const intentHref = (channel: ShareChannel) =>
    buildShareIntentUrl(channel, {
      url: buildShareTargetUrl(path, channel, placement),
      text,
    }) ?? undefined;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(
        buildShareTargetUrl(path, "copy", placement)
      );
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  async function handleNativeShare() {
    try {
      await navigator.share({
        title,
        text,
        url: buildShareTargetUrl(path, "native", placement),
      });
    } catch {
      // The viewer closed the share sheet; nothing to do.
    }
  }

  return (
    <section
      aria-label={dictionary.heading}
      data-share-placement={placement}
      className={className}
    >
      <p className="text-[11px] tracking-[0.18em] text-neutral-500">
        {dictionary.heading}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <a
          href={intentHref("x")}
          target="_blank"
          rel="noopener noreferrer"
          data-share-channel="x"
          className={linkClassName}
        >
          {dictionary.shareOnX}
        </a>
        <a
          href={intentHref("line")}
          target="_blank"
          rel="noopener noreferrer"
          data-share-channel="line"
          className={linkClassName}
        >
          {dictionary.shareOnLine}
        </a>
        <a
          href={intentHref("facebook")}
          target="_blank"
          rel="noopener noreferrer"
          data-share-channel="facebook"
          className={linkClassName}
        >
          {dictionary.shareOnFacebook}
        </a>
        <button
          type="button"
          onClick={handleCopy}
          data-share-channel="copy"
          className={linkClassName}
        >
          {dictionary.copyLink}
        </button>
        {nativeShareAvailable ? (
          <button
            type="button"
            onClick={handleNativeShare}
            data-share-channel="native"
            className={linkClassName}
          >
            {dictionary.shareNative}
          </button>
        ) : null}
        <span aria-live="polite" className="text-xs text-neutral-500">
          {copyState === "copied"
            ? dictionary.copied
            : copyState === "failed"
              ? dictionary.copyFailed
              : ""}
        </span>
      </div>
      {copyState === "failed" ? (
        // Clipboard permission denied: let the viewer copy by hand.
        <input
          type="text"
          readOnly
          aria-label={dictionary.copyLink}
          value={buildShareTargetUrl(path, "copy", placement)}
          onFocus={(event) => event.currentTarget.select()}
          className="mt-2 w-full rounded-lg border border-black/10 bg-neutral-50 px-3 py-2 text-xs text-neutral-700"
        />
      ) : null}
    </section>
  );
}
