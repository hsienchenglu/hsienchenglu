/**
 * 叫醒對方的 Service Worker。
 *
 * 這裡送出的是「無內容推播」：不夾帶任何資料，只是敲一下對方的瀏覽器。
 * 對方的 Service Worker 醒來後會自己去 Firebase 讀來電資訊。
 * 這樣就完全不需要 RFC 8291 的內容加密，也不需要任何 npm 套件——
 * VAPID 的 JWT 簽章用 Web Crypto 就能做完。
 *
 * 環境變數：
 *   VAPID_PUBLIC_KEY   必填，base64url 的未壓縮公鑰（65 bytes）
 *   VAPID_PRIVATE_KEY  必填，base64url 的私鑰（32 bytes）
 *   VAPID_SUBJECT      選填，mailto: 或 https: 開頭的聯絡方式
 */

const env = (key: string): string | undefined => {
  const g = globalThis as any;
  return g.Netlify?.env?.get(key) ?? g.process?.env?.[key];
};

/** 兩次推播之間隔多久。太短會被當成同一次提示，太長對方已經接了。 */
const REPEAT_GAP_MS = 3000;

/**
 * Netlify 免費方案的函式上限是 10 秒，超過會被中斷。
 * 留 2 秒安全邊際，時間不夠就少敲幾次，不要冒著整個函式被砍掉的風險。
 */
const DEADLINE_MS = 8000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/');
  const padded = pad + '='.repeat((4 - (pad.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64url(bytes: Uint8Array | ArrayBuffer): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const textToB64url = (s: string) => bytesToB64url(new TextEncoder().encode(s));

/**
 * 用 VAPID 金鑰簽一個 ES256 的 JWT。
 * 公鑰是未壓縮格式（0x04 || x || y），從中取出 x、y 再配上私鑰 d 組成 JWK。
 */
async function signVapidJwt(audience: string, publicKey: string, privateKey: string, subject: string) {
  const pub = b64urlToBytes(publicKey);
  if (pub.length !== 65 || pub[0] !== 0x04) {
    throw new Error('VAPID_PUBLIC_KEY 格式不正確（應為 65 bytes 的未壓縮公鑰）');
  }

  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: bytesToB64url(pub.slice(1, 33)),
    y: bytesToB64url(pub.slice(33, 65)),
    d: privateKey,
    ext: true,
  };

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const header = textToB64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = textToB64url(
    JSON.stringify({
      aud: audience,
      exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
      sub: subject,
    })
  );
  const signingInput = `${header}.${payload}`;

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${bytesToB64url(signature)}`;
}

function fbUrl(dbUrl: string, path: string, secret?: string) {
  const base = dbUrl.replace(/\/+$/, '');
  const q = secret ? '?auth=' + encodeURIComponent(secret) : '';
  return `${base}/${path}.json${q}`;
}

export default async (req: Request) => {
  if (req.method !== 'POST') return json({ error: '只接受 POST' }, 405);

  const publicKey = env('VAPID_PUBLIC_KEY');
  const privateKey = env('VAPID_PRIVATE_KEY');
  if (!publicKey || !privateKey) {
    // 501 讓前端知道推播還沒設定好，可以安靜略過
    return json({ error: '伺服器尚未設定 VAPID 金鑰' }, 501);
  }

  let body: { to?: string; dbUrl?: string; dbSecret?: string; repeat?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: '請求內容不是合法的 JSON' }, 400);
  }

  const to = (body.to || '').trim();
  const dbUrl = (body.dbUrl || '').trim();
  if (!to || !dbUrl) return json({ error: '缺少 to 或 dbUrl' }, 400);
  if (!dbUrl.startsWith('https://')) return json({ error: 'dbUrl 必須是 https' }, 400);

  // 取出對方的推播訂閱
  let subscription: any = null;
  try {
    const res = await fetch(fbUrl(dbUrl, `users/${to}/push`, body.dbSecret), { cache: 'no-store' });
    if (res.ok) subscription = await res.json();
  } catch (e) {
    return json({ error: '讀取推播訂閱失敗' }, 502);
  }

  if (!subscription || !subscription.endpoint) {
    // 對方沒訂閱推播不算錯誤，可能他就是把網頁開著在等
    return json({ sent: false, reason: '對方沒有推播訂閱' });
  }

  const endpoint: string = subscription.endpoint;
  let audience: string;
  try {
    audience = new URL(endpoint).origin;
  } catch {
    return json({ error: '推播端點格式不正確' }, 400);
  }

  const subject = env('VAPID_SUBJECT') || 'mailto:noreply@example.com';

  let jwt: string;
  try {
    jwt = await signVapidJwt(audience, publicKey, privateKey, subject);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }

  const headers = {
    Authorization: `vapid t=${jwt}, k=${publicKey}`,
    TTL: '60',
    Urgency: 'high',
  };

  // 敲不只一次，跟鈴聲連響的道理一樣——一聲通知音很容易漏掉。
  // 通知用同一個 tag 加上 renotify，所以第二次會取代第一次並重新提示，
  // 不會在通知欄堆成兩則。
  const repeat = Math.min(Math.max(Number(body.repeat) || 2, 1), 5);
  const startedAt = Date.now();
  let sent = 0;

  for (let i = 0; i < repeat; i++) {
    if (i > 0) {
      if (Date.now() - startedAt + REPEAT_GAP_MS > DEADLINE_MS) break;
      await new Promise((r) => setTimeout(r, REPEAT_GAP_MS));
      // 對方已經接聽或撥號方已取消，就不必再敲了
      const stillRinging = await isStillRinging(dbUrl, to, body.dbSecret);
      if (!stillRinging) break;
    }

    const res = await fetch(endpoint, { method: 'POST', headers });

    // 404／410 代表訂閱已失效，順手清掉，避免每次撥號都白打一次
    if (res.status === 404 || res.status === 410) {
      await fetch(fbUrl(dbUrl, `users/${to}/push`, body.dbSecret), { method: 'DELETE' }).catch(() => {});
      return json({ sent: sent > 0, count: sent, reason: '對方的推播訂閱已失效' });
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return json(
        { sent: sent > 0, count: sent, error: `推播服務回應 ${res.status}`, detail: detail.slice(0, 200) },
        sent > 0 ? 200 : 502
      );
    }
    sent++;
  }

  return json({ sent: true, count: sent });
};

/** 來電節點還在，就代表對方還沒接也還沒被取消。 */
async function isStillRinging(dbUrl: string, to: string, secret?: string) {
  try {
    const res = await fetch(fbUrl(dbUrl, `users/${to}/incoming`, secret), { cache: 'no-store' });
    if (!res.ok) return false;
    const data = await res.json();
    return !!(data && data.from);
  } catch {
    return false;
  }
}

export const config = {
  path: '/api/push',
};
