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
  zh: { api: 'zh-TW', stt: 'zh-TW', tts: 'zh-TW', label: '中文' },
  id: { api: 'id', stt: 'id-ID', tts: 'id-ID', label: '印尼文' },
};
const otherLang = (l) => (l === 'zh' ? 'id' : 'zh');

const DEFAULTS = {
  account: '', peer: '', lang: 'zh',
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
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
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
  if (d.toDateString() === now.toDateString()) return '今天 ' + time;
  const yest = new Date(now.getTime() - 86400000);
  if (d.toDateString() === yest.toDateString()) return '昨天 ' + time;
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
    if (!prefs.apiKey) {
      throw new Error(e.message + '（也沒有設定備援金鑰）');
    }
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

  /** 瀏覽器要有使用者互動才允許出聲，所以上線時先把 AudioContext 準備好。 */
  prime() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return !!this.ctx;
  },

  /** 響 times 次，每次是 2 秒響鈴 + 4 秒靜音，這是一般電話的節奏。 */
  start(times) {
    this.stop();
    if (!this.prime()) return;
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
  },
};

// ───────────────────────────── 語音辨識與朗讀

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

const Speech = {
  rec: null,
  want: false,
  speaking: false,
  voices: [],

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
      toast('這個瀏覽器不支援語音辨識，請改用 Chrome 或 Edge');
      return;
    }
    this.want = true;
    this.begin();
  },

  begin() {
    if (!this.want || this.speaking || this.rec) return;
    const rec = new SR();
    rec.lang = LANGS[prefs.lang].stt;
    rec.interimResults = true;
    rec.continuous = false;
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
        Call.showPartial('');
        Call.sendUtterance(final.trim());
      }
    };

    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.want = false;
        toast('需要麥克風權限才能說話');
      } else if (e.error === 'network') {
        toast('語音辨識連線不穩');
      }
      // no-speech / aborted 屬正常情況，交給 onend 重啟
    };

    rec.onend = () => {
      this.rec = null;
      if (this.want && !this.speaking) setTimeout(() => this.begin(), 200);
      else Call.micUI(false);
    };

    try {
      rec.start();
      this.rec = rec;
      Call.micUI(true);
    } catch (e) {
      this.rec = null;
      setTimeout(() => this.begin(), 500);
    }
  },

  stop() {
    this.want = false;
    this.kill();
    Call.micUI(false);
  },

  kill() {
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

    const u = new SpeechSynthesisUtterance(text);
    u.lang = LANGS[lang].tts;
    u.rate = 0.95;
    const v = this.pickVoice(LANGS[lang].tts);
    if (v) u.voice = v;
    else toast(`系統缺少${LANGS[lang].label}的語音，聲音可能不正確`);

    const done = () => {
      if (speechSynthesis.speaking || speechSynthesis.pending) return;
      this.speaking = false;
      if (this.want) setTimeout(() => this.begin(), 250);
    };
    u.onend = done;
    u.onerror = done;
    speechSynthesis.speak(u);
  },

  stopSpeaking() {
    if (window.speechSynthesis) { try { speechSynthesis.cancel(); } catch (e) { /* 忽略 */ } }
    this.speaking = false;
  },
};

// ───────────────────────────── 聆聽指示動畫

