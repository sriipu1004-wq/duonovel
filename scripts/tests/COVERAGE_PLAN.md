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
| `src/lib/auth/operator.ts` | `scripts/test-auth-operator.ts` | `test:auth-operator` | 2026-11-26 | PASS、tsc PASS。KD-13 で `LIBREAD_OPERATOR_EMAILS` だけを読むように変えた（`NEXT_PUBLIC_LIBREAD_OPERATOR_EMAILS` は読まない。回帰テストあり） |
| `src/lib/aiUsage/aiUsage.ts` | `scripts/test-ai-usage-format.ts` | `test:ai-usage-format` | 2026-11-25 | PASS、tsc PASS |
| `src/lib/translation/openAITranslationModel.ts` | `scripts/test-openai-translation-model.ts` | `test:openai-translation-model` | 2026-11-26 | PASS、tsc PASS。KD-13 で、表に無いモデル名は表の中で最も高い入力・出力単価で見積もるように変えた（回帰テストあり） |
| `src/lib/pdfAssets.ts`、`src/app/api/pdf-assets/[kind]/[name]/route.ts` | `scripts/test-pdf-assets-route.ts` | `test:pdf-assets-route` | 2026-11-26 | PASS、tsc PASS。KD-10 で入力の検査を足した（表に無い `kind` は 404。回帰テストあり） |
| `src/lib/recording/audioUploadServerValidation.ts` | `scripts/test-audio-upload-server-validation.ts` | `test:audio-upload-server-validation` | 2026-11-25 | PASS、tsc PASS。拡張子・MIME が表に無いと照合をしない（例 `a.bin`＋`audio/x-custom` の WAV は通る） |
| `src/lib/recording/nemoWav.ts` | `scripts/test-nemo-wav.ts` | `test:nemo-wav` | 2026-11-25 | PASS、tsc PASS（16bit の合成 PCM で確認） |
| `src/lib/library/zipBook.ts` | `scripts/test-zip-book.ts` | `test:zip-book` | 2026-11-25 | PASS、tsc PASS。展開前の大きさの上限は ZIP の目次に書かれた値で見る（目次の値が偽のときの挙動は確かめていない） |
| `src/lib/recording/humanRecordingAlignment.ts` | `scripts/test-human-recording-alignment.ts` | `test:human-recording-alignment` | 2026-11-25 | PASS、tsc PASS（1文ずつのセグメントの場合を固定。複数の文が入ったセグメントは PR #238 で直し、回帰テストを足した） |
| `src/lib/seo/currentSearchDiscovery.ts` | `scripts/test-current-search-discovery.ts` | `test:current-search-discovery` | 2026-11-25 | PASS、tsc PASS |
| `src/lib/effects/effectTextLayout.ts` | `scripts/test-effect-text-layout.ts` | `test:effect-text-layout` | 2026-11-25 | PASS、tsc PASS。短い場面転換のきっかけ（例「見当」）や文の一部だけのタイムスタンプは、しきい値（0.12・長さの比 0.55）に届かず捨てられる（今の挙動として固定） |
| `src/lib/authorFollow.ts` | `scripts/test-author-follow.ts` | `test:author-follow` | 2026-11-25 | PASS、tsc PASS（Supabase は呼び出しを記録するモック） |
| `src/lib/authorProfileLike.ts` | `scripts/test-author-profile-like.ts` | `test:author-profile-like` | 2026-11-25 | PASS、tsc PASS（モック） |
| `src/lib/readerCardLike.ts` | `scripts/test-reader-card-like.ts` | `test:reader-card-like` | 2026-11-25 | PASS、tsc PASS（モック） |
| `src/lib/bgm/bgmLibrary.ts` | `scripts/test-bgm-library.ts` | `test:bgm-library` | 2026-11-25 | PASS、tsc PASS（モック）。取得の失敗は console.error に出して空の一覧を返す |
| `src/lib/playback/translationReaderPreference.ts` | `scripts/test-translation-reader-preference.ts` | `test:translation-reader-preference` | 2026-11-25 | PASS、tsc PASS（偽の window） |
| `src/lib/translation/bilingualSessionPreference.ts` | `scripts/test-bilingual-session-preference.ts` | `test:bilingual-session-preference` | 2026-11-25 | PASS、tsc PASS（偽の window） |
| `src/lib/client/loadingFeedback.ts` | `scripts/test-loading-feedback.ts` | `test:loading-feedback` | 2026-11-25 | PASS、tsc PASS（偽の window） |
| `src/lib/recording/nemoPlaybackCompatibility.ts` | `scripts/test-nemo-playback-compatibility.ts` | `test:nemo-playback-compatibility` | 2026-11-25 | PASS、tsc PASS（fetch は差し替え。ネットワークは使っていない） |
| `src/lib/popularityEvents.ts` | `scripts/test-popularity-events.ts` | `test:popularity-events` | 2026-11-25 | PASS、tsc PASS（偽の window・fetch） |
| `src/lib/playLogs.ts` | `scripts/test-play-logs.ts` | `test:play-logs` | 2026-11-25 | PASS、tsc PASS（モック） |
| `src/lib/auth/displayNameAvailability.ts` | `scripts/test-display-name-availability.ts` | `test:display-name-availability` | 2026-11-25 | PASS、tsc PASS（モック） |
| `src/lib/auth/checkDisplayNameAvailability.ts` | `scripts/test-check-display-name-availability.ts` | `test:check-display-name-availability` | 2026-11-25 | PASS、tsc PASS（fetch は差し替え） |
| `src/lib/auth/checkEmailAvailability.ts` | `scripts/test-check-email-availability.ts` | `test:check-email-availability` | 2026-11-25 | PASS、tsc PASS（fetch は差し替え） |
| `src/lib/billing/billingConfig.ts` | `scripts/test-billing-config.ts` | `test:billing-config` | 2026-11-25 | PASS、tsc PASS（環境変数は偽の値をこのプロセスの中でだけ設定。Stripe には接続していない）。チェックアウトは明示的に無効化しない限り有効 |
| `src/lib/billing/creditPackCatalog.ts` | `scripts/test-credit-pack-catalog.ts` | `test:credit-pack-catalog` | 2026-11-25 | PASS、tsc PASS（環境変数は偽の値。Stripe・Supabase には接続していない） |
| `src/lib/search/publicSearchRequestContext.ts` | `scripts/test-public-search-request-context.ts` | `test:public-search-request-context` | 2026-11-25 | PASS、tsc PASS |
| `src/lib/rights/regionRestriction.server.ts` | `scripts/test-region-restriction-server.ts` | `test:region-restriction-server` | 2026-11-25 | PASS、tsc PASS（admin クライアント・next/headers・next/navigation はプロセスの中で差し替え。DB には接続していない）。既存の `test:region-restriction` はこのファイルの文字列を見るだけだった |
| `src/lib/contentRatingServer.ts` | `scripts/test-content-rating-server.ts` | `test:content-rating-server` | 2026-11-25 | PASS、tsc PASS（Supabase の server・admin クライアントはプロセスの中で差し替え）。R18 は本人が表示を選び、かつ年齢確認済みのときだけ表示 |
| `src/lib/auth/requireLoggedInUser.ts` | `scripts/test-require-logged-in-user.ts` | `test:require-logged-in-user` | 2026-11-25 | PASS、tsc PASS（差し替え）。5行のラッパー `requireOfficialAccount.ts` も同じテストで固定した。名前は「公式アカウント」だが、今はログインしているかだけを見る（`/write` の layout が使う。投稿をログイン利用者に開いているのが意図なら名前だけの問題。記録だけ） |
| `src/lib/auth/requireOwnedSeries.ts` | `scripts/test-require-owned-series.ts` | `test:require-owned-series` | 2026-11-25 | PASS、tsc PASS（差し替え）。所有者でないときも「ログインへ移動」になる（403 や not found ではない） |
| `src/lib/auth/officialAccount.server.ts` | `scripts/test-official-account-entitlement.ts` | `test:official-account-entitlement` | 2026-11-25 | PASS、tsc PASS（admin クライアントは差し替え） |
| `src/lib/auth/officialAuthor.server.ts` | `scripts/test-official-author-display.ts` | `test:official-author-display` | 2026-11-25 | PASS、tsc PASS（admin クライアントは差し替え） |
| `src/lib/recording/privateMediaSourceAccess.ts` | `scripts/test-private-media-source-access.ts` | `test:private-media-source-access` | 2026-11-25 | PASS、tsc PASS（Supabase は差し替え） |
| `src/lib/auth/registrationGate.server.ts` | `scripts/test-registration-gate-server.ts` | `test:registration-gate-server` | 2026-11-25 | PASS、tsc PASS（next/headers は差し替え） |
| `src/lib/library/privateLibraryImportServer.ts` | `scripts/test-private-library-import-errors.ts` | `test:private-library-import-errors` | 2026-11-25 | PASS、tsc PASS。1日の上限の文言に、廃止済みの「AI生成」が残っている（ほかの料金の説明は「公開作品のAI翻訳解放・個人本棚への取り込み」。文言だけの差で、記録だけ）。上限の判定だけ大文字・小文字を区別する |
| `src/lib/auth/syncPublicUserProfile.ts` | `scripts/test-sync-public-user-profile.ts` | `test:sync-public-user-profile` | 2026-11-25 | PASS、tsc PASS（fetch は差し替え） |
| `src/lib/auth/officialAuthorGrant.server.ts` | `scripts/test-official-author-grant-server.ts` | `test:official-author-grant-server` | 2026-11-25 | PASS、tsc PASS（admin クライアントは差し替え） |
| `src/lib/library/privateLibraryTranslationServer.ts` | `scripts/test-private-library-translation-access.ts` | `test:private-library-translation-access` | 2026-11-25 | PASS、tsc PASS（Supabase の server クライアントは差し替え） |
| `src/lib/translation/humanTranslationServer.ts` | `scripts/test-human-translation-server.ts` | `test:human-translation-server` | 2026-11-25 | PASS、tsc PASS（差し替え）。`resolveHumanTranslationContext` は `episodeTranslationServer` の判定に頼るので、今回は固定していない |
| `src/lib/translation/translationReservationServer.ts` | `scripts/test-translation-reservation-server.ts` | `test:translation-reservation-server` | 2026-11-25 | PASS、tsc PASS（admin は偽物を渡す） |
| `src/lib/translation/publicTranslationCredits.server.ts` | `scripts/test-public-translation-credits-server.ts` | `test:public-translation-credits-server` | 2026-11-25 | PASS、tsc PASS（Supabase と AI 利用量のモジュールは差し替え） |
| `src/lib/billing/billing.server.ts` | `scripts/test-billing-server.ts` | `test:billing-server` | 2026-11-25 | PASS、tsc PASS（admin クライアントと Stripe クライアントは偽物。Stripe・DB には接続していない） |
| `src/lib/aiUsage/aiUsage.server.ts` | `scripts/test-ai-usage-server.ts` | `test:ai-usage-server` | 2026-11-25 | PASS、tsc PASS（差し替え。環境変数は偽の値）。サブスク利用者の単語解説は日次回数を数えず月間予算だけを使う。`subscriber_until` が空なら期限なしのサブスク扱い |
| `src/lib/translation/episodeTranslationServer.ts` | `scripts/test-episode-translation-server.ts` | `test:episode-translation-server` | 2026-11-25 | PASS、tsc PASS（差し替え）。地域制限は作品の作者本人にもかかる（作者でも、制限された国からは本文・翻訳を読めない）。今の挙動として固定 |
| `src/lib/recording/recordingEntry.ts` | `scripts/test-recording-entry.ts` | `test:recording-entry` | 2026-11-25 | PASS、tsc PASS（Supabase の server クライアント・next/headers・next/navigation は差し替え）。作品の取得はログインの判定より先なので、未ログインでも作品が無ければ not found になる。題名は前後の空白を取らずにそのまま返す |
| `src/lib/recording/privateMediaProxy.ts` | `scripts/test-private-media-proxy.ts` | `test:private-media-proxy` | 2026-11-25 | PASS、tsc PASS（privateMediaStream は差し替え。環境変数は偽の値）。環境変数は呼び出しのたびに読み、無ければ undefined のまま渡す（503 にするのは privateMediaStream 側） |
| `src/lib/legacyAttribution.server.ts` | `scripts/test-legacy-attribution-server.ts` | `test:legacy-attribution-server` | 2026-11-25 | PASS、tsc PASS（officialAuthorGrant.server は差し替え）。記録が無い・形が違うときは公式アカウントの照会をしない |
| `src/lib/updates/followingUpdates.server.ts` | `scripts/test-following-updates-server.ts` | `test:following-updates-server` | 2026-11-25 | PASS、tsc PASS（Supabase・next/headers・作品一覧のキャッシュ・R18 設定・地域制限・`runFollowingUpdates` は差し替え。各読み出しの組み立てだけを固定）。既読の印（play_logs）が読めないときは null で続ける。話数は小数を切り捨てる |
| `src/lib/translation/prepareEpisodeTranslationGeneration.ts` | `scripts/test-prepare-episode-translation-generation.ts` | `test:prepare-episode-translation-generation` | 2026-11-25 | PASS、tsc PASS（Supabase・next/headers・閲覧権の判定・登録ゲート・シリーズの一貫性の読み出しは差し替え。OpenAI には接続していない）。状態が `failed` のキャッシュ行は生成へ進む。一時停止（`EPISODE_TRANSLATION_ENABLED`）はモジュールの読み込み時に決まるので固定していない |
| `src/lib/recording/audioPlaybackNormalization.ts` | `scripts/test-audio-playback-normalization.ts` | `test:audio-playback-normalization` | 2026-11-25 | PASS、tsc PASS（`node:child_process` はプロセスの中の偽の spawn に差し替え。ffmpeg は動かしていない。`FFMPEG_PATH` は偽の値）。一時フォルダは成功でも失敗でも消す。`ffmpeg-static` を探す経路は固定していない |
| `src/lib/translation/seriesTranslationGlossaryAutoServer.ts` | `scripts/test-series-translation-glossary-auto-server.ts` | `test:series-translation-glossary-auto-server` | 2026-11-25 | PASS、tsc PASS（admin クライアントはプロセスの中の小さな偽 DB）。作者・編集者の固定した語の分岐は、ほかの語と同じ判定（適用開始の話数）になっている（今の挙動として固定。記録だけ）。失敗はすべて黙って打ち切る |
| `src/lib/translation/publicWorkTranslations.ts` | `scripts/test-public-work-translations.ts` | `test:public-work-translations` | 2026-11-25 | PASS、tsc PASS（admin クライアントは偽 DB、episodeTranslationServer のサーバー側の依存は差し替え。ハッシュ関数は本物）。話の一覧の読み出しが失敗すると「話が無い」扱いで null になる。翻訳の読み出しの失敗は「翻訳なし」になる |
| `src/lib/translation/seriesTranslationConsistencyServer.ts` | `scripts/test-series-translation-consistency-server.ts` | `test:series-translation-consistency-server` | 2026-11-25 | PASS、tsc PASS（admin クライアントは偽 DB、episodeTranslationServer のサーバー側の依存は差し替え。用語集の選択などの純粋関数は本物）。読み出しの失敗はその部分を空にし、例外が出たら全体を空の文脈にする |
| `src/lib/aozora/aozoraGaijiGenerated.ts` | `scripts/test-aozora-gaiji-generated.ts` | `test:aozora-gaiji-generated` | 2026-11-25 | PASS、tsc PASS。生成された表が `scripts/aozora/gaiji-pairs.tsv`・`gaiji-equivalent.tsv` と食い違わないことを固定（208件）。JIS X 0213 からの変換そのものは Node に復号器が無いので試していない。別に生成スクリプトを作業用の場所で走らせ、今の表と1バイトも違わないことを確かめた |
| `src/lib/popularity.ts` | `scripts/test-popularity.ts` | `test:popularity` | 2026-11-25 | PASS、tsc PASS（next/cache・admin クライアントは差し替え）。期間は東京の日付で比べ、両端を含む。数が `NaN` なら 0、文字列の数は数に直して足す |
| `src/lib/translation/executeEpisodeTranslationGeneration.ts` | `scripts/test-execute-episode-translation-generation.ts` | `test:execute-episode-translation-generation` | 2026-11-25 | PASS、tsc PASS（admin・AI 利用量の予約・翻訳の予約・OpenAI の翻訳・用語集の書き込みは差し替え。`OPENAI_API_KEY` は偽の値で、OpenAI には接続していない）。成功のときは AI 利用量の予約を返さない（使った分として残す）。結果の保存に失敗すると、ログはいったん success にした後で failed に書き直す |
| `src/lib/publicRead.ts` | `scripts/test-public-read.ts` | `test:public-read` | 2026-11-25 | PASS、tsc PASS（react の cache・Supabase の server/admin クライアント・R18 設定は差し替え）。R18 の作品は表示を許していない閲覧者でも payload（本文の行を含む）を返し、`r18Blocked: true` で録音だけを空にする（隠すのは呼び出し側）。非公開の作品で最初の認証の読み出しが失敗すると、もう1回読み直す |
| `src/lib/og/ogFontCoverage.generated.ts` | `scripts/test-og-font-coverage-generated.ts` | `test:og-font-coverage-generated` | 2026-11-25 | PASS、tsc PASS。同梱の4つのサブセットフォント（`src/assets/og-fonts/`）の文字表（cmap、形式4・12）をテストの中で読み、その和集合と範囲表が一致することを固定（6488字）。範囲は並び順・重なりなし・隣接は結合済み |
| `src/lib/recording/humanRecordingPublish.ts` | `scripts/test-human-recording-publish.ts` | `test:human-recording-publish` | 2026-11-25 | PASS、tsc PASS（admin の DB と Storage・書き込みの境界・音声の変換・文字起こし・時刻合わせ・H1 の RPC・後片付け・バケットの確認はすべて差し替え。Storage・ffmpeg・文字起こしには接続していない）。公開のつもりで、自分の非公開・状態不明の行がある話に上げると、メディアを作る前に止める。途中の失敗でも上げた物は消さない（コードの方針どおり） |
| `src/lib/recording/nemoGenerationQueue.ts` | `scripts/test-nemo-generation-queue.ts` | `test:nemo-generation-queue` | 2026-11-25 | PASS、tsc PASS（admin クライアントは偽 DB）。本文のハッシュは本物の `buildNemoChunks` の結果から計算して比べるので、chunk の中身（上の不具合の疑い）は固定していない。`is_public` が null の録音は公開扱い。`nemoChunking` を直すと全話のハッシュが変わり、全話が「本文が変わった」として再生成の待ち行列に入る（推定） |
| `src/lib/recording/nemoClient.ts` | `scripts/test-nemo-client.ts` | `test:nemo-client` | 2026-11-25 | PASS、tsc PASS（fetch はプロセスの中の偽物。エンジンには接続していない）。エンジンの URL にパスがあっても捨てる（`/audio_query` は絶対パス）。数値の上下限で丸め、NaN は送らない |
| `src/lib/recording/aivisClient.ts` | `scripts/test-aivis-client.ts` | `test:aivis-client` | 2026-11-25 | PASS、tsc PASS（fetch はプロセスの中の偽物。エンジンには接続していない）。nemoClient と同じ形（既定の URL と環境変数の名前だけが違う） |
| `src/lib/recording/audioUploadValidation.ts` | `scripts/test-audio-upload-validation.ts` | `test:audio-upload-validation` | 2026-11-25 | PASS、tsc PASS（ブラウザの AudioContext はプロセスの中の偽物で、合成した波形を返す）。合成波形（無音・一定の音・雑音・間のある声らしい音・間の少ない音）での判定を固定。実際の録音での判定の正しさは確かめていない |

