"use client";

import { Fragment, type CSSProperties, type ReactNode } from "react";
import {
  getBackgroundPresetMeta,
  type EffectBackgroundPreset,
  type EffectIllustration,
  type EffectInlineMark,
  type EffectSceneCue,
  type EffectSettings,
} from "@/lib/effects/effectSettings";
import {
  buildContentBlocks,
  buildParagraphBlocks,
  buildSceneBreakRuntimeList,
} from "@/lib/effects/effectTextLayout";
import {
  formatAozoraNoteLabel,
  tokenizeAozoraDisplayText,
  type AozoraDisplayToken,
  type AozoraGaijiInfo,
} from "@/lib/aozora/aozoraNotation";

type EffectPreviewRendererProps = {
  body: string;
  settings: EffectSettings;
};

export type TextSegment = {
  text: string;
  marks: EffectInlineMark[];
};

const AOZORA_CONTROL_PATTERNS = [
  /［＃改ページ］/g,
  /［＃改丁］/g,
  /［＃改見開き］/g,
  /［＃改行］/g,
  /［＃(?:ここから[^］]+)］/g,
  /［＃(?:ここで[^］]+終わり)］/g,
  /［＃地付き］/g,
  /［＃(?:地から[^］]+)］/g,
  /［＃(?:ページの左右中央)］/g,
  /［＃(?:ページの左[^］]+)］/g,
  /［＃(?:ページの右[^］]+)］/g,
] as const;

function stripAozoraControlAnnotations(text: string): string {
  let normalized = text;

  for (const pattern of AOZORA_CONTROL_PATTERNS) {
    normalized = normalized.replace(pattern, "");
  }

  return normalized;
}

