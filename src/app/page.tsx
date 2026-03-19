// src/app/page.tsx
import { supabase } from '@/lib/supabaseClient';

type Genre = {
  id: number;
  name: string;
};

export default async function Home() {
  const { data: genres, error } = await supabase
    .from('genres') // ← ここから <Genre> を消した
    .select('id, name')
    .order('id', { ascending: true });

  if (error) {
    console.error('ジャンル取得エラー:', error);
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '24px',
        backgroundColor: '#050510',
        color: '#f5f5f5',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      <h1 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '8px' }}>
        デュオノベル
      </h1>
      <p style={{ marginBottom: '24px', opacity: 0.8 }}>
        ※ 接続テスト用：Supabase からジャンル一覧を表示しています
      </p>

      {error && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            backgroundColor: '#331111',
            color: '#ffaaaa',
            marginBottom: '16px',
          }}
        >
          ジャンルの取得中にエラーが発生しました。コンソールを確認してください。
        </div>
      )}

      <section>
        <h2 style={{ fontSize: '20px', marginBottom: '12px' }}>
          登録されているジャンル
        </h2>
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          {genres?.map((g: Genre) => (
            <li
              key={g.id}
              style={{
                padding: '6px 12px',
                borderRadius: '999px',
                border: '1px solid #444',
                fontSize: '14px',
              }}
            >
              {g.name}
            </li>
          ))}
        </ul>

        {!genres?.length && !error && (
          <p style={{ marginTop: '8px', opacity: 0.7 }}>
            ジャンルがまだ登録されていません。
          </p>
        )}
      </section>
    </main>
  );
}
