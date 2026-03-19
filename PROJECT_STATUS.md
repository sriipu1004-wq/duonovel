# Duonovel Project Status

## 現在地
- Next.js / TypeScript / Supabase 構成で開発中
- /read/[seriesId]/[episodeNumber] は表示成功済み
- /works/[seriesId] は作品ページとして動作中
- 作品ページから読むページへの導線あり
- 朗読者タブあり
- 朗読者固定で目次→読むページへ移動可能
- recordings を使った朗読者表示の土台あり
- テスト朗読データ投入済み
- 再生UIあり
- 15秒戻し / 再生 / 15秒送りあり
- 再生終了時の次話移動あり
- 第2話追加済み
- 本文追尾マーカーの仮実装あり
- 手動スクロールで追尾OFF、現在位置に戻るあり
- しおり保存 / 続きから読む は localStorage 版で実装済み
- BGM再生土台あり
- BGM設定UIあり
- 表示演出設定あり
- BGMは DB 管理化済み
- /manage/bgm/[seriesId] で管理UIから series / episode のBGM変更可能
- play_logs の Supabase 本実装土台は完了
- 認証済みは Supabase、未認証は localStorage 継続方針で確定

## 今正常に動く主要機能
- 作品ページ表示
- 目次表示
- 朗読者タブ
- 朗読者固定導線
- 読むページ表示
- 朗読再生
- 次話移動
- 本文追尾の仮実装
- しおり保存 / 続きから読む
- BGM ON/OFF / 音量
- 表示テーマ / 文字サイズ / 行間
- BGM管理ページ

## 未完成 / 仮実装
- /read ページへの play_logs 実接続
- /works ページの「続きから読む」DB接続
- localStorage → Supabase 移行
- 匿名ユーザーの DB 保存
- FK の厳密化
- 文ごとの本物の timestamp 同期
- 朗読音声DL / 本文PDF 許可制の本実装
- 投稿画面 / 管理画面の本格化
- ランキング
- ジャンル絞り込み
- 検索
- 作者ページ
- 朗読者ページ
- 本番向け認証とRLS整理

## 直近の優先順位
1. /read/[seriesId]/[episodeNumber] に play_logs を接続
2. /works/[seriesId] の「続きから読む」を DB ベースに切り替え
3. 投稿 / 管理系の整備
4. ランキング / ジャンル / 検索

## 子チャット担当
- 1A: 読む画面 / 再生 / 演出
- 2A: 作品ページ / 目次 / 導線
- 3A: DB / 管理 / 投稿
- 4A: その他 / 横断タスク

## 直近の確定事項
- play_logs は 1ユーザー × 1作品 で1行
- unique は (user_id, series_id)
- authenticated のみアクセス可
- 自分の row の select / insert / update / delete のみ許可
- getPlayLogBySeries / savePlayLog / toPlayLogResumeState の仕様整理済み