# Project Gutenberg の取り込み（2026-11 第1バッチ、48作品）

オーナーの指示（2026-11-15）「それぞれの国での無料公開可能な作品をできる限り導入して」と、親セッションの判断（2026-11-19、`docs/rights/region-research-2026-11-19-gutenberg.md`）「当面は全世界で PD の英語作品を広げる」に基づく。法的助言ではない。独立レビュー（#228 a5fe6926、FIX）の指摘を直した版。

## 権利の基準（既存の英語 40 作品と同じ）
- 根拠：`public-domain/audits/en-ko-parity-rights-framework-2026-09-23.json`（英語の cohort：作者の没年 1944 以前、初版 1930 以前、原語のみ、現代の翻訳・表紙・挿絵なし。オーナー承認 2026-09-23）。Aozora の第2・3バッチの基準（没年 1945 以前）より1年厳しい。英米の作品には日本の戦時加算（米英は 3,794日）があるため、英語は 1944 で切っている。
- このバッチの条件：名前が出る人（作者・序文の筆者など）全員の没年が 1944 以前、初版 1930 以前、英語の原文、翻訳なし。
- **短編集は、収録作すべての初出を確かめたものだけを入れる。** 確かめていない短編集は入れない（今回は Chopin の短編集を外した。下の「外したもの」）。
- **寄稿者**：序文・挿絵・編者など作者以外に名前の出る人は、`public-domain/batches/gutenberg-2026-11-19.json` の `contributors` に記録する（没年、本文に取り込むかどうか）。取り込む寄稿（序文など）は没年 1944 以前が必要。承認スクリプトは、準備した本文の頭に "Illustrated by …"・"preface by …" などの記名があるのに記録が無い作品を止める。今回の記録：Kidnapped の序文 Fanny Van de Grift Stevenson（1914年没、取り込む）、The Happy Prince の挿絵 Walter Crane（1915年没）・Jacomb Hood（1929年没）、Three Men in a Boat の挿絵 A. Frederics（没年不明）、いずれも挿絵は取り込まない。Riddle of the Sands の「編者」は作者自身。
- **国の制限（D030）は不要**。既存の英語 40 作品も制限なし。
  - US：1930 年以前の発行なので 95 年の期間の外。英国などの作品が §104A で回復していても、残りの期間（発行から 95 年）までなので同じ。
  - JP：死後50年＋戦時加算 3,794日は、没年 1944 なら 2005-05 に満了。2018年の延長の前に切れており、復活しない。
  - KR：2013年の延長の前に死後50年で満了（没年 1962 以前）。外国の作品は第3条④も。
  - 死後70年の国は 2014年末まで、死後80年の国（CO・GQ）は 2024年末までに満了。MX は没年 1952 より前を PD として扱う（`docs/rights/region-research-2026-11-15.md`。Aozora のバッチと同じ読み）。
- 機械的な確認は `scripts/public-domain/generate-gutenberg-batch-2026-11.py`（作成時）と `approve-gutenberg-batch-2026-11.py`（承認時）が行う（没年 ≤1944、初版 ≤1930、翻訳なし、gutenberg_body、表示に PG の名前なし、寄稿者の記録）。

## Project Gutenberg の名前・制作者の注・後年の刷りの表示を本文から外す
- PG の利用条件（ https://www.gutenberg.org/policy/license.html ）：PG のライセンスと PG への言及をすべて外せば、残る本文は米国の知的財産法の制約を受けない。PG の名前は商標。
- 正規化 `gutenberg_body`（`scripts/public-domain/core.ts`）：
  - START/END の外（ヘッダー・ライセンス・フッター）を archive metadata に移す（既存の `gutenberg` と同じ）。
  - 本文の頭の3段落までにあるボランティアの記名（"Produced by <名前>" など）を移す。名前だけか、PG・PGDP・URL を含む短い段落（400字・4行まで）に限る。"Produced by the hand of fate, …" のような文は消さない。空白だけの行も段落の区切りとして扱う。
  - 末尾の "End of Project Gutenberg's …"（2行に折り返したものも）を移す。
  - **manifest の `gutenberg_body`**：外す段落を正確な文字列の先頭で指定する（`remove_paragraphs`：頭の60段落か末尾の40段落の中。同じ先頭を n 回書いたら n 段落にちょうど当たること）。`remove_tail_from` はその段落から最後までを外す（末尾の制作者の注）。外した部分は archive metadata に残る。指定が本文に無ければ止まる（`GUTENBERG_BODY_TRIM_NOT_FOUND`）。
  - 外した後の本文に PG・PGLAF・PGDP の名前、`gutenberg.org`・`gutenberg.net`・`promo.net/pg`、URL が残れば止まる（`GUTENBERG_BODY_PROVIDER_REFERENCE`）。
  - 外した後の本文に "Transcriber"、"Production note"、"etext"、"All rights reserved"、"RENEWED"、"Copyright"、"First published"、"Printed in/by …"（大文字の固有名詞が続くもの）が残れば止まる（`GUTENBERG_BODY_EDITORIAL_MARKER`）。物語の文として出るものは、manifest の `allowed_markers` に正確な文を書いて個別に許す（今回は5作品・6か所。下の表の「許可」）。
