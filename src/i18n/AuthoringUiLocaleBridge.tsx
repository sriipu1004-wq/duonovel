"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import type { UiLocale } from "./config";
import { stripUiLocalePrefix } from "./config";

const EN: Record<string, string> = {
  "新規作成スペース": "Create work",
  "作品ワークスペース": "Work workspace",
  "作品ワークスペース一覧へ": "Back to workspaces",
  "読む画面を見る": "Open reader",
  "作品ページ（目次）を見る": "Open work page (contents)",
  "まだ公開面に出ていない": "Not public yet",
  "作品情報": "Work information",
  "作品タイトル": "Work title",
  "あらすじ": "Synopsis",
  "作品公開状態": "Publication status",
  "作品状態": "Work status",
  "公開状態": "Publication",
  "作品形式": "Work format",
  "短編": "Short story",
  "長編": "Long-form",
  "反応表示": "Reactions",
  "レビュー表示": "Reviews shown",
  "レビュー非表示": "Reviews hidden",
  "コメント表示": "Comments shown",
  "コメント非表示": "Comments hidden",
  "表示設定": "Display settings",
  "ジャンル": "Genre",
  "タグ": "Tags",
  "朗読許可": "Narration permission",
  "無条件許可（固定）": "Always allowed (fixed)",
  "変更": "Change",
  "閉じる": "Close",
  "未設定": "Not set",
  "レビュー": "Reviews",
  "コメント": "Comments",
  "表示": "Shown",
  "非表示": "Hidden",
  "エピソード全体の背景": "Episode background",
  "文字フォント": "Font",
  "文字サイズ": "Font size",
  "文字色": "Text color",
  "白": "White",
  "生成り": "Ivory paper",
  "薄い青紙": "Pale blue paper",
  "しわ紙": "Wrinkled paper",
  "古紙": "Aged paper",
  "黒": "Black",
  "薄赤": "Pale red",
  "薄青": "Pale blue",
  "薄緑": "Pale green",
  "明朝系": "Serif",
  "ゴシック系": "Sans serif",
  "等幅": "Monospace",
  "游明朝": "Yu Mincho",
  "游ゴシック": "Yu Gothic",
  "小さめ": "Small",
  "標準": "Standard",
  "やや大きめ": "Medium large",
  "大きめ": "Large",
  "かなり大きめ": "Extra large",
  "濃茶": "Dark brown",
  "青黒": "Blue black",
  "赤": "Red",
  "青": "Blue",
  "緑": "Green",
  "紫": "Purple",
  "保存済みに戻す": "Restore saved value",
  "空にする": "Clear",
  "固定タグ: AI生成": "Fixed tag: AI generated",
  "AI生成作品であることを示すタグのため、削除・変更できない。": "This tag identifies an AI-generated work and cannot be removed or changed.",
  "AI生成作品は朗読許可を無条件許可として扱うため、この画面では変更できない。": "AI-generated works always allow narration, so this cannot be changed here.",
  "変更は「作品ワークスペースを保存」で反映。": "Changes take effect when you save the work workspace.",
  "1話目の投稿状態": "Episode 1 publication status",
  "投稿": "Publish",
  "予約投稿": "Schedule",
  "下書き保存": "Save draft",
  "1話目の予約日時": "Episode 1 scheduled time",
  "ローカル時刻で入力。保存時に UTC へ変換して送る。": "Enter local time. It is converted to UTC when saved.",
  "作品レビュー欄を表示": "Show work reviews",
  "エピソードコメント欄を表示": "Show episode comments",
  "保存中...": "Saving...",
  "保存済み": "Saved",
  "保存失敗": "Save failed",
  "未保存": "Unsaved",
  "作品を作成して1話目へ": "Create work and continue to episode 1",
  "作品ワークスペースを保存": "Save work workspace",
  "作品を作成してワークスペースへ": "Create work and open workspace",
  "作成中...": "Creating...",
  "以下を確認してください": "Check the following",
  "作品タイトルを入力してください。": "Enter a work title.",
  "原文言語を選択してください。": "Choose the original language.",
  "1話目の予約日時を入力してください。": "Enter the scheduled time for episode 1.",
  "作品を作成できませんでした。入力内容を確認して、もう一度お試しください。": "Could not create the work. Check your entries and try again.",
  "作品を保存できませんでした。もう一度お試しください。": "Could not save the work. Try again.",
  "作品を保存できませんでした。入力内容を確認して、もう一度お試しください。": "Could not save the work. Check your entries and try again.",
  "新しい話を追加": "Add episode",
  "話本文を編集": "Edit episode",
  "本文編集": "Episode editor",
  "作品ワークスペースへ": "Back to work workspace",
  "話タイトル": "Episode title",
  "本文": "Body",
  "編集": "Edit",
  "読者プレビュー": "Reader preview",
  "投稿状態": "Publication status",
  "下書き": "Draft",
  "予約日時": "Scheduled time",
  "作成して保存": "Create and save",
  "保存して続ける": "Save and continue",
  "この下書きを投稿する": "Publish this draft",
  "ワークスペースへ戻る": "Back to workspace",
  "話数を確認してください。": "Check the episode number.",
  "話タイトルを入力してください。": "Enter an episode title.",
  "予約日時を入力してください。": "Enter a scheduled time.",
  "話を作成できませんでした。入力内容を確認して、もう一度お試しください。": "Could not create the episode. Check your entries and try again.",
  "話を保存できませんでした。入力内容を確認して、もう一度お試しください。": "Could not save the episode. Check your entries and try again.",
  "話は保存されましたが、作品の公開状態を更新できませんでした。": "The episode was saved, but the work publication state could not be updated.",
  "作品公開": "Publication",
  "読者向け表示": "Reader visibility",
  "表示中": "Visible",
  "公開待ち": "Waiting for publication",
  "レビュー欄": "Reviews",
  "コメント欄": "Comments",
  "ジャンル管理": "Manage genres",
  "ジャンル管理へ": "Manage genres",
  "タグ管理": "Manage tags",
  "タグ管理へ": "Manage tags",
  "朗読許可管理": "Narration permissions",
  "朗読許可へ": "Narration permissions",
  "1話目を作る": "Create episode 1",
  "まずはこの作品の最初の話を作る。": "Create the first episode of this work.",
  "話を追加する": "Add episode",
  "予約投稿や投稿済みの流れを保ったまま次の話へ進む。": "Continue to the next episode while keeping the current publication workflow.",
  "AI生成作品は第1話だけの間は短編、続編生成に成功すると長編へ自動で切り替わる。この画面からは変更できない。": "AI-generated works remain short stories while they have only episode 1 and automatically switch to long-form after a sequel is generated. This cannot be changed here.",
  "作品ページ（目次）を作らず、読む画面へ直接公開する。あらすじは読む画面に表示する。": "Publish directly to the reader without a separate contents page. The synopsis appears in the reader.",
  "作品ページ（目次）を作り、各話・朗読者・レビューなどを作品単位で表示する。": "Create a work contents page and show episodes, narrators, reviews and other work-level information there.",
};