## 候補（未着手、上から順に。2026-11-25 に洗い直し）
最初の洗い出しは、テストからの参照を文字列で探しただけで、ソースの文字列を読むだけのテスト（例 `test:public-seo-alignment`）も「テスト済み」と数えていた。洗い直しでは、`scripts/test-*` が `../src/lib/…` か `@/lib/…` から import しているものだけを「テスト済み」とした。

2026-11-25（夕）の再計算で残った15件は、すべて上の「済み」に移した。今残っているのは `supabaseClient`・`supabase/client`・`supabase/proxy` だけ（クライアントを作るだけなので対象外にした）。次の週は main に増えたモジュールを同じ方法で洗い直す。


## 後回し（純粋でない）
なし（2026-11-25 に `audioUploadValidation`・`aivisClient`・`nemoClient` を偽の AudioContext・fetch でテストした）。

## 不具合の疑い
- `src/lib/recording/nemoChunking.ts` の `buildNemoChunks`（2026-11-25、テストは足していない）
  - 内容: 原文（`originalParagraph`）と読み上げ用の文（`spokenParagraph`）を別々に文へ分け、番号でそろえている。前処理（`nemoTextPreprocess.ts` の `normalizePauseExpressionSurface` など）が `」` の後ろに `、` を入れる・`――` の扱いを変えると、読み上げ側の文の数が原文より少なくなる。足りない分は原文の文で埋めるため、同じ部分が2回読み上げ用の chunk に入る。
  - 再現（`maxChars` は既定）: `buildNemoChunks("「こんにちは」と彼は言った。")` → chunk の `text` が `「こんにちは」、と彼は言った。` と `と彼は言った。` の2つ（後半が重複）。`buildNemoChunks("そして――彼は去った")` → `そして、彼は去った` と `彼は去った`。
  - 影響の範囲（コードを読んだだけ）: `nemoGeneration.ts`、`nemoAutoGeneration.ts`、`nemoGenerationQueue.ts`、`aivisGeneration.ts` が使う自動朗読（TTS）の生成。生成の route（`src/app/api/recordings/nemo-generate/route.ts:286`、`aivis-generate/route.ts:281`）には `ai_narration_generation_suspended` を返す分岐があり、今は止めている可能性が高い（本番の設定は見ていない）。実際の音声で重複するかは未検証。
  - この形の振る舞いを固定するテストは足さない（不具合を固定してしまうため）。直すかどうかはオーナーの判断。
  - 直した（PR #242、KD-9）: 原文の文ごとに読み上げ用の前処理をかけて1対1にした。上の2つの再現例は `scripts/test-nemo-chunking.ts`（`test:nemo-chunking`）の回帰テストになった。会話文・`――` を含む話は本文のハッシュが変わる（自動朗読の生成は停止中のため、今は再生成は起きない。再開前に量の見積もりが要る）。
