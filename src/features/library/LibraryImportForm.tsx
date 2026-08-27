"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ChangeEvent } from "react";
import type { ParsedBookImport } from "@/lib/library/bookImport";
import {
  PRIVATE_LIBRARY_LIMITS,
  buildPrivateLibraryWorkHref,
  formatCharacterCount,
  type PrivateLibrarySourceType,
} from "@/lib/library/privateLibrary";
import { parseDocxImport } from "@/lib/library/parseDocxImport";
import { parseEpubImport } from "@/lib/library/parseEpubImport";
import { parsePdfImport } from "@/lib/library/parsePdfImport";
import { decodeTxtBuffer, parseTxtImport } from "@/lib/library/parseTxtImport";
import {
  getSupportedLanguage,
  type SupportedLanguageTag,
} from "@/lib/translation/languageRegistry";
import { detectBookSourceLanguage } from "@/lib/translation/detectSourceLanguage";

type ImportState = "idle" | "reading" | "ready" | "saving" | "error";

type ParsedSelection = {
  parsed: ParsedBookImport;
  sourceType: PrivateLibrarySourceType;
  formatLabel: string;
  suggestedTitle: string;
  suggestedAuthor: string;
  suggestedLanguage: SupportedLanguageTag | null;
  detailLabel: string;
};

function titleFromFileName(fileName: string): string {
  return fileName.replace(/\.(?:txt|epub|docx|pdf)$/iu, "").trim().slice(0, 200);
}

function extensionFromFileName(fileName: string): string {
  return fileName.toLowerCase().split(".").pop() ?? "";
}

async function parseSelectedFile(file: File): Promise<ParsedSelection> {
  const buffer = await file.arrayBuffer();
  const extension = extensionFromFileName(file.name);

  if (extension === "txt") {
    const decoded = decodeTxtBuffer(buffer);
    return {
      parsed: parseTxtImport(decoded.text),
      sourceType: "txt",
      formatLabel: "TXT",
      suggestedTitle: titleFromFileName(file.name),
      suggestedAuthor: "",
      suggestedLanguage: null,
      detailLabel: decoded.encodingLabel,
    };
  }

  if (extension === "epub") {
    const result = parseEpubImport(buffer, file.name);
    return {
      parsed: result.parsed,
      sourceType: "epub",
      formatLabel: result.formatLabel,
      suggestedTitle: result.suggestedTitle,
      suggestedAuthor: result.suggestedAuthor,
      suggestedLanguage: result.suggestedLanguage,
      detailLabel: "目次 / spine解析",
    };
  }

  if (extension === "docx") {
    const result = parseDocxImport(buffer, file.name);
    return {
      parsed: result.parsed,
      sourceType: "docx",
      formatLabel: result.formatLabel,
      suggestedTitle: result.suggestedTitle,
      suggestedAuthor: result.suggestedAuthor,
      suggestedLanguage: null,
      detailLabel: "見出し解析",
    };
  }

  if (extension === "pdf") {
    const result = await parsePdfImport(buffer, file.name);
    return {
      parsed: result.parsed,
      sourceType: "pdf",
      formatLabel: result.formatLabel,
      suggestedTitle: result.suggestedTitle,
      suggestedAuthor: result.suggestedAuthor,
      suggestedLanguage: null,
      detailLabel: "文字レイヤー解析",
    };
  }

  throw new Error("TXT・EPUB・DOCX・PDFのいずれかを選択してください。");
}

async function readJsonResponse(response: Response): Promise<{
  ok?: boolean;
  workId?: string;
  message?: string;
}> {
  try {
    return (await response.json()) as {
      ok?: boolean;
      workId?: string;
      message?: string;
    };
  } catch {
    return {};
  }
}