const KO: Record<string, string> = {
  "新規作成スペース": "새 작품 만들기",
  "作品ワークスペース": "작품 워크스페이스",
  "作品ワークスペース一覧へ": "워크스페이스 목록으로",
  "読む画面を見る": "읽기 화면 보기",
  "作品ページ（目次）を見る": "작품 페이지(목차) 보기",
  "まだ公開面に出ていない": "아직 공개되지 않음",
  "作品情報": "작품 정보",
  "作品タイトル": "작품 제목",
  "あらすじ": "줄거리",
  "作品公開状態": "공개 상태",
  "作品状態": "작품 상태",
  "公開状態": "공개 상태",
  "作品形式": "작품 형식",
  "短編": "단편",
  "長編": "장편",
  "反応表示": "반응 표시",
  "レビュー表示": "리뷰 표시",
  "レビュー非表示": "리뷰 숨김",
  "コメント表示": "댓글 표시",
  "コメント非表示": "댓글 숨김",
  "表示設定": "표시 설정",
  "ジャンル": "장르",
  "タグ": "태그",
  "朗読許可": "낭독 허용",
  "無条件許可（固定）": "항상 허용(고정)",
  "変更": "변경",
  "閉じる": "닫기",
  "未設定": "미설정",
  "レビュー": "리뷰",
  "コメント": "댓글",
  "表示": "표시",
  "非表示": "숨김",
  "エピソード全体の背景": "에피소드 전체 배경",
  "文字フォント": "글꼴",
  "文字サイズ": "글자 크기",
  "文字色": "글자 색",
  "白": "흰색",
  "生成り": "미색 종이",
  "薄い青紙": "연한 파란 종이",
  "しわ紙": "구김 종이",
  "古紙": "고지",
  "黒": "검정",
  "薄赤": "연한 빨강",
  "薄青": "연한 파랑",
  "薄緑": "연한 초록",
  "明朝系": "명조 계열",
  "ゴシック系": "고딕 계열",
  "等幅": "고정폭",
  "游明朝": "Yu Mincho",
  "游ゴシック": "Yu Gothic",
  "小さめ": "작게",
  "標準": "표준",
  "やや大きめ": "조금 크게",
  "大きめ": "크게",
  "かなり大きめ": "매우 크게",
  "濃茶": "진한 갈색",
  "青黒": "청흑색",
  "赤": "빨강",
  "青": "파랑",
  "緑": "초록",
  "紫": "보라",
  "保存済みに戻す": "저장된 값으로 되돌리기",
  "空にする": "비우기",
  "固定タグ: AI生成": "고정 태그: AI 생성",
  "AI生成作品であることを示すタグのため、削除・変更できない。": "AI 생성 작품임을 나타내는 태그이므로 삭제하거나 변경할 수 없습니다.",
  "AI生成作品は朗読許可を無条件許可として扱うため、この画面では変更できない。": "AI 생성 작품은 낭독을 항상 허용하므로 이 화면에서 변경할 수 없습니다.",
  "変更は「作品ワークスペースを保存」で反映。": "‘작품 워크스페이스 저장’을 누르면 변경 사항이 적용됩니다.",
  "1話目の投稿状態": "1화 게시 상태",
  "投稿": "게시",
  "予約投稿": "예약 게시",
  "下書き保存": "초안 저장",
  "1話目の予約日時": "1화 예약 일시",
  "ローカル時刻で入力。保存時に UTC へ変換して送る。": "현지 시간으로 입력합니다. 저장 시 UTC로 변환됩니다.",
  "作品レビュー欄を表示": "작품 리뷰 표시",
  "エピソードコメント欄を表示": "에피소드 댓글 표시",
  "保存中...": "저장 중...",
  "保存済み": "저장됨",
  "保存失敗": "저장 실패",
  "未保存": "저장 안 됨",
  "作品を作成して1話目へ": "작품을 만들고 1화로",
  "作品ワークスペースを保存": "작품 워크스페이스 저장",
  "作品を作成してワークスペースへ": "작품을 만들고 워크스페이스로",
  "作成中...": "생성 중...",
  "以下を確認してください": "다음 항목을 확인하세요",
  "作品タイトルを入力してください。": "작품 제목을 입력하세요.",
  "原文言語を選択してください。": "원문 언어를 선택하세요.",
  "1話目の予約日時を入力してください。": "1화 예약 일시를 입력하세요.",
  "作品を作成できませんでした。入力内容を確認して、もう一度お試しください。": "작품을 만들 수 없습니다. 입력 내용을 확인한 뒤 다시 시도하세요.",
  "作品を保存できませんでした。もう一度お試しください。": "작품을 저장할 수 없습니다. 다시 시도하세요.",
  "作品を保存できませんでした。入力内容を確認して、もう一度お試しください。": "작품을 저장할 수 없습니다. 입력 내용을 확인한 뒤 다시 시도하세요.",
  "新しい話を追加": "새 화 추가",
  "話本文を編集": "화 본문 편집",
  "本文編集": "본문 편집",
  "作品ワークスペースへ": "작품 워크스페이스로",
  "話タイトル": "화 제목",
  "本文": "본문",
  "編集": "편집",
  "読者プレビュー": "독자 미리보기",
  "投稿状態": "게시 상태",
  "下書き": "초안",
  "予約日時": "예약 일시",
  "作成して保存": "생성 후 저장",
  "保存して続ける": "저장하고 계속",
  "この下書きを投稿する": "이 초안 게시",
  "ワークスペースへ戻る": "워크스페이스로 돌아가기",
  "話数を確認してください。": "화 번호를 확인하세요.",
  "話タイトルを入力してください。": "화 제목을 입력하세요.",
  "予約日時を入力してください。": "예약 일시를 입력하세요.",
  "話を作成できませんでした。入力内容を確認して、もう一度お試しください。": "화를 만들 수 없습니다. 입력 내용을 확인한 뒤 다시 시도하세요.",
  "話を保存できませんでした。入力内容を確認して、もう一度お試しください。": "화를 저장할 수 없습니다. 입력 내용을 확인한 뒤 다시 시도하세요.",
  "話は保存されましたが、作品の公開状態を更新できませんでした。": "화는 저장되었지만 작품 공개 상태를 업데이트하지 못했습니다.",
  "作品公開": "작품 공개",
  "読者向け表示": "독자 표시",
  "表示中": "표시 중",
  "公開待ち": "공개 대기",
  "レビュー欄": "리뷰",
  "コメント欄": "댓글",
  "ジャンル管理": "장르 관리",
  "ジャンル管理へ": "장르 관리",
  "タグ管理": "태그 관리",
  "タグ管理へ": "태그 관리",
  "朗読許可管理": "낭독 권한 관리",
  "朗読許可へ": "낭독 권한",
  "1話目を作る": "1화 만들기",
  "まずはこの作品の最初の話を作る。": "먼저 이 작품의 첫 화를 만듭니다.",
  "話を追加する": "화 추가",
  "予約投稿や投稿済みの流れを保ったまま次の話へ進む。": "예약 게시 및 게시 흐름을 유지하면서 다음 화로 진행합니다.",
  "AI生成作品は第1話だけの間は短編、続編生成に成功すると長編へ自動で切り替わる。この画面からは変更できない。": "AI 생성 작품은 1화만 있을 때 단편이며 후속편 생성에 성공하면 장편으로 자동 전환됩니다. 이 화면에서는 변경할 수 없습니다.",
  "作品ページ（目次）を作らず、読む画面へ直接公開する。あらすじは読む画面に表示する。": "별도의 목차 페이지 없이 읽기 화면으로 바로 공개합니다. 줄거리는 읽기 화면에 표시됩니다.",
  "作品ページ（目次）を作り、各話・朗読者・レビューなどを作品単位で表示する。": "작품 목차 페이지를 만들고 각 화, 낭독자, 리뷰 등을 작품 단위로 표시합니다.",
};

