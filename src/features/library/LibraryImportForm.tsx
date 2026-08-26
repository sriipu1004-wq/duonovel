"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ChangeEvent } from "react";
import {
  PRIVATE_LIBRARY_LIMITS,
  buildPrivateLibraryWorkHref,
  formatCharacterCount,
} from "@/lib/library/privateLibrary";
import {
  decodeTxtBuffer,
  parseTxtImport,
  type ParsedTxtImport,
} from "@/lib/library/parseTxtImport";
import {
  LANGUAGE_REGISTRY,
  type SupportedLanguageTag,
} from "@/lib/translation/languageRegistry";

type ImportState = "idle" | "reading" | "ready" | "saving" | "error";

const SOURCE_LANGUAGES = Object.values(LANGUAGE_REGISTRY);

function titleFromFileName(fileName: string): string {
  return fileName.replace(/\.txt$/iu, "").trim().slice(0, 200);
}

export default function LibraryImportForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [sourceLanguage, setSourceLanguage] =
    useState<SupportedLanguageTag>("ja");
  const [fileName, setFileName] = useState("");
  const [encodingLabel, setEncodingLabel] = useState("");
  const [parsed, setParsed] = useState<ParsedTxtImport | null>(null);
  const [state, setState] = useState<ImportState>("idle");
  const [message, setMessage] = useState("");

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setParsed(null);
    setEncodingLabel("");
    setMessage("");

    if (!file) {
      setFileName("");
      setState("idle");
      return;
    }

    if (!file.name.toLowerCase().endsWith(".txt")) {
      setState("error");
      setMessage(".txtファイルを選択してください。");
      event.target.value = "";
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
      const decoded = decodeTxtBuffer(await file.arrayBuffer());
      const nextParsed = parseTxtImport(decoded.text);
      setParsed(nextParsed);
      setEncodingLabel(decoded.encodingLabel);
      setTitle((current) => current || titleFromFileName(file.name));
      setState("ready");
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "TXTファイルを読み取れませんでした。"
      );
    }
  }

  async function handleImport() {
    if (!parsed || !title.trim() || state === "saving") return;

    setState("saving");
    setMessage("");

    try {
      const response = await fetch("/api/library/import-txt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          authorName: authorName.trim(),
          sourceLanguage,
          originalFileName: fileName,
          chapters: parsed.chapters,
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        workId?: string;
        message?: string;
      };

      if (!response.ok || !payload.ok || !payload.workId) {
        setState("error");
        setMessage(payload.message || "TXTの取り込みに失敗しました。");
        return;
      }

      router.push(buildPrivateLibraryWorkHref(payload.workId));
      router.refresh();
    } catch {
      setState("error");
      setMessage("通信が中断されました。もう一度お試しください。");
    }
  }

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 text-sm text-neutral-500">
          <Link href="/library" className="hover:text-black">
            個人本棚
          </Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-700">TXTを取り込む</span>
        </div>

        <section className="overflow-hidden rounded-[32px] border border-black/10 bg-white shadow-sm">
          <div className="border-b border-black/10 px-5 py-6 sm:px-8">
            <p className="text-xs tracking-[0.22em] text-neutral-500">
              PRIVATE LIBRARY IMPORT
            </p>
            <h1 className="mt-3 text-3xl font-bold text-black">
              TXTを個人本棚へ取り込む
            </h1>
            <p className="mt-3 text-sm leading-7 text-neutral-600">
              本文を話数へ自動分割し、LIB readのReaderで読める形にします。
            </p>
          </div>

          <div className="grid gap-6 px-5 py-6 sm:px-8">
            <div className="rounded-[24px] border border-sky-200 bg-sky-50 p-4 text-sm leading-7 text-neutral-800">
              取り込んだ作品は本人だけが閲覧できます。公開・共有・検索表示・検索エンジンへの登録は行いません。DRMやペイウォールを回避したデータは取り込まないでください。
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 sm:col-span-2">
                <span className="text-sm text-neutral-700">TXTファイル</span>
                <input
                  type="file"
                  accept=".txt,text/plain"
                  onChange={handleFileChange}
                  className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black file:mr-4 file:rounded-full file:border-0 file:bg-black file:px-4 file:py-2 file:text-sm file:text-white"
                />
                <span className="text-xs leading-6 text-neutral-500">
                  UTF-8・Shift_JIS・UTF-16に対応。最大{Math.floor(PRIVATE_LIBRARY_LIMITS.maxFileBytes / 1_000_000)}MB、{PRIVATE_LIBRARY_LIMITS.maxSourceChars.toLocaleString("ja-JP")}文字、{PRIVATE_LIBRARY_LIMITS.maxChapters}話。
                </span>
              </label>

              <label className="grid gap-2 sm:col-span-2">
                <span className="text-sm text-neutral-700">作品タイトル</span>
                <input
                  value={title}
                  maxLength={200}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="ファイル名から自動入力"
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

              <label className="grid gap-2">
                <span className="text-sm text-neutral-700">原文言語</span>
                <select
                  value={sourceLanguage}
                  onChange={(event) =>
                    setSourceLanguage(event.target.value as SupportedLanguageTag)
                  }
                  className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none focus:border-sky-300"
                >
                  {SOURCE_LANGUAGES.map((language) => (
                    <option key={language.tag} value={language.tag}>
                      {language.nativeLabel}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {parsed ? (
              <section className="rounded-[24px] border border-black/10 bg-neutral-50 p-5">
                <div className="flex flex-wrap gap-2 text-xs text-neutral-700">
                  <span className="rounded-full border border-black/10 bg-white px-3 py-1.5">
                    {parsed.chapters.length}話
                  </span>
                  <span className="rounded-full border border-black/10 bg-white px-3 py-1.5">
                    {formatCharacterCount(parsed.sourceCharCount)}
                  </span>
                  <span className="rounded-full border border-black/10 bg-white px-3 py-1.5">
                    {encodingLabel}
                  </span>
                  <span className="rounded-full border border-black/10 bg-white px-3 py-1.5">
                    {parsed.usedDetectedHeadings ? "見出しから分割" : "本文量から分割"}
                  </span>
                </div>
                <div className="mt-4 grid gap-2">
                  {parsed.chapters.slice(0, 5).map((chapter, index) => (
                    <div
                      key={`${chapter.title}-${index}`}
                      className="rounded-2xl border border-black/10 bg-white px-4 py-3"
                    >
                      <p className="text-sm font-medium text-black">
                        {index + 1}. {chapter.title}
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {formatCharacterCount(chapter.body.length)}
                      </p>
                    </div>
                  ))}
                  {parsed.chapters.length > 5 ? (
                    <p className="px-2 text-xs text-neutral-500">
                      ほか{parsed.chapters.length - 5}話
                    </p>
                  ) : null}
                </div>
              </section>
            ) : null}

            {state === "reading" ? (
              <p className="text-sm text-neutral-600">TXTを解析しています…</p>
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
                disabled={!parsed || !title.trim() || state === "saving"}
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
