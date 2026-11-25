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
| `src/lib/translation/segmentJapaneseEpisode.ts` | `scripts/test-segment-japanese-episode.ts` | `test:segment-japanese-episode` | 2026-11-25 | PASS、tsc PASS（ラッパーが `segmentSourceDocument(body, "ja")` と同じ結果を返すことだけ） |
| `src/lib/recording/nemoPronunciationDictionary.ts` | `scripts/test-nemo-pronunciation-dictionary.ts` | `test:nemo-pronunciation-dictionary` | 2026-11-25 | PASS、tsc PASS |
| `src/lib/seo/jaSearchDiscovery.ts` | `scripts/test-ja-search-discovery.ts` | `test:ja-search-discovery` | 2026-11-25 | PASS、tsc PASS。既存の `test:public-seo-alignment` はソースの文字列を見るだけで、関数は動かしていなかった |
| `src/lib/bgm/bgmSettings.ts` | `scripts/test-bgm-settings.ts` | `test:bgm-settings` | 2026-11-25 | PASS、tsc PASS。`clampBgmSeconds` は空白だけの文字列・`[]` を 0、`true` を 1 にする（`Number()` の変換。不具合とまでは言えないので記録だけ） |
| `src/lib/effects/effectSettings.ts` | `scripts/test-effect-settings.ts` | `test:effect-settings` | 2026-11-25 | PASS、tsc PASS。挿絵の `imageUrl` は前後の空白を取るだけで、URL の形式は見ていない（今の挙動として固定） |
| `src/lib/auth/operator.ts` | `scripts/test-auth-operator.ts` | `test:auth-operator` | 2026-11-25 | PASS、tsc PASS。`LIBREAD_OPERATOR_EMAILS` が無いときだけ `NEXT_PUBLIC_LIBREAD_OPERATOR_EMAILS` を使う（空文字なら使わない）。`NEXT_PUBLIC_` の名前はブラウザ用の bundle に入りうる名前（実際に入っているかは見ていない） |
| `src/lib/aiUsage/aiUsage.ts` | `scripts/test-ai-usage-format.ts` | `test:ai-usage-format` | 2026-11-25 | PASS、tsc PASS |
| `src/lib/translation/openAITranslationModel.ts` | `scripts/test-openai-translation-model.ts` | `test:openai-translation-model` | 2026-11-25 | PASS、tsc PASS。表に無いモデル名は gpt-4.1-mini の単価になる（高いモデルを環境変数で指定すると原価の見積もりが低く出うる。記録だけ） |
| `src/lib/recording/audioUploadServerValidation.ts` | `scripts/test-audio-upload-server-validation.ts` | `test:audio-upload-server-validation` | 2026-11-25 | PASS、tsc PASS。拡張子・MIME が表に無いと照合をしない（例 `a.bin`＋`audio/x-custom` の WAV は通る） |
| `src/lib/recording/nemoWav.ts` | `scripts/test-nemo-wav.ts` | `test:nemo-wav` | 2026-11-25 | PASS、tsc PASS（16bit の合成 PCM で確認） |
| `src/lib/library/zipBook.ts` | `scripts/test-zip-book.ts` | `test:zip-book` | 2026-11-25 | PASS、tsc PASS。展開前の大きさの上限は ZIP の目次に書かれた値で見る（目次の値が偽のときの挙動は確かめていない） |

## 候補（未着手、上から順に。2026-11-25 に洗い直し）
最初の洗い出しは、テストからの参照を文字列で探しただけで、ソースの文字列を読むだけのテスト（例 `test:public-seo-alignment`）も「テスト済み」と数えていた。洗い直しでは、`scripts/test-*` が `../src/lib/…` か `@/lib/…` から import しているものだけを「テスト済み」とした。
- `src/lib/recording/humanRecordingAlignment.ts`
- `src/lib/seo/currentSearchDiscovery.ts`（今のテストはソースの文字列を見るだけ）
- `src/lib/effects/effectTextLayout.ts`

## 後回し（純粋でない）
- `src/lib/playback/translationReaderPreference.ts`、`src/lib/translation/bilingualSessionPreference.ts`（`window.localStorage`）
- `src/lib/recording/audioUploadValidation.ts`（ブラウザの `AudioContext` が要る）
- `src/lib/authorFollow.ts`、`src/lib/authorProfileLike.ts`、`src/lib/readerCardLike.ts`、`src/lib/bgm/bgmLibrary.ts`、`src/lib/auth/*` の Supabase を使うもの（Supabase のモックが要る）
- `src/lib/recording/aivisClient.ts`、`src/lib/recording/nemoClient.ts`（ネットワーク）

## 不具合の疑い
- `src/lib/recording/nemoChunking.ts` の `buildNemoChunks`（2026-11-25、テストは足していない）
  - 内容: 原文（`originalParagraph`）と読み上げ用の文（`spokenParagraph`）を別々に文へ分け、番号でそろえている。前処理（`nemoTextPreprocess.ts` の `normalizePauseExpressionSurface` など）が `」` の後ろに `、` を入れる・`――` の扱いを変えると、読み上げ側の文の数が原文より少なくなる。足りない分は原文の文で埋めるため、同じ部分が2回読み上げ用の chunk に入る。
  - 再現（`maxChars` は既定）: `buildNemoChunks("「こんにちは」と彼は言った。")` → chunk の `text` が `「こんにちは」、と彼は言った。` と `と彼は言った。` の2つ（後半が重複）。`buildNemoChunks("そして――彼は去った")` → `そして、彼は去った` と `彼は去った`。
  - 影響の範囲（コードを読んだだけ）: `nemoGeneration.ts`、`nemoAutoGeneration.ts`、`nemoGenerationQueue.ts`、`aivisGeneration.ts` が使う自動朗読（TTS）の生成。生成の route（`src/app/api/recordings/nemo-generate/route.ts:286`、`aivis-generate/route.ts:281`）には `ai_narration_generation_suspended` を返す分岐があり、今は止めている可能性が高い（本番の設定は見ていない）。実際の音声で重複するかは未検証。
  - この形の振る舞いを固定するテストは足さない（不具合を固定してしまうため）。直すかどうかはオーナーの判断。
- `src/lib/recording/nemoWav.ts` の `concatNemoWavs`（2026-11-25、軽い。テストは足していない）
  - 内容: 間（ポーズ）の無音を、ビット深度にかかわらず 0 のバイトで作る（`createSilencePcm`）。16bit なら 0 が無音で正しいが、8bit の PCM は 128 が無音なので、8bit の WAV をつなぐと間が最大の負の値になり、雑音になりうる。
  - 再現: 8bit・モノラル・8Hz の合成 WAV（データ `[128, 128]`）に `pauseAfterMs: 250` を付けてつなぐと、データが `[128, 128, 0, 0]` になる。
  - 影響（推定）: Nemo・Aivis の出力が 16bit なら影響は無い。出力のビット深度は確かめていない。今の挙動の 16bit 部分だけをテストで固定した。
