# テスト追加の計画（LT-002）

`src/lib/` のうち、`scripts/test-*` から参照されていないモジュールに、今の挙動を固定するテスト（characterization test）を1つずつ足す。実装は変えない。テストが今の実装で落ちたら、テストは足さず下の「不具合の疑い」に書く。

選び方: 入力から出力が決まる純粋な関数を先に、import の少ない・短いものから。`window`・Supabase・ネットワーク・ファイルに触るものは後回し。

## 済み
| モジュール | テスト | package.json | 日付 | 結果 |
|---|---|---|---|---|
| `src/lib/readerAuthorHref.ts` | `scripts/test-reader-author-href.ts` | `test:reader-author-href` | 2026-11-25 | PASS、tsc PASS |
| `src/lib/recording/audioUploadPolicy.ts` | `scripts/test-audio-upload-policy.ts` | `test:audio-upload-policy` | 2026-11-25 | PASS、tsc PASS |

## 候補（未着手、上から順に）
- `src/lib/searchSavedFilters.ts`（キーの解決とラベル）
- `src/lib/recording/nemoChunking.ts`
- `src/lib/recording/nemoRegenerationDiff.ts`
- `src/lib/translation/segmentJapaneseEpisode.ts`
- `src/lib/recording/nemoPronunciationDictionary.ts`
- `src/lib/seo/jaSearchDiscovery.ts`
- `src/lib/bgm/bgmSettings.ts`、`src/lib/effects/effectSettings.ts`

## 後回し（純粋でない）
- `src/lib/playback/translationReaderPreference.ts`、`src/lib/translation/bilingualSessionPreference.ts`（`window.localStorage`）
- `src/lib/authorFollow.ts`、`src/lib/authorProfileLike.ts`、`src/lib/readerCardLike.ts`、`src/lib/auth/*`（Supabase）
- `src/lib/recording/aivisClient.ts`、`src/lib/recording/nemoClient.ts`（ネットワーク）

## 不具合の疑い
- まだ無い。