- 作品ページの「出典」：manifest の `public_attribution`（`Public domain`、URL なし、版は「First published <年> (<発行地・出版社>)」）。`gutenberg_body` では必須で、PG の名前・URL・PG のタグは検証で拒む。公開 SQL も、`sourceUrl` が null で、edition に gutenberg を含まないことを確かめる。
- **既存の英語 40 作品は「出典：Project Gutenberg」（gutenberg.org へのリンク）と版「Project Gutenberg eBook #… plain text」を表示している**。2作品（gutenberg-000011、gutenberg-001952）はタグにも「Project Gutenberg」がある。直すかどうかは別に決める（このバッチでは変えていない）。

## 後年の刷りを底本にした作品（rights_notes に記録）
- Mrs. Dalloway（71865）：PG の底本は Harcourt, Brace & World の「Twenty-third printing」（Copyright 1925, renewed by Leonard Woolf）。使うのは 1925 年の小説の本文だけ。後年の刷りの扉・著作一覧・著作権表示・制作者の注は本文から外した。
- This Side of Paradise（805）：PG の eBook 第11版。制作者の注に、参照した 1960 年の再刷と 1948 年以降の再刷が書かれている（注は archive metadata のみ）。本文は 1920 年の本文。
- The Tale of Peter Rabbit（14838）：Frederick Warne の後年の刷り（William Clowes 印刷）。扉の行を外した。
- The Sea-Wolf（1074）：Heinemann 1917 年の Popular Edition。The Happy Prince（902）：David Nutt 1910 年の第7刷。King Solomon's Mines（2166）：Cassell 1907 年版。Black Beauty（271）：1911 年の米国版。いずれも扉・刷りの行・PG の注を外した。
- The House of Mirth（284）：PG の制作者が縮約形を現代の形にし、名前を1か所直した（注は archive metadata のみ）。

## 選び方
- PG カタログ（2026-11-08 までの版）から、既存の 41 manifest と重複しない、よく読まれる小説・短編集・児童文学を選んだ（`public-domain/batches/gutenberg-2026-11-19.json`）。
- 初版の年・発行地：PG 本文の扉・注記で確かめられたものはその旨、扉に記載が無いものは「二次（書誌の通説）」と manifest の `rights_notes` に書いた。条件に効くのは初版の年（1930 以前）だけで、最も新しいのは 1925 年（Gatsby、Mrs. Dalloway）。
- 外したもの：
  - The Awakening, and Selected Short Stories（#160）：収録の "The Locket" は 1969 年に初めて発行された（独立レビュー S1-1）。
  - Northanger Abbey（#121）：PG の本文の末尾に Signet Classic（現代の版）の注があり、底本が現代の版。
  - Winesburg, Ohio（#416）：Irving Howe（1993年没）の序文を含む。
  - The Man Who Was Thursday（#1695）：年の分からない現代の紹介文で始まる。
  - The Velveteen Rabbit（#11757）：後年の版で、第三者の謝辞の行がある。挿絵の William Nicholson は 1949 年没。
  - Five Children and It（#778）：本文に PG の行と "*** x-header ***" が残る。

## 内容の注意
- violence：32件（独立レビューで This Side of Paradise と Silas Marner を足した）。`content-warnings.ts` の語の当たりと、知られている筋から Claude が判断した。全文を通読したものではない。sexual_r18：0件。判断はオーナーの承認に含める。

