/*
 * 譯通（網頁版）— 中文 ↔ 印尼文即時翻譯通話
 *
 * 訊令與訊息格式刻意和 Android 版完全一致，兩邊可以互相撥號：
 *   users/{帳號}/incoming        來電
 *   calls/{通話ID}/state         ringing / accepted / rejected / ended
 *   calls/{通話ID}/meta          雙方帳號與語言
 *   calls/{通話ID}/msgs/{自動ID} 一句話（原文 + 譯文）
 */
'use strict';

// ───────────────────────────── 設定

const LANGS = {
  zh: { api: 'zh-TW', stt: 'zh-TW', tts: 'zh-TW', key: 'lang_zh' },
  id: { api: 'id', stt: 'id-ID', tts: 'id-ID', key: 'lang_id' },
  en: { api: 'en', stt: 'en-US', tts: 'en-US', key: 'lang_en' },
};
const langLabel = (l) => t(LANGS[l] ? LANGS[l].key : 'lang_zh');

/** 把線路上的語言代碼（zh-TW／id／en-US…）換回內部代號。 */
function langFromApi(code) {
  const c = String(code || '').toLowerCase();
  for (const k of Object.keys(LANGS)) {
    if (c === k || c.startsWith(k + '-') || c.startsWith(LANGS[k].api.toLowerCase())) return k;
  }
  return '';
}

/**
 * 舊版（只有中文和印尼文）沒有宣告自己的語言，只好照舊規則猜。
 * 三種語言之後這個推論不成立，所以只在對方沒宣告時當退路。
 */
const legacyPeerLang = (l) => (l === 'zh' ? 'id' : 'zh');

const DEFAULTS = {
  account: '', peer: '', lang: 'zh', uiLang: '',
  dbUrl: '', dbSecret: '',
  provider: 'google', apiKey: '',
  ring: 2, ringVol: 5, autoListen: true, autoSpeak: true, serverTts: true,
  textSize: 'm',
};

/**
 * 頁面裡可以先烙一個資料庫網址（index.html 的 default-db-url）。
 * 兩邊網址只要差一個字就永遠接不到對方，讓使用者自己打是最容易出錯的一步，
 * 所以預先填好。使用者仍然可以在設定頁改，改成空的就回到這個預設值。
 */
const BAKED_DB_URL = trimUrl(
  (document.querySelector('meta[name="default-db-url"]') || {}).content || ''
);

function trimUrl(u) { return String(u || '').trim().replace(/\/+$/, ''); }

let prefs = loadPrefs();

function loadPrefs() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem('zhid.prefs') || '{}');
  } catch (e) { /* 壞掉就當作沒有 */ }
  const p = Object.assign({}, DEFAULTS, saved);
  if (!p.dbUrl) p.dbUrl = BAKED_DB_URL;
  return p;
}

/**
 * localStorage 寫入的統一入口。
 *
 * 空間滿的時候 setItem 會丟 QuotaExceededError，而原本沒有任何地方接它。
 * 後果比「存不進去」嚴重得多：在 Call.end() 裡，存紀錄排在關閉串流之前，
 * 一丟出來整段就中斷了——SSE 連線關不掉、通話狀態解不開，電話掛不掉。
 *
 * 所以寫入一律走這裡：接住錯誤、騰出空間再試一次、回報成功與否。
 */
const Store = {
  set(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      if (!this.isQuotaError(e)) return false;
      if (!History.freeSpace()) return false;
      try {
        localStorage.setItem(key, value);
        return true;
      } catch (e2) {
        return false;   // 騰過空間還是寫不進去，放棄，但不要往上丟
      }
    }
  },

  /** 各家瀏覽器的名稱和代碼都不一樣，一律認成空間不足。 */
  isQuotaError(e) {
    if (!e) return false;
    return e.name === 'QuotaExceededError'
      || e.name === 'NS_ERROR_DOM_QUOTA_REACHED'
      || e.code === 22 || e.code === 1014;
  },
};

/**
 * 套用字級。所有字都是 rem，所以只要改根元素的大小，整個 App 一起變。
 * 這是給看不清楚小字的人用的——尤其是印尼那邊年紀較長的客戶。
 */
function applyTextSize(size) {
  const root = document.documentElement;
  root.classList.remove('text-l', 'text-xl');
  if (size === 'l') root.classList.add('text-l');
  else if (size === 'xl') root.classList.add('text-xl');
}

function savePrefs() {
  // 設定存不進去是使用者該知道的事——不講的話就變成「設定又跑掉了」
  if (!Store.set('zhid.prefs', JSON.stringify(prefs))) toast(t('err_storage_full'));
}

/** Firebase 的鍵值不能含有 . $ # [ ] / 這些字元；規則和 Android 版一致。 */
function sanitize(account) {
  return String(account || '').trim().toLowerCase().replace(/[.$#[\]/\s]/g, '_');
}

const isConfigured = () => !!(prefs.account && prefs.dbUrl);

// ───────────────────────────── 小工具

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

let toastTimer = null;
function toast(msg) {
  const box = $('toast');
  box.textContent = msg;
  box.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove('show'), 2600);
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  window.scrollTo(0, 0);
}

const fmtDuration = (sec) => {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
};

function fmtTime(ts) {
  const d = new Date(ts), now = new Date();
  const time = d.toTimeString().slice(0, 5);
  if (d.toDateString() === now.toDateString()) return t('today') + ' ' + time;
  const yest = new Date(now.getTime() - 86400000);
  if (d.toDateString() === yest.toDateString()) return t('yesterday') + ' ' + time;
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}

// ───────────────────────────── Firebase REST / SSE

function fbUrl(path, query) {
  if (!prefs.dbUrl) throw new Error('尚未設定資料庫網址');
  const base = prefs.dbUrl.replace(/\/+$/, '');
  const params = [];
  if (prefs.dbSecret) params.push('auth=' + encodeURIComponent(prefs.dbSecret));
  if (query) params.push(query);
  const q = params.length ? '?' + params.join('&') : '';
  return `${base}/${String(path).replace(/^\/+/, '')}.json${q}`;
}

async function fbPut(path, value) {
  const r = await fetch(fbUrl(path), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
  if (!r.ok) throw new Error('資料庫寫入失敗 HTTP ' + r.status);
}

async function fbPush(path, value) {
  const r = await fetch(fbUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
  if (!r.ok) throw new Error('資料庫寫入失敗 HTTP ' + r.status);
  const j = await r.json().catch(() => ({}));
  return j.name || null;
}

async function fbGet(path, query) {
  const r = await fetch(fbUrl(path, query));
  if (!r.ok) throw new Error('資料庫讀取失敗 HTTP ' + r.status);
  return r.json();
}

async function fbDelete(path) {
  const r = await fetch(fbUrl(path), { method: 'DELETE' });
  if (!r.ok) throw new Error('資料庫刪除失敗 HTTP ' + r.status);
}

/**
 * 通話結束後把資料庫上的紀錄刪掉。
 *
 * 每通電話都會在 calls/{callId} 底下留 meta、state，以及 msgs——
 * 也就是雙方講過的每一句話，原文和譯文都在。資料庫規則是公開讀寫的，
 * 網址又烙在網頁裡，這些內容留著只有壞處：別人讀得到，資料庫還會無限長大。
 *
 * 雙方本機都已經存好逐字稿（通話紀錄那一頁），刪掉不會少任何東西。
 */
const CallCleanup = {
  /** 掛斷後隔一下再刪，讓對方先收到「已結束」的訊令 */
  DELAY_MS: 8000,
  /** 沒被正常刪掉的（例如 App 直接被關掉），超過這個時間就在開啟時清掉 */
  MAX_AGE_MS: 6 * 3600 * 1000,
  /** 一次最多刪幾筆，免得拖慢開啟速度 */
  MAX_PER_SWEEP: 50,
  /** 這個專案 2026 年才有，比這更早的時間戳一定是解錯了 */
  MIN_TS: Date.parse('2025-01-01T00:00:00Z'),

  after(callId) {
    if (!callId) return;
    setTimeout(() => {
      fbDelete(`calls/${callId}`).catch(() => { /* 刪不掉就交給下次開啟時掃 */ });
    }, this.DELAY_MS);
  },

  /**
   * callId 的前半段就是建立時間（36 進位的毫秒），所以只要用 shallow
   * 拿一份 id 清單就能判斷新舊，完全不必把通話內容讀下來。
   * 認不出格式的一律留著——寧可漏刪，也不要誤刪。
   */
  async sweep() {
    let ids;
    try {
      ids = await fbGet('calls', 'shallow=true');
    } catch (e) {
      return;   // 讀不到就算了，這只是打掃
    }
    if (!ids || typeof ids !== 'object') return;

    const cutoff = Date.now() - this.MAX_AGE_MS;
    const stale = Object.keys(ids).filter((id) => {
      /*
       * 只檢查「有沒有解出數字」是不夠的：36 進位下字母也是合法數字，
       * 'not-a-timestamp' 會解出 30701（1970 年），照樣被當成很舊的紀錄刪掉。
       * 所以時間必須落在合理範圍內才算數，認不出的一律留著。
       */
      const ts = parseInt(String(id).split('_')[0], 36);
      return Number.isFinite(ts) && ts >= this.MIN_TS && ts < cutoff;
    });

    for (const id of stale.slice(0, this.MAX_PER_SWEEP)) {
      try {
        await fbDelete(`calls/${id}`);
      } catch (e) { /* 下次再試 */ }
    }
  },
};

/**
 * 訂閱節點變動。onEvent(相對路徑, 內容)，內容被刪除時為 null。
 *
 * EventSource 自己會重連，而且重連後 Firebase 會重送整個節點，
 * 所以**斷線期間的訊息不會遺失**，只是會晚一點到。真正的問題是使用者
 * 不知道自己斷線了，還對著沒連線的電話一直講——所以 onError／onOpen
 * 兩個都要接，斷了要講，回來了也要講。
 */
function fbStream(path, onEvent, onError, onOpen) {
  const es = new EventSource(fbUrl(path));
  const handle = (e) => {
    try {
      const d = JSON.parse(e.data);
      onEvent(d.path || '/', d.data);
    } catch (err) {
      /* keep-alive 或格式不符，忽略 */
    }
  };
  es.addEventListener('put', handle);
  es.addEventListener('patch', handle);
  if (onError) es.addEventListener('error', onError);
  if (onOpen) es.addEventListener('open', onOpen);
  return es;
}

// ───────────────────────────── 翻譯

/**
 * 先走 Netlify Function（金鑰放伺服器，不會外流）；
 * 沒有部署函式時，退回用這台裝置設定的金鑰直接呼叫。
 */
/** 過幾百毫秒就可能好的錯誤，值得重試；其餘重試幾次都一樣。 */
const isTransientStatus = (s) => s === 408 || s === 429 || (s >= 500 && s !== 501);

async function translate(text, from, to) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return '';
  if (from === to) return trimmed;

  /*
   * 講電話沒有「等一下再試」的餘地——一句話沒翻出來，那句就沒了。
   * 網路瞬斷、速率限制、伺服器暫時忙碌都是幾百毫秒後就會好的問題，
   * 所以這類失敗自己重試一次再放棄。金鑰錯、內容有問題重試也沒用，
   * 立刻往下走。
   */
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await new Promise((res) => setTimeout(res, 600));
    try {
      const r = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed, from: LANGS[from].api, to: LANGS[to].api }),
      });
      if (r.ok) {
        const j = await r.json();
        if (j.text) return j.text;
        lastErr = new Error(j.error || '翻譯服務沒有回傳結果');
        break;
      }
      // 404／501 代表沒有部署或沒設環境變數，往下用本機金鑰
      if (r.status === 404 || r.status === 501) { lastErr = null; break; }
      const j = await r.json().catch(() => ({}));
      lastErr = new Error(j.error || '翻譯失敗 HTTP ' + r.status);
      if (!isTransientStatus(r.status)) break;
    } catch (e) {
      lastErr = e;   // 連不上，很可能只是瞬斷，值得再試一次
    }
  }
  if (lastErr && !prefs.apiKey) throw lastErr;

  if (!prefs.apiKey) throw new Error('尚未設定翻譯金鑰');
  // OpenAI 金鑰一律 sk- 開頭，選錯服務商時直接用金鑰格式修正
  const provider = prefs.apiKey.startsWith('sk-') ? 'openai' : prefs.provider;
  if (provider === 'gemini') return translateGemini(trimmed, from, to, prefs.apiKey);
  if (provider === 'openai') return translateOpenAI(trimmed, from, to, prefs.apiKey);
  return translateGoogle(trimmed, from, to, prefs.apiKey);
}

