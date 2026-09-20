"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import type { UiLocale } from "./config";
import { isReaderPath, localizePath } from "./navigation";

const EN: Record<string, string> = {
  "無料枠あり": "Free tier available",
  "個人本棚 / 多言語対訳 / 読み上げ / AI生成": "Personal library / bilingual reading / read-aloud / AI generation",
  "読む、聴く、学ぶ。": "Read. Listen. Learn.",
  "外国語の長編を、自分の本棚で読み続ける。多言語対訳、読み上げ、AI物語、Web小説にも対応。": "Keep reading long-form stories in another language in your own library. Bilingual text, read-aloud, AI stories and web novels are all supported.",
  "PDF・EPUB・TXT・DOCXを作品単位で取り込み、章・話ごとの読書位置、対訳、栞を管理できます。公開作品を読む・聴く・投稿する機能と、時間に合わせたAI物語生成も同じ場所で利用できます。": "Import PDF, EPUB, TXT or DOCX files and keep reading position, bilingual text and bookmarks by work and chapter. Read, listen to and publish public works, or generate AI stories for the time you have.",
  "物語を生成する": "Generate a story",
  "個人本棚を開く": "Open My Library",
  "作品を探す": "Explore works",
  "作品を投稿する": "Create / publish a work",
  "作品を朗読する": "Create narration",
  "目次": "Contents",
  "LIB read の特徴": "About LIB read",
  "月額680円サブスク": "¥680 monthly subscription",
  "ブックマーク更新": "Bookmark updates",
  "新着更新": "Latest updates",
  "週間新作おすすめ": "Weekly new picks",
  "総合人気順": "Overall popular",
  "朗読視聴人気順": "Narration popularity",
  "月額680円で、長編の対訳を止めずに読む。": "Read long-form bilingual text without interruption for ¥680/month.",
  "単語解説は無制限。AI物語は1日10回、対訳生成は1日30回へ拡大し、読書中に次話の対訳を1話だけ先読みします。": "Word explanations are unlimited. AI stories expand to 10 per day and bilingual generation to 30 per day, with one episode prefetched while you read.",
  "無料版との違いを見る": "Compare with the free tier",
  "長編を読む・聴く・作る・学ぶための機能を、作品単位で管理する。": "Manage reading, listening, creation and learning tools around each work.",
  "個人本棚": "Personal library",
  "自分で用意したPDF・EPUB・TXT・DOCXを取り込み、長編を章・話単位で管理して続きから読める。": "Import your own PDF, EPUB, TXT and DOCX files, manage long works by chapter or episode, and continue where you left off.",
  "多言語対訳": "Multilingual bilingual reading",
  "原文と訳文を上下で同期し、語の意味・品詞も確認できる。保存済み対訳は再利用する。": "Keep original and translated text synchronized, inspect meanings and parts of speech, and reuse saved translations.",
  "読み上げ・栞": "Read-aloud & bookmarks",
  "ブラウザ読み上げと投稿朗読に対応。読書位置や栞、表示・朗読設定を保持する。": "Supports browser read-aloud and published narration while preserving reading position, bookmarks, display and narration settings.",
  "AI物語・投稿": "AI stories & publishing",
  "読む時間に合わせた物語を生成し、保存後は作品ワークスペースで編集・続編生成・投稿ができる。": "Generate a story for the time you have, then edit, continue and publish it from the work workspace.",
  "最近更新された公開作品。": "Recently updated public works.",
  "新しめの作品から入りやすくする。": "Discover recently published works.",
  "現時点の人気寄り順で公開作品を表示。": "Public works ordered by current popularity.",
  "朗読視聴寄りの順で公開作品を表示。": "Public works ordered by narration activity.",
  "ブックマークした作品のうち、最近更新された作品。": "Recently updated works from your bookmarks.",
  "ログインすると、ブックマークした作品の更新をここで確認できる。": "Sign in to see updates from bookmarked works here.",
  "ブックマーク更新を表示するにはログインが必要。": "Sign in to view bookmark updates.",
  "ログインする": "Sign in",
  "さらに表示": "Show more",
  "条件に合う公開作品がない。": "No public works match these conditions.",
  "新着更新の結果": "Latest update results",
  "新着更新順で表示中。": "Showing recently updated works.",
  "週間新作おすすめの結果": "Weekly new-pick results",
  "新作寄りの順で表示中。": "Showing newer works first.",
  "総合人気順の結果": "Overall popularity results",
  "公開中作品を人気寄りの順で表示中。": "Showing public works by popularity.",
  "朗読視聴人気順の結果": "Narration popularity results",
  "朗読視聴寄りの順で表示中。": "Showing works by narration activity.",
  "タグ一致作品を人気寄りの順で表示中。": "Showing matching-tag works by popularity.",
  "条件に合う公開作品を表示中。": "Showing public works matching the current conditions.",
  "公開検索": "Public search",
  "公開作品を探す": "Explore public works",
  "公開されている作品を、タグやジャンル、公開時期などから絞り込めます。": "Filter public works by tags, genres, publication period and more.",
  "ジャンル / タグで絞る（左に表示されてるものほど強く参照される）": "Filter by genre / tag (items further left are referenced more strongly)",
  "条件をクリア": "Clear filters",
  "ジャンル": "Genre",
  "タグ": "Tags",
  "続きを表示": "Show more",
  "閉じる": "Show less",
  "人気順": "Popularity",
  "更新順": "Recently updated",
  "検索する": "Search",
  "検索棚": "Discovery shelves",
  "新着更新順": "Latest updates",
  "週間新作おすすめ順": "Weekly new picks",
  "暫定人気順": "Provisional popularity",
  "上の棚は作品を見つけるための入口。今の条件に一致した作品一覧は下でまとめて確認できる。": "Use the shelves above to discover works. The complete list matching the current filters appears below.",
  "この条件に一致するジャンル別作品はまだありません。下の検索結果から公開作品を確認できます。": "There are no genre shelves matching these conditions yet. Check the public works in the results below.",
  "日間": "Daily",
  "週間": "Weekly",
  "月間": "Monthly",
  "四半期": "Quarterly",
  "年間": "Yearly",
  "累計": "All time",
  "もっと見る": "View more",
  "検索結果": "Search results",
  "作品詳細": "Work details",
  "読み始める": "Start reading",
  "タグ未設定": "No tags",
  "あらすじ未設定": "No synopsis",
  "第1話から読む": "Read from episode 1",
  "作品を読む": "Read this work",
  "未公開": "Unpublished",
  "閲覧": "Views",
  "期間閲覧": "Period views",
  "いいね": "Likes",
  "期間いいね": "Period likes",
  "ブックマーク": "Bookmarks",
  "期間ブックマーク": "Period bookmarks",
  "人気値": "Popularity score",
  "朗読再生": "Narration plays",
  "朗読視聴": "Narration plays",
  "更新": "Updated",
  "作者": "Author",
  "ファンタジー": "Fantasy",
  "恋愛": "Romance",
  "ホラー": "Horror",
  "コメディ": "Comedy",
  "ミステリー": "Mystery",
  "癒し": "Comfort",
  "異世界": "Isekai",
  "現代": "Contemporary",
  "歴史": "Historical",
  "冒険": "Adventure",
  "青春": "Coming of age",
  "AI生成": "AI generated",
  "時間指定AI短編": "Timed AI short story",
  "#AI生成": "#AI-generated",
  "#時間指定AI短編": "#Timed-AI-short",
  "投稿データベース": "Work workspace",
  "公開前の下書きから公開中の作品まで、投稿作品をまとめて管理する。": "Manage drafts and published works in one workspace.",
  "新しい作品を作る": "Create a new work",
  "マイページへ": "My Page",
  "作品一覧": "My works",
  "まだ作品がない。上のボタンから新しい作品を作成できる。": "You do not have any works yet. Create one with the button above.",
  "非公開": "Private",
  "公開": "Public",
  "公開準備": "Preparing to publish",
  "朗読許可": "Narration allowed",
  "朗読不可": "Narration unavailable",
  "公開状況": "Publication",
  "朗読状態": "Narration",
  "話数": "Episodes",
  "最終更新": "Last updated",
  "朗読ページ": "Narration",
  "朗読管理トップ": "Narration dashboard",
  "朗読作品の検索、投稿済み朗読、ブックマーク作品、朗読状況をここでまとめて管理する。": "Search works for narration and manage published narrations, bookmarks and request status in one place.",
  "朗読作品を探す": "Find works to narrate",
  "公開中の朗読関連作品を、検索語、ジャンル、タグ、期間、並び順、朗読向けフィルタで絞り込む。": "Filter narration-eligible public works by search term, genre, tags, period, order and narration filters.",
  "朗読フィルタ": "Narration filter",
  "検索": "Search",
  "投稿朗読作品": "Published narrations",
  "ブックマーク作品": "Bookmarked works",
  "朗読状況": "Narration status",
  "すべて": "All",
  "投稿済": "Published",
  "朗読可": "Narration available",
  "自分が朗読投稿済みの作品だけを見る。": "Show only works you have already narrated.",
  "今すぐ朗読制作へ進める作品だけを見る。": "Show only works ready for narration now.",
  "自分が保存した作品だけを見る。": "Show only works you bookmarked.",
  "公開中の朗読関連作品をまとめて見る。": "Show all public works available for narration.",
  "朗読制作へ": "Create narration",
  "作品ページへ": "Open work",
  "作品ページ": "Work page",
  "制作開始": "Start creating",
  "申請ページ": "Request page",
  "申請メッセージは未入力。": "No request message was entered.",
  "上の検索へ": "Back to search",
  "フィルタ": "Filter",
  "検索語": "Search term",
  "未入力": "None",
  "未指定": "Not specified",
  "並び順": "Order",
  "朗読視聴順": "Narration plays",
  "条件に合う朗読関連作品はない。": "No narration-related works match these conditions.",
  "未使用": "Pending",
  "却下": "Rejected",
  "取消済み": "Cancelled",
  "未申請": "Not requested",
  "未記録": "No record",
  "ジャンルは3つまで選択可能": "You can select up to three genres",
  "設定": "Settings",
  "一覧を見る": "View all",
};

