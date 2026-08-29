/**
 * 朗讀代理。
 *
 * 手機內建的朗讀有兩個擋不掉的問題：沒裝該語言的語音資料就完全不出聲，
 * 而且每支手機的行為都不一樣。改成由伺服器產生 mp3 送回去，
 * 手機只要會播聲音就好。金鑰一樣留在伺服器端。
 *
 * 環境變數：
 *   TRANSLATE_API_KEY   必填，OpenAI 的金鑰（和翻譯共用同一把）
 *   TTS_MODEL           選填，預設 gpt-4o-mini-tts，不支援時自動退回 tts-1
 *   TTS_VOICE           選填，預設 alloy
 *
 * 回傳 audio/mpeg；沒設定金鑰時回 501，前端會自動退回手機內建朗讀。
 */

const DEFAULT_MODEL = 'gpt-4o-mini-tts';
const FALLBACK_MODEL = 'tts-1';
const DEFAULT_VOICE = 'alloy';

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
  if (req.method !== 'POST') return json({ error: '只接受 POST' }, 405);

  const key = env('TRANSLATE_API_KEY');
  // 501 是給前端的信號：伺服器沒得用，請改用手機內建的朗讀
  if (!key) return json({ error: '伺服器尚未設定 TRANSLATE_API_KEY' }, 501);
  if (!key.startsWith('sk-')) {
    return json({ error: '朗讀需要 OpenAI 金鑰，目前這把不是' }, 501);
  }

  let payload: { text?: string; voice?: string; warm?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: '請求內容不是合法的 JSON' }, 400);
  }

  /*
   * 通話接通時前端會先送一個 warm 請求把這支函式叫醒。冷啟動要好幾秒，
   * 第一句話撞上就會被判定逾時、退回手機內建的朗讀——使用者感受到的是
   * 「剛開始不穩，講幾句才會順」。這裡只回應、不去產生音檔，所以不花錢。
   */
  if (payload.warm) return new Response(null, { status: 204 });

  const text = (payload.text || '').trim();
  if (!text) return json({ error: '沒有要朗讀的內容' }, 400);
  // 通話裡一句話不會這麼長；擋住異常請求，免得產生大檔案與費用
  if (text.length > 1000) return json({ error: '單句長度超過上限' }, 400);

  const voice = (payload.voice || env('TTS_VOICE') || DEFAULT_VOICE).trim();
  const model = (env('TTS_MODEL') || DEFAULT_MODEL).trim();

  try {
    let res = await speak(text, model, voice, key);
    // 帳號拿不到新模型時退回舊的，不要讓整個朗讀功能掛掉
    if (!res.ok && model !== FALLBACK_MODEL && isModelProblem(res.status)) {
      res = await speak(text, FALLBACK_MODEL, voice, key);
    }
    if (!res.ok) {
      const detail: any = await res.json().catch(() => ({}));
      return json({ error: detail?.error?.message || `朗讀失敗 HTTP ${res.status}` }, 502);
    }

    const audio = await res.arrayBuffer();
    return new Response(audio, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        // 同一句話重播不必再付一次錢
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
};

/** 語言不必指定，模型會照著文字本身的語言唸。 */
function speak(text: string, model: string, voice: string, key: string) {
  return fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model, voice, input: text, response_format: 'mp3' }),
  });
}

const isModelProblem = (status: number) => status === 400 || status === 404;

export const config = {
  path: '/api/tts',
};
