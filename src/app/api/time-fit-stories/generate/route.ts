import { NextResponse } from "next/server";

export const runtime = "nodejs";

type TimeMinutes = 5 | 10 | 15 | 20;

type TimeFitStoryRequest = {
  scene: string;
  timeMinutes: TimeMinutes;
  genre: string;
  mood: string;
};

type TimeFitStory = {
  title: string;
  synopsis: string;
  body: string;
  estimatedReadingMinutes: number;
  tags: string[];
  aiGenerated: true;
};

type OpenAIResponseBody = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  error?: {
    message?: string;
  };
};

const ALLOWED_SCENES = ["通勤", "休憩", "睡眠導入", "作業前", "その他"] as const;
const ALLOWED_TIMES = [5, 10, 15, 20] as const;
const ALLOWED_GENRES = [
  "ホラー",
  "コメディ",
  "恋愛",
  "SF",
  "ミステリー",
  "ファンタジー",
  "癒し",
] as const;
const ALLOWED_MOODS = [
  "静か",
  "少し怖い",
  "泣ける",
  "優しい",
  "不穏",
  "明るい",
] as const;

const CHARACTER_RANGES: Record<TimeMinutes, { min: number; max: number }> = {
  5: { min: 1500, max: 2000 },
  10: { min: 3000, max: 4000 },
  15: { min: 4500, max: 6000 },
  20: { min: 6000, max: 8000 },
};

const MAX_OUTPUT_TOKENS: Record<TimeMinutes, number> = {
  5: 3000,
  10: 5200,
  15: 7600,
  20: 9800,
};

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isTimeMinutes(value: unknown): value is TimeMinutes {
  return (
    typeof value === "number" &&
    ALLOWED_TIMES.includes(value as TimeMinutes)
  );
}

function includesString<T extends readonly string[]>(
  options: T,
  value: string
): value is T[number] {
  return (options as readonly string[]).includes(value);
}

function parseRequest(payload: Record<string, unknown>): TimeFitStoryRequest {
  const scene = readText(payload.scene);
  const rawTimeMinutes =
    typeof payload.timeMinutes === "string"
      ? Number(payload.timeMinutes)
      : payload.timeMinutes;
  const genre = readText(payload.genre);
  const mood = readText(payload.mood);

  if (!includesString(ALLOWED_SCENES, scene)) {
    throw new Error("利用シーンを選択してください。");
  }

  if (!isTimeMinutes(rawTimeMinutes)) {
    throw new Error("時間を選択してください。");
  }

  if (!includesString(ALLOWED_GENRES, genre)) {
    throw new Error("ジャンルを選択してください。");
  }

  if (!includesString(ALLOWED_MOODS, mood)) {
    throw new Error("雰囲気を選択してください。");
  }

  return {
    scene,
    timeMinutes: rawTimeMinutes,
    genre,
    mood,
  };
}

function extractOutputText(responseBody: OpenAIResponseBody): string {
  if (typeof responseBody.output_text === "string") {
    return responseBody.output_text;
  }

  for (const item of responseBody.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }

  return "";
}

function normalizeStory(
  value: unknown,
  requestedMinutes: TimeMinutes
): TimeFitStory {
  if (!value || typeof value !== "object") {
    throw new Error("AI生成結果を読み取れませんでした。");
  }

  const candidate = value as Partial<Record<keyof TimeFitStory, unknown>>;

  const title = readText(candidate.title);
  const synopsis = readText(candidate.synopsis);
  const body = readText(candidate.body);
  const estimatedReadingMinutes =
    typeof candidate.estimatedReadingMinutes === "number"
      ? candidate.estimatedReadingMinutes
      : requestedMinutes;

  const rawTags = Array.isArray(candidate.tags) ? candidate.tags : [];
  const tags = rawTags
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 6);

  if (!title) {
    throw new Error("タイトルが生成されませんでした。");
  }

  if (!synopsis) {
    throw new Error("あらすじが生成されませんでした。");
  }

  if (!body) {
    throw new Error("本文が生成されませんでした。");
  }

  return {
    title,
    synopsis,
    body,
    estimatedReadingMinutes,
    tags: Array.from(
      new Set(["AI生成", "時間指定AI短編", ...tags])
    ).slice(0, 8),
    aiGenerated: true,
  };
}

