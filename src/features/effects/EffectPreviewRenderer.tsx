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

type EffectPreviewRendererProps = {
  body: string;
  settings: EffectSettings;
};

export type TextSegment = {
  text: string;
  marks: EffectInlineMark[];
};

const AOZORA_RUBY_PATTERN =
  /｜([^《》\n]+)《([^《》\n]+)》|([一-龯々ヶヵ]+)《([^《》\n]+)》/g;

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

export function renderTextWithAozoraRuby(text: string): ReactNode {
  const normalizedText = normalizeAozoraTextForDisplay(text);

  if (!normalizedText.includes("《")) {
    return normalizedText;
  }

  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let partIndex = 0;

  for (const match of normalizedText.matchAll(AOZORA_RUBY_PATTERN)) {
    const matchIndex = match.index ?? -1;

    if (matchIndex < 0) {
      continue;
    }

    if (matchIndex > lastIndex) {
      nodes.push(
        <Fragment key={`plain-${partIndex}-${lastIndex}`}>
          {normalizedText.slice(lastIndex, matchIndex)}
        </Fragment>
      );
    }

    const baseText = (match[1] ?? match[3] ?? "").trim();
    const rubyText = (match[2] ?? match[4] ?? "").trim();

    if (baseText && rubyText) {
      nodes.push(
        <ruby
          key={`ruby-${partIndex}-${matchIndex}`}
          className="align-middle"
        >
          <span>{baseText}</span>
          <rt className="text-[0.52em] font-normal not-italic leading-none opacity-80">
            {rubyText}
          </rt>
        </ruby>
      );
    } else {
      nodes.push(
        <Fragment key={`raw-${partIndex}-${matchIndex}`}>
          {match[0]}
        </Fragment>
      );
    }

    lastIndex = matchIndex + match[0].length;
    partIndex += 1;
  }

  if (lastIndex < normalizedText.length) {
    nodes.push(
      <Fragment key={`plain-tail-${lastIndex}`}>
        {normalizedText.slice(lastIndex)}
      </Fragment>
    );
  }

  if (nodes.length === 0) {
    return normalizedText;
  }

  return nodes;
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
    surfaceClassName: "bg-white/35 backdrop-blur-[0.4px]",
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

    case "shake":
      return (
        <span className="rounded bg-amber-300/15 px-[0.08em] py-[0.02em] ring-1 ring-amber-300/20">
          {node}
        </span>
      );

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
      className="overflow-hidden rounded-[24px] border border-black/10 bg-white shadow-sm"
    >
      <img
        src={illustration.imageUrl}
        alt={illustration.caption || "挿絵"}
        className="h-auto w-full object-cover"
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
    <div className={`${theme.frameClassName} overflow-hidden`} style={buildBackgroundStyle(settings)}>
      <div className={`${theme.surfaceClassName} px-5 py-5 sm:px-6 sm:py-6`}>
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