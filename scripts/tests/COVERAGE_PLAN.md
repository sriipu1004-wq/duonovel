# テスト追加の計画（LT-002）

`src/lib/` のうち、`scripts/test-*` から参照されていないモジュールに、今の挙動を固定するテスト（characterization test）を1つずつ足す。実装は変えない。テストが今の実装で落ちたら、テストは足さず下の「不具合の疑い」に書く。

選び方: 入力から出力が決まる純粋な関数を先に、import の少ない・短いものから。`window`・Supabase・ネットワーク・ファイルに触るものは後回し。

## 済み
| モジュール | テスト | package.json | 日付 | 結果 |
|---|---|---|---|---|
| `src/lib/readerAuthorHref.ts` | `scripts/test-reader-author-href.ts` | `test:reader-author-href` | 2026-11-25 | PASS、tsc PASS |
| `src/lib/recording/audioUploadPolicy.ts` | `scripts/test-audio-upload-policy.ts` | `test:audio-upload-policy` | 2026-11-25 | PASS、tsc PASS |
| `src/lib/recording/nemoRegenerationDiff.ts` | `scripts/test-nemo-regeneration-diff.ts` | `test:nemo-regeneration-diff` | 2026-11-25 | PASS、tsc PASS。`猫…`→`猫...` を「読みが変わった」と判定する今の挙動も固定した |
| `src/lib/searchSavedFilters.ts` | `scripts/test-search-saved-filters.ts` | `test:search-saved-filters` | 2026-11-25 | PASS、tsc PASS |

## 候補（未着手、上から順に）
- `src/lib/translation/segmentJapaneseEpisode.ts`
- `src/lib/recording/nemoPronunciationDictionary.ts`
- `src/lib/seo/jaSearchDiscovery.ts`
- `src/lib/bgm/bgmSettings.ts`、`src/lib/effects/effectSettings.ts`

## 後回し（純粋でない）
- `src/lib/playback/translationReaderPreference.ts`、`src/lib/translation/bilingualSessionPreference.ts`（`window.localStorage`）
- `src/lib/authorFollow.ts`、`src/lib/authorProfileLike.ts`、`src/lib/readerCardLike.ts`、`src/lib/auth/*`（Supabase）
- `src/lib/recording/aivisClient.ts`、`src/lib/recording/nemoClient.ts`（ネットワーク）

## 不具合の疑い
- `src/lib/recording/nemoChunking.ts` の `buildNemoChunks`（2026-11-25、テストは足していない）
  - 内容: 原文（`originalParagraph`）と読み上げ用の文（`spokenParagraph`）を別々に文へ分け、番号でそろえている。前処理（`nemoTextPreprocess.ts` の `normalizePauseExpressionSurface` など）が `」` の後ろに `、` を入れる・`――` の扱いを変えると、読み上げ側の文の数が原文より少なくなる。足りない分は原文の文で埋めるため、同じ部分が2回読み上げ用の chunk に入る。
  - 再現（`maxChars` は既定）: `buildNemoChunks("「こんにちは」と彼は言った。")` → chunk の `text` が `「こんにちは」、と彼は言った。` と `と彼は言った。` の2つ（後半が重複）。`buildNemoChunks("そして――彼は去った")` → `そして、彼は去った` と `彼は去った`。
  - 影響の範囲（コードを読んだだけ）: `nemoGeneration.ts`、`nemoAutoGeneration.ts`、`nemoGenerationQueue.ts`、`aivisGeneration.ts` が使う自動朗読（TTS）の生成。今その生成が動いているか（停止中か）は確かめていない。実際の音声で重複するかは未検証。
  - この形の振る舞いを固定するテストは足さない（不具合を固定してしまうため）。直すかどうかはオーナーの判断。