## 一覧（話数は pglaf ミラーの同じ本文での試算。本番の数は source-sync の後に確定する）
| manifest | 題 | 作者 | 没年 | 初版 | 話数 | 注意 | gutenberg_body |
|---|---|---|---|---|---|---|---|
| gutenberg-064317 | The Great Gatsby | F. Scott Fitzgerald | 1940 | 1925 | 35 | violence | ― |
| gutenberg-000805 | This Side of Paradise | F. Scott Fitzgerald | 1940 | 1920 | 65 | violence | 末尾の注 |
| gutenberg-004368 | Flappers and Philosophers | F. Scott Fitzgerald | 1940 | 1920 | 45 | なし | 許可1 |
| gutenberg-000284 | The House of Mirth | Edith Wharton | 1937 | 1905 | 96 | violence | 末尾の注 |
| gutenberg-004517 | Ethan Frome | Edith Wharton | 1937 | 1911 | 25 | violence | ― |
| gutenberg-000219 | Heart of Darkness | Joseph Conrad | 1924 | 1899 | 32 | violence | ― |
| gutenberg-005658 | Lord Jim | Joseph Conrad | 1924 | 1900 | 104 | violence | ― |
| gutenberg-002226 | Kim | Rudyard Kipling | 1936 | 1901 | 74 | なし | 許可1 |
| gutenberg-002781 | Just So Stories | Rudyard Kipling | 1936 | 1902 | 21 | なし | ― |
| gutenberg-000558 | The Thirty-Nine Steps | John Buchan | 1940 | 1915 | 28 | violence | ― |
| gutenberg-071865 | Mrs. Dalloway | Virginia Woolf | 1941 | 1925 | 49 | violence | 指定の段落13・末尾の注 |
| gutenberg-000139 | The Lost World | Arthur Conan Doyle | 1930 | 1912 | 56 | violence | 指定の段落1 |
| gutenberg-002097 | The Sign of the Four | Arthur Conan Doyle | 1930 | 1890 | 31 | violence | ― |
| gutenberg-000108 | The Return of Sherlock Holmes | Arthur Conan Doyle | 1930 | 1905 | 88 | violence | ― |
| gutenberg-000834 | The Memoirs of Sherlock Holmes | Arthur Conan Doyle | 1930 | 1894 | 73 | violence | 指定の段落1 |
| gutenberg-003289 | The Valley of Fear | Arthur Conan Doyle | 1930 | 1915 | 41 | violence | ― |
| gutenberg-000204 | The Innocence of Father Brown | G. K. Chesterton | 1936 | 1911 | 58 | violence | ― |
| gutenberg-001450 | Pollyanna | Eleanor H. Porter | 1920 | 1913 | 41 | なし | ― |
| gutenberg-000498 | Rebecca of Sunnybrook Farm | Kate Douglas Wiggin | 1923 | 1903 | 54 | なし | 許可1 |
| gutenberg-000157 | Daddy-Long-Legs | Jean Webster | 1916 | 1912 | 27 | なし | 指定の段落1 |
| gutenberg-000047 | Anne of Avonlea | L. M. Montgomery | 1942 | 1909 | 64 | なし | ― |
| gutenberg-000146 | A Little Princess | Frances Hodgson Burnett | 1924 | 1905 | 48 | なし | 指定の段落1 |
| gutenberg-000708 | The Princess and the Goblin | George MacDonald | 1905 | 1872 | 37 | なし | ― |
| gutenberg-001874 | The Railway Children | E. Nesbit | 1924 | 1906 | 42 | なし | ― |
| gutenberg-014838 | The Tale of Peter Rabbit | Beatrix Potter | 1943 | 1902 | 1 | なし | 指定の段落5 |
| gutenberg-000271 | Black Beauty | Anna Sewell | 1878 | 1877 | 40 | violence | 指定の段落2 |
| gutenberg-000032 | Herland | Charlotte Perkins Gilman | 1935 | 1915 | 38 | なし | ― |
| gutenberg-000308 | Three Men in a Boat (To Say Nothing of the Dog) | Jerome K. Jerome | 1927 | 1889 | 47 | violence | 指定の段落4 |
| gutenberg-000095 | The Prisoner of Zenda | Anthony Hope | 1933 | 1894 | 38 | violence | ― |
| gutenberg-002166 | King Solomon's Mines | H. Rider Haggard | 1925 | 1885 | 58 | violence | 指定の段落2 |
| gutenberg-002360 | The Riddle of the Sands | Erskine Childers | 1922 | 1903 | 81 | なし | ― |
| gutenberg-001298 | The Virginian: A Horseman of the Plains | Owen Wister | 1938 | 1902 | 92 | violence | ― |
| gutenberg-001300 | Riders of the Purple Sage | Zane Grey | 1939 | 1912 | 76 | violence | ― |
| gutenberg-001074 | The Sea-Wolf | Jack London | 1916 | 1904 | 75 | violence | 指定の段落6・末尾の注 |
| gutenberg-001056 | Martin Eden | Jack London | 1916 | 1909 | 101 | violence | 許可1 |
| gutenberg-002776 | The Four Million | O. Henry | 1910 | 1906 | 38 | violence | ― |
| gutenberg-000155 | The Moonstone | Wilkie Collins | 1889 | 1868 | 140 | violence | ― |
| gutenberg-000550 | Silas Marner | George Eliot | 1880 | 1861 | 55 | violence | 指定の段落1 |
| gutenberg-000110 | Tess of the d'Urbervilles: A Pure Woman | Thomas Hardy | 1928 | 1891 | 110 | violence | 許可2 |
| gutenberg-000421 | Kidnapped | Robert Louis Stevenson | 1894 | 1886 | 55 | violence | ― |
| gutenberg-001837 | The Prince and the Pauper | Mark Twain | 1910 | 1881 | 52 | violence | ― |
| gutenberg-000086 | A Connecticut Yankee in King Arthur's Court | Mark Twain | 1910 | 1889 | 86 | violence | ― |
| gutenberg-000208 | Daisy Miller: A Study | Henry James | 1916 | 1878 | 16 | なし | 指定の段落1 |
| gutenberg-002775 | The Good Soldier | Ford Madox Ford | 1939 | 1915 | 54 | violence | ― |
| gutenberg-002814 | Dubliners | James Joyce | 1941 | 1914 | 48 | violence | 指定の段落1 |
| gutenberg-000902 | The Happy Prince, and Other Tales | Oscar Wilde | 1900 | 1888 | 12 | なし | 指定の段落3・末尾の注 |
| gutenberg-000848 | The Black Arrow: A Tale of the Two Roses | Robert Louis Stevenson | 1894 | 1888 | 56 | violence | ― |
| gutenberg-016389 | The Enchanted April | Elizabeth von Arnim | 1941 | 1922 | 57 | なし | ― |