async function translateGoogle(text, from, to, key) {
  const body = new URLSearchParams({
    q: text, source: LANGS[from].api, target: LANGS[to].api, format: 'text',
  });
  const r = await fetch('https://translation.googleapis.com/language/translate/v2?key=' + key, {
    method: 'POST', body,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || '翻譯失敗 HTTP ' + r.status);
  const out = j.data?.translations?.[0]?.translatedText;
  if (!out) throw new Error('翻譯服務沒有回傳結果');
  return unescapeHtml(out);
}

async function translateGemini(text, from, to, key) {
  const fromName = from === 'zh' ? 'Traditional Chinese' : 'Indonesian';
  const toName = to === 'zh' ? 'Traditional Chinese' : 'Indonesian';
  const prompt =
    `Translate the following ${fromName} speech transcript into ${toName}. ` +
    'It is one utterance from a live phone conversation, so keep it colloquial and natural. ' +
    'Reply with the translation only, no quotes, no explanation.\n\n' + text;

  const r = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + key,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 512 },
      }),
    }
  );
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || '翻譯失敗 HTTP ' + r.status);
  const out = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
  if (!out) throw new Error('翻譯服務沒有回傳結果');
  return out;
}

async function translateOpenAI(text, from, to, key) {
  const fromName = from === 'zh' ? 'Traditional Chinese' : 'Indonesian';
  const toName = to === 'zh' ? 'Traditional Chinese' : 'Indonesian';

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            `You translate ${fromName} into ${toName} for a live phone call. ` +
            'Each input is one spoken utterance. Keep it colloquial and natural. ' +
            'Reply with the translation only — no quotes, no explanation.',
        },
        { role: 'user', content: text },
      ],
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || '翻譯失敗 HTTP ' + r.status);
  const out = (j.choices?.[0]?.message?.content || '').trim();
  if (!out) throw new Error('翻譯服務沒有回傳結果');
  return out;
}

function unescapeHtml(s) {
  const d = document.createElement('textarea');
  d.innerHTML = s;
  return d.value;
}

// ───────────────────────────── 鈴聲（Web Audio 合成的電話鈴聲）

const Ringer = {
  /*
   * 五段音量。原本寫死 0.22，回報是「太小聲聽不到」——漏接一通就是
   * 漏掉一筆生意，所以預設拉到最大段。
   *
   * 為什麼可以開到 1.2 而不破音：鈴聲是 440 與 480 兩個振盪器疊在
   * 同一個 gain 上，峰值是設定值的兩倍，直接送出去超過 0.5 就會削頂。
   * 這裡在輸出前串一顆限幅器（見 dest()），把峰值壓住，所以推得更大聲
   * 而不會變成刺耳的爆音。單純把數字調大是做不到這件事的。
   */
  LEVELS: [0.20, 0.40, 0.70, 0.95, 1.20],
  /** 試聽時用滑桿的當下數值，不必先儲存 */
  volOverride: 0,
  /** 輸出前的限幅器，只建一次 */
  limiter: null,

  ctx: null,
  timers: [],
  nodes: [],
  idleTimer: 0,
  /** 撥出去時的回鈴音計時器，接通或掛斷才停 */
  ringbackTimer: 0,

  /**
   * 瀏覽器要有使用者互動才允許出聲，所以上線時先把 AudioContext 準備好。
   * 但準備好之後要馬上讓它休眠——AudioContext 只要維持 running，
   * 手機的喇叭線路就一直開著，Android 上聽起來就是通話全程有一層持續的底噪。
   */
  prime() {
    const ok = this.wake();
    if (!this.timers.length) this.idle();
    return ok;
  },

  /**
   * 輸出端。中間串一顆限幅器，把疊加後的峰值壓在 1.0 以內，
   * 這樣音量可以推到平常會削頂的程度，聽起來只是變大聲、不會變破音。
   */
  dest() {
    if (!this.ctx) return null;
    // 極少數瀏覽器沒有這個節點。沒有就直接輸出——聲音小一點總比完全沒鈴聲好
    if (!this.limiter) {
      if (typeof this.ctx.createDynamicsCompressor !== 'function') return this.ctx.destination;
      const c = this.ctx.createDynamicsCompressor();
      c.threshold.value = -8;
      c.knee.value = 6;
      c.ratio.value = 12;      // 接近限幅，超過門檻就幾乎不再增加
      c.attack.value = 0.003;
      c.release.value = 0.12;
      c.connect(this.ctx.destination);
      this.limiter = c;
    }
    return this.limiter;
  },

  /** 目前該用多大聲。試聽時用滑桿的當下值，其餘用已儲存的設定。 */
  peak() {
    const level = this.volOverride || prefs.ringVol || 5;
    return this.LEVELS[Math.min(Math.max(level, 1), this.LEVELS.length) - 1];
  },

  /** 真的要出聲之前叫醒音訊環境。 */
  wake() {
    clearTimeout(this.idleTimer);
    this.idleTimer = 0;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
      this.limiter = null;   // 換了新的音訊環境，舊的限幅器不能再用
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      const r = this.ctx.resume();
      if (r && r.catch) r.catch(() => { /* 尚未取得互動許可 */ });
    }
    return !!this.ctx;
  },

  /** 沒在響鈴就把音訊環境暫停，留一點時間讓最後一聲的尾音放完。 */
  idle() {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.idleTimer = 0;
      if (this.ctx && this.ctx.state === 'running') {
        const r = this.ctx.suspend();
        if (r && r.catch) r.catch(() => { /* 忽略 */ });
      }
    }, 400);
  },

  /** 響 times 次，每次是 2 秒響鈴 + 4 秒靜音，這是一般電話的節奏。 */
  /** vol 有給的話就用它（試聽用），沒給就照設定值。 */
  start(times, vol) {
    this.stop();                    // stop() 會清掉 volOverride，所以要在它之後才設
    this.volOverride = vol || 0;
    if (!this.wake()) return;
    const n = Math.max(1, Math.min(10, times || 2));
    for (let i = 0; i < n; i++) {
      this.timers.push(setTimeout(() => this.oneRing(), i * 6000));
    }
    this.timers.push(setTimeout(() => this.stop(), (n - 1) * 6000 + 2200));
    if (navigator.vibrate) {
      const pattern = [];
      for (let i = 0; i < n; i++) pattern.push(700, 700, 700, 3900);
      try { navigator.vibrate(pattern); } catch (e) { /* 不支援就算了 */ }
    }
  },

  /**
   * 撥出去時的回鈴音，一直響到接通或掛斷為止。
   *
   * 沒有這個的話，撥號的人只看得到「撥號中…」四個字，聽不到任何聲音，
   * 會以為根本沒撥出去。按下撥號本身就是使用者動作，所以出得了聲。
   */
  startRingback() {
    this.stopRingback();
    if (!this.wake()) return;
    const tick = () => {
      // 固定比來電鈴聲小一截——這是貼著耳朵聽的，但仍跟著音量設定走
      this.oneRing(this.peak() * 0.4);
      this.ringbackTimer = setTimeout(tick, 6000);
    };
    tick();
  },

  stopRingback() {
    clearTimeout(this.ringbackTimer);
    this.ringbackTimer = 0;
  },

  oneRing(vol) {
    const ctx = this.ctx;
    if (!ctx) return;
    const peak = vol || this.peak();
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(peak, ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(peak, ctx.currentTime + 1.9);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 2);
    gain.connect(this.dest() || ctx.destination);

    [440, 480].forEach((f) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      osc.connect(gain);
      osc.start();
      osc.stop(ctx.currentTime + 2.05);
      this.nodes.push(osc);
    });
    this.nodes.push(gain);
  },

  stop() {
    this.volOverride = 0;
    this.stopRingback();
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.nodes.forEach((n) => { try { n.stop ? n.stop() : n.disconnect(); } catch (e) { /* 已停止 */ } });
    this.nodes = [];
    if (navigator.vibrate) { try { navigator.vibrate(0); } catch (e) { /* 不支援 */ } }
    this.idle();
  },
};

// ───────────────────────────── 推播（網頁關著也收得到來電）

