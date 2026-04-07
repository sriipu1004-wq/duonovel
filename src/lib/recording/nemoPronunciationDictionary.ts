export type NemoPronunciationDictionary = Record<string, string>;

type ResolveNemoPronunciationDictionaryInput = {
  seriesId?: string;
  episodeId?: string;
};

const GLOBAL_PRONUNCIATION_DICTIONARY: NemoPronunciationDictionary = {
  "LIB read": "ライブリード",
  "VOICEVOX Nemo": "ボイスボックス ニモ",
};

const SERIES_PRONUNCIATION_DICTIONARIES: Record<
  string,
  NemoPronunciationDictionary
> = {
  // "series-id": {
  //   "固有語": "よみ",
  // },
};

const EPISODE_PRONUNCIATION_DICTIONARIES: Record<
  string,
  NemoPronunciationDictionary
> = {
  // "episode-id": {
  //   "固有語": "よみ",
  // },
};

function compactDictionary(
  dictionary: NemoPronunciationDictionary
): NemoPronunciationDictionary {
  return Object.fromEntries(
    Object.entries(dictionary).filter(([source, target]) => {
      return source.trim().length > 0 && target.trim().length > 0;
    })
  );
}

export function resolveNemoPronunciationDictionary({
  seriesId,
  episodeId,
}: ResolveNemoPronunciationDictionaryInput): NemoPronunciationDictionary {
  const seriesDictionary =
    (seriesId && SERIES_PRONUNCIATION_DICTIONARIES[seriesId]) || {};
  const episodeDictionary =
    (episodeId && EPISODE_PRONUNCIATION_DICTIONARIES[episodeId]) || {};

  return compactDictionary({
    ...GLOBAL_PRONUNCIATION_DICTIONARY,
    ...seriesDictionary,
    ...episodeDictionary,
  });
}