const PLACEHOLDERS: Record<"en" | "ko", Record<string, string>> = {
  en: {
    "作品タイトル": "Work title",
    "作品の概要を書く": "Write a synopsis",
    "1行1タグ\n例: 異世界\nダークファンタジー": "One tag per line\nExample: Isekai\nDark fantasy",
    "第1話 など": "Episode 1, etc.",
    "本文を入力": "Enter body text",
  },
  ko: {
    "作品タイトル": "작품 제목",
    "作品の概要を書く": "작품 줄거리 작성",
    "1行1タグ\n例: 異世界\nダークファンタジー": "한 줄에 태그 하나\n예: 이세계\n다크 판타지",
    "第1話 など": "1화 등",
    "本文を入力": "본문 입력",
  },
};

function normalize(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function translateDynamic(value: string, locale: "en" | "ko"): string | null {
  const nextDraft = value.match(/^下書き中の第(\d+)話を開いて投稿へ進める$/);
  if (nextDraft) return locale === "en" ? `Open draft episode ${nextDraft[1]} and continue to publishing` : `작성 중인 ${nextDraft[1]}화를 열고 게시로 진행`;

  const addEpisode = value.match(/^第(\d+)話を追加する$/);
  if (addEpisode) return locale === "en" ? `Add episode ${addEpisode[1]}` : `${addEpisode[1]}화 추가`;

  const previousDraft = value.match(/^前の第(\d+)話が下書きのため、この話はまだ投稿または予約投稿にできません。$/);
  if (previousDraft) {
    return locale === "en"
      ? `Episode ${previousDraft[1]} is still a draft, so this episode cannot be published or scheduled yet.`
      : `이전 ${previousDraft[1]}화가 아직 초안이므로 이 화는 게시하거나 예약 게시할 수 없습니다.`;
  }

  const previousSchedule = value.match(/^前の第(\d+)話の予約時刻より前には設定できません。$/);
  if (previousSchedule) {
    return locale === "en"
      ? `Set a time after the scheduled time for episode ${previousSchedule[1]}.`
      : `이전 ${previousSchedule[1]}화의 예약 시각 이후로 설정하세요.`;
  }

  const count = value.match(/^(\d+)件$/);
  if (count) return locale === "en" ? `${count[1]}` : `${count[1]}개`;

  const autoFormat = value.match(/^(短編|長編)（自動管理）$/);
  if (autoFormat) {
    const translated = (locale === "en" ? EN : KO)[autoFormat[1]] ?? autoFormat[1];
    return locale === "en" ? `${translated} (automatic)` : `${translated}(자동 관리)`;
  }

  return null;
}

function applyTranslation(locale: "en" | "ko") {
  const dictionary = locale === "en" ? EN : KO;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);

  for (const node of nodes) {
    const parent = node.parentElement;
    if (!parent || parent.closest("script, style, textarea") || parent.isContentEditable) continue;
    const value = normalize(node.data);
    if (!value) continue;
    const translated = dictionary[value] ?? translateDynamic(value, locale);
    if (!translated || translated === value) continue;
    const leading = node.data.match(/^\s*/)?.[0] ?? "";
    const trailing = node.data.match(/\s*$/)?.[0] ?? "";
    node.data = `${leading}${translated}${trailing}`;
  }

  document.querySelectorAll("input[placeholder], textarea[placeholder]").forEach((element) => {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return;
    const translated = PLACEHOLDERS[locale][element.placeholder];
    if (translated) element.placeholder = translated;
  });
}

export default function AuthoringUiLocaleBridge({ locale }: { locale: UiLocale }) {
  const pathname = usePathname();

  useEffect(() => {
    if (locale === "ja" || !stripUiLocalePrefix(pathname).startsWith("/write")) return;

    let scheduled = false;
    const apply = () => applyTranslation(locale);
    apply();

    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        apply();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [locale, pathname]);

  return null;
}