合計（試算）：48 作品・2,660 話。

## 残りの手順（それぞれ承認が要る）
1. 本文の取得と固定：`npm run public-domain:source-sync -- $(cat scripts/issue139-gutenberg-publish-batch1/manifest-ids.txt) --prepare --limit=50`（www.gutenberg.org の作品ページが「Public domain in the USA.」を示すことを確かめ、本文を SHA-256 で固定する）。続けて `node --import tsx scripts/public-domain/plan-chapters.ts $(cat scripts/issue139-gutenberg-publish-batch1/manifest-ids.txt)`。gutenberg.org の本文が pglaf ミラーと違えば `gutenberg_body` の指定が合わずに止まるので、そのときは指定を直す。
2. 権利の記録：`python scripts/public-domain/approve-gutenberg-batch-2026-11.py $(cat scripts/issue139-gutenberg-publish-batch1/manifest-ids.txt)`（`.public-domain-work/<id>/normalized.txt` で寄稿者の記名を確かめる）。
3. dry run：`npm run public-domain:batch -- $(cat scripts/issue139-gutenberg-publish-batch1/manifest-ids.txt) --prepare --max=50`。
4. 取り込み（下書き）：`PUBLIC_DOMAIN_IMPORT_TARGET=production PUBLIC_DOMAIN_IMPORT_CONFIRM=PRODUCTION_DRAFT_ONLY node --env-file=.env.local --import tsx scripts/public-domain/batch.ts $(cat scripts/issue139-gutenberg-publish-batch1/manifest-ids.txt) --execute --target=production --production --max=50`。
5. 公開：取り込みで出た series id から `python scripts/issue139-gutenberg-publish-batch1/generate.py <map.txt>` で apply.sql・rollback.sql を作る（Aozora 第3バッチの SQL と同じ形。tag `issue139_publish_gut1_*_20261119`。出典は 'Public domain'、sourceUrl は null、edition に gutenberg を含まないことを確かめる）。
