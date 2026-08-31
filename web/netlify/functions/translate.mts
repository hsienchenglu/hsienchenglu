/**
 * 翻譯代理。
 *
 * 把 API 金鑰留在伺服器端的環境變數裡，前端只送出要翻譯的句子，
 * 這樣金鑰就不會隨著網頁原始碼外流。
 *
 * 環境變數：
 *   TRANSLATE_API_KEY   必填，Google Cloud Translation、Gemini 或 OpenAI 的金鑰
 *   TRANSLATE_PROVIDER  選填，google（預設）、gemini 或 openai
 *   TRANSLATE_MODEL     選填，僅 gemini／openai 使用，可指定模型名稱
 */

const LANG_NAMES: Record<string, string> = {
  'zh-TW': 'Traditional Chinese',
  zh: 'Traditional Chinese',
  id: 'Indonesian',
  en: 'English',
  'en-US': 'English',
};

/** 環境變數：優先用 Netlify 執行環境注入的全域物件，本機測試時退回 process.env。 */
const env = (key: string): string | undefined => {
  const g = globalThis as any;
  return g.Netlify?.env?.get(key) ?? g.process?.env?.[key];
};

/**
 * 決定要用哪一家翻譯服務。
 *
 * 以 TRANSLATE_PROVIDER 為準；沒設的時候從金鑰格式推斷。
 * OpenAI 的金鑰一律是 sk- 開頭，光憑這點就能認出來——
 * 少一個必填設定，就少一種「金鑰貼對了卻打到別家 API」的失敗。
 */
function resolveProvider(key: string): string {
  const explicit = (env('TRANSLATE_PROVIDER') || '').trim().toLowerCase();
  if (explicit) return explicit;
  if (key.startsWith('sk-')) return 'openai';
  return 'google';
}

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

  const provider = resolveProvider(key);

  try {
    let translated: string;
    if (provider === 'gemini') translated = await viaGemini(text, from, to, key);
    else if (provider === 'openai') translated = await viaOpenAI(text, from, to, key);
    else translated = await viaGoogle(text, from, to, key);
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

/*
 * 模型名稱是最脆弱的一環：打錯字、或哪天服務商把某個版本下架，
 * 整個翻譯就一句都不通。朗讀那支函式本來就有退路，這裡補上同樣的機制。
 * 依序試，遇到「模型有問題」才換下一個；其他錯誤（沒錢、金鑰不對）
 * 換模型也沒用，直接往上拋。
 */
const OPENAI_DEFAULT_MODEL = 'gpt-4o-mini';
const OPENAI_FALLBACK_MODEL = 'gpt-4o';

const isModelProblem = (status: number) => status === 400 || status === 404;

async function viaOpenAI(text: string, from: string, to: string, key: string) {
  const fromName = LANG_NAMES[from] || from;
  const toName = LANG_NAMES[to] || to;

  const chain: string[] = [];
  for (const m of [env('TRANSLATE_MODEL'), OPENAI_DEFAULT_MODEL, OPENAI_FALLBACK_MODEL]) {
    const name = (m || '').trim();
    if (name && !chain.includes(name)) chain.push(name);
  }

  let lastError = '';
  for (let i = 0; i < chain.length; i++) {
    const r = await askOpenAI(text, fromName, toName, chain[i], key);
    const data: any = await r.json().catch(() => ({}));
    if (r.ok) {
      const out = (data?.choices?.[0]?.message?.content || '').trim();
      if (out) return out;
      lastError = '翻譯服務沒有回傳結果';
      continue;   // 這個模型回了空的，換下一個試試
    }
    lastError = data?.error?.message || `翻譯失敗 HTTP ${r.status}`;
    // 不是模型的問題就別再換模型了，換幾個都一樣的結果
    if (!isModelProblem(r.status) || i === chain.length - 1) break;
  }
  throw new Error(lastError || '翻譯失敗');
}

function askOpenAI(text: string, fromName: string, toName: string, model: string, key: string) {
  return fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            `You translate ${fromName} into ${toName} for a live phone call. ` +
            'Each input is one spoken utterance. Keep it colloquial and natural. ' +
            'Reply with the translation only — no quotes, no explanation, no romanisation.',
        },
        { role: 'user', content: text },
      ],
    }),
  });
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
