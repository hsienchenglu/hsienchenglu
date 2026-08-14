/*
 * Service Worker：讓網頁關著也能收到來電通知。
 *
 * 推播本身不帶任何內容（省下 RFC 8291 的加密流程），它只負責把這個
 * Service Worker 叫醒；醒來之後自己去 Firebase 讀「誰在撥給我」，
 * 再把通知顯示出來。設定值放在 Cache Storage，網頁那邊寫、這裡讀。
 */

const CONFIG_CACHE = 'zhid-config';
const CONFIG_KEY = '/__zhid_config';

/** 通知也要看得懂——語言跟著網頁的介面語言走。 */
const TEXT = {
  zh: {
    app: '譯通',
    title: '翻譯通話來電',
    body: '{0} 撥給你，點一下接聽',
    generic: '有來電，請開啟譯通查看',
    ended: '來電已結束',
  },
  id: {
    app: 'ZhID Talk',
    title: 'Panggilan terjemahan masuk',
    body: '{0} menelepon Anda, ketuk untuk menjawab',
    generic: 'Ada panggilan masuk, buka aplikasi',
    ended: 'Panggilan sudah berakhir',
  },
};

const txt = (cfg, key, arg) => {
  const dict = TEXT[(cfg && cfg.uiLang) === 'id' ? 'id' : 'zh'];
  return arg == null ? dict[key] : dict[key].replace('{0}', arg);
};

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// 有 fetch 監聽器，瀏覽器才會把這個網站視為可安裝的 PWA
self.addEventListener('fetch', () => {});

async function readConfig() {
  try {
    const cache = await caches.open(CONFIG_CACHE);
    const res = await cache.match(CONFIG_KEY);
    return res ? await res.json() : null;
  } catch (e) {
    return null;
  }
}

function fbUrl(cfg, path) {
  const base = String(cfg.dbUrl || '').replace(/\/+$/, '');
  const q = cfg.dbSecret ? '?auth=' + encodeURIComponent(cfg.dbSecret) : '';
  return `${base}/${path}.json${q}`;
}

self.addEventListener('push', (event) => {
  event.waitUntil(handlePush());
});

/**
 * 推播規範要求每一則推播都必須顯示通知（userVisibleOnly），
 * 所以即使查不到來電，也要顯示一則簡短的通知。
 */
async function handlePush() {
  const cfg = await readConfig();
  if (!cfg || !cfg.dbUrl || !cfg.account) {
    return self.registration.showNotification(txt(cfg, 'app'), {
      body: txt(cfg, 'generic'),
      icon: 'icons/icon-192.png',
      tag: 'zhid-call',
    });
  }

  let incoming = null;
  try {
    const res = await fetch(fbUrl(cfg, `users/${cfg.account}/incoming`), { cache: 'no-store' });
    if (res.ok) incoming = await res.json();
  } catch (e) {
    /* 讀不到就顯示通用訊息 */
  }

  if (!incoming || !incoming.from) {
    return self.registration.showNotification(txt(cfg, 'app'), {
      body: txt(cfg, 'ended'),
      icon: 'icons/icon-192.png',
      tag: 'zhid-call',
      silent: true,
    });
  }

  return self.registration.showNotification(txt(cfg, 'title'), {
    body: txt(cfg, 'body', incoming.from),
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: 'zhid-call',
    renotify: true,
    requireInteraction: true,
    vibrate: [700, 700, 700, 700, 700],
    data: { callId: incoming.callId, from: incoming.from },
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(openApp());
});

/** 已經開著就聚焦過去，沒開就開一個新視窗。 */
async function openApp() {
  const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clientList) {
    if ('focus' in client) {
      client.postMessage({ type: 'incoming-call' });
      return client.focus();
    }
  }
  if (self.clients.openWindow) {
    return self.clients.openWindow('./?incoming=1');
  }
}
