"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type AivisAutogenStatus =
  | "idle"
  | "checking"
  | "generated"
  | "busy"
  | "none_missing"
  | "error";

type AivisAutogenResponse = {
  ok?: boolean;
  status?: "generated" | "none_missing" | "model_missing" | "skipped" | "busy";
  generatedCount?: number;
  steps?: Array<{
    status?: string;
    generatedEpisodeId?: string;
    generatedSeriesId?: string;
    generatedVoiceModelId?: string;
    narratorName?: string;
    reason?: string;
  }>;
  error?: string;
  detail?: string;
};

type AivisAutoGenerationBootstrapProps = {
  enabled: boolean;
};

function getStatusLabel(status: AivisAutogenStatus): string {
  if (status === "checking") return "Aivis自動朗読を確認中";
  if (status === "generated") return "Aivis自動朗読を生成済み";
  if (status === "busy") return "Aivis自動朗読を生成中";
  if (status === "none_missing") return "Aivis自動朗読の未生成なし";
  if (status === "error") return "Aivis自動朗読でエラー";
  return "Aivis自動朗読待機中";
}

export function AivisAutoGenerationBootstrap({
  enabled,
}: AivisAutoGenerationBootstrapProps) {
  const router = useRouter();
  const [status, setStatus] = useState<AivisAutogenStatus>(
    enabled ? "checking" : "idle"
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!enabled) {
      setStatus("idle");
      setMessage("");
      return;
    }

    let cancelled = false;
    let attempts = 0;

    async function runStep() {
      if (cancelled) return;
      if (attempts >= 5) return;

      attempts += 1;
      setStatus("checking");

      try {
        const response = await fetch("/api/recordings/aivis-autogen-run-pending", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            maxSteps: 1,
          }),
        });

        const payload = (await response.json()) as AivisAutogenResponse;
        const firstStep = payload.steps?.[0] ?? null;

        if (!response.ok || payload.ok === false) {
          setStatus("error");
          setMessage(payload.detail || payload.error || "Aivis自動朗読に失敗");
          return;
        }

        if (cancelled) return;

        if (payload.status === "generated") {
          setStatus("generated");
          setMessage(
            firstStep?.narratorName
              ? `${firstStep.narratorName} を生成`
              : "1件生成"
          );

          window.setTimeout(() => {
            if (!cancelled) {
              router.refresh();
            }
          }, 1200);

          window.setTimeout(runStep, 1800);
          return;
        }

        if (payload.status === "busy") {
          setStatus("busy");
          setMessage("別のAivis生成処理が進行中");
          window.setTimeout(runStep, 2500);
          return;
        }

        if (payload.status === "none_missing") {
          setStatus("none_missing");
          setMessage("生成対象なし");
          return;
        }

        if (payload.status === "model_missing") {
          setStatus("error");
          setMessage("有効なAivis音声モデルなし");
          return;
        }

        setStatus("idle");
        setMessage(payload.status || "");
      } catch (error) {
        setStatus("error");
        setMessage(error instanceof Error ? error.message : String(error));
      }
    }

    void runStep();

    return () => {
      cancelled = true;
    };
  }, [enabled, router]);

  if (!enabled || status === "idle") {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-xs rounded-2xl border border-black/10 bg-white px-4 py-3 text-xs text-black shadow-lg">
      <div className="font-semibold">{getStatusLabel(status)}</div>
      {message ? (
        <div className="mt-1 text-neutral-600">{message}</div>
      ) : null}
    </div>
  );
}