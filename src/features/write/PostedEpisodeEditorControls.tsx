"use client";

import { useEffect } from "react";

export default function PostedEpisodeEditorControls() {
  useEffect(() => {
    const apply = () => {
      const checked = document.querySelector<HTMLInputElement>('input[name="episode-posting-status"]:checked');
      const section = checked?.closest("section");
      if (!checked || !section) return;
      const grid = section.querySelector<HTMLDivElement>("div.mt-4.grid");
      const buttons = Array.from(section.querySelectorAll<HTMLButtonElement>("button"));
      const save = buttons.find((button) => button.textContent?.includes("保存して続ける"));
      const postDraft = buttons.find((button) => button.textContent?.includes("この下書きを投稿する"));
      const pillId = "posted-episode-status";
      let pill = section.querySelector<HTMLElement>(`[data-${pillId}]`);
      if (checked.value === "posted") {
        if (grid) grid.style.display = "none";
        if (!pill) {
          pill = document.createElement("span");
          pill.dataset[pillId] = "true";
          pill.className = "rounded-full border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800";
          pill.textContent = "公開中";
          const actionBar = save?.parentElement;
          actionBar?.prepend(pill);
        }
        if (save) save.textContent = "変更を保存";
        if (postDraft) postDraft.style.display = "none";
      } else {
        if (grid) grid.style.display = "";
        pill?.remove();
        if (save) save.textContent = "保存して続ける";
        if (postDraft) postDraft.style.display = "none";
      }
    };
    apply();
    document.addEventListener("change", apply);
    return () => document.removeEventListener("change", apply);
  }, []);

  return null;
}