const Push = {
  reg: null,
  enabled: false,

  supported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  },

  /** 電腦（不是手機）。電腦有自己的坑：視窗關掉就沒有東西在跑。 */
  isDesktop() {
    return !/iPad|iPhone|iPod|Android/.test(navigator.userAgent);
  },

  /** 還開在瀏覽器分頁裡，沒有安裝成獨立的應用程式。 */
  notInstalled() {
    try {
      return !window.matchMedia('(display-mode: standalone)').matches
        && window.navigator.standalone !== true;
    } catch (e) {
      return false;
    }
  },

  /** iOS 必須先「加入主畫面」才拿得到推播權限。 */
  needsInstallOnIos() {
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const standalone = window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
    return isIos && !standalone;
  },

  async register() {
    if (!('serviceWorker' in navigator)) return null;
    try {
      this.reg = await navigator.serviceWorker.register('sw.js');
      await this.saveConfig();
      return this.reg;
    } catch (e) {
      console.warn('Service Worker 註冊失敗', e);
      return null;
    }
  },

  /** 目前卡在哪一步——出問題時把這個字串顯示出來就知道要往哪裡查。 */
  async swState() {
    if (!('serviceWorker' in navigator)) return 'unsupported';
    try {
      const reg = this.reg || (await navigator.serviceWorker.getRegistration());
      if (!reg) return 'none';
      if (reg.active) return 'active';
      if (reg.waiting) return 'waiting';
      if (reg.installing) return reg.installing.state;
      return 'none';
    } catch (e) {
      return 'error';
    }
  },

  /**
   * 註冊完成 ≠ 已經啟用。剛註冊回來的 registration，active 還是 null，
   * 這時候去碰 pushManager，Safari 會直接丟
   * 「Getting push subscription requires a service worker」。
   * 所以先等到真的有一個啟用中的 worker 再往下走。
   *
   * 這裡用輪詢而不是只等 navigator.serviceWorker.ready：iOS 上把網頁加到
   * 主畫面之後，ready 有時候永遠不會 resolve，只有直接去問 registration
   * 才問得到真正的狀態。
   */
  async waitActive(ms = 12000) {
    if (!('serviceWorker' in navigator)) return null;
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      let reg = this.reg;
      try {
        if (!reg || !reg.active) reg = (await navigator.serviceWorker.getRegistration()) || reg;
      } catch (e) { /* 這一輪問不到，下一輪再問 */ }
      if (reg) {
        this.reg = reg;
        if (reg.active) return reg;
        // 卡在 waiting 就推它一把，sw.js 收到訊息會自己接手
        if (reg.waiting) {
          try { reg.waiting.postMessage({ type: 'skipWaiting' }); } catch (e) {}
        }
      }
      await new Promise((res) => setTimeout(res, 300));
    }
    return null;
  },

  /**
   * 等不到就把註冊整個清掉重來一次。背景服務卡在壞掉的狀態時
   * （安裝到一半失敗、舊版殘留），只有這招有用。
   */
  async reregister() {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) await r.unregister();
    } catch (e) { /* 清不掉就直接重註冊看看 */ }
    this.reg = null;
    await this.register();
    return this.reg ? this.waitActive(12000) : null;
  },

  /** Service Worker 被推播叫醒時，要靠這份設定才知道去哪裡查來電。 */
  async saveConfig() {
    if (!('caches' in window)) return;
    try {
      const cache = await caches.open('zhid-config');
      const body = JSON.stringify({
        account: sanitize(prefs.account),
        dbUrl: prefs.dbUrl,
        dbSecret: prefs.dbSecret,
        uiLang: UI_LANG,
      });
      await cache.put(
        '/__zhid_config',
        new Response(body, { headers: { 'Content-Type': 'application/json' } })
      );
    } catch (e) {
      /* 存不進去只影響背景通知，不影響前景通話 */
    }
  },

  /** 建立訂閱並寫進 Firebase，讓對方撥號時能叫醒我。 */
  async enable() {
    if (!this.supported()) {
      return { ok: false, reason: t('err_no_push') };
    }
    if (this.needsInstallOnIos()) {
      return { ok: false, reason: t('err_ios_install') };
    }

    const permission = await requestNotificationPermission();
    if (permission !== 'granted') {
      return { ok: false, reason: t('err_no_notify_perm') };
    }

    if (!this.reg) await this.register();
    if (!this.reg) return { ok: false, reason: t('err_sw_failed') };
    if (!(await this.waitActive()) && !(await this.reregister())) {
      return { ok: false, reason: t('err_sw_activating', await this.swState()) };
    }
    await this.saveConfig();

    let serverKey;
    try {
      const r = await fetch('/api/push-key');
      if (r.status === 404 || r.status === 501) {
        return { ok: false, reason: t('err_no_vapid') };
      }
      if (!r.ok) return { ok: false, reason: t('err_push_key', 'HTTP ' + r.status) };
      serverKey = (await r.json()).key;
    } catch (e) {
      return { ok: false, reason: t('err_push_key', e.message) };
    }
    if (!serverKey) return { ok: false, reason: t('err_no_vapid') };

    let sub;
    try {
      sub = await this.reg.pushManager.getSubscription();
      if (!sub) {
        sub = await this.reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: b64ToBytes(serverKey),
        });
      }
    } catch (e) {
      // 金鑰換過時舊訂閱會失效，退掉重來一次
      try {
        const old = await this.reg.pushManager.getSubscription();
        if (old) await old.unsubscribe();
        sub = await this.reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: b64ToBytes(serverKey),
        });
      } catch (e2) {
        return { ok: false, reason: t('err_push_sub', e2.message) };
      }
    }

    try {
      await fbPut(`users/${sanitize(prefs.account)}/push`, JSON.parse(JSON.stringify(sub)));
    } catch (e) {
      return { ok: false, reason: t('err_push_save', e.message) };
    }

    this.enabled = true;
    return { ok: true };
  },

  /** 撥號時順手敲對方一下，讓他的手機跳出通知。 */
  async wake(peerKey) {
    try {
      await fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: peerKey,
          dbUrl: prefs.dbUrl,
          dbSecret: prefs.dbSecret,
          repeat: prefs.ring, // 和「連續響幾次」用同一個設定
        }),
      });
    } catch (e) {
      /* 推播失敗不影響通話本身：對方只要開著網頁就收得到 */
    }
  },
};

/**
 * 舊版 Safari 的 requestPermission 只吃 callback 不回傳 Promise，
 * 而且某些環境下兩種都不會回應——加上逾時，避免按鈕永遠卡在「啟用中」。
 */
function requestNotificationPermission() {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value || Notification.permission);
    };
    setTimeout(() => finish(Notification.permission), 20000);
    try {
      const maybePromise = Notification.requestPermission(finish);
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then(finish).catch(() => finish(Notification.permission));
      }
    } catch (e) {
      finish(Notification.permission);
    }
  });
}

function b64ToBytes(base64) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// ───────────────────────────── 版本更新提示

/**
 * 網頁版最大的好處是「更新一次，所有人都是新版」，但前提是使用者
 * 真的重新載入過。加到主畫面之後頁面常常一直開著，不重開就一直是舊版。
 *
 * 作法：把版本戳記烙在頁面裡（index.html 的 app-version），
 * 再定期去問伺服器上的 version.json。兩者不同就代表手上這份是舊的。
 */
const Updater = {
  baked: (document.querySelector('meta[name="app-version"]') || {}).content || '',
  lastCheck: 0,
  shown: false,

  init() {
    if (!this.baked || this.baked === 'dev') return; // 開發中不檢查
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.check();
    });
    setInterval(() => this.check(), 30 * 60 * 1000);
    setTimeout(() => this.check(), 5000); // 開啟後先確認一次
  },

  async check() {
    if (this.shown || Call.active) return; // 通話中不要打擾
    if (Date.now() - this.lastCheck < 5 * 60 * 1000) return;
    this.lastCheck = Date.now();

    let latest = null;
    try {
      const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
      if (r.ok) latest = (await r.json()).version;
    } catch (e) {
      return; // 沒網路就算了，下次再說
    }
    if (latest && latest !== this.baked) {
      this.shown = true;
      $('updateBar').classList.remove('hidden');
    }
  },

  async apply() {
    // 順手叫 Service Worker 也去抓新版，再整頁重新載入
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) await reg.update();
    } catch (e) { /* 沒有也無所謂 */ }
    location.reload();
  },
};

// ───────────────────────────── 語音辨識與朗讀

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

/** 一個取樣的無聲 WAV，只拿來解鎖播放權限 */
const SILENT_CLIP =
  'data:audio/wav;base64,UklGRiUAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQEAAACA';

const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/*
 * 每啟動一次語音辨識就發一聲提示音的是 Android，那是系統發的、網頁關不掉。
 * 判斷要針對 Android 本身，不能寫成「不是 iPhone 就是它」——
 * 電腦也不是 iPhone，但電腦不會叮，不該跟著被限制。
 */
const IS_ANDROID = /Android/.test(navigator.userAgent);