function buildPrompt(request: TimeFitStoryRequest): string {
  const range = CHARACTER_RANGES[request.timeMinutes];

  return [
    "LIB readの時間フィットAI物語生成MVPとして、日本語の短編小説を生成してください。",
    "",
    "条件:",
    `- 利用シーン: ${request.scene}`,
    `- 想定時間: 約${request.timeMinutes}分で聴ける`,
    `- ジャンル: ${request.genre}`,
    `- 雰囲気: ${request.mood}`,
    `- 本文文字数目安: ${range.min}〜${range.max}字`,
    "",
    "方針:",
    "- 読み上げで聴いて理解しやすい、情景と展開が明確な文章にする。",
    "- 冒頭から状況が分かるようにする。",
    "- 結末まで完結させる。",
    "- 過度に説明的なプロンプト文やメタ発言を本文に入れない。",
    "- 実在の作家名、既存作品名、著名IPの文体模倣はしない。",
    "- 暴力・性的表現・差別表現は一般公開サービスの短編として安全な範囲に抑える。",
    "- 「ぴったり」ではなく「約◯分」の体験として成立させる。",
    "",
    "返す内容:",
    "- title: 作品タイトル",
    "- synopsis: 100〜220字程度のあらすじ",
    "- body: 小説本文",
    "- estimatedReadingMinutes: 数値",
    "- tags: ジャンル、雰囲気、利用シーンを含む短いタグ配列",
    "- aiGenerated: true",
  ].join("\n");
}

export async function POST(request: Request) {
  let payload: Record<string, unknown>;

  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "リクエストを読み取れませんでした。" },
      { status: 400 }
    );
  }

  let generationRequest: TimeFitStoryRequest;

  try {
    generationRequest = parseRequest(payload);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "入力内容を確認してください。",
      },
      { status: 400 }
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        ok: false,
        error: "OPENAI_API_KEY が設定されていません。",
      },
      { status: 500 }
    );
  }

  const model = process.env.OPENAI_TEXT_MODEL ?? "gpt-5.4-mini";

  try {
    const openAIResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "developer",
            content: [
              {
                type: "input_text",
                text:
                  "あなたは日本語の短編小説編集者です。読み上げで聴きやすく、短時間で完結する物語だけを生成してください。返答は必ず指定JSONスキーマに従ってください。",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: buildPrompt(generationRequest),
              },
            ],
          },
        ],
        max_output_tokens: MAX_OUTPUT_TOKENS[generationRequest.timeMinutes],
        text: {
          format: {
            type: "json_schema",
            name: "time_fit_story",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                title: {
                  type: "string",
                },
                synopsis: {
                  type: "string",
                },
                body: {
                  type: "string",
                },
                estimatedReadingMinutes: {
                  type: "number",
                },
                tags: {
                  type: "array",
                  items: {
                    type: "string",
                  },
                },
                aiGenerated: {
                  type: "boolean",
                },
              },
              required: [
                "title",
                "synopsis",
                "body",
                "estimatedReadingMinutes",
                "tags",
                "aiGenerated",
              ],
            },
          },
        },
      }),
    });

    const responseBody = (await openAIResponse.json()) as OpenAIResponseBody;

    if (!openAIResponse.ok) {
      return NextResponse.json(
        {
          ok: false,
          error:
            responseBody.error?.message ??
            "AI短編の生成に失敗しました。",
        },
        { status: openAIResponse.status }
      );
    }

    const outputText = extractOutputText(responseBody);

    if (!outputText) {
      return NextResponse.json(
        {
          ok: false,
          error: "AI生成結果が空でした。",
        },
        { status: 502 }
      );
    }

    const parsedStory = JSON.parse(outputText) as unknown;
    const story = normalizeStory(parsedStory, generationRequest.timeMinutes);

    return NextResponse.json({
      ok: true,
      story,
      request: generationRequest,
    });
  } catch (error) {
    console.error("[time-fit-story-generate]", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "AI短編の生成中にエラーが発生しました。",
      },
      { status: 500 }
    );
  }
}