- `src/lib/recording/nemoWav.ts` の `concatNemoWavs`（2026-11-25、軽い。テストは足していない）
  - 内容: 間（ポーズ）の無音を、ビット深度にかかわらず 0 のバイトで作る（`createSilencePcm`）。16bit なら 0 が無音で正しいが、8bit の PCM は 128 が無音なので、8bit の WAV をつなぐと間が最大の負の値になり、雑音になりうる。
  - 再現: 8bit・モノラル・8Hz の合成 WAV（データ `[128, 128]`）に `pauseAfterMs: 250` を付けてつなぐと、データが `[128, 128, 0, 0]` になる。
  - 影響（推定）: Nemo・Aivis の出力が 16bit なら影響は無い。出力のビット深度は確かめていない。今の挙動の 16bit 部分だけをテストで固定した。
  - 直した（PR #242、KD-9）: 8bit のときは 128 で埋める。`scripts/test-nemo-wav.ts` に 8bit の回帰テストを足した。
- `src/lib/recording/humanRecordingAlignment.ts` の `alignHumanRecordingToBodyOrThrow`（2026-11-25、テストは足していない）
  - 内容: 文字起こしの1つのセグメントに本文の2文以上が入っていると、その中の文がほとんど対応付かない。単語ごとの時刻を渡しても同じ。
  - 再現: 本文 `吾輩は猫である。名前はまだ無い。\n\nどこで生れたかとんと見当がつかぬ。`、セグメント `[0-3秒「吾輩は猫である。名前はまだ無い。」, 3.2-6秒「どこで生れたかとんと見当がつかぬ。」]` → 3文のうち1文だけが対応付き、`human_alignment_insufficient` で止まる（1文ずつのセグメントなら3文とも対応付く）。
  - 影響（推定）: Whisper などの文字起こしは、1つのセグメントに複数の文を入れることが多い。そのため人の朗読の時刻合わせが、実際の録音では失敗しやすい可能性がある。実際の録音・文字起こしでは確かめていない。短い合成の例での観察で、本番の失敗率は分からない。
  - 直した（PR #238、KD-6）: 対応付けの前に、セグメントを本文と同じ分け方で文に分ける（単語の時刻があればそれで、無ければ文字数の比で時刻を割る）。上の再現例は `scripts/test-human-recording-alignment.ts` の回帰テストになった。実際の録音では未検証。