const Speech = {
  rec: null,
  want: false,
  speaking: false,
  starting: false,
  voices: [],

  /** 連續「開始後馬上就結束」的次數，用來判斷辨識服務是不是壞了 */
  rapidFails: 0,
  lastStartAt: 0,
  /** 朗讀沒有回報結束時的保險計時器，見 utter() */
  speakWatchdog: 0,
  /** 檢查朗讀到底有沒有真的開始的計時器 */
  startCheck: 0,
  /** 目前這一句，重試前要先把它的處理函式拆掉 */
  cur: null,
  /** 這一句的編號，用來忽略已經過期的回應（例如新訊息蓋掉舊的） */
  seq: 0,
  /** 正在播的 mp3 */
  audio: null,
  audioUrl: '',
  /** 已經跟伺服器要過的句子，重播不必再付一次錢 */
  ttsCache: new Map(),
  /** 一律重複使用同一個 audio 元素——手機只認得被解鎖過的那一個 */
  audioEl: null,
  unlocked: false,
  /** 上一句實際上是誰唸的：server（網路語音）或 builtin（手機內建） */
  lastSource: '',
  /** 因為切到背景而暫停，回到前景要自動接回去 */
  pausedByHide: false,
  /** 語音清單的 voiceschanged 只掛一次 */
  voicesHooked: false,
  /** 伺服器朗讀的函式這通電話有沒有先叫醒過 */
  warmed: false,
  /** 這一段辨識有沒有真的辨識出東西，用來判斷是不是在空轉 */
  emptyRuns: 0,
  /** 引擎還沒確認的即時稿。引擎卡住時，這是唯一還留得住的內容 */
  lastInterim: '',
  /** 安靜多久之後就把即時稿補送出去 */
  interimTimer: 0,
  /** 上次更新畫面的時間，用來節流 */
  partialAt: 0,
  /** 剛剛補送出去的內容，用來擋掉引擎慢一步才吐出來的同一句話 */
  justFlushed: '',
  justFlushedAt: 0,

  supported() { return !!SR; },

  /**
   * 通話一開始就先把朗讀「熱機」。前幾句唸不出來、要講幾句才穩，
   * 幾乎都是這兩件事還沒好：
   *
   *  - 手機的語音清單是非同步載入的，第一次拿到的是空陣列，
   *    挑不到聲音就可能整句不出聲。
   *  - 伺服器朗讀的函式是冷的，第一次要等好幾秒，等到保險時間到
   *    就被判定失敗、退回內建朗讀了。
   *
   * 兩件都在接通當下先做掉，第一句就跟第十句一樣穩。
   */
  warmUp() {
    try {
      const synth = window.speechSynthesis;
      if (synth) {
        this.voices = synth.getVoices() || [];
        if (!this.voices.length && !this.voicesHooked) {
          this.voicesHooked = true;
          synth.addEventListener('voiceschanged', () => {
            this.voices = synth.getVoices() || [];
          });
        }
      }
    } catch (e) { /* 拿不到就等真的要唸的時候再取 */ }

    // warm 這個旗標讓函式醒過來就好，不會真的去產生音檔，不花錢
    if (prefs.serverTts && !this.warmed) {
      this.warmed = true;
      fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warm: 1 }),
      }).catch(() => { /* 叫不醒就照舊，只是第一句會慢一點 */ });
    }
  },

  /**
   * 手機瀏覽器規定聲音要由使用者的動作觸發。通話中的朗讀是網路訊息觸發的，
   * 沒有這道解鎖就會靜靜地不出聲，而且不報錯——測試時按按鈕唸得出來、
   * 真的通話卻沒聲音，就是這個原因。
   *
   * 解法是在使用者第一次點畫面時，先播一段無聲的音檔、也讓朗讀引擎動一次，
   * 之後程式自己觸發的播放就會被允許。
   */
  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    try {
      const a = this.el();
      a.src = SILENT_CLIP;
      const p = a.play();
      if (p && p.catch) p.catch(() => { /* 有些瀏覽器本來就不需要解鎖 */ });
    } catch (e) { /* 忽略 */ }
    try {
      if (window.speechSynthesis) {
        const u = new SpeechSynthesisUtterance(' ');
        u.volume = 0;
        speechSynthesis.speak(u);
      }
    } catch (e) { /* 忽略 */ }
  },

  /** 同一個元素從頭用到尾，換句話只換 src。 */
  el() {
    if (!this.audioEl) {
      this.audioEl = new Audio();
      this.audioEl.preload = 'auto';
    }
    return this.audioEl;
  },

  loadVoices() {
    if (!window.speechSynthesis) return;
    this.voices = speechSynthesis.getVoices();
    speechSynthesis.onvoiceschanged = () => { this.voices = speechSynthesis.getVoices(); };
  },

  pickVoice(tag) {
    const want = tag.toLowerCase();
    const base = want.split('-')[0];
    return (
      this.voices.find((v) => v.lang.toLowerCase() === want) ||
      this.voices.find((v) => v.lang.toLowerCase().replace('_', '-').startsWith(base)) ||
      null
    );
  },

  start() {
    if (!SR) {
      toast(t('err_no_stt'));
      return;
    }
    this.want = true;
    // 使用者親自按下麥克風時，不管前面卡在什麼狀態都先清乾淨。
    // 沒有這一段的話，只要朗讀那邊卡住一次，麥克風就再也叫不起來。
    if (this.speaking) this.stopSpeaking();
    this.rapidFails = 0;
    this.begin();
  },

  begin() {
    if (!this.want || this.speaking || this.rec || this.starting) return;
    // 分頁被切到背景時不要重啟，iOS 會直接把行程收掉
    if (document.hidden) return;

    this.starting = true;
    this.lastStartAt = Date.now();

    const rec = new SR();
    rec.lang = LANGS[prefs.lang].stt;
    /*
     * 即時結果三個平台都要開。以前 iOS 是關的（事件太密集會拖慢畫面），
     * 但那等於「引擎不給最終結果，講過的話就完全不存在」——引擎一卡住，
     * 使用者按停止也送不出東西，因為程式手上根本沒有稿子。
     *
     * 現在改成一律留著即時稿當底牌，畫面更新則另外節流，兼顧兩邊。
     */
    rec.interimResults = true;
    /*
     * Android 每重新啟動一次辨識就會發出一聲提示音。單次模式下講完一句
     * 或靜默幾秒就結束，接著馬上重啟，整通電話就變成一直有雜音。
     * 改成連續辨識可以大幅減少重啟次數。iOS 的連續模式很不穩，維持單次。
     */
    rec.continuous = !IS_IOS;
    rec.maxAlternatives = 1;

    // 這一段辨識有沒有講出東西——沒有的話就不要一直自動重開，那是空轉
    let gotFinal = false;

    rec.onresult = (e) => {
      let interim = '', final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (interim) {
        this.lastInterim = interim;
        // iOS 的即時事件很密集，畫面更新節流一下，不然會拖慢整個頁面
        const now = Date.now();
        if (now - this.partialAt > 120) {
          this.partialAt = now;
          Call.showPartial(interim);
        }
        /*
         * 講完話之後引擎有時候就是不給最終結果，麥克風一直開著不關。
         * 安靜超過這段時間就當作話講完了，用即時稿補送出去。
         */
        clearTimeout(this.interimTimer);
        this.interimTimer = setTimeout(() => {
          if (this.flushInterim()) this.restart();
        }, 2500);
      }
      if (final.trim()) {
        const text = final.trim();
        this.rapidFails = 0; // 有辨識出東西，代表服務是好的
        this.emptyRuns = 0;
        gotFinal = true;
        this.lastInterim = '';
        clearTimeout(this.interimTimer);
        this.interimTimer = 0;
        Call.showPartial('');
        // 剛剛已經用即時稿補送過的話，引擎慢一步才吐出來就不要再送一次
        if (!this.isDuplicate(text)) Call.sendUtterance(text);
      }
    };

    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.want = false;
        toast(t('err_mic_permission'));
      } else if (e.error === 'network') {
        toast(t('err_stt_network'));
      }
      // no-speech / aborted 屬正常情況，交給 onend 重啟
    };

    rec.onend = () => {
      this.rec = null;
      this.starting = false;
      // 引擎沒給最終結果就收掉這一段，講過的話還在即時稿裡，補送出去
      if (!gotFinal && this.flushInterim()) gotFinal = true;
      if (!this.want || this.speaking) { Call.micUI(false); return; }

      // 開始不到 0.6 秒就結束，代表辨識服務其實沒在運作。
      // 這種情況下原本會每 0.2 秒重試一次，等於每秒建立五個辨識物件，
      // 在 iPhone 上很快就把行程拖垮——改成指數退避，連續失敗就停手。
      // 有辨識出東西就不算失敗，不管它結束得多快——講得短不是壞掉
      if (!gotFinal && Date.now() - this.lastStartAt < 600) {
        this.rapidFails++;
        if (this.rapidFails >= 6) {
          this.want = false;
          this.rapidFails = 0;
          Call.micUI(false);
          toast(t('err_stt_stopped'));
          return;
        }
        setTimeout(() => this.begin(), Math.min(400 * 2 ** (this.rapidFails - 1), 5000));
        return;
      }

      /*
       * 正常結束＝使用者講完停下來了。要不要自動接著開下一段，看平台：
       *
       * Android 每啟動一次語音辨識就會發出一聲提示音，那是系統發的，
       * 網頁沒有權限關掉。自動重開等於整通電話一直在叮，所以只有它維持
       * 「按一下開始講、講完再按一下」。它本來就是連續辨識，
       * 一句講完就會送出，不必等這一段結束。
       *
       * 其他平台（iPhone、電腦）都沒有那個提示音，自動接下一段是免費的。
       * 不自動接的話，使用者每講一句都要重按一次麥克風，感覺就像
       * 「要等麥克風關掉，話才送得出去」。
       */
      this.rapidFails = 0;
      this.emptyRuns = gotFinal ? 0 : this.emptyRuns + 1;

      // 連續幾段都沒講半個字就收手，免得沒人講話時一直空轉耗電
      if (!IS_ANDROID && Call.active && this.emptyRuns < 4) {
        setTimeout(() => this.begin(), 150);
        return;
      }

      this.emptyRuns = 0;
      this.want = false;
      Call.micUI(false);
      // 麥克風是自己收掉的，不是使用者按的，講一聲免得對著沒開的麥克風說話
      if (Call.active) toast(t('mic_auto_off'));
    };

    try {
      rec.start();
      this.rec = rec;
      this.starting = false;
      Call.micUI(true);
    } catch (e) {
      this.starting = false;
      this.rec = null;
      this.rapidFails++;
      if (this.rapidFails >= 6) {
        this.want = false;
        this.rapidFails = 0;
        Call.micUI(false);
        toast(t('err_stt_start'));
      } else {
        setTimeout(() => this.begin(), 800);
      }
    }
  },

  /**
   * 把引擎還沒確認、但使用者顯然已經講完的那段話送出去。
   *
   * 這是「按了停止卻什麼都沒送出」的解法：以前手上只有引擎給的最終結果，
   * 引擎不給就完全沒東西可送；現在即時稿一直留著，隨時補得出來。
   */
  flushInterim() {
    clearTimeout(this.interimTimer);
    this.interimTimer = 0;
    const text = (this.lastInterim || '').trim();
    this.lastInterim = '';
    if (!text) return false;

    this.justFlushed = text;
    this.justFlushedAt = Date.now();
    this.rapidFails = 0;
    this.emptyRuns = 0;   // 有講出東西，不算空轉
    Call.showPartial('');
    Call.sendUtterance(text);
    return true;
  },

  /** 補送過的內容，引擎晚一步才確認同一句話——擋掉，不要送兩次。 */
  isDuplicate(text) {
    if (!this.justFlushed) return false;
    if (Date.now() - this.justFlushedAt > 8000) return false;
    const norm = (s) => String(s).replace(/[\s,.!?;:，。！？、；：]/g, '');
    const a = norm(this.justFlushed);
    const b = norm(text);
    return !!a && !!b && (a === b || a.includes(b) || b.includes(a));
  },

  /** 重開一段辨識。用 abort 而不是 stop，這一段的結果就不會再吐出來重複送。 */
  restart() {
    if (!this.want) return;
    const rec = this.rec;
    this.rec = null;
    this.starting = false;
    if (rec) {
      rec.onend = rec.onresult = rec.onerror = null;
      try { rec.abort(); } catch (e) { /* 已經停了 */ }
    }
    setTimeout(() => this.begin(), 150);
  },

  stop() {
    this.want = false;
    // 使用者按停止＝話講完了。還沒送出去的先補送，再收掉辨識
    this.flushInterim();
    this.kill();
    Call.micUI(false);
  },

  kill() {
    this.starting = false;
    clearTimeout(this.interimTimer);
    this.interimTimer = 0;
    this.lastInterim = '';
    if (this.rec) {
      this.rec.onend = null;
      try { this.rec.stop(); } catch (e) { /* 已停止 */ }
      this.rec = null;
    }
  },

  toggle() { this.want ? this.stop() : this.start(); },

  /** 朗讀時先關麥克風，否則會把喇叭的聲音再辨識一次，造成無限迴圈。 */
  speak(text, lang) {
    if (!text) return;
    this.speaking = true;
    this.kill();
    this.stopAudio();
    Call.micUI(false);
    this.seq++;
    if (prefs.serverTts) this.speakViaServer(text, lang, this.seq);
    else if (window.speechSynthesis) this.utter(text, lang, 1);
    else this.finishSpeaking();
  },

  /**
   * 用伺服器產生的 mp3 朗讀。
   *
   * 手機內建的朗讀要看有沒有裝該語言的語音資料，沒裝就整個不出聲，
   * 而且每支手機行為都不一樣。改成播 mp3 之後，只要手機會出聲就會唸。
   * 任何一個環節失敗都退回手機內建的朗讀，不會變成完全沒聲音。
   */
  async speakViaServer(text, lang, seq) {
    const stale = () => seq !== this.seq;

    clearTimeout(this.speakWatchdog);
    // 網路慢或函式掛掉時不能無限等，時間到就改用手機內建的唸
    this.speakWatchdog = setTimeout(() => {
      if (!stale()) this.fallbackSpeak(text, lang, seq);
    }, 7000);

    let blob = this.ttsCache.get(text);
    if (!blob) {
      try {
        const r = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        blob = await r.blob();
        if (!blob || !blob.size) throw new Error('空的音檔');
        this.cacheTts(text, blob);
      } catch (e) {
        if (!stale()) this.fallbackSpeak(text, lang, seq);
        return;
      }
    }
    if (stale()) return;

    const url = URL.createObjectURL(blob);
    const a = this.el();
    a.onended = a.onerror = a.onloadedmetadata = null;
    a.src = url;
    this.audio = a;
    this.audioUrl = url;

    const release = () => {
      if (this.audioUrl === url) { this.audio = null; this.audioUrl = ''; }
      URL.revokeObjectURL(url);
    };
    a.onended = () => { release(); if (!stale()) this.finishSpeaking(); };
    a.onerror = () => { release(); if (!stale()) this.fallbackSpeak(text, lang, seq); };
    a.onloadedmetadata = () => {
      // 知道實際長度之後才好抓保險時間，太短會把還在唸的句子切掉
      if (stale() || !isFinite(a.duration)) return;
      clearTimeout(this.speakWatchdog);
      this.speakWatchdog = setTimeout(() => {
        if (!stale()) this.finishSpeaking();
      }, a.duration * 1000 + 3000);
    };

    try {
      const p = a.play();
      this.lastSource = 'server';
      if (p && p.catch) {
        p.catch(() => { release(); if (!stale()) this.fallbackSpeak(text, lang, seq); });
      }
    } catch (e) {
      release();
      if (!stale()) this.fallbackSpeak(text, lang, seq);
    }
  },

  /** 伺服器朗讀走不通時，退回手機內建的。 */
  fallbackSpeak(text, lang, seq) {
    if (seq !== this.seq) return;
    this.stopAudio();
    if (window.speechSynthesis) this.utter(text, lang, 1);
    else this.finishSpeaking();
  },

  /** 同一句話（例如點訊息重聽）不必再跟伺服器要一次，省錢也省等待。 */
  cacheTts(text, blob) {
    this.ttsCache.set(text, blob);
    while (this.ttsCache.size > 20) {
      this.ttsCache.delete(this.ttsCache.keys().next().value);
    }
  },

  stopAudio() {
    if (!this.audio) return;
    const a = this.audio;
    a.onended = a.onerror = a.onloadedmetadata = null;
    try { a.pause(); } catch (e) { /* 忽略 */ }
    if (this.audioUrl) URL.revokeObjectURL(this.audioUrl);
    this.audio = null;   // 元素本身留著，解鎖狀態才不會丟掉
    this.audioUrl = '';
  },

  /**
   * 手機上的朗讀有好幾種「安靜地失敗」的方式，這裡一次擋掉：
   *
   *  - Chrome 有時候會停在 paused，speak() 進得去卻不出聲 → 先 resume()
   *  - 前一句沒收乾淨會把整個佇列卡住 → 先 cancel() 清一次
   *  - Android 的語音清單是非同步載入的，第一次拿到的是空陣列 → 用時再取
   *  - 有時候 speak() 呼叫了完全沒動靜（沒裝語音資料、引擎當掉）
   *    → 900 毫秒內沒開始就重試一次，再不行就明講原因，不要默默沒聲音
   */
  utter(text, lang, attempt) {
    const synth = window.speechSynthesis;

    // 清掉上一句的處理函式，否則等一下的 cancel() 會被當成「唸完了」
    if (this.cur) {
      this.cur.onstart = this.cur.onend = this.cur.onerror = null;
      this.cur = null;
    }
    try { if (synth.paused) synth.resume(); } catch (e) { /* 忽略 */ }
    try { synth.cancel(); } catch (e) { /* 忽略 */ }

    if (!this.voices.length) this.voices = synth.getVoices() || [];

    const u = new SpeechSynthesisUtterance(text);
    u.lang = LANGS[lang].tts;
    u.rate = 0.95;
    const v = this.pickVoice(LANGS[lang].tts);
    if (v) u.voice = v;
    this.cur = u;

    let started = false;
    u.onstart = () => { started = true; this.lastSource = 'builtin'; clearTimeout(this.startCheck); };
    const done = () => {
      if (synth.speaking || synth.pending) return;
      this.finishSpeaking();
    };
    u.onend = done;
    u.onerror = done;

    /*
     * 沒有這道保險的話：瀏覽器不回報 onend／onerror 時（句子偏長、缺語音、
     * 朗讀途中切到背景都會發生），speaking 會永遠停在 true，麥克風再也打不開。
     */
    clearTimeout(this.speakWatchdog);
    this.speakWatchdog = setTimeout(() => {
      try { synth.cancel(); } catch (e) { /* 忽略 */ }
      this.finishSpeaking();
    }, Math.min(5000 + text.length * 250, 30000));

    clearTimeout(this.startCheck);
    this.startCheck = setTimeout(() => {
      if (started || synth.speaking) return;
      if (attempt < 2) { this.utter(text, lang, attempt + 1); return; }
      toast(v ? t('err_tts_silent') : t('err_tts_voice', langLabel(lang)));
      this.finishSpeaking();
    }, 900);

    synth.speak(u);
  },

  /** 朗讀結束（或被保險機制強制結束）後回到聆聽狀態。 */
  finishSpeaking() {
    clearTimeout(this.speakWatchdog);
    clearTimeout(this.startCheck);
    this.speakWatchdog = 0;
    this.startCheck = 0;
    this.cur = null;
    this.stopAudio();
    this.speaking = false;
    if (this.want) setTimeout(() => this.begin(), 250);
  },

  stopSpeaking() {
    clearTimeout(this.speakWatchdog);
    clearTimeout(this.startCheck);
    this.speakWatchdog = 0;
    this.startCheck = 0;
    this.seq++;              // 讓還在飛的回應失效
    this.stopAudio();
    if (this.cur) {
      this.cur.onstart = this.cur.onend = this.cur.onerror = null;
      this.cur = null;
    }
    if (window.speechSynthesis) { try { speechSynthesis.cancel(); } catch (e) { /* 忽略 */ } }
    this.speaking = false;
  },
};

// ───────────────────────────── 聆聽指示動畫

const Wave = {
  canvas: null, ctx: null, raf: 0, level: 0, active: false, phase: 0,
  w: 0, h: 0,

  init() {
    this.canvas = $('wave');
    this.ctx = this.canvas.getContext('2d');
  },

  setActive(on) {
    this.active = on;
    if (on && !this.raf) this.loop();
    if (!on) this.level = 0;
  },

  bump() { this.level = 1; },

  /**
   * 只有尺寸真的變了才動 canvas.width／height。
   * 每一幀都設定會強制重新配置繪圖緩衝區，一秒 60 次，
   * 在 iPhone 上足以把整個網頁行程的記憶體壓垮。
   */
  resize() {
    const c = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2); // 3x 螢幕沒必要，只是浪費記憶體
    const w = Math.round(c.clientWidth * dpr);
    const h = Math.round(56 * dpr);
    if (w !== this.w || h !== this.h) {
      c.width = this.w = w;
      c.height = this.h = h;
    }
  },

  loop() {
    this.raf = requestAnimationFrame(() => this.loop());
    const c = this.canvas, ctx = this.ctx;
    if (!c || !ctx) return;
    this.resize();
    const w = this.w, h = this.h;
    if (!w || !h) return;
    ctx.clearRect(0, 0, w, h);
    if (!this.active && this.level <= 0.02) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      return;
    }
    this.phase += 0.13;
    this.level *= 0.94;
    const bars = 24, gap = (w / bars) * 0.35, bw = w / bars - gap;
    ctx.fillStyle = '#2FD08A';
    for (let i = 0; i < bars; i++) {
      const idle = 0.12 + 0.1 * Math.abs(Math.sin(this.phase + i * 0.5));
      const amp = Math.max(idle, this.level * Math.abs(Math.sin(this.phase * 1.7 + i * 0.6)));
      const bh = h * amp;
      const x = i * (bw + gap), y = (h - bh) / 2;
      ctx.beginPath();
      const r = bw / 2;
      ctx.roundRect ? ctx.roundRect(x, y, bw, bh, r) : ctx.rect(x, y, bw, bh);
      ctx.fill();
    }
  },
};

// ───────────────────────────── 通話紀錄

const History = {
  key: 'zhid.history',
  /** 最多保留幾筆。不設上限只是把「空間爆掉」這件事往後延而已 */
  MAX: 300,

  list() {
    try {
      const arr = JSON.parse(localStorage.getItem(this.key) || '[]');
      return arr.sort((a, b) => b.startTs - a.startTs);
    } catch (e) {
      return [];
    }
  },

  save(record) {
    const all = this.list().filter((r) => r.callId !== record.callId);
    all.push(record);
    all.sort((a, b) => b.startTs - a.startTs);

    // 超過上限就連同逐字稿一起丟掉最舊的
    all.slice(this.MAX).forEach((r) => localStorage.removeItem('zhid.t.' + r.callId));
    Store.set(this.key, JSON.stringify(all.slice(0, this.MAX)));
  },

  /**
   * 空間不夠時騰出一些，有清掉東西就回傳 true。
   *
   * 先丟最舊那一半的逐字稿：它們是這裡面最大的東西，而且越舊越不可能
   * 再回去看。通話紀錄本身（時間、對象、長度）很小，盡量留著。
   *
   * 這裡直接呼叫 localStorage，不能走 Store.set——那會繞回來變成無窮遞迴。
   */
  freeSpace() {
    const all = this.list();
    let freed = false;
    for (const r of all.slice(Math.floor(all.length / 2))) {
      const k = 'zhid.t.' + r.callId;
      if (localStorage.getItem(k) !== null) {
        localStorage.removeItem(k);
        freed = true;
      }
    }
    if (freed) return true;

    // 逐字稿都清光了還是不夠，只好連紀錄一起砍到剩最近 20 筆
    if (all.length > 20) {
      try {
        localStorage.setItem(this.key, JSON.stringify(all.slice(0, 20)));
        all.slice(20).forEach((r) => localStorage.removeItem('zhid.t.' + r.callId));
        return true;
      } catch (e) { /* 連砍都砍不動就放棄 */ }
    }
    return false;
  },

  remove(callId) {
    // 先刪逐字稿：就算下一行寫不進去，空間也已經放出來了
    localStorage.removeItem('zhid.t.' + callId);
    Store.set(this.key, JSON.stringify(this.list().filter((r) => r.callId !== callId)));
  },

  clear() {
    this.list().forEach((r) => localStorage.removeItem('zhid.t.' + r.callId));
    localStorage.removeItem(this.key);
  },

  saveTranscript(callId, msgs) {
    if (!msgs.length) return;
    // 存不下就算了——通話紀錄那一列還在，不值得為了逐字稿打斷掛電話的流程
    Store.set('zhid.t.' + callId, JSON.stringify(msgs));
  },

  transcript(callId) {
    try {
      return JSON.parse(localStorage.getItem('zhid.t.' + callId) || '[]');
    } catch (e) {
      return [];
    }
  },

  render() {
    const ul = $('historyList');
    ul.innerHTML = '';
    const all = this.list();
    $('noHistory').classList.toggle('hidden', all.length > 0);
    $('btnClearHistory').classList.toggle('hidden', all.length === 0);

    all.forEach((r) => {
      const li = el('li');
      const missed = !r.answered && r.incoming;
      if (missed) li.classList.add('missed');

      li.appendChild(el('div', 'dir', missed ? '↙' : r.incoming ? '↘' : '↗'));

      const info = el('div', 'info');
      info.appendChild(el('div', 'name', r.peer));
      const meta = missed ? t('call_missed')
        : !r.answered ? t('call_no_answer')
        : t('duration_fmt', fmtDuration(r.durationSec));
      info.appendChild(el(
        'div', 'meta',
        r.msgCount ? `${meta} · ${t('sentence_count', r.msgCount)}` : meta
      ));
      info.appendChild(el('div', 'time', fmtTime(r.startTs)));
      info.onclick = () => Detail.open(r);
      li.appendChild(info);

      const del = el('button', 'del', '🗑');
      del.title = '刪除';
      del.onclick = (e) => {
        e.stopPropagation();
        if (confirm(t('delete_record_q', r.peer))) {
          this.remove(r.callId);
          this.render();
        }
      };
      li.appendChild(del);
      ul.appendChild(li);
    });
  },
};

// ───────────────────────────── 逐字稿頁

const Detail = {
  current: null,

  open(record) {
    this.current = record;
    $('detailTitle').textContent = record.peer || t('history_detail');
    const msgs = History.transcript(record.callId);
    renderTranscript($('detailTranscript'), msgs);
    $('detailEmpty').classList.toggle('hidden', msgs.length > 0);
    showScreen('screenDetail');
  },
};

function renderTranscript(ul, msgs) {
  ul.innerHTML = '';
  msgs.forEach((m) => ul.appendChild(msgBubble(m)));
}

function msgBubble(m) {
  const li = el('li', m.fromMe ? 'mine' : '');
  const b = el('div', 'bubble');
  b.appendChild(el('div', 'src', m.src));
  if (m.dst) b.appendChild(el('div', 'dst', m.dst));
  li.appendChild(b);

  /*
   * 沒送出去的那一句。以前失敗只跳一個提示就把話丟掉，使用者常常
   * 沒注意到，對方也就一直沒收到——講電話時這是最糟的失敗方式。
   * 現在留在畫面上、標成失敗、點一下重送。
   */
  if (m.failed) {
    li.classList.add('failed');
    b.appendChild(el('div', 'retry', t('send_failed_retry')));
    b.classList.add('speakable');
    b.title = t('send_failed_retry');
    b.onclick = () => Call.retry(m);
    return li;
  }

  /*
   * 點一下重聽。自動朗讀有可能因為手機沒裝語音、音量沒開、或引擎當掉而
   * 沒出聲，這裡給一個明確的補救動作——而且是使用者親手點的，
   * 有些瀏覽器只認使用者動作觸發的朗讀。
   */
  if (m.dst) {
    b.classList.add('speakable');
    b.title = t('tap_to_replay');
    b.onclick = () => {
      // 對方的話唸我聽得懂的那一句；自己的話唸送出去的譯文
      Speech.speak(m.dst, LANGS[m.dstLang] ? m.dstLang : prefs.lang);
    };
  }
  return li;
}

// ───────────────────────────── 來電監聽

const Standby = {
  stream: null,
  account: '',
  pending: null,

  start() {
    if (!isConfigured()) return;
    const account = sanitize(prefs.account);
    if (this.stream && this.account === account) return;
    this.stop();
    this.account = account;

    try {
      this.stream = fbStream(
        `users/${account}/incoming`,
        (path, data) => this.onEvent(path, data),
        () => { $('standbyState').textContent = t('standby_reconnecting'); },
        // 沒有這一段的話，斷線一次「重新連線中」就會一直掛在那裡騙人
        () => { $('standbyState').textContent = t('standby_online', prefs.account); }
      );
    } catch (e) {
      toast(e.message);
      return;
    }
    $('standbyState').textContent = t('standby_online', prefs.account);
  },

  stop() {
    if (this.stream) { this.stream.close(); this.stream = null; }
    this.account = '';
    $('standbyState').textContent = t('standby_offline');
  },

  onEvent(path, data) {
    if (!data) {
      // 節點被清空，代表對方取消了來電
      if (this.pending) this.cancel();
      return;
    }
    if (typeof data !== 'object' || !data.callId || !data.from) return;
    if (this.pending && this.pending.callId === data.callId) return;

    // 超過兩分鐘的來電視為殘留（例如對方的網頁當掉沒清乾淨）。
    // 不處理的話，一打開 App 就會跳出一通根本沒人在撥的電話。
    if (data.ts && Date.now() - data.ts > 120000) {
      fbDelete(`users/${this.account}/incoming`).catch(() => {});
      return;
    }

    // 已經在通話中就直接回覆忙線
    if (Call.active) {
      fbPut(`calls/${data.callId}/state`, 'rejected').catch(() => {});
      fbDelete(`users/${this.account}/incoming`).catch(() => {});
      return;
    }

    this.pending = {
      callId: data.callId,
      from: data.from,
      fromLang: langFromApi(data.fromLang) || legacyPeerLang(prefs.lang),
      startTs: Date.now(),
    };
    this.showIncoming();
  },

  showIncoming() {
    const p = this.pending;
    $('incomingPeer').textContent = p.from;
    $('incomingCard').classList.remove('hidden');
    $('incomingPeerBig').textContent = p.from;
    $('incomingLang').textContent = t('speaks', langLabel(p.fromLang));
    showScreen('screenIncoming');
    Ringer.start(prefs.ring);
    notifyIncoming(p.from);
  },

  /**
   * 待機卡片上那行推播狀態。存的是「哪一句」而不是當下的文字，
   * 不然切換介面語言之後那一行會停在舊語言——實測就出現過中文畫面
   * 配一行英文的狀況。
   */
  pushNote: null,
  /** 待機按鈕目前該顯示哪一句（啟用／啟用中／已啟用／重新啟用） */
  alertsBtnKey: 'enable_alerts',

  setPushNote(key, arg, accent) {
    this.pushNote = key ? { key, arg, accent: !!accent } : null;
    this.renderPushNote();
  },

  setAlertsBtn(key) {
    this.alertsBtnKey = key;
    $('btnStandby').textContent = t(key);
  },

  renderPushNote() {
    const el = $('standbyPush');
    if (!this.pushNote) { el.textContent = ''; el.className = 'sub'; return; }
    const { key, arg, accent } = this.pushNote;
    el.textContent = arg == null ? t(key) : t(key, arg);
    el.className = accent ? 'sub accent' : 'sub';
  },

  hideIncoming() {
    Ringer.stop();
    closeNotification();
    $('incomingCard').classList.add('hidden');
    if ($('screenIncoming').classList.contains('active')) showScreen('screenMain');
  },

  accept() {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    this.hideIncoming();
    Ringer.prime();
    // 先宣告語言再改狀態，撥號方收到 accepted 時才讀得到
    fbPut(`calls/${p.callId}/meta/calleeLang`, LANGS[prefs.lang].api)
      .catch(() => { /* 舊版沒這個欄位也不影響通話 */ })
      .then(() => fbPut(`calls/${p.callId}/state`, 'accepted'))
      .catch((e) => toast(e.message));
    fbDelete(`users/${this.account}/incoming`).catch(() => {});
    Call.open({
      callId: p.callId, peer: p.from, incoming: true, accepted: true, peerLang: p.fromLang,
    });
  },

  reject(userRejected) {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    this.hideIncoming();
    fbPut(`calls/${p.callId}/state`, 'rejected').catch(() => {});
    fbDelete(`users/${this.account}/incoming`).catch(() => {});
    if (userRejected) {
      History.save({
        callId: p.callId, peer: p.from, incoming: true,
        startTs: p.startTs, durationSec: 0, answered: false, msgCount: 0,
      });
      History.render();
    }
  },

  cancel() {
    const p = this.pending;
    this.pending = null;
    this.hideIncoming();
    if (p) {
      History.save({
        callId: p.callId, peer: p.from, incoming: true,
        startTs: p.startTs, durationSec: 0, answered: false, msgCount: 0,
      });
      History.render();
    }
  },
};

// 分頁在背景時，用系統通知提醒有來電
let liveNotification = null;
function notifyIncoming(peer) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (!document.hidden) return;
  try {
    liveNotification = new Notification(t('incoming_call'), { body: peer, tag: 'zhid-call', requireInteraction: true });
    liveNotification.onclick = () => { window.focus(); liveNotification.close(); };
  } catch (e) { /* 部分瀏覽器不支援建構式 */ }
}
function closeNotification() {
  if (liveNotification) { try { liveNotification.close(); } catch (e) { /* 忽略 */ } liveNotification = null; }
}

// ───────────────────────────── 通話

const Call = {
  active: false,
  callId: null,
  peer: '',
  incoming: false,
  connected: false,
  ending: false,
  startTs: 0,
  connectedAt: 0,
  msgs: [],
  seen: new Set(),
  stateStream: null,
  msgStream: null,
  /** 兩條串流各自的連線狀態，任一條斷了就算斷線 */
  netUp: { state: false, msgs: false },
  netDown: false,
  /** 目前該顯示哪一個狀態文字（斷線時會被重新連線中蓋過去） */
  statusKey: '',
  timer: null,
  ringTimeout: null,
  wakeLock: null,

  /** 對方宣告的語言；還不知道的時候是空字串 */
  peerLang: '',

  /** 要翻成什麼語言。對方還沒宣告就先用舊規則猜，收到宣告後會自動修正。 */
  get target() { return this.peerLang || legacyPeerLang(prefs.lang); },

  /** 對方的語言可能從來電資訊、meta、或訊息本身得知，哪個先到就用哪個。 */
  setPeerLang(lang) {
    if (!lang || !LANGS[lang] || lang === this.peerLang) return;
    this.peerLang = lang;
    this.langPairUI();
  },

  langPairUI() {
    $('callLangPair').textContent = this.peerLang
      ? t('lang_pair', langLabel(prefs.lang), langLabel(this.peerLang))
      : langLabel(prefs.lang);
  },

  open({ callId, peer, incoming, accepted, peerLang }) {
    this.active = true;
    this.callId = callId;
    this.peer = peer;
    this.incoming = !!incoming;
    this.connected = false;
    this.ending = false;
    this.startTs = Date.now();
    this.msgs = [];
    this.seen = new Set();
    this.peerLang = LANGS[peerLang] ? peerLang : '';

    $('callPeer').textContent = peer;
    this.langPairUI();
    this.netDown = false;
    this.netUp = { state: false, msgs: false };
    this.statusKey = accepted ? 'status_connected' : 'status_calling';
    this.showStatus();
    $('callDuration').textContent = '';
    $('transcript').innerHTML = '';
    $('transcriptEmpty').classList.remove('hidden');
    this.showPartial('');
    this.micUI(false);
    this.speakerUI();
    showScreen('screenCall');
    Wave.init();
    this.keepAwake(true);
    // 撥出去而且還沒接通：放回鈴音，不然撥號的人聽不到任何動靜
    if (!incoming && !accepted) Ringer.startRingback();
    // 趁著還在響鈴、還沒開始講話，先把朗讀該準備的都準備好
    Speech.warmed = false;
    Speech.emptyRuns = 0;
    Speech.warmUp();

    this.watchState();
    this.watchMessages();

    if (accepted) this.onConnected();
    else this.placeOutgoing();

    this.timer = setInterval(() => {
      if (this.connected) {
        $('callDuration').textContent = fmtDuration((Date.now() - this.connectedAt) / 1000);
      }
    }, 1000);
  },

  async placeOutgoing() {
    const peerKey = sanitize(this.peer);
    try {
      await fbPut(`calls/${this.callId}/meta`, {
        caller: sanitize(prefs.account),
        callerLang: LANGS[prefs.lang].api,
        callee: peerKey,
        startTs: this.startTs,
      });
      await fbPut(`calls/${this.callId}/state`, 'ringing');
      await fbPut(`users/${peerKey}/incoming`, {
        callId: this.callId,
        from: sanitize(prefs.account),
        fromLang: LANGS[prefs.lang].api,
        ts: this.startTs,
      });
    } catch (e) {
      toast(t('err_dial', e.message));
      this.end(false);
      return;
    }

    // 對方可能沒開著網頁，敲一下推播把他的手機叫醒
    Push.wake(peerKey);

    this.ringTimeout = setTimeout(() => {
      if (!this.connected && !this.ending) {
        toast(t('call_no_answer'));
        this.end(true);
      }
    }, 45000);
  },

  /**
   * 通話畫面的狀態列。
   *
   * 斷線的訊息不能被「通話中」「翻譯中」這些字蓋掉——那正是使用者最需要
   * 知道的時候。所以狀態統一走這裡，斷線期間一律顯示重新連線中。
   */
  showStatus(key) {
    if (key) this.statusKey = key;
    $('callStatus').textContent = this.netDown
      ? t('status_reconnecting')
      : t(this.statusKey || 'status_connected');
  },

  /** 兩條串流只要有一條斷了就算斷線，兩條都回來才算恢復。 */
  setNet(stream, up) {
    this.netUp[stream] = up;
    const down = !this.netUp.state || !this.netUp.msgs;
    if (down === this.netDown) return;
    this.netDown = down;
    this.showStatus();
  },

  watchState() {
    this.stateStream = fbStream(
      `calls/${this.callId}/state`,
      (path, data) => {
        if (this.ending) return;
        if (data === 'accepted') this.onConnected();
        else if (data === 'rejected') { toast(t('call_rejected')); this.end(false); }
        else if (data === 'ended') { toast(t('call_peer_hung_up')); this.end(false); }
      },
      () => this.setNet('state', false),
      () => this.setNet('state', true)
    );
  },

  watchMessages() {
    this.msgStream = fbStream(
      `calls/${this.callId}/msgs`,
      (path, data) => {
        if (!data) return;
        if (path === '/') {
          // 連線（或重新連線）時會一次送來整包既有訊息，斷線期間的就是這樣補回來的
          Object.keys(data)
            .map((k) => [k, data[k]])
            .sort((a, b) => (a[1].ts || 0) - (b[1].ts || 0))
            .forEach(([k, v]) => this.onRemoteMsg(k, v));
        } else {
          this.onRemoteMsg(path.replace(/^\//, ''), data);
        }
      },
      () => this.setNet('msgs', false),
      () => this.setNet('msgs', true)
    );
  },

  onRemoteMsg(key, o) {
    if (!key || !o || this.seen.has(key)) return;
    this.seen.add(key);
    if (o.from === sanitize(prefs.account)) return; // 自己送的，畫面上已經有了

    // 訊息本身就帶著來源語言，是最可靠的一手資料
    this.setPeerLang(langFromApi(o.srcLang));

    const msg = {
      id: key, fromMe: false,
      src: o.src || '', dst: o.dst || '',
      dstLang: prefs.lang,          // 對方的話已經翻成我的語言
      ts: o.ts || Date.now(),
    };
    this.append(msg);
    if (prefs.autoSpeak && msg.dst) Speech.speak(msg.dst, prefs.lang);
  },

  /** 撥號方一開始不知道對方講什麼，接通後才讀得到對方宣告的語言。 */
  async fetchPeerLang() {
    if (this.peerLang) return;
    try {
      const code = await fbGet(`calls/${this.callId}/meta/calleeLang`);
      this.setPeerLang(langFromApi(code));
    } catch (e) { /* 讀不到就先用舊規則，之後靠訊息裡的 srcLang 修正 */ }
  },

  onConnected() {
    if (this.connected) return;
    this.connected = true;
    this.connectedAt = Date.now();
    clearTimeout(this.ringTimeout);
    Ringer.stopRingback();   // 接通了就別再響
    this.showStatus('status_connected');
    if (!this.incoming) this.fetchPeerLang();
    if (prefs.autoListen) Speech.start();
  },

  /** 重送失敗的那一句：先把失敗的泡泡拿掉，再走一次正常流程。 */
  retry(msg) {
    if (this.ending) return;
    const i = this.msgs.indexOf(msg);
    if (i >= 0) this.msgs.splice(i, 1);
    this.render();
    this.sendUtterance(msg.src);
  },

  /** 從 msgs 重畫整份逐字稿，刪掉或改動某一則之後用。 */
  render() {
    const ul = $('transcript');
    ul.innerHTML = '';
    this.msgs.forEach((m) => ul.appendChild(msgBubble(m)));
    ul.scrollTop = ul.scrollHeight;
    $('transcriptEmpty').classList.toggle('hidden', this.msgs.length > 0);
  },

  /** 沒送出去的話留在畫面上，標成失敗、可以點一下重送。 */
  markFailed(text, reason) {
    toast(reason);
    this.showStatus('status_connected');
    this.append({
      id: 'failed_' + Date.now().toString(36),
      fromMe: true, src: text, dst: '', dstLang: this.target,
      ts: Date.now(), failed: true,
    });
  },

  async sendUtterance(text) {
    if (!text || this.ending) return;
    this.showStatus('status_translating');
    let dst;
    try {
      dst = await translate(text, prefs.lang, this.target);
    } catch (e) {
      this.markFailed(text, e.message);
      return;
    }

    const ts = Date.now();
    let key;
    try {
      key = await fbPush(`calls/${this.callId}/msgs`, {
        from: sanitize(prefs.account),
        srcLang: LANGS[prefs.lang].api,
        dstLang: LANGS[this.target].api,
        src: text, dst, ts,
      });
    } catch (e) {
      // 翻譯成功但送不出去，對方一樣沒收到——這句同樣要留著可以重送
      this.markFailed(text, t('err_send', e.message));
      return;
    }

    if (key) this.seen.add(key);
    this.append({
      id: key || 'local_' + ts, fromMe: true, src: text, dst, dstLang: this.target, ts,
    });
    this.showStatus('status_connected');
  },

  append(msg) {
    this.msgs.push(msg);
    const ul = $('transcript');
    ul.appendChild(msgBubble(msg));
    ul.scrollTop = ul.scrollHeight;
    $('transcriptEmpty').classList.add('hidden');
  },

  showPartial(text) {
    const p = $('partial');
    p.textContent = text;
    p.classList.toggle('hidden', !text);
    if (text) Wave.bump();
  },

  micUI(on) {
    const b = $('btnMic');
    b.classList.toggle('off', !on);
    b.textContent = on ? '🎙' : '🔇';
    $('micHint').textContent = on ? t('mic_on_hint') : t('mic_off_hint');
    Wave.setActive(on);
  },

  speakerUI() {
    $('btnSpeaker').textContent = prefs.autoSpeak ? '🔊' : '🔈';
  },

  async keepAwake(on) {
    try {
      if (on && 'wakeLock' in navigator) {
        this.wakeLock = await navigator.wakeLock.request('screen');
      } else if (this.wakeLock) {
        this.wakeLock.release();
        this.wakeLock = null;
      }
    } catch (e) { /* 不支援或被拒絕都不影響通話 */ }
  },

  end(notifyPeer) {
    if (this.ending) return;
    this.ending = true;
    clearTimeout(this.ringTimeout);
    clearInterval(this.timer);
    Ringer.stopRingback();   // 沒接通就掛掉時，回鈴音也要跟著停

    Speech.stop();
    Speech.stopSpeaking();
    Wave.setActive(false);
    this.keepAwake(false);

    const duration = this.connected ? (Date.now() - this.connectedAt) / 1000 : 0;
    if (notifyPeer) {
      fbPut(`calls/${this.callId}/state`, 'ended').catch(() => {});
      if (!this.connected) fbDelete(`users/${sanitize(this.peer)}/incoming`).catch(() => {});
    }
    // 逐字稿本機已經留著了，資料庫上那份沒有理由繼續放著給人看
    CallCleanup.after(this.callId);

    /*
     * 先關連線再存紀錄。存紀錄會碰 localStorage，而 localStorage 是這一段
     * 裡唯一可能丟例外的東西（空間滿）。萬一真的丟出來，也不能拖累
     * 「把電話掛乾淨」這件事——連線關不掉會一直佔著，比少一筆紀錄嚴重得多。
     */
    if (this.stateStream) { this.stateStream.close(); this.stateStream = null; }
    if (this.msgStream) { this.msgStream.close(); this.msgStream = null; }

    History.save({
      callId: this.callId, peer: this.peer, incoming: this.incoming,
      startTs: this.startTs, durationSec: Math.round(duration),
      answered: this.connected, msgCount: this.msgs.length,
    });
    History.saveTranscript(this.callId, this.msgs);
    History.render();

    this.active = false;
    showScreen('screenMain');
  },
};

// ───────────────────────────── 設定頁

function fillSettings() {
  $('setAccount').value = prefs.account;
  $('setPeer').value = prefs.peer;
  $('setDbUrl').value = prefs.dbUrl;
  $('setDbSecret').value = prefs.dbSecret;
  $('setApiKey').value = prefs.apiKey;
  $('setRing').value = prefs.ring;
  $('setRingVol').value = prefs.ringVol;
  $('ringVolLabel').textContent = t('ring_vol_level', prefs.ringVol);
  $('ringLabel').textContent = t('ring_times', prefs.ring);
  $('setAutoListen').checked = prefs.autoListen;
  $('setAutoSpeak').checked = prefs.autoSpeak;
  $('setServerTts').checked = prefs.serverTts;
  document.querySelector(`input[name="lang"][value="${prefs.lang}"]`).checked = true;
  document.querySelector(`input[name="provider"][value="${prefs.provider}"]`).checked = true;
  document.querySelector(`input[name="uilang"][value="${UI_LANG}"]`).checked = true;
  const sizeRadio = document.querySelector(`input[name="textsize"][value="${prefs.textSize}"]`);
  if (sizeRadio) sizeRadio.checked = true;
  $('testResult').textContent = '';
  $('versionLabel').textContent = t('version_label', Updater.baked || '—');
}

function readSettings() {
  const account = $('setAccount').value.trim();
  if (!account) { toast(t('err_account_required')); return false; }
  const dbUrl = trimUrl($('setDbUrl').value) || BAKED_DB_URL;
  if (dbUrl && !dbUrl.startsWith('https://')) { toast(t('err_db_url')); return false; }

  prefs.account = account;
  prefs.peer = $('setPeer').value.trim();
  prefs.dbUrl = dbUrl;
  prefs.dbSecret = $('setDbSecret').value.trim();
  prefs.apiKey = $('setApiKey').value.trim();
  prefs.lang = document.querySelector('input[name="lang"]:checked').value;
  prefs.provider = document.querySelector('input[name="provider"]:checked').value;
  prefs.ring = parseInt($('setRing').value, 10) || 2;
  prefs.ringVol = parseInt($('setRingVol').value, 10) || 5;
  prefs.autoListen = $('setAutoListen').checked;
  prefs.autoSpeak = $('setAutoSpeak').checked;
  prefs.serverTts = $('setServerTts').checked;
  prefs.uiLang = document.querySelector('input[name="uilang"]:checked').value;
  const size = document.querySelector('input[name="textsize"]:checked');
  if (size) prefs.textSize = size.value;
  savePrefs();
  applyUiLang(prefs.uiLang);
  return true;
}

/**
 * 切換介面語言。除了 data-i18n 的靜態文字，
 * 動態產生的部分（標頭、通話紀錄、狀態列）也要一起重畫。
 */
function applyUiLang(lang) {
  setUiLang(lang || prefs.lang || 'zh');
  applyI18n();
  // 顯示「目前」的語言，不是下一個
  $('btnUiLang').textContent = { zh: '中', id: 'ID', en: 'EN' }[UI_LANG];
  $('langMenu').querySelectorAll('button[data-lang]').forEach((b) => {
    b.classList.toggle('on', b.dataset.lang === UI_LANG);
  });

  refreshHeader();
  History.render();
  $('ringLabel').textContent = t('ring_times', prefs.ring);
  $('standbyState').textContent = Standby.stream
    ? t('standby_online', prefs.account)
    : t('standby_offline');
  Standby.renderPushNote();
  Standby.setAlertsBtn(Standby.alertsBtnKey);
  Call.micUI(Speech.want);

  if (Call.active) {
    Call.langPairUI();
    Call.showStatus(Call.connected ? 'status_connected' : 'status_calling');
  }
  Push.saveConfig(); // Service Worker 的通知也要跟著換語言
}

function refreshHeader() {
  $('myAccountLabel').textContent = prefs.account ? t('my_account', prefs.account) : t('no_account');
  // 一定要有標籤。只寫語言名的話會被當成「介面語言」，
  // 實測就有人以為介面是英文卻顯示 Chinese 是壞掉了。
  $('myLangLabel').textContent = t('my_lang', langLabel(prefs.lang));
  $('setupHint').classList.toggle('hidden', isConfigured());
  $('setupHint').textContent = t(BAKED_DB_URL ? 'setup_hint_account' : 'setup_hint');
  if (prefs.peer && !$('inputPeer').value) $('inputPeer').value = prefs.peer;
}

async function testConnection() {
  if (!readSettings()) return;
  const out = $('testResult');
  $('btnTest').disabled = true;
  out.textContent = t('testing');
  try {
    await fbPut('healthcheck/' + (sanitize(prefs.account) || 'anon'), Date.now());
  } catch (e) {
    out.textContent = t('test_db_fail', e.message);
    $('btnTest').disabled = false;
    return;
  }
  try {
    const sample = await translate('你好', 'zh', 'id');
    out.textContent = t('test_ok', sample);
  } catch (e) {
    out.textContent = t('test_tr_fail', e.message);
  }
  $('btnTest').disabled = false;
}

// ───────────────────────────── 事件接線

function wire() {
  $('btnSettings').onclick = () => { fillSettings(); showScreen('screenSettings'); };
  /*
   * 返回時也存一次。使用者改完設定按返回是很自然的動作，
   * 沒存到就等於白改。帳號沒填之類的情況存不起來，那就直接離開，
   * 主畫面本來就會提示要去設定。
   */
  $('btnSettingsBack').onclick = () => {
    readSettings();          // 存不起來（例如帳號沒填）就算了，主畫面會提示
    Push.saveConfig();
    showScreen('screenMain');
  };
  $('btnSave').onclick = () => {
    if (!readSettings()) return;
    toast(t('saved'));
    Standby.stop();
    Standby.start();
    Push.saveConfig(); // 帳號或資料庫換了，背景通知也要跟著更新
    showScreen('screenMain');
  };
  $('updateBar').onclick = () => Updater.apply();

  /*
   * 語言鍵改成跳選單。原本是「按一下換下一個」，鍵上顯示的是「下一個語言」，
   * 使用者會讀成「現在是這個語言」——三種語言之後這個誤解一定會發生。
   * 現在鍵上顯示的是「目前的語言」，點開就看得到三個選項和打勾的那個。
   */
  const langMenu = $('langMenu');
  const closeLangMenu = () => langMenu.classList.add('hidden');

  $('btnUiLang').onclick = (e) => {
    e.stopPropagation();
    langMenu.classList.toggle('hidden');
  };

  langMenu.querySelectorAll('button[data-lang]').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      closeLangMenu();
      const next = btn.dataset.lang;
      if (next === UI_LANG) return;
      prefs.uiLang = next;
      savePrefs();
      applyUiLang(next);
      toast(t('ui_lang_switched'));
    };
  });

  // 點畫面其他地方就收起來
  document.addEventListener('click', closeLangMenu);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLangMenu(); });

  /*
   * 設定頁的介面語言要「選了就馬上換」。
   * 第一次開網頁會直接停在設定頁，而主畫面的 ID 切換鍵這時候看不到；
   * 若要按了儲存才生效，看不懂中文的人根本找不到儲存鍵在哪。
   */
  /*
   * 「我說的語言」也改成選了就存。原本這格要按儲存才算數，但同一頁的
   * 介面語言卻是即時生效——使用者改完直接按左上角返回，改的東西就沒了。
   * 同一頁兩種行為一定會出事。
   */
  document.querySelectorAll('input[name="lang"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      prefs.lang = radio.value;
      savePrefs();
      refreshHeader();
      Push.saveConfig();
    });
  });

  document.querySelectorAll('input[name="textsize"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      prefs.textSize = radio.value;
      savePrefs();
      applyTextSize(radio.value);
    });
  });

  document.querySelectorAll('input[name="uilang"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      prefs.uiLang = radio.value;
      savePrefs();
      applyUiLang(radio.value);
    });
  });

  // 使用者碰畫面的第一下就解鎖音訊，之後通話中才叫得出聲音
  ['pointerdown', 'click', 'touchend'].forEach((ev) => {
    document.addEventListener(ev, () => Speech.unlock(), { capture: true });
  });

  $('btnTest').onclick = testConnection;

  // 對方的話是用「我說的語言」唸出來的，所以就測這個語言。
  // 唸完順便講清楚用的是哪一種聲音——兩者聽起來可能差不多，
  // 但「退回手機內建」代表伺服器那條路有問題，要看得出來才能修。
  $('btnTestVoice').onclick = () => {
    const lang = document.querySelector('input[name="lang"]:checked').value;
    Speech.lastSource = '';
    Speech.speak(t('tts_test_sample'), lang);
    setTimeout(() => {
      if (Speech.lastSource === 'server') toast(t('tts_via_server'));
      else if (Speech.lastSource === 'builtin') toast(t('tts_via_builtin'));
      else toast(t('tts_via_none'));
    }, 2800);
  };

  // 網頁如果在通話中被系統關掉，Firebase 裡會留下沒清乾淨的來電節點，
  // 之後就會一直跳出假來電或撥不出去。這顆按鈕是給使用者的自救出口。
  $('btnReset').onclick = async () => {
    if (!isConfigured()) { toast(t('err_finish_setup')); return; }
    const btn = $('btnReset');
    btn.disabled = true;
    try {
      await fbDelete(`users/${sanitize(prefs.account)}/incoming`);
      Standby.pending = null;
      Standby.hideIncoming();
      Standby.stop();
      Standby.start();
      toast(t('reset_done'));
    } catch (e) {
      toast(t('reset_fail', e.message));
    }
    btn.disabled = false;
  };
  $('setRing').oninput = (e) => { $('ringLabel').textContent = t('ring_times', e.target.value); };
  $('setRingVol').oninput = (e) => {
    $('ringVolLabel').textContent = t('ring_vol_level', e.target.value);
  };
  // 用滑桿的當下數值試聽，不必先按儲存才聽得出差別
  $('btnTestRing').onclick = () => Ringer.start(
    parseInt($('setRing').value, 10) || 2,
    parseInt($('setRingVol').value, 10) || 5
  );

  $('btnStandby').onclick = async () => {
    if (!isConfigured()) { toast(t('err_setup_first')); return; }
    Ringer.prime(); // 借這次點擊解鎖音訊播放，之後才響得出鈴聲
    Standby.start();

    const btn = $('btnStandby');
    btn.disabled = true;
    Standby.setAlertsBtn('enabling');
    const result = await Push.enable();
    btn.disabled = false;

    if (result.ok) {
      Standby.setAlertsBtn('enabled');
      Standby.setPushNote('alerts_all_on', null, true);
      toast(t('alerts_on'));
    } else {
      Standby.setAlertsBtn('enable_again');
      Standby.setPushNote('alerts_ring_only', result.reason);
      toast(result.reason);
    }
  };

  $('btnCall').onclick = () => {
    if (!isConfigured()) { toast(t('err_setup_first')); return; }
    const peer = $('inputPeer').value.trim();
    if (!peer) { toast(t('err_need_peer')); return; }
    if (sanitize(peer) === sanitize(prefs.account)) { toast(t('err_call_self')); return; }
    prefs.peer = peer;
    savePrefs();
    Ringer.prime();
    Standby.start();
    Call.open({
      callId: Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
      peer, incoming: false, accepted: false,
    });
  };

  $('btnAccept').onclick = () => Standby.accept();
  $('btnReject').onclick = () => Standby.reject(true);
  $('btnAcceptBig').onclick = () => Standby.accept();
  $('btnRejectBig').onclick = () => Standby.reject(true);

  $('btnMic').onclick = () => Speech.toggle();
  $('btnEnd').onclick = () => { if (confirm(t('end_call_q'))) Call.end(true); };
  $('btnSpeaker').onclick = () => {
    prefs.autoSpeak = !prefs.autoSpeak;
    savePrefs();
    Call.speakerUI();
    if (!prefs.autoSpeak) Speech.stopSpeaking();
    toast(prefs.autoSpeak ? t('speak_on') : t('speak_off'));
  };

  $('btnClearHistory').onclick = () => {
    if (confirm(t('clear_all_q'))) {
      History.clear();
      History.render();
    }
  };
  $('btnDetailBack').onclick = () => showScreen('screenMain');
  $('btnDeleteRecord').onclick = () => {
    if (Detail.current && confirm(t('delete_this_q'))) {
      History.remove(Detail.current.callId);
      History.render();
      showScreen('screenMain');
    }
  };

  $('inputPeer').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('btnCall').click();
  });

  // 通話中不小心關掉分頁時，至少通知對方。
  // iOS 幾乎不會觸發 beforeunload，pagehide 才是可靠的那個。
  const markEnded = () => {
    if (Call.active && !Call.ending) {
      navigator.sendBeacon?.(fbUrl(`calls/${Call.callId}/state`), JSON.stringify('ended'));
    }
  };
  window.addEventListener('beforeunload', markEnded);
  window.addEventListener('pagehide', markEnded);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // 切到背景時一定要把麥克風收起來。iOS 會因為背景錄音直接
      // 把整個網頁行程收掉，回來時就變成「打不開、不能通話」。
      if (Speech.want) {
        Speech.pausedByHide = true;
        Speech.stop();
      }
      return;
    }
    if (Call.active) {
      Call.keepAwake(true); // 螢幕鎖可能已經被系統釋放
      if (Speech.pausedByHide) {
        Speech.pausedByHide = false;
        Speech.start();
      }
    }
  });
}

