"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function LibraryProgressTracker({
  workId,
  chapterNumber,
}: {
  workId: string;
  chapterNumber: number;
}) {
  useEffect(() => {
    void supabase
      .from("private_library_works")
      .update({
        last_opened_chapter_number: chapterNumber,
        last_opened_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", workId);
  }, [chapterNumber, workId]);

  return null;
}
