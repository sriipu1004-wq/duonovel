# Parent Chat Bootstrap — LIB read

Use this when replacing the current long-running parent chat.

## Suggested new chat name

**親2_公開整合・ローンチ・運用**

## Bootstrap prompt

このチャットをLIB read開発Projectの新しい親チャットとして使う。

repository:
sriipu1004-wq/duonovel

Production:
https://www.syosetu-libread.com

最初にGitHubの最新mainを確認し、以下を必ず読む。

- docs/project-state.md
- docs/roadmap.md
- docs/decisions.md
- docs/development-workflow.md
- 必要に応じ docs/ai-data-flow.md

このProjectでは、過去チャットの長大な引き継ぎより上記repo docsを正史として扱う。
ただしrepo/Productionの実状態がdocsより新しい場合は、実状態を確認して差分を報告し、docs更新を優先する。

現時点の最終product-changing baselineはChild80。
Human translationまでProduction実装済み。
AI小説生成は撤去済み。

ロードマップ順序は docs/roadmap.md を正本とし、ユーザーの明示的な変更、重大Production/security/legal/data-loss incident、hard dependency以外では勝手に並べ替えない。

現在予定している次のproduct workはChild81：
公開説明・SEO・AI検索向け情報最終整合。

その後：
Child82 外部情報更新
Child83 Search Console / Bing / IndexNow / Naver
acquisition
real usage observation / minimal analytics

既知のverification gate：
- Human translation real-user Production E2E未確認
- Human narration genuine-audio Production E2E未確認
- OpenAI account固有data sharing / ZDR / MAM設定未確認
- legacy rights未確認Official 36作品

これらは docs/roadmap.md のpriorityを勝手に変更するものではない。
各claim/acquisition前のgateとして扱う。

通常workflow：
latest main
→ branch
→ 実装
→ validation
→ Draft PR
→ Preview
→ ユーザー確認
→ 明示承認
→ merge
→ Production確認。

親チャットは、
優先順位、
cross-feature整合、
正史更新、
子チャット引き継ぎ、
Production/Git検証
を担当する。

ユーザーへ細かな手作業を頼まず、可能なものはrepo/tool側で進める。

最初の返答では、
1. 最新main
2. canonical docsを読んだこと
3. docs/roadmap.mdの現在の順番
4. docsとProduction/Gitで矛盾があるか
だけを簡潔に確認し、
勝手にChild81を開始しない。