export function normalizeAozoraTextForLayout(text: string): string {
  if (!text) {
    return "";
  }

  return stripAozoraControlAnnotations(text)
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeAozoraTextForDisplay(text: string): string {
  return normalizeAozoraTextForLayout(text);
}

const AOZORA_EMPHASIS_STYLE = {
  WebkitTextEmphasis: "filled sesame",
  textEmphasis: "filled sesame",
} as CSSProperties;

function gaijiTitle(gaiji: AozoraGaijiInfo): string {
  return `外字「${gaiji.description}」（JIS X 0213 ${gaiji.code}）`;
}

function renderAozoraToken(token: AozoraDisplayToken, key: string): ReactNode {
  switch (token.kind) {
    case "text":
      return <Fragment key={key}>{token.text}</Fragment>;
    case "gaiji":
      return (
        <span
          key={key}
          data-aozora-gaiji={token.gaiji.code}
          title={gaijiTitle(token.gaiji)}
        >
          {token.gaiji.char}
        </span>
      );
    case "ruby":
      return (
        <ruby
          key={key}
          className="align-middle"
          data-aozora-gaiji={
            token.gaiji.length > 0
              ? token.gaiji.map((gaiji) => gaiji.code).join(" ")
              : undefined
          }
          title={
            token.gaiji.length > 0
              ? token.gaiji.map(gaijiTitle).join(" / ")
              : undefined
          }
        >
          <span>{token.base}</span>
          <rt className="text-[0.52em] font-normal not-italic leading-none opacity-80">
            {token.reading}
          </rt>
        </ruby>
      );
    case "emphasis":
      return (
        <span key={key} data-aozora-emphasis="sesame" style={AOZORA_EMPHASIS_STYLE}>
          {token.text}
        </span>
      );
    case "note":
      return (
        <small
          key={key}
          data-aozora-note={token.noteKind}
          className="mx-0.5 align-baseline text-[0.72em] font-normal not-italic text-neutral-500"
        >
          {formatAozoraNoteLabel(token.text)}
        </small>
      );
    case "align_end":
      return (
        <span key={key} data-aozora-layout="align-end" className="block text-right">
          {renderAozoraRubyOnly(token.text, key)}
        </span>
      );
  }
}

function renderAozoraRubyOnly(text: string, keyPrefix: string): ReactNode {
  return tokenizeAozoraDisplayText(text).map((token, index) =>
    token.kind === "align_end"
      ? <Fragment key={`${keyPrefix}-${index}`}>{token.text}</Fragment>
      : renderAozoraToken(token, `${keyPrefix}-${index}`)
  );
}

/**
 * Issue #140: Reader visual rendering of Aozora notation (ruby, bouten,
 * verified gaiji, edition-variant / ruby notes, end alignment). Display only;
 * unrecognised directives stay literal.
 */
export function renderTextWithAozoraRuby(text: string): ReactNode {
  const normalizedText = normalizeAozoraTextForDisplay(text);

  if (!normalizedText.includes("《") && !normalizedText.includes("［＃")) {
    return normalizedText;
  }

  const tokens = tokenizeAozoraDisplayText(normalizedText);
  if (tokens.length === 1 && tokens[0]?.kind === "text") {
    return tokens[0].text;
  }
  return tokens.map((token, index) => renderAozoraToken(token, `aozora-${index}`));
}

export function buildBackgroundTheme(preset: EffectBackgroundPreset) {
  const meta = getBackgroundPresetMeta(preset);

  if (!meta) {
    return {
      frameClassName: "rounded-[28px] border border-black/10 bg-white",
      surfaceClassName: "bg-white/70",
      textClassName: "text-neutral-900",
    };
  }

  return {
    frameClassName: "rounded-[28px] border border-black/10 bg-white shadow-sm",
    surfaceClassName: "bg-white/20 backdrop-blur-[0.2px]",
    textClassName: meta.textClassName,
  };
}

export function buildBackgroundStyle(settings: EffectSettings): CSSProperties {
  const meta = getBackgroundPresetMeta(settings.backgroundPreset);

  if (!meta) {
    return {
      backgroundColor: settings.backgroundColor ?? undefined,
    };
  }

  return {
    backgroundImage: `url(${meta.assetPath})`,
    backgroundRepeat: "repeat",
    backgroundSize: "720px 720px",
    backgroundPosition: "center top",
    backgroundColor: meta.backgroundColor,
  };
}

export function buildTypographyStyle(settings: EffectSettings): CSSProperties {
  return {
    fontFamily: settings.typography.fontFamily ?? undefined,
    fontSize: settings.typography.fontSize ?? undefined,
    color: settings.typography.textColor ?? undefined,
    fontWeight: settings.typography.bold ? 700 : undefined,
    fontStyle: settings.typography.italic ? "italic" : undefined,
  };
}

function applyInlineMark(node: ReactNode, mark: EffectInlineMark): ReactNode {
  switch (mark.kind) {
    case "ruby":
      return (
        <ruby className="align-middle">
          {node}
          <rt className="text-[0.52em] font-normal not-italic leading-none opacity-80">
            {mark.value ?? ""}
          </rt>
        </ruby>
      );

    case "bold":
      return <strong className="font-semibold">{node}</strong>;

    case "italic":
      return <em className="italic">{node}</em>;

    case "color":
      return <span style={{ color: mark.value ?? "#f59e0b" }}>{node}</span>;

    case "dot_emphasis":
      return (
        <span
          style={
            {
              WebkitTextEmphasis: "filled sesame",
              textEmphasis: "filled sesame",
            } as CSSProperties
          }
        >
          {node}
        </span>
      );

    case "line_emphasis":
      return (
        <span
          style={{
            textDecorationLine: "underline",
            textDecorationThickness: "0.12em",
            textUnderlineOffset: "0.18em",
          }}
        >
          {node}
        </span>
      );

    case "shake": {
      const rawValue = (mark.value ?? "").toLowerCase();
      const isStrong =
        rawValue.includes("strong") ||
        rawValue.includes("大") ||
        rawValue.includes("強");
      const isSmall =
        rawValue.includes("small") ||
        rawValue.includes("弱") ||
        rawValue.includes("小");

      return (
        <span
          className="libread-effect-shake"
          data-libread-effect="shake"
          style={
            {
              "--libread-shake-distance": isStrong
                ? "0.22em"
                : isSmall
                  ? "0.09em"
                  : "0.15em",
              "--libread-shake-duration": isStrong
                ? "90ms"
                : isSmall
                  ? "180ms"
                  : "120ms",
              animation:
                "libread-text-shake var(--libread-shake-duration, 120ms) steps(2, jump-none) infinite",
            } as CSSProperties
          }
        >
          <span className="libread-effect-shake-inner">{node}</span>
        </span>
      );
    }

    case "typing":
      return <span className="tracking-[0.06em]">{node}</span>;

    case "fade_out":
      return <span style={{ opacity: 0.55 }}>{node}</span>;

    default:
      return node;
  }
}

export function buildSegments(
  text: string,
  marks: EffectInlineMark[]
): TextSegment[] {
  let segments: TextSegment[] = [{ text, marks: [] }];

  for (const mark of marks) {
    if (!mark.targetText.trim()) continue;

    for (let index = 0; index < segments.length; index += 1) {
      const current = segments[index];
      const hitIndex = current.text.indexOf(mark.targetText);

      if (hitIndex === -1) {
        continue;
      }

      const nextSegments: TextSegment[] = [];

      if (hitIndex > 0) {
        nextSegments.push({
          text: current.text.slice(0, hitIndex),
          marks: current.marks,
        });
      }

      nextSegments.push({
        text: current.text.slice(hitIndex, hitIndex + mark.targetText.length),
        marks: [...current.marks, mark],
      });

      const rest = current.text.slice(hitIndex + mark.targetText.length);
      if (rest.length > 0) {
        nextSegments.push({
          text: rest,
          marks: current.marks,
        });
      }

      segments = [
        ...segments.slice(0, index),
        ...nextSegments,
        ...segments.slice(index + 1),
      ];

      break;
    }
  }

  return segments;
}

export function renderSegment(segment: TextSegment, index: number) {
  let node: ReactNode = renderTextWithAozoraRuby(segment.text);

  for (const mark of segment.marks) {
    node = applyInlineMark(node, mark);
  }

  return <Fragment key={`segment-${index}`}>{node}</Fragment>;
}

function renderSentenceWithInlineMarks(
  text: string,
  inlineMarks: EffectSettings["inlineMarks"]
) {
  return buildSegments(text, inlineMarks).map((segment, index) =>
    renderSegment(segment, index)
  );
}

export function renderIllustration(illustration: EffectIllustration) {
  return (
    <figure
      key={illustration.id}
      className="relative z-10 rounded-[24px] border border-black/10 bg-white/95 shadow-sm"
    >
      <img
        src={illustration.imageUrl}
        alt={illustration.caption || "挿絵"}
        className="block h-auto max-h-none w-full object-contain"
      />
      {illustration.caption ? (
        <figcaption className="px-4 py-3 text-xs leading-6 text-neutral-600">
          {illustration.caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

export function renderSceneCue(sceneCue: EffectSceneCue) {
  const pieces = [
    sceneCue.triggerText ? `発火: ${sceneCue.triggerText}` : "",
    sceneCue.backgroundPreset ? `背景: ${sceneCue.backgroundPreset}` : "",
    sceneCue.textAnimation ? `文字動作: ${sceneCue.textAnimation}` : "",
  ].filter((item) => item.length > 0);

  return (
    <div
      key={sceneCue.id}
      className="rounded-full border border-black/10 bg-white px-3 py-2 text-xs text-neutral-600"
    >
      <span className="font-semibold text-black">{sceneCue.label}</span>
      {pieces.length > 0 ? <span className="ml-2">/ {pieces.join(" / ")}</span> : null}
    </div>
  );
}

export default function EffectPreviewRenderer({
  body,
  settings,
}: EffectPreviewRendererProps) {
  const theme = buildBackgroundTheme(settings.backgroundPreset);
  const typographyStyle = buildTypographyStyle(settings);
  const safeBody =
    body.trim().length > 0
      ? body
      : "本文がまだありません。ここに演出付き本文プレビューが表示される。";

  const normalizedBody = normalizeAozoraTextForLayout(safeBody);
  const paragraphBlocks = buildParagraphBlocks(normalizedBody);
  const previewIllustrations = settings.illustrations.filter(
    (illustration) => illustration.placement !== "scene_break"
  );
  const sceneBreaks = buildSceneBreakRuntimeList(
    paragraphBlocks,
    settings.illustrations
  );
  const contentBlocks = buildContentBlocks(paragraphBlocks, sceneBreaks);

  return (
    <div className={`${theme.frameClassName} overflow-visible`} style={buildBackgroundStyle(settings)}>
      <div className={`${theme.surfaceClassName} relative px-5 py-5 sm:px-6 sm:py-6`}>
        <div className="grid gap-5">
          {previewIllustrations.length > 0 ? (
            <div className="grid gap-4">{previewIllustrations.map(renderIllustration)}</div>
          ) : null}

          <article
            className={`space-y-7 break-words text-[15px] leading-8 sm:text-base ${theme.textClassName}`}
            style={typographyStyle}
          >
            {contentBlocks.length > 0 ? (
              contentBlocks.map((block) => {
                if (block.kind === "scene_break") {
                  return (
                    <div key={block.key} className="grid gap-4">
                      {block.illustrations.map(renderIllustration)}
                    </div>
                  );
                }

                return (
                  <p key={block.key}>
                    {block.sentences.map((sentence) => (
                      <span key={sentence.index} className="inline">
                        {renderSentenceWithInlineMarks(
                          sentence.text,
                          settings.inlineMarks
                        )}
                      </span>
                    ))}
                  </p>
                );
              })
            ) : (
              <p>本文がありません。</p>
            )}
          </article>

          {settings.sceneCues.length > 0 ? (
            <div className="border-t border-black/10 pt-4">
              <p className="text-xs tracking-[0.18em] text-neutral-500">SCENE CUES</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {settings.sceneCues.map(renderSceneCue)}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}