import EpisodePlayback from '@/features/playback/EpisodePlayback';

export default function ReadTestPage() {
  return (
    <EpisodePlayback
      seriesTitle="テストシリーズ"
      episodeTitle="第1話 テスト"
      body={`これは read-test 用の仮本文です。

新しい EpisodePlayback コンポーネントの表示確認をしています。`}
    />
  );
}