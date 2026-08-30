"use client";

import { useEffect, useState } from "react";
import {
  readWebSpeechDisplaySettings,
  writeWebSpeechDisplaySettings,
  type StoredWebSpeechDisplaySettings,
} from "@/lib/playback/webSpeechPreferences";

export function useReaderDisplaySettings(seriesId: string): {
  displaySettings: StoredWebSpeechDisplaySettings;
  setDisplaySettings: (
    settings: StoredWebSpeechDisplaySettings
  ) => void;
} {
  const [displaySettings, setDisplaySettings] =
    useState<StoredWebSpeechDisplaySettings>(() =>
      readWebSpeechDisplaySettings(seriesId)
    );

  useEffect(() => {
    writeWebSpeechDisplaySettings(displaySettings);
  }, [displaySettings]);

  return { displaySettings, setDisplaySettings };
}
