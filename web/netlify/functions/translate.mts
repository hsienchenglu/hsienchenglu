/**
 * 翻譯代理。
 *
 * 把 API 金鑰留在伺服器端的環境變數裡，前端只送出要翻譯的句子，
 * 這樣金鑰就不會隨著網頁原始碼外流。
 *
 * 環境變數：
 *   TRANSLATE_API_KEY   必填，Google Cloud Translation 或 Gemini 的金鑰
 *   TRANSLATE_PROVIDER  選填，google（預設）或 gemini
 */

const LANG_NAMES: Record<string, string> = {
  'zh-TW': 'Traditional Chinese',
  zh: 'Traditional Chinese',
  id: 'Indonesian',
};

/** 環境變數：優先用 Netlify 執行環境注入的全域物件，本機測試時退回 process.env。 */
const env = (key: string): string | undefined => {
  const g = globalThis as any;
  return g.Netlify?.env?.get(key) ?? g.process?.env?.[key];
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return json({ error: '只接受 POST' }, 405);
  }

  const key = env('TRANSLATE_API_KEY');
  if (!key) {
    // 501 讓前端知道可以退回使用瀏覽器裡設定的金鑰
    return json({ error: '伺服器尚未設定 TRANSLATE_API_KEY' }, 501);
  }

  let payload: { text?: string; from?: string; to?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: '請求內容不是合法的 JSON' }, 400);
  }

  const text = (payload.text || '').trim();
  const from = payload.from || 'zh-TW';
  const to = payload.to || 'id';
  if (!text) return json({ error: '沒有要翻譯的內容' }, 400);
  if (text.length > 2000) return json({ error: '單句長度超過上限' }, 400);

  const provider = (env('TRANSLATE_PROVIDER') || 'google').toLowerCase();

  try {
    const translated =
      provider === 'gemini'
        ? await viaGemini(text, from, to, key)
        : await viaGoogle(text, from, to, key);
    return json({ text: translated });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
};

async function viaGoogle(text: string, from: string, to: string, key: string) {
  const body = new URLSearchParams({ q: text, source: from, target: to, format: 'text' });
  const r = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${key}`, {
    method: 'POST',
    body,
  });
  const data: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error?.message || `翻譯失敗 HTTP ${r.status}`);
  const out = data?.data?.translations?.[0]?.translatedText;
  if (!out) throw new Error('翻譯服務沒有回傳結果');
  return decodeEntities(out);
}

async function viaGemini(text: string, from: string, to: string, key: string) {
  const fromName = LANG_NAMES[from] || from;
  const toName = LANG_NAMES[to] || to;
  const prompt =
    `Translate the following ${fromName} speech transcript into ${toName}. ` +
    'It is one utterance from a live phone conversation, so keep it colloquial and natural. ' +
    'Reply with the translation only, no quotes, no explanation.\n\n' +
    text;

  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 512 },
      }),
    }
  );
  const data: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error?.message || `翻譯失敗 HTTP ${r.status}`);
  const out = (data?.candidates?.[0]?.content?.parts || [])
    .map((p: any) => p.text || '')
    .join('')
    .trim();
  if (!out) throw new Error('翻譯服務沒有回傳結果');
  return out;
}

/** Cloud Translation v2 會把譯文做 HTML 跳脫，這裡還原回來。 */
function decodeEntities(s: string) {
  return s
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

export const config = {
  path: '/api/translate',
};
