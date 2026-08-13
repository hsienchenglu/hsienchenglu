/**
 * 把 VAPID 公開金鑰交給前端，讓瀏覽器建立推播訂閱。
 *
 * 公開金鑰本來就是要給所有人的，放前端沒有安全問題；
 * 私密金鑰只留在 VAPID_PRIVATE_KEY，永遠不離開伺服器。
 */

const env = (key: string): string | undefined => {
  const g = globalThis as any;
  return g.Netlify?.env?.get(key) ?? g.process?.env?.[key];
};

export default async () => {
  const key = env('VAPID_PUBLIC_KEY');
  if (!key) {
    return new Response(JSON.stringify({ error: '伺服器尚未設定 VAPID_PUBLIC_KEY' }), {
      status: 501,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
  return new Response(JSON.stringify({ key }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};

export const config = {
  path: '/api/push-key',
};