const Wave = {
  canvas: null, ctx: null, raf: 0, level: 0, active: false, phase: 0,

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

  loop() {
    this.raf = requestAnimationFrame(() => this.loop());
    const c = this.canvas, ctx = this.ctx;
    if (!c || !ctx) return;
    const w = (c.width = c.clientWidth * (window.devicePixelRatio || 1));
    const h = (c.height = 56 * (window.devicePixelRatio || 1));
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
      const meta = missed ? '未接來電'
        : !r.answered ? '對方未接聽'
        : `通話 ${fmtDuration(r.durationSec)}`;
      info.appendChild(el('div', 'meta', r.msgCount ? `${meta} · ${r.msgCount} 句` : meta));
      info.appendChild(el('div', 'time', fmtTime(r.startTs)));
      info.onclick = () => Detail.open(r);
      li.appendChild(info);

      const del = el('button', 'del', '🗑');
      del.title = '刪除';
      del.onclick = (e) => {
        e.stopPropagation();
        if (confirm(`刪除與 ${r.peer} 的通話紀錄與逐字稿？`)) {
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
    $('detailTitle').textContent = record.peer;
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
        () => $('standbyState').textContent = '連線中斷，重新連線中…'
      );
    } catch (e) {
      toast(e.message);
      return;
    }
    $('standbyState').textContent = `已上線：${prefs.account}`;
    $('btnStandby').textContent = '離線';
  },

  stop() {
    if (this.stream) { this.stream.close(); this.stream = null; }
    this.account = '';
    $('standbyState').textContent = '尚未上線，接不到來電';
    $('btnStandby').textContent = '上線待機';
  },

  onEvent(path, data) {
    if (!data) {
      // 節點被清空，代表對方取消了來電
      if (this.pending) this.cancel();
      return;
    }
    if (typeof data !== 'object' || !data.callId || !data.from) return;
    if (this.pending && this.pending.callId === data.callId) return;

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
    $('incomingLang').textContent = `對方說 ${LANGS[p.fromLang].label}`;
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
    liveNotification = new Notification('翻譯通話來電', { body: peer, tag: 'zhid-call', requireInteraction: true });
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
    $('callLangPair').textContent = `${LANGS[prefs.lang].label} → ${LANGS[this.target].label}`;
    $('callStatus').textContent = accepted ? '通話中' : '撥號中…';
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
      toast('撥號失敗：' + e.message);
      this.end(false);
      return;
    }
    this.ringTimeout = setTimeout(() => {
      if (!this.connected && !this.ending) {
        toast('對方未接聽');
        this.end(true);
      }
    }, 45000);
  },

  watchState() {
    this.stateStream = fbStream(`calls/${this.callId}/state`, (path, data) => {
      if (this.ending) return;
      if (data === 'accepted') this.onConnected();
      else if (data === 'rejected') { toast('對方拒接'); this.end(false); }
      else if (data === 'ended') { toast('對方已掛斷'); this.end(false); }
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
    $('callStatus').textContent = '通話中';
    if (prefs.autoListen) Speech.start();
  },

  async sendUtterance(text) {
    if (!text || this.ending) return;
    $('callStatus').textContent = '翻譯中…';
    let dst;
    try {
      dst = await translate(text, prefs.lang, this.target);
    } catch (e) {
      toast(e.message);
      $('callStatus').textContent = '通話中';
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
      toast('訊息送出失敗：' + e.message);
      $('callStatus').textContent = '通話中';
      return;
    }

    if (key) this.seen.add(key);
    this.append({ id: key || 'local_' + ts, fromMe: true, src: text, dst, ts });
    $('callStatus').textContent = '通話中';
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
    $('micHint').textContent = on
      ? '請說話，停頓一下就會自動送出'
      : '麥克風已關閉，點一下開始說話';
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
  $('ringLabel').textContent = `連續響 ${prefs.ring} 次`;
  $('setAutoListen').checked = prefs.autoListen;
  $('setAutoSpeak').checked = prefs.autoSpeak;
  document.querySelector(`input[name="lang"][value="${prefs.lang}"]`).checked = true;
  document.querySelector(`input[name="provider"][value="${prefs.provider}"]`).checked = true;
  $('testResult').textContent = '';
}

function readSettings() {
  const account = $('setAccount').value.trim();
  if (!account) { toast('請填寫你的帳號'); return false; }
  const dbUrl = $('setDbUrl').value.trim().replace(/\/+$/, '');
  if (dbUrl && !dbUrl.startsWith('https://')) { toast('網址必須以 https:// 開頭'); return false; }

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
  savePrefs();
  refreshHeader();
  return true;
}

function refreshHeader() {
  $('myAccountLabel').textContent = prefs.account ? `我的帳號：${prefs.account}` : '尚未設定帳號';
  $('myLangLabel').textContent = `${LANGS[prefs.lang].label} → ${LANGS[otherLang(prefs.lang)].label}`;
  $('setupHint').classList.toggle('hidden', isConfigured());
  if (prefs.peer && !$('inputPeer').value) $('inputPeer').value = prefs.peer;
}

async function testConnection() {
  if (!readSettings()) return;
  const out = $('testResult');
  $('btnTest').disabled = true;
  out.textContent = '測試中…';
  try {
    await fbPut('healthcheck/' + (sanitize(prefs.account) || 'anon'), Date.now());
  } catch (e) {
    out.textContent = '資料庫連線失敗：' + e.message;
    $('btnTest').disabled = false;
    return;
  }
  try {
    const sample = await translate('你好', 'zh', 'id');
    out.textContent = `連線正常，翻譯測試：你好 → ${sample}`;
  } catch (e) {
    out.textContent = '資料庫正常，但翻譯失敗：' + e.message;
  }
  $('btnTest').disabled = false;
}

// ───────────────────────────── 事件接線

function wire() {
  $('btnSettings').onclick = () => { fillSettings(); showScreen('screenSettings'); };
  $('btnSettingsBack').onclick = () => { showScreen('screenMain'); };
  $('btnSave').onclick = () => {
    if (!readSettings()) return;
    toast('已儲存');
    Standby.stop();
    Standby.start();
    showScreen('screenMain');
  };
  $('btnTest').onclick = testConnection;
  $('setRing').oninput = (e) => { $('ringLabel').textContent = `連續響 ${e.target.value} 次`; };
  $('btnTestRing').onclick = () => Ringer.start(parseInt($('setRing').value, 10) || 2);

  $('btnStandby').onclick = async () => {
    if (Standby.stream) { Standby.stop(); return; }
    if (!isConfigured()) { toast('請先到設定填入帳號與資料庫網址'); return; }
    Ringer.prime(); // 借這次點擊解鎖音訊播放
    if ('Notification' in window && Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch (e) { /* 忽略 */ }
    }
    Standby.start();
  };

  $('btnCall').onclick = () => {
    if (!isConfigured()) { toast('請先到設定填入帳號與資料庫網址'); return; }
    const peer = $('inputPeer').value.trim();
    if (!peer) { toast('請輸入對方帳號'); return; }
    if (sanitize(peer) === sanitize(prefs.account)) { toast('不能撥給自己'); return; }
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
  $('btnEnd').onclick = () => { if (confirm('要結束通話嗎？')) Call.end(true); };
  $('btnSpeaker').onclick = () => {
    prefs.autoSpeak = !prefs.autoSpeak;
    savePrefs();
    Call.speakerUI();
    if (!prefs.autoSpeak) Speech.stopSpeaking();
    toast(prefs.autoSpeak ? '已開啟自動朗讀' : '已關閉自動朗讀');
  };

  $('btnClearHistory').onclick = () => {
    if (confirm('刪除全部通話紀錄與逐字稿？此動作無法復原。')) {
      History.clear();
      History.render();
    }
  };
  $('btnDetailBack').onclick = () => showScreen('screenMain');
  $('btnDeleteRecord').onclick = () => {
    if (Detail.current && confirm('刪除這筆通話紀錄？')) {
      History.remove(Detail.current.callId);
      History.render();
      showScreen('screenMain');
    }
  };

  $('inputPeer').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('btnCall').click();
  });

  // 通話中不小心關掉分頁時，至少通知對方
  window.addEventListener('beforeunload', () => {
    if (Call.active && !Call.ending) {
      navigator.sendBeacon?.(fbUrl(`calls/${Call.callId}/state`), JSON.stringify('ended'));
    }
  });

  // 分頁回到前景時，螢幕鎖可能已經被系統釋放
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Call.active) Call.keepAwake(true);
  });
}

// ───────────────────────────── 啟動

function init() {
  wire();
  Speech.loadVoices();
  refreshHeader();
  History.render();
  Wave.init();

  if (!isConfigured()) {
    showScreen('screenSettings');
    fillSettings();
    toast('請先完成設定');
  } else if (!Speech.supported()) {
    toast('這個瀏覽器不支援語音辨識，請改用 Chrome 或 Edge');
  }
}

document.addEventListener('DOMContentLoaded', init);
