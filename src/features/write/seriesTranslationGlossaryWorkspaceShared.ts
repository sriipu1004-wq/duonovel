import type { SupportedLanguageTag } from "@/lib/translation/languageRegistry";
import type { UiLocale } from "@/i18n/config";

export type SeriesTranslationGlossaryEntryRow = {
  id: string;
  series_id: string;
  source_language: SupportedLanguageTag;
  source_term: string;
  term_type: string;
  source_note?: string | null;
  effective_from_episode_number: number;
  origin: string;
  status: string;
  is_locked: boolean;
  is_global: boolean;
  created_by_user_id?: string | null;
  updated_at?: string | null;
};

export type SeriesTranslationGlossaryTargetRow = {
  id: string;
  glossary_entry_id: string;
  target_language: SupportedLanguageTag;
  target_term: string;
  translation_note?: string | null;
  origin: string;
  status: string;
  is_locked: boolean;
  effective_from_episode_number: number;
  updated_at?: string | null;
};

export type SeriesTranslationProfileRow = {
  id: string;
  series_id: string;
  target_language: SupportedLanguageTag;
  style_notes?: string | null;
  honorific_policy?: string | null;
  formatting_notes?: string | null;
  origin: string;
  updated_by_user_id?: string | null;
  updated_at?: string | null;
};

export type SeriesTranslationGlossaryWorkspaceProps = {
  seriesId: string;
  currentUserId: string;
  sourceLanguage: SupportedLanguageTag;
  initialEntries: SeriesTranslationGlossaryEntryRow[];
  initialTargets: SeriesTranslationGlossaryTargetRow[];
  initialProfiles: SeriesTranslationProfileRow[];
};

export const TERM_TYPES = [
  "character",
  "person",
  "place",
  "organization",
  "item",
  "skill",
  "magic",
  "concept",
  "title",
  "other",
] as const;

export type GlossaryCopy = {
  title: string; help: string; targetLanguage: string; sourceTerm: string;
  targetTerm: string; type: string; note: string; status: string; locked: string;
  global: string; effectiveFrom: string; add: string; save: string; cancel: string;
  edit: string; disable: string; enable: string; delete: string; empty: string;
  profileTitle: string; styleNotes: string; honorificPolicy: string;
  formattingNotes: string; saveProfile: string; saved: string; failed: string;
  confirmed: string; suggested: string; disabled: string;
};

export const SERIES_TRANSLATION_GLOSSARY_COPY: Record<UiLocale, GlossaryCopy> = {
  ja: {
    title: "翻訳用語集",
    help: "作品ごとの固有名詞・呼称・話し方を対訳言語別に固定する。既存の完成済み対訳は自動再生成されない。",
    targetLanguage: "対訳言語", sourceTerm: "原文の用語", targetTerm: "固定する訳",
    type: "種類", note: "翻訳メモ・話し方", status: "状態", locked: "作者固定",
    global: "全話で安全な表記", effectiveFrom: "有効開始話", add: "用語を追加",
    save: "変更を保存", cancel: "キャンセル", edit: "編集", disable: "無効化",
    enable: "有効化", delete: "削除", empty: "この言語の用語はまだない。",
    profileTitle: "作品の翻訳方針", styleNotes: "文体メモ", honorificPolicy: "敬称・呼称方針",
    formattingNotes: "表記・整形メモ", saveProfile: "翻訳方針を保存", saved: "保存した。",
    failed: "保存に失敗した。", confirmed: "Confirmed", suggested: "Suggested", disabled: "Disabled",
  },
  en: {
    title: "Translation glossary",
    help: "Fix names, terms, forms of address, and character voice per target language. Existing ready translations are not regenerated automatically.",
    targetLanguage: "Target language", sourceTerm: "Source term", targetTerm: "Target rendering",
    type: "Type", note: "Translation / voice note", status: "Status", locked: "Author locked",
    global: "Safe across all episodes", effectiveFrom: "Effective from episode", add: "Add term",
    save: "Save changes", cancel: "Cancel", edit: "Edit", disable: "Disable", enable: "Enable",
    delete: "Delete", empty: "No terms for this language yet.", profileTitle: "Series translation profile",
    styleNotes: "Style notes", honorificPolicy: "Honorific / address policy", formattingNotes: "Formatting notes",
    saveProfile: "Save profile", saved: "Saved.", failed: "Save failed.", confirmed: "Confirmed",
    suggested: "Suggested", disabled: "Disabled",
  },
  ko: {
    title: "번역 용어집",
    help: "작품별 고유명사, 호칭, 말투를 대상 언어별로 고정한다. 이미 완료된 번역은 자동 재생성되지 않는다.",
    targetLanguage: "번역 언어", sourceTerm: "원문 용어", targetTerm: "고정 번역", type: "종류",
    note: "번역·말투 메모", status: "상태", locked: "작가 고정", global: "전 화에 안전한 표기",
    effectiveFrom: "적용 시작 화", add: "용어 추가", save: "변경 저장", cancel: "취소", edit: "편집",
    disable: "비활성화", enable: "활성화", delete: "삭제", empty: "이 언어의 용어가 아직 없다.",
    profileTitle: "작품 번역 방침", styleNotes: "문체 메모", honorificPolicy: "경칭·호칭 방침",
    formattingNotes: "표기·서식 메모", saveProfile: "번역 방침 저장", saved: "저장했다.",
    failed: "저장에 실패했다.", confirmed: "Confirmed", suggested: "Suggested", disabled: "Disabled",
  },
};