// ───────────────────────────── 啟動

function init() {
  wire();
  applyTextSize(prefs.textSize);
  // 沒特別指定的話，介面語言跟著「我說的語言」走——
  // 印尼看護把語言設成印尼文，介面就自然是印尼文
  applyUiLang(prefs.uiLang || prefs.lang);
  Speech.loadVoices();
  Wave.init();
  Push.register();
  Updater.init();

  // 從通知點進來時，Service Worker 會通知這裡
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'incoming-call') Standby.start();
    });
  }

  if (!isConfigured()) {
    showScreen('screenSettings');
    fillSettings();
    toast(t('err_finish_setup'));
    return;
  }

  // 設定完成就自動連線，這樣網頁一打開就等得到來電；
  // 鈴聲與背景通知仍需要使用者按一下按鈕才能授權。
  Standby.start();

  // 掃掉沒被正常刪除的舊通話（App 被直接關掉時就會留下來）。
  // 純粹是打掃，失敗也不影響任何功能，所以不等它、也不理會錯誤。
  CallCleanup.sweep().catch(() => {});

  if (!Speech.supported()) {
    toast(t('err_no_stt'));
  }
  /*
   * 電腦上放在工作列的「捷徑」只是啟動器，視窗關掉就沒有東西在跑，
   * 來電當然不會有反應。這比「通知已允許」更值得講，所以優先顯示。
   */
  if (Push.isDesktop() && Push.notInstalled()) {
    Standby.setPushNote('alerts_pc_install');
  } else if (Push.supported() && Notification.permission === 'granted') {
    Standby.setPushNote('alerts_notify_granted');
  } else if (Push.needsInstallOnIos()) {
    Standby.setPushNote('alerts_ios_install');
  }
}

document.addEventListener('DOMContentLoaded', init);
