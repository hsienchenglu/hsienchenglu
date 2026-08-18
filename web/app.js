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
};
const langLabel = (l) => t(LANGS[l].key);
const otherLang = (l) => (l === 'zh' ? 'id' : 'zh');

const DEFAULTS = {
  account: '', peer: '', lang: 'zh', uiLang: '',
  dbUrl: '', dbSecret: '',
  provider: 'google', apiKey: '',
  ring: 2, autoListen: true, autoSpeak: true,
};

let prefs = loadPrefs();

function loadPrefs() {
  try {
    return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem('zhid.prefs') || '{}'));
  } catch (e) {
    return Object.assign({}, DEFAULTS);
  }
}

function savePrefs() {
  localStorage.setItem('zhid.prefs', JSON.stringify(prefs));
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

function fbUrl(path) {
  if (!prefs.dbUrl) throw new Error('尚未設定資料庫網址');
  const base = prefs.dbUrl.replace(/\/+$/, '');
  const q = prefs.dbSecret ? '?auth=' + encodeURIComponent(prefs.dbSecret) : '';
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

async function fbDelete(path) {
  const r = await fetch(fbUrl(path), { method: 'DELETE' });
  if (!r.ok) throw new Error('資料庫刪除失敗 HTTP ' + r.status);
}

/**
 * 訂閱節點變動。EventSource 本身會自動重連，斷線時只要通知使用者即可。
 * onEvent(相對路徑, 內容)，內容被刪除時為 null。
 */
function fbStream(path, onEvent, onError) {
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
  return es;
}

// ───────────────────────────── 翻譯

/**
 * 先走 Netlify Function（金鑰放伺服器，不會外流）；
 * 沒有部署函式時，退回用這台裝置設定的金鑰直接呼叫。
 */
async function translate(text, from, to) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return '';
  if (from === to) return trimmed;

  try {
    const r = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: trimmed, from: LANGS[from].api, to: LANGS[to].api }),
    });
    if (r.ok) {
      const j = await r.json();
      if (j.text) return j.text;
      throw new Error(j.error || '翻譯服務沒有回傳結果');
    }
    // 404／501 代表沒有部署或沒設環境變數，往下用本機金鑰
    if (r.status !== 404 && r.status !== 501) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.error || '翻譯失敗 HTTP ' + r.status);
    }
  } catch (e) {
    if (!prefs.apiKey) throw e;
  }

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
  ctx: null,
  timers: [],
  nodes: [],
  idleTimer: 0,

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

  /** 真的要出聲之前叫醒音訊環境。 */
  wake() {
    clearTimeout(this.idleTimer);
    this.idleTimer = 0;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
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
  start(times) {
    this.stop();
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

  oneRing() {
    const ctx = this.ctx;
    if (!ctx) return;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.22, ctx.currentTime + 1.9);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 2);
    gain.connect(ctx.destination);

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

const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

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
  /** 因為切到背景而暫停，回到前景要自動接回去 */
  pausedByHide: false,

  supported() { return !!SR; },

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
    // iOS 的即時辨識結果事件很密集又不穩，關掉可以明顯降低當掉的機率
    rec.interimResults = !IS_IOS;
    /*
     * Android 每重新啟動一次辨識就會發出一聲提示音。單次模式下講完一句
     * 或靜默幾秒就結束，接著馬上重啟，整通電話就變成一直有雜音。
     * 改成連續辨識可以大幅減少重啟次數。iOS 的連續模式很不穩，維持單次。
     */
    rec.continuous = !IS_IOS;
    rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      let interim = '', final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (interim) Call.showPartial(interim);
      if (final.trim()) {
        this.rapidFails = 0; // 有辨識出東西，代表服務是好的
        Call.showPartial('');
        Call.sendUtterance(final.trim());
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
      if (!this.want || this.speaking) { Call.micUI(false); return; }

      // 開始不到 0.6 秒就結束，代表辨識服務其實沒在運作。
      // 這種情況下原本會每 0.2 秒重試一次，等於每秒建立五個辨識物件，
      // 在 iPhone 上很快就把行程拖垮——改成指數退避，連續失敗就停手。
      if (Date.now() - this.lastStartAt < 600) {
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
       * 正常結束＝使用者講完停下來了。這裡刻意「不自動重開」。
       *
       * Android 每啟動一次語音辨識就會發出一聲提示音，那是系統發的，
       * 網頁沒有權限關掉。原本講完一句就自動重開，等於整通電話一直在叮。
       * 改成按一下開始講、講完再按一下（或停下來讓它自己收），
       * 提示音就只在真正開口前響那一次。
       */
      this.rapidFails = 0;
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

  stop() {
    this.want = false;
    this.kill();
    Call.micUI(false);
  },

  kill() {
    this.starting = false;
    if (this.rec) {
      this.rec.onend = null;
      try { this.rec.stop(); } catch (e) { /* 已停止 */ }
      this.rec = null;
    }
  },

  toggle() { this.want ? this.stop() : this.start(); },

  /** 朗讀時先關麥克風，否則會把喇叭的聲音再辨識一次，造成無限迴圈。 */
  speak(text, lang) {
    if (!text || !window.speechSynthesis) return;
    this.speaking = true;
    this.kill();
    Call.micUI(false);
    this.utter(text, lang, 1);
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
    u.onstart = () => { started = true; clearTimeout(this.startCheck); };
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
    this.speaking = false;
    if (this.want) setTimeout(() => this.begin(), 250);
  },

  stopSpeaking() {
    clearTimeout(this.speakWatchdog);
    clearTimeout(this.startCheck);
    this.speakWatchdog = 0;
    this.startCheck = 0;
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
    localStorage.setItem(this.key, JSON.stringify(all));
  },

  remove(callId) {
    localStorage.setItem(this.key, JSON.stringify(this.list().filter((r) => r.callId !== callId)));
    localStorage.removeItem('zhid.t.' + callId);
  },

  clear() {
    this.list().forEach((r) => localStorage.removeItem('zhid.t.' + r.callId));
    localStorage.removeItem(this.key);
  },

  saveTranscript(callId, msgs) {
    if (!msgs.length) return;
    localStorage.setItem('zhid.t.' + callId, JSON.stringify(msgs));
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
   * 點一下重聽。自動朗讀有可能因為手機沒裝語音、音量沒開、或引擎當掉而
   * 沒出聲，這裡給一個明確的補救動作——而且是使用者親手點的，
   * 有些瀏覽器只認使用者動作觸發的朗讀。
   */
  if (m.dst) {
    b.classList.add('speakable');
    b.title = t('tap_to_replay');
    b.onclick = () => {
      // 對方的話唸我聽得懂的那一句；自己的話唸送出去的譯文
      Speech.speak(m.dst, m.fromMe ? otherLang(prefs.lang) : prefs.lang);
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
        () => { $('standbyState').textContent = t('standby_reconnecting'); }
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
      fromLang: data.fromLang && String(data.fromLang).startsWith('id') ? 'id' : 'zh',
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
    fbPut(`calls/${p.callId}/state`, 'accepted').catch((e) => toast(e.message));
    fbDelete(`users/${this.account}/incoming`).catch(() => {});
    Call.open({ callId: p.callId, peer: p.from, incoming: true, accepted: true });
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
  timer: null,
  ringTimeout: null,
  wakeLock: null,

  get target() { return otherLang(prefs.lang); },

  open({ callId, peer, incoming, accepted }) {
    this.active = true;
    this.callId = callId;
    this.peer = peer;
    this.incoming = !!incoming;
    this.connected = false;
    this.ending = false;
    this.startTs = Date.now();
    this.msgs = [];
    this.seen = new Set();

    $('callPeer').textContent = peer;
    $('callLangPair').textContent = t('lang_pair', langLabel(prefs.lang), langLabel(this.target));
    $('callStatus').textContent = accepted ? t('status_connected') : t('status_calling');
    $('callDuration').textContent = '';
    $('transcript').innerHTML = '';
    $('transcriptEmpty').classList.remove('hidden');
    this.showPartial('');
    this.micUI(false);
    this.speakerUI();
    showScreen('screenCall');
    Wave.init();
    this.keepAwake(true);

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

  watchState() {
    this.stateStream = fbStream(`calls/${this.callId}/state`, (path, data) => {
      if (this.ending) return;
      if (data === 'accepted') this.onConnected();
      else if (data === 'rejected') { toast(t('call_rejected')); this.end(false); }
      else if (data === 'ended') { toast(t('call_peer_hung_up')); this.end(false); }
    });
  },

  watchMessages() {
    this.msgStream = fbStream(`calls/${this.callId}/msgs`, (path, data) => {
      if (!data) return;
      if (path === '/') {
        // 初次連線會一次送來整包既有訊息
        Object.keys(data)
          .map((k) => [k, data[k]])
          .sort((a, b) => (a[1].ts || 0) - (b[1].ts || 0))
          .forEach(([k, v]) => this.onRemoteMsg(k, v));
      } else {
        this.onRemoteMsg(path.replace(/^\//, ''), data);
      }
    });
  },

  onRemoteMsg(key, o) {
    if (!key || !o || this.seen.has(key)) return;
    this.seen.add(key);
    if (o.from === sanitize(prefs.account)) return; // 自己送的，畫面上已經有了

    const msg = {
      id: key, fromMe: false,
      src: o.src || '', dst: o.dst || '',
      ts: o.ts || Date.now(),
    };
    this.append(msg);
    if (prefs.autoSpeak && msg.dst) Speech.speak(msg.dst, prefs.lang);
  },

  onConnected() {
    if (this.connected) return;
    this.connected = true;
    this.connectedAt = Date.now();
    clearTimeout(this.ringTimeout);
    $('callStatus').textContent = t('status_connected');
    if (prefs.autoListen) Speech.start();
  },

  async sendUtterance(text) {
    if (!text || this.ending) return;
    $('callStatus').textContent = t('status_translating');
    let dst;
    try {
      dst = await translate(text, prefs.lang, this.target);
    } catch (e) {
      toast(e.message);
      $('callStatus').textContent = t('status_connected');
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
      toast(t('err_send', e.message));
      $('callStatus').textContent = t('status_connected');
      return;
    }

    if (key) this.seen.add(key);
    this.append({ id: key || 'local_' + ts, fromMe: true, src: text, dst, ts });
    $('callStatus').textContent = t('status_connected');
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

    Speech.stop();
    Speech.stopSpeaking();
    Wave.setActive(false);
    this.keepAwake(false);

    const duration = this.connected ? (Date.now() - this.connectedAt) / 1000 : 0;
    if (notifyPeer) {
      fbPut(`calls/${this.callId}/state`, 'ended').catch(() => {});
      if (!this.connected) fbDelete(`users/${sanitize(this.peer)}/incoming`).catch(() => {});
    }

    History.save({
      callId: this.callId, peer: this.peer, incoming: this.incoming,
      startTs: this.startTs, durationSec: Math.round(duration),
      answered: this.connected, msgCount: this.msgs.length,
    });
    History.saveTranscript(this.callId, this.msgs);
    History.render();

    if (this.stateStream) { this.stateStream.close(); this.stateStream = null; }
    if (this.msgStream) { this.msgStream.close(); this.msgStream = null; }

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
  $('ringLabel').textContent = t('ring_times', prefs.ring);
  $('setAutoListen').checked = prefs.autoListen;
  $('setAutoSpeak').checked = prefs.autoSpeak;
  document.querySelector(`input[name="lang"][value="${prefs.lang}"]`).checked = true;
  document.querySelector(`input[name="provider"][value="${prefs.provider}"]`).checked = true;
  document.querySelector(`input[name="uilang"][value="${UI_LANG}"]`).checked = true;
  $('testResult').textContent = '';
}

function readSettings() {
  const account = $('setAccount').value.trim();
  if (!account) { toast(t('err_account_required')); return false; }
  const dbUrl = $('setDbUrl').value.trim().replace(/\/+$/, '');
  if (dbUrl && !dbUrl.startsWith('https://')) { toast(t('err_db_url')); return false; }

  prefs.account = account;
  prefs.peer = $('setPeer').value.trim();
  prefs.dbUrl = dbUrl;
  prefs.dbSecret = $('setDbSecret').value.trim();
  prefs.apiKey = $('setApiKey').value.trim();
  prefs.lang = document.querySelector('input[name="lang"]:checked').value;
  prefs.provider = document.querySelector('input[name="provider"]:checked').value;
  prefs.ring = parseInt($('setRing').value, 10) || 2;
  prefs.autoListen = $('setAutoListen').checked;
  prefs.autoSpeak = $('setAutoSpeak').checked;
  prefs.uiLang = document.querySelector('input[name="uilang"]:checked').value;
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
  $('btnUiLang').textContent = UI_LANG === 'zh' ? 'ID' : '中';

  refreshHeader();
  History.render();
  $('ringLabel').textContent = t('ring_times', prefs.ring);
  $('standbyState').textContent = Standby.stream
    ? t('standby_online', prefs.account)
    : t('standby_offline');
  Call.micUI(Speech.want);

  if (Call.active) {
    $('callLangPair').textContent = t('lang_pair', langLabel(prefs.lang), langLabel(Call.target));
    $('callStatus').textContent = Call.connected ? t('status_connected') : t('status_calling');
  }
  Push.saveConfig(); // Service Worker 的通知也要跟著換語言
}

function refreshHeader() {
  $('myAccountLabel').textContent = prefs.account ? t('my_account', prefs.account) : t('no_account');
  $('myLangLabel').textContent = t('lang_pair', langLabel(prefs.lang), langLabel(otherLang(prefs.lang)));
  $('setupHint').classList.toggle('hidden', isConfigured());
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
  $('btnSettingsBack').onclick = () => { showScreen('screenMain'); };
  $('btnSave').onclick = () => {
    if (!readSettings()) return;
    toast(t('saved'));
    Standby.stop();
    Standby.start();
    Push.saveConfig(); // 帳號或資料庫換了，背景通知也要跟著更新
    showScreen('screenMain');
  };
  $('updateBar').onclick = () => Updater.apply();

  $('btnUiLang').onclick = () => {
    const next = UI_LANG === 'zh' ? 'id' : 'zh';
    prefs.uiLang = next;
    savePrefs();
    applyUiLang(next);
    toast(t('ui_lang_switched'));
  };

  /*
   * 設定頁的介面語言要「選了就馬上換」。
   * 第一次開網頁會直接停在設定頁，而主畫面的 ID 切換鍵這時候看不到；
   * 若要按了儲存才生效，看不懂中文的人根本找不到儲存鍵在哪。
   */
  document.querySelectorAll('input[name="uilang"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      prefs.uiLang = radio.value;
      savePrefs();
      applyUiLang(radio.value);
    });
  });

  $('btnTest').onclick = testConnection;

  // 對方的話是用「我說的語言」唸出來的，所以就測這個語言
  $('btnTestVoice').onclick = () => {
    const lang = document.querySelector('input[name="lang"]:checked').value;
    Speech.speak(t('tts_test_sample'), lang);
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
  $('btnTestRing').onclick = () => Ringer.start(parseInt($('setRing').value, 10) || 2);

  $('btnStandby').onclick = async () => {
    if (!isConfigured()) { toast(t('err_setup_first')); return; }
    Ringer.prime(); // 借這次點擊解鎖音訊播放，之後才響得出鈴聲
    Standby.start();

    const btn = $('btnStandby');
    btn.disabled = true;
    btn.textContent = t('enabling');
    const result = await Push.enable();
    btn.disabled = false;

    if (result.ok) {
      btn.textContent = t('enabled');
      $('standbyPush').textContent = t('alerts_all_on');
      $('standbyPush').className = 'sub accent';
      toast(t('alerts_on'));
    } else {
      btn.textContent = t('enable_again');
      $('standbyPush').textContent = t('alerts_ring_only', result.reason);
      $('standbyPush').className = 'sub';
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

  if (!Speech.supported()) {
    toast(t('err_no_stt'));
  }
  if (Push.supported() && Notification.permission === 'granted') {
    $('standbyPush').textContent = t('alerts_notify_granted');
  } else if (Push.needsInstallOnIos()) {
    $('standbyPush').textContent = t('alerts_ios_install');
  }
}

document.addEventListener('DOMContentLoaded', init);
