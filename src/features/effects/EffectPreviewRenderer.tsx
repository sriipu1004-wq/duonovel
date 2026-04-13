"use client";

import { Fragment, type CSSProperties, type ReactNode } from "react";
import {
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

const AOZORA_GAIJI_PATTERN = /※［＃「([^」]+)」、[^］]+］/g;

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

const AOZORA_GAIJI_DESCRIPTION_TO_CHAR = new Map<string, string>([
  ["特のへん+建", "犍"],
  ["特のへん+え+辛", "犍"],
  ["特のへん+之+辛", "犍"],
  ["牛へん+建", "犍"],
]);

function normalizeAozoraGaijiDescription(value: string): string {
  return value
    .trim()
    .replace(/[＋﹢]/g, "+")
    .replace(/\s+/g, "")
    .replace(/[「」]/g, "");
}

export function normalizeAozoraTextForDisplay(text: string): string {
  if (!text) {
    return "";
  }

  let normalized = text;

  normalized = normalized.replace(AOZORA_GAIJI_PATTERN, (full, description) => {
    const key = normalizeAozoraGaijiDescription(String(description ?? ""));
    return AOZORA_GAIJI_DESCRIPTION_TO_CHAR.get(key) ?? full;
  });

  for (const pattern of AOZORA_CONTROL_PATTERNS) {
    normalized = normalized.replace(pattern, "");
  }

  normalized = normalized.replace(/\n{3,}/g, "\n\n");

  return normalized;
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
  switch (preset) {
    case "paper":
      return {
        frameClassName: "rounded-[28px] border border-amber-900/20 bg-[#f3ead7]",
        surfaceClassName:
          "bg-[linear-gradient(180deg,rgba(255,255,255,0.45),rgba(255,255,255,0.18))]",
        textClassName: "text-[#2f2416]",
      };
    case "glass":
      return {
        frameClassName:
          "rounded-[28px] border border-white/15 bg-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset]",
        surfaceClassName: "backdrop-blur-md bg-white/[0.08]",
        textClassName: "text-white",
      };
    case "plastic":
      return {
        frameClassName:
          "rounded-[28px] border border-sky-400/20 bg-[#111827] shadow-[0_16px_50px_rgba(15,23,42,0.45)]",
        surfaceClassName:
          "bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))]",
        textClassName: "text-slate-100",
      };
    case "stone":
      return {
        frameClassName:
          "rounded-[28px] border border-white/10 bg-[#34343b] shadow-[0_18px_50px_rgba(0,0,0,0.28)]",
        surfaceClassName:
          "bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),rgba(255,255,255,0.02))]",
        textClassName: "text-neutral-100",
      };
    case "wood":
      return {
        frameClassName:
          "rounded-[28px] border border-amber-950/20 bg-[#4a3120] shadow-[0_18px_50px_rgba(0,0,0,0.28)]",
        surfaceClassName:
          "bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))]",
        textClassName: "text-amber-50",
      };
    default:
      return {
        frameClassName: "rounded-[28px] border border-white/10 bg-white/[0.03]",
        surfaceClassName: "bg-black/20",
        textClassName: "text-neutral-100",
      };
  }
}

export function buildTypographyStyle(settings: EffectSettings): CSSProperties {
  return {
    fontFamily: settings.typography.fontFamily ?? undefined,
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
      className="overflow-hidden rounded-[24px] border border-white/10 bg-black/20"
    >
      <img
        src={illustration.imageUrl}
        alt={illustration.caption || "挿絵"}
        className="h-auto w-full object-cover"
      />
      {illustration.caption ? (
        <figcaption className="px-4 py-3 text-xs leading-6 text-neutral-300">
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
    sceneCue.nextBgmTitle ? `BGM: ${sceneCue.nextBgmTitle}` : "",
  ].filter((item) => item.length > 0);

  return (
    <div
      key={sceneCue.id}
      className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-neutral-300"
    >
      <span className="font-semibold text-white">{sceneCue.label}</span>
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

  const paragraphBlocks = buildParagraphBlocks(safeBody);
  const previewIllustrations = settings.illustrations.filter(
    (illustration) => illustration.placement !== "scene_break"
  );
  const sceneBreaks = buildSceneBreakRuntimeList(
    paragraphBlocks,
    settings.illustrations
  );
  const contentBlocks = buildContentBlocks(paragraphBlocks, sceneBreaks);

  return (
    <div className={`${theme.frameClassName} overflow-hidden`}>
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
            <div className="border-t border-white/10 pt-4">
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