const KO: Record<string, string> = {
  "無料枠あり": "무료 이용 가능",
  "個人本棚 / 多言語対訳 / 読み上げ / AI生成": "개인 서재 / 다국어 대역 / 읽어주기 / AI 생성",
  "読む、聴く、学ぶ。": "읽고, 듣고, 배우기.",
  "外国語の長編を、自分の本棚で読み続ける。多言語対訳、読み上げ、AI物語、Web小説にも対応。": "개인 서재에서 장편 외국어 작품을 이어 읽고, 다국어 대역·읽어주기·AI 이야기·웹소설을 함께 이용할 수 있습니다.",
  "PDF・EPUB・TXT・DOCXを作品単位で取り込み、章・話ごとの読書位置、対訳、栞を管理できます。公開作品を読む・聴く・投稿する機能と、時間に合わせたAI物語生成も同じ場所で利用できます。": "PDF, EPUB, TXT, DOCX를 작품 단위로 가져와 장·화별 읽던 위치, 대역, 책갈피를 관리할 수 있습니다. 공개 작품을 읽고 듣고 게시하거나 시간에 맞는 AI 이야기를 만들 수도 있습니다.",
  "物語を生成する": "AI 이야기 만들기",
  "個人本棚を開く": "개인 서재 열기",
  "作品を探す": "작품 찾기",
  "作品を投稿する": "작품 제작·게시",
  "作品を朗読する": "낭독 제작",
  "目次": "목차",
  "LIB read の特徴": "LIB read 특징",
  "月額680円サブスク": "월 ¥680 구독",
  "ブックマーク更新": "책갈피 작품 업데이트",
  "新着更新": "최근 업데이트",
  "週間新作おすすめ": "주간 신작 추천",
  "総合人気順": "종합 인기순",
  "朗読視聴人気順": "낭독 인기순",
  "月額680円で、長編の対訳を止めずに読む。": "월 ¥680으로 장편 대역을 끊김 없이 읽기.",
  "単語解説は無制限。AI物語は1日10回、対訳生成は1日30回へ拡大し、読書中に次話の対訳を1話だけ先読みします。": "단어 설명은 무제한입니다. AI 이야기는 하루 10회, 대역 생성은 하루 30회로 늘어나며 읽는 동안 다음 화 대역을 1화 미리 생성합니다.",
  "無料版との違いを見る": "무료 버전과 비교",
  "長編を読む・聴く・作る・学ぶための機能を、作品単位で管理する。": "장편을 읽고 듣고 만들고 학습하는 기능을 작품 단위로 관리합니다.",
  "個人本棚": "개인 서재",
  "自分で用意したPDF・EPUB・TXT・DOCXを取り込み、長編を章・話単位で管理して続きから読める。": "PDF, EPUB, TXT, DOCX를 가져와 장편을 장·화 단위로 관리하고 이어 읽을 수 있습니다.",
  "多言語対訳": "다국어 대역",
  "原文と訳文を上下で同期し、語の意味・品詞も確認できる。保存済み対訳は再利用する。": "원문과 번역문을 동기화하고 단어 뜻과 품사를 확인할 수 있습니다. 저장된 대역은 재사용합니다.",
  "読み上げ・栞": "읽어주기·책갈피",
  "ブラウザ読み上げと投稿朗読に対応。読書位置や栞、表示・朗読設定を保持する。": "브라우저 읽어주기와 게시 낭독을 지원하며 읽던 위치, 책갈피, 표시·낭독 설정을 유지합니다.",
  "AI物語・投稿": "AI 이야기·게시",
  "読む時間に合わせた物語を生成し、保存後は作品ワークスペースで編集・続編生成・投稿ができる。": "읽을 시간에 맞는 이야기를 만들고 저장 후 작품 워크스페이스에서 편집, 후속편 생성, 게시할 수 있습니다.",
  "最近更新された公開作品。": "최근 업데이트된 공개 작품입니다.",
  "新しめの作品から入りやすくする。": "최근 공개된 작품을 발견합니다.",
  "現時点の人気寄り順で公開作品を表示。": "현재 인기순으로 공개 작품을 표시합니다.",
  "朗読視聴寄りの順で公開作品を表示。": "낭독 시청 활동순으로 공개 작품을 표시합니다.",
  "ブックマークした作品のうち、最近更新された作品。": "책갈피한 작품 중 최근 업데이트된 작품입니다.",
  "ログインすると、ブックマークした作品の更新をここで確認できる。": "로그인하면 책갈피 작품의 업데이트를 여기에서 확인할 수 있습니다.",
  "ブックマーク更新を表示するにはログインが必要。": "책갈피 업데이트를 보려면 로그인이 필요합니다.",
  "ログインする": "로그인",
  "さらに表示": "더 보기",
  "条件に合う公開作品がない。": "조건에 맞는 공개 작품이 없습니다.",
  "新着更新の結果": "최근 업데이트 결과",
  "新着更新順で表示中。": "최근 업데이트순으로 표시 중입니다.",
  "週間新作おすすめの結果": "주간 신작 추천 결과",
  "新作寄りの順で表示中。": "신작 중심으로 표시 중입니다.",
  "総合人気順の結果": "종합 인기순 결과",
  "公開中作品を人気寄りの順で表示中。": "공개 작품을 인기순으로 표시 중입니다.",
  "朗読視聴人気順の結果": "낭독 인기순 결과",
  "朗読視聴寄りの順で表示中。": "낭독 활동순으로 표시 중입니다.",
  "タグ一致作品を人気寄りの順で表示中。": "태그가 일치하는 작품을 인기순으로 표시 중입니다.",
  "条件に合う公開作品を表示中。": "현재 조건에 맞는 공개 작품을 표시 중입니다.",
  "公開検索": "공개 검색",
  "公開作品を探す": "공개 작품 찾기",
  "公開されている作品を、タグやジャンル、公開時期などから絞り込めます。": "공개 작품을 태그, 장르, 공개 시기 등으로 필터링할 수 있습니다.",
  "ジャンル / タグで絞る（左に表示されてるものほど強く参照される）": "장르 / 태그로 필터링 (왼쪽 항목일수록 우선 참조)",
  "条件をクリア": "조건 초기화",
  "ジャンル": "장르",
  "タグ": "태그",
  "続きを表示": "더 보기",
  "閉じる": "접기",
  "人気順": "인기순",
  "更新順": "업데이트순",
  "検索する": "검색",
  "検索棚": "탐색 선반",
  "新着更新順": "최근 업데이트순",
  "週間新作おすすめ順": "주간 신작 추천순",
  "暫定人気順": "잠정 인기순",
  "上の棚は作品を見つけるための入口。今の条件に一致した作品一覧は下でまとめて確認できる。": "위 선반에서 작품을 발견하고 현재 조건과 일치하는 전체 목록은 아래에서 확인할 수 있습니다.",
  "この条件に一致するジャンル別作品はまだありません。下の検索結果から公開作品を確認できます。": "이 조건에 맞는 장르별 작품은 아직 없습니다. 아래 검색 결과에서 공개 작품을 확인할 수 있습니다.",
  "日間": "일간",
  "週間": "주간",
  "月間": "월간",
  "四半期": "분기",
  "年間": "연간",
  "累計": "누적",
  "もっと見る": "더 보기",
  "検索結果": "검색 결과",
  "作品詳細": "작품 상세",
  "読み始める": "읽기 시작",
  "タグ未設定": "태그 없음",
  "あらすじ未設定": "줄거리 없음",
  "第1話から読む": "1화부터 읽기",
  "作品を読む": "작품 읽기",
  "未公開": "미공개",
  "閲覧": "조회",
  "期間閲覧": "기간 조회",
  "いいね": "좋아요",
  "期間いいね": "기간 좋아요",
  "ブックマーク": "책갈피",
  "期間ブックマーク": "기간 책갈피",
  "人気値": "인기도",
  "朗読再生": "낭독 재생",
  "朗読視聴": "낭독 재생",
  "更新": "업데이트",
  "作者": "작가",
  "ファンタジー": "판타지",
  "恋愛": "로맨스",
  "ホラー": "호러",
  "コメディ": "코미디",
  "ミステリー": "미스터리",
  "癒し": "힐링",
  "異世界": "이세계",
  "現代": "현대",
  "歴史": "역사",
  "冒険": "모험",
  "青春": "청춘",
  "AI生成": "AI 생성",
  "時間指定AI短編": "시간 지정 AI 단편",
  "#AI生成": "#AI생성",
  "#時間指定AI短編": "#시간지정AI단편",
  "投稿データベース": "작품 워크스페이스",
  "公開前の下書きから公開中の作品まで、投稿作品をまとめて管理する。": "초안부터 공개 중인 작품까지 한 워크스페이스에서 관리합니다.",
  "新しい作品を作る": "새 작품 만들기",
  "マイページへ": "마이페이지",
  "作品一覧": "내 작품",
  "まだ作品がない。上のボタンから新しい作品を作成できる。": "아직 작품이 없습니다. 위 버튼에서 새 작품을 만들 수 있습니다.",
  "非公開": "비공개",
  "公開": "공개",
  "公開準備": "공개 준비",
  "朗読許可": "낭독 허용",
  "朗読不可": "낭독 불가",
  "公開状況": "공개 상태",
  "朗読状態": "낭독 상태",
  "話数": "화 수",
  "最終更新": "최종 업데이트",
  "朗読ページ": "낭독",
  "朗読管理トップ": "낭독 관리",
  "朗読作品の検索、投稿済み朗読、ブックマーク作品、朗読状況をここでまとめて管理する。": "낭독 작품 검색, 게시한 낭독, 책갈피 작품, 낭독 상태를 한곳에서 관리합니다.",
  "朗読作品を探す": "낭독할 작품 찾기",
  "公開中の朗読関連作品を、検索語、ジャンル、タグ、期間、並び順、朗読向けフィルタで絞り込む。": "공개 중인 낭독 관련 작품을 검색어, 장르, 태그, 기간, 정렬, 낭독 필터로 좁힙니다.",
  "朗読フィルタ": "낭독 필터",
  "検索": "검색",
  "投稿朗読作品": "게시한 낭독",
  "ブックマーク作品": "책갈피 작품",
  "朗読状況": "낭독 상태",
  "すべて": "전체",
  "投稿済": "게시 완료",
  "朗読可": "낭독 가능",
  "自分が朗読投稿済みの作品だけを見る。": "내가 이미 낭독을 게시한 작품만 봅니다.",
  "今すぐ朗読制作へ進める作品だけを見る。": "지금 바로 낭독 제작을 시작할 수 있는 작품만 봅니다.",
  "自分が保存した作品だけを見る。": "내가 저장한 작품만 봅니다.",
  "公開中の朗読関連作品をまとめて見る。": "공개 중인 낭독 관련 작품을 모두 봅니다.",
  "朗読制作へ": "낭독 제작",
  "作品ページへ": "작품 페이지",
  "作品ページ": "작품 페이지",
  "制作開始": "제작 시작",
  "申請ページ": "신청 페이지",
  "申請メッセージは未入力。": "신청 메시지가 없습니다.",
  "上の検索へ": "검색으로 돌아가기",
  "フィルタ": "필터",
  "検索語": "검색어",
  "未入力": "입력 없음",
  "未指定": "미지정",
  "並び順": "정렬",
  "朗読視聴順": "낭독 재생순",
  "条件に合う朗読関連作品はない。": "조건에 맞는 낭독 관련 작품이 없습니다.",
  "未使用": "대기 중",
  "却下": "거절됨",
  "取消済み": "취소됨",
  "未申請": "미신청",
  "未記録": "기록 없음",
  "ジャンルは3つまで選択可能": "장르는 최대 3개까지 선택할 수 있습니다",
  "設定": "설정",
  "一覧を見る": "전체 보기",
};

const PLACEHOLDER: Record<"en" | "ko", Record<string, string>> = {
  en: { "作品名、作者名、あらすじなどで検索": "Search by title, author, synopsis and more" },
  ko: { "作品名、作者名、あらすじなどで検索": "제목, 작가, 줄거리 등으로 검색" },
};

const LEGAL_JA_ONLY = new Set([
  "/terms",
  "/privacy",
  "/commercial-transactions",
  "/record/terms",
]);

function normalized(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function translateDynamic(value: string, locale: "en" | "ko"): string | null {
  const episodes = value.match(/^(\d+)話$/);
  if (episodes) return locale === "en" ? `${episodes[1]} episodes` : `${episodes[1]}화`;

  const requestAt = value.match(/^直近申請日時: (.+)$/);
  if (requestAt) return locale === "en" ? `Latest request: ${requestAt[1]}` : `최근 신청: ${requestAt[1]}`;

  const period = value.match(/^指定期間: (.+) 〜 (.+) \/ 並び順: (.+)$/);
  if (period) {
    const order = (locale === "en" ? EN : KO)[period[3]] ?? period[3];
    return locale === "en"
      ? `Period: ${period[1]} – ${period[2]} / Order: ${order}`
      : `기간: ${period[1]} ~ ${period[2]} / 정렬: ${order}`;
  }

  const currentShelf = value.match(/^現在表示: (.+)$/);
  if (currentShelf) {
    const shelf = (locale === "en" ? EN : KO)[currentShelf[1]] ?? currentShelf[1];
    return locale === "en" ? `Currently shown: ${shelf}` : `현재 표시: ${shelf}`;
  }

  const recentPopularity = value.match(/^直近(\d+)日で獲得した人気値順で表示。$/);
  if (recentPopularity) {
    return locale === "en"
      ? `Ordered by popularity gained in the last ${recentPopularity[1]} days.`
      : `최근 ${recentPopularity[1]}일 동안 얻은 인기도순으로 표시합니다.`;
  }

  const recentNarration = value.match(/^直近(\d+)日で再生された朗読視聴数順で表示。$/);
  if (recentNarration) {
    return locale === "en"
      ? `Ordered by narration plays in the last ${recentNarration[1]} days.`
      : `최근 ${recentNarration[1]}일 동안의 낭독 재생순으로 표시합니다.`;
  }

  const genreUpdated = value.match(/^公開中の (.+) 作品を更新順で表示。$/);
  if (genreUpdated) {
    const genre = (locale === "en" ? EN : KO)[genreUpdated[1]] ?? genreUpdated[1];
    return locale === "en"
      ? `Public ${genre} works ordered by latest update.`
      : `공개 중인 ${genre} 작품을 업데이트순으로 표시합니다.`;
  }

  const weeklyGenre = value.match(/^直近7日で初公開された (.+) 作品を暫定人気順で表示。$/);
  if (weeklyGenre) {
    const genre = (locale === "en" ? EN : KO)[weeklyGenre[1]] ?? weeklyGenre[1];
    return locale === "en"
      ? `${genre} works first published in the last 7 days, ordered by provisional popularity.`
      : `최근 7일 안에 처음 공개된 ${genre} 작품을 잠정 인기순으로 표시합니다.`;
  }

  const emptyGenre = value.match(/^(.+) の公開作品はまだない。$/);
  if (emptyGenre) {
    const genre = (locale === "en" ? EN : KO)[emptyGenre[1]] ?? emptyGenre[1];
    return locale === "en"
      ? `There are no public ${genre} works yet.`
      : `공개된 ${genre} 작품이 아직 없습니다.`;
  }

  const emptyWeeklyGenre = value.match(/^直近7日で初公開された (.+) 作品はまだない。$/);
  if (emptyWeeklyGenre) {
    const genre = (locale === "en" ? EN : KO)[emptyWeeklyGenre[1]] ?? emptyWeeklyGenre[1];
    return locale === "en"
      ? `There are no ${genre} works first published in the last 7 days yet.`
      : `최근 7일 안에 처음 공개된 ${genre} 작품이 아직 없습니다.`;
  }

  const tagResult = value.match(/^(.+) の結果$/);
  if (tagResult) {
    return locale === "en" ? `${tagResult[1]} results` : `${tagResult[1]} 결과`;
  }

  return null;
}

function restyleDisclosureButtons(root: ParentNode) {
  root.querySelectorAll("button").forEach((element) => {
    if (!(element instanceof HTMLButtonElement)) return;
    const value = normalized(element.textContent ?? "");
    if (!["続きを表示", "閉じる", "Show more", "Show less", "더 보기", "접기"].includes(value)) return;
    element.className = "mt-2 text-xs text-neutral-500 underline decoration-black/20 underline-offset-4 transition hover:text-black";
    element.style.position = "static";
    element.style.boxShadow = "none";
  });
}

function localizeElement(root: ParentNode, locale: "en" | "ko") {
  const dictionary = locale === "en" ? EN : KO;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);

  for (const node of nodes) {
    const parent = node.parentElement;
    if (!parent || parent.closest("script, style, textarea, [data-no-ui-localize]") || parent.isContentEditable) continue;
    const value = normalized(node.data);
    if (!value) continue;
    const translated = dictionary[value] ?? translateDynamic(value, locale);
    if (!translated || translated === value) continue;
    const leading = node.data.match(/^\s*/)?.[0] ?? "";
    const trailing = node.data.match(/\s*$/)?.[0] ?? "";
    node.data = `${leading}${translated}${trailing}`;
  }

  root.querySelectorAll("input[placeholder]").forEach((element) => {
    if (!(element instanceof HTMLInputElement)) return;
    const translated = PLACEHOLDER[locale][element.placeholder];
    if (translated) element.placeholder = translated;
  });

  root.querySelectorAll("a[href]").forEach((element) => {
    if (!(element instanceof HTMLAnchorElement)) return;
    const rawHref = element.getAttribute("href") ?? "";
    if (!rawHref.startsWith("/") || rawHref.startsWith("//")) return;
    const pathOnly = rawHref.split(/[?#]/, 1)[0];
    if (LEGAL_JA_ONLY.has(pathOnly)) return;
    const nextHref = localizePath(rawHref, locale);
    if (nextHref !== rawHref) element.setAttribute("href", nextHref);
  });

  restyleDisclosureButtons(root);
}

export default function SiteUiLocaleBridge({ locale }: { locale: UiLocale }) {
  const pathname = usePathname();

  useEffect(() => {
    const reader = isReaderPath(pathname);
    const apply = () => {
      if (!reader && locale !== "ja") localizeElement(document.body, locale);
      restyleDisclosureButtons(document.body);
    };

    apply();
    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        apply();
      });
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: locale !== "ja" && !reader,
    });
    return () => observer.disconnect();
  }, [locale, pathname]);

  return null;
}