export default function LibraryImportForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [sourceLanguage, setSourceLanguage] =
    useState<SupportedLanguageTag>("ja");
  const [fileName, setFileName] = useState("");
  const [selection, setSelection] = useState<ParsedSelection | null>(null);
  const [state, setState] = useState<ImportState>("idle");
  const [message, setMessage] = useState("");
  const [savedUnits, setSavedUnits] = useState(0);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSelection(null);
    setMessage("");
    setSavedUnits(0);
    setRightsConfirmed(false);

    if (!file) {
      setFileName("");
      setState("idle");
      return;
    }

    if (file.size <= 0 || file.size > PRIVATE_LIBRARY_LIMITS.maxFileBytes) {
      setState("error");
      setMessage(
        `ファイルサイズは${Math.floor(PRIVATE_LIBRARY_LIMITS.maxFileBytes / 1_000_000)}MB以内にしてください。`
      );
      event.target.value = "";
      return;
    }

    setState("reading");
    setFileName(file.name);

    try {
      const nextSelection = await parseSelectedFile(file);
      setSelection(nextSelection);
      setTitle(nextSelection.suggestedTitle || titleFromFileName(file.name));
      setAuthorName(nextSelection.suggestedAuthor);
      setSourceLanguage(
        detectBookSourceLanguage(
          nextSelection.parsed,
          nextSelection.suggestedLanguage
        )
      );
      setState("ready");
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "ファイルを読み取れませんでした。"
      );
    }
  }

  async function abortImport(workId: string) {
    try {
      await fetch(`/api/library/import/${encodeURIComponent(workId)}`, {
        method: "DELETE",
        keepalive: true,
      });
    } catch {
      // Incomplete imports remain hidden and are cleaned before a future import.
    }
  }

  async function handleImport() {
    if (
      !selection ||
      !title.trim() ||
      !rightsConfirmed ||
      state === "saving"
    ) {
      return;
    }

    setState("saving");
    setMessage("");
    setSavedUnits(0);
    let workId = "";

    try {
      const startResponse = await fetch("/api/library/import/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          authorName: authorName.trim(),
          sourceType: selection.sourceType,
          sourceLanguage,
          originalFileName: fileName,
          sourceCharCount: selection.parsed.sourceCharCount,
          unitCount: selection.parsed.units.length,
          sectionCount: selection.parsed.sections.length,
        }),
      });
      const startPayload = await readJsonResponse(startResponse);

      if (!startResponse.ok || !startPayload.ok || !startPayload.workId) {
        throw new Error(
          startPayload.message || "作品の保存準備に失敗しました。"
        );
      }

      workId = startPayload.workId;

      for (
        let startIndex = 0;
        startIndex < selection.parsed.units.length;
        startIndex += PRIVATE_LIBRARY_LIMITS.importBatchSize
      ) {
        const units = selection.parsed.units.slice(
          startIndex,
          startIndex + PRIVATE_LIBRARY_LIMITS.importBatchSize
        );
        const batchResponse = await fetch(
          `/api/library/import/${encodeURIComponent(workId)}/units`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              startUnitNumber: startIndex + 1,
              units,
            }),
          }
        );
        const batchPayload = await readJsonResponse(batchResponse);

        if (!batchResponse.ok || !batchPayload.ok) {
          throw new Error(
            batchPayload.message || "本文の分割保存に失敗しました。"
          );
        }

        setSavedUnits(startIndex + units.length);
      }

      const completeResponse = await fetch(
        `/api/library/import/${encodeURIComponent(workId)}/complete`,
        { method: "POST" }
      );
      const completePayload = await readJsonResponse(completeResponse);

      if (!completeResponse.ok || !completePayload.ok) {
        throw new Error(
          completePayload.message || "作品の保存完了を確認できませんでした。"
        );
      }

      router.push(buildPrivateLibraryWorkHref(workId));
      router.refresh();
    } catch (error) {
      if (workId) await abortImport(workId);
      setState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "通信が中断されました。もう一度お試しください。"
      );
    }
  }

  const progress = selection
    ? Math.round((savedUnits / selection.parsed.units.length) * 100)
    : 0;

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 text-sm text-neutral-500">
          <Link href="/library" className="hover:text-black">
            個人本棚
          </Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-700">作品を取り込む</span>
        </div>

        <section className="overflow-hidden rounded-[32px] border border-black/10 bg-white shadow-sm">
          <div className="border-b border-black/10 px-5 py-6 sm:px-8">
            <p className="text-xs tracking-[0.22em] text-neutral-500">
              PRIVATE LIBRARY IMPORT
            </p>
            <h1 className="mt-3 text-3xl font-bold text-black">
              長編小説を個人本棚へ取り込む
            </h1>
            <p className="mt-3 text-sm leading-7 text-neutral-600">
              章構造を保ったまま分割し、現在読む部分だけ対訳できる形にします。
            </p>
          </div>

          <div className="grid gap-6 px-5 py-6 sm:px-8">
            <div className="rounded-[24px] border border-sky-200 bg-sky-50 p-4 text-sm leading-7 text-neutral-800">
              取り込んだ作品は本人だけが閲覧できます。URLからの取得、公開、共有、検索表示は行いません。DRM・パスワード・ペイウォールを回避したデータは取り込めません。
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 sm:col-span-2">
                <span className="text-sm text-neutral-700">小説ファイル</span>
                <input
                  type="file"
                  accept=".txt,.epub,.docx,.pdf,text/plain,application/epub+zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
                  onChange={handleFileChange}
                  className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black file:mr-4 file:rounded-full file:border-0 file:bg-black file:px-4 file:py-2 file:text-sm file:text-white"
                />
                <span className="text-xs leading-6 text-neutral-500">
                  TXT・EPUB・DOCX・テキストPDFに対応。最大
                  {Math.floor(PRIVATE_LIBRARY_LIMITS.maxFileBytes / 1_000_000)}
                  MB、{PRIVATE_LIBRARY_LIMITS.maxSourceChars.toLocaleString("ja-JP")}
                  文字、{PRIVATE_LIBRARY_LIMITS.maxSections.toLocaleString("ja-JP")}
                  章・話。
                </span>
              </label>

              <label className="grid gap-2 sm:col-span-2">
                <span className="text-sm text-neutral-700">作品タイトル</span>
                <input
                  value={title}
                  maxLength={200}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="ファイルから自動入力"
                  className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none focus:border-sky-300"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm text-neutral-700">作者名（任意）</span>
                <input
                  value={authorName}
                  maxLength={200}
                  onChange={(event) => setAuthorName(event.target.value)}
                  placeholder="作者名"
                  className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none focus:border-sky-300"
                />
              </label>

            </div>

            {selection ? (
              <section className="rounded-[24px] border border-black/10 bg-neutral-50 p-5">
                <div className="flex flex-wrap gap-2 text-xs text-neutral-700">
                  <span className="rounded-full border border-black/10 bg-white px-3 py-1.5">
                    {selection.formatLabel}
                  </span>
                  <span className="rounded-full border border-black/10 bg-white px-3 py-1.5">
                    {selection.parsed.sections.length.toLocaleString("ja-JP")}章・話
                  </span>
                  <span className="rounded-full border border-black/10 bg-white px-3 py-1.5">
                    {selection.parsed.units.length.toLocaleString("ja-JP")}読書単位
                  </span>
                  <span className="rounded-full border border-black/10 bg-white px-3 py-1.5">
                    {formatCharacterCount(selection.parsed.sourceCharCount)}
                  </span>
                  <span className="rounded-full border border-black/10 bg-white px-3 py-1.5">
                    {selection.detailLabel}
                  </span>
                  <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5">
                    原文 {getSupportedLanguage(sourceLanguage).nativeLabel}（自動判定）
                  </span>
                </div>

                {selection.parsed.warnings.map((warning) => (
                  <p
                    key={warning}
                    className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-900"
                  >
                    {warning}
                  </p>
                ))}

                <div className="mt-4 grid gap-2">
                  {selection.parsed.sections.slice(0, 8).map((section) => (
                    <div
                      key={`${section.sectionNumber}-${section.title}`}
                      className="rounded-2xl border border-black/10 bg-white px-4 py-3"
                    >
                      <p className="text-sm font-medium text-black">
                        {section.sectionNumber}. {section.title}
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {formatCharacterCount(section.sourceCharCount)}
                        {section.partCount > 1
                          ? `・内部で${section.partCount}分割`
                          : ""}
                      </p>
                    </div>
                  ))}
                  {selection.parsed.sections.length > 8 ? (
                    <p className="px-2 text-xs text-neutral-500">
                      ほか
                      {(selection.parsed.sections.length - 8).toLocaleString("ja-JP")}
                      章・話
                    </p>
                  ) : null}
                </div>
              </section>
            ) : null}

            {selection ? (
              <label className="flex items-start gap-3 rounded-[20px] border border-black/10 bg-white px-4 py-4 text-sm leading-6 text-neutral-700">
                <input
                  type="checkbox"
                  checked={rightsConfirmed}
                  onChange={(event) => setRightsConfirmed(event.target.checked)}
                  className="mt-1 size-4 shrink-0"
                />
                <span>
                  自分が作成した作品、著作権が切れた作品、利用許諾を得た作品、または自分が適法に用意して個人利用できるファイルであり、DRM等を回避していないことを確認します。
                </span>
              </label>
            ) : null}

            {state === "reading" ? (
              <p className="text-sm text-neutral-600">ファイルを解析しています…</p>
            ) : null}
            {state === "saving" && selection ? (
              <div className="grid gap-2">
                <div className="flex justify-between text-xs text-neutral-600">
                  <span>本文を安全に分割保存しています…</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-neutral-200">
                  <div
                    className="h-full rounded-full bg-black transition-[width]"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            ) : null}
            {message ? (
              <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-7 text-red-800">
                {message}
              </p>
            ) : null}

            <div className="flex flex-wrap justify-end gap-3">
              <Link
                href="/library"
                className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-neutral-800 transition hover:bg-neutral-50"
              >
                戻る
              </Link>
              <button
                type="button"
                disabled={
                  !selection ||
                  !title.trim() ||
                  !rightsConfirmed ||
                  state === "saving"
                }
                onClick={handleImport}
                className="rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {state === "saving" ? "取り込み中…" : "個人本棚へ保存"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
