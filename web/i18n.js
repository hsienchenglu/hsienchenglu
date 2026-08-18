/*
 * 介面語言：中文 / 印尼文。
 *
 * 這裡只管「介面上的字」，和通話翻譯是兩回事——
 * 印尼看護把介面切成印尼文，仍然是說印尼文、聽到中文翻譯。
 *
 * 用法：
 *   HTML 靜態文字   <span data-i18n="鍵名">
 *   輸入框提示文字   <input data-i18n-ph="鍵名">
 *   按鈕說明         <button data-i18n-title="鍵名">
 *   程式裡的動態字串 t('鍵名', 參數0, 參數1)   佔位符寫成 {0} {1}
 */
'use strict';

const I18N = {
  zh: {
    app_name: '譯通',
    lang_zh: '中文',
    lang_id: '印尼文',
    lang_pair: '{0} → {1}',
    ui_lang_switched: '介面已切換成中文',
    update_prompt: '有新版本，點一下更新',

    // 主畫面
    my_account: '我的帳號：{0}',
    no_account: '尚未設定帳號',
    standby_title: '待機狀態',
    standby_offline: '尚未上線，接不到來電',
    standby_online: '已上線：{0}',
    standby_reconnecting: '連線中斷，重新連線中…',
    enable_alerts: '啟用鈴聲與通知',
    enabling: '啟用中…',
    enabled: '已啟用',
    enable_again: '重新啟用',
    alerts_all_on: '鈴聲與背景通知都已啟用',
    alerts_ring_only: '鈴聲已啟用；背景通知未啟用：{0}',
    alerts_notify_granted: '已允許通知，建議按一次按鈕確認推播訂閱',
    alerts_ios_install: 'iPhone 請用分享選單「加入主畫面」，才能在背景收到來電',
    dial_title: '撥打翻譯通話',
    peer_hint: '對方帳號',
    call_button: '撥號',
    setup_hint: '請先到設定填入帳號、資料庫網址',
    history_title: '通話紀錄',
    clear_all: '全部刪除',
    no_history: '還沒有通話紀錄',

    // 來電
    incoming_call: '翻譯通話來電',
    accept: '接聽',
    reject: '拒接',
    speaks: '對方說 {0}',

    // 通話中
    status_calling: '撥號中…',
    status_connected: '通話中',
    status_translating: '翻譯中…',
    no_transcript: '這通電話還沒有對話內容',
    mic_on_hint: '聆聽中…說完請再按一下麥克風',
    mic_off_hint: '麥克風已關閉，點一下開始說話',
    mic_auto_off: '麥克風已收起，要說話請按一下 🎙',
    tap_to_replay: '點一下重聽',
    tts_test: '試唸',
    tts_test_desc: '確認這支手機唸得出聲音',
    tts_test_sample: '你好，這是朗讀測試。',
    end_call_q: '要結束通話嗎？',
    call_rejected: '對方拒接',
    call_peer_hung_up: '對方已掛斷',
    call_no_answer: '對方未接聽',
    speak_on: '已開啟自動朗讀',
    speak_off: '已關閉自動朗讀',

    // 通話紀錄
    call_missed: '未接來電',
    duration_fmt: '通話 {0}',
    sentence_count: '{0} 句',
    today: '今天',
    yesterday: '昨天',
    delete_record_q: '刪除與 {0} 的通話紀錄與逐字稿？',
    clear_all_q: '刪除全部通話紀錄與逐字稿？此動作無法復原。',
    history_detail: '通話逐字稿',
    delete_record: '刪除這筆紀錄',
    delete_this_q: '刪除這筆通話紀錄？',

    // 設定
    settings: '設定',
    back: '返回',
    settings_account: '帳號',
    settings_account_desc: '你的帳號要告訴對方，對方才撥得進來。兩邊請填不同帳號。',
    my_account_hint: '我的帳號',
    peer_account_hint: '常用對方帳號（可留空）',
    settings_lang: '我說的語言',
    settings_lang_desc: '另一方會自動使用另一種語言。',
    settings_ui_lang: '介面語言',
    settings_ui_lang_desc: '只影響畫面上的文字，不影響通話翻譯。',
    settings_db: '連線（Firebase Realtime Database）',
    settings_db_desc: '兩邊填一樣的網址就能互相撥號，和 Android 版通用。',
    db_url_hint: '資料庫網址',
    db_secret_hint: '資料庫密鑰（測試規則可留空）',
    settings_translate: '翻譯服務',
    settings_translate_desc:
      '建議把金鑰放在 Netlify 的環境變數（TRANSLATE_API_KEY），網頁會自動走伺服器代理，金鑰不會外流。下面的欄位只在沒有代理時當備援用。',
    api_key_hint: 'API 金鑰（備援，會存在這台裝置）',
    settings_ring: '來電鈴聲',
    settings_ring_desc: '網頁無法讀取手機內建鈴聲，改用內建的電話鈴聲音效，響完設定的次數就停。',
    ring_times: '連續響 {0} 次',
    ring_test: '試聽',
    auto_listen: '接通後自動打開麥克風',
    auto_speak: '自動朗讀對方的話',
    test_connection: '測試連線與翻譯',
    testing: '測試中…',
    test_ok: '連線正常，翻譯測試：你好 → {0}',
    test_db_fail: '資料庫連線失敗：{0}',
    test_tr_fail: '資料庫正常，但翻譯失敗：{0}',
    reset_state: '清除殘留的通話狀態',
    reset_state_desc: '如果撥不出去、或一直跳出根本沒人在撥的來電，按這個把卡住的狀態清掉。不會影響設定與通話紀錄。',
    reset_done: '已清除，可以重新撥號了',
    reset_fail: '清除失敗：{0}',
    save: '儲存',
    saved: '已儲存',
    browser_note: '語音辨識需要 Chrome／Edge，且網站必須是 HTTPS。',

    // 錯誤與提示
    err_need_peer: '請輸入對方帳號',
    err_call_self: '不能撥給自己',
    err_setup_first: '請先到設定填入帳號與資料庫網址',
    err_finish_setup: '請先完成設定',
    err_account_required: '請填寫你的帳號',
    err_db_url: '網址必須以 https:// 開頭',
    err_dial: '撥號失敗：{0}',
    err_send: '訊息送出失敗：{0}',
    err_no_stt: '這個瀏覽器不支援語音辨識，請改用 Chrome 或 Edge',
    err_stt_stopped: '語音辨識一直中斷，已暫停。點一下麥克風可重新開始',
    err_stt_start: '無法啟動語音辨識，點一下麥克風可重試',
    err_mic_permission: '需要麥克風權限才能說話',
    err_tts_silent: '手機沒有發出聲音，請確認媒體音量，以及手機設定裡的文字轉語音',
    err_stt_network: '語音辨識連線不穩',
    err_tts_voice: '系統缺少{0}的語音，聲音可能不正確',
    err_no_push: '這個瀏覽器不支援背景推播',
    err_ios_install: 'iPhone 請先用分享選單「加入主畫面」，再從主畫面開啟',
    err_no_notify_perm: '沒有通知權限，背景時收不到來電',
    err_sw_failed: 'Service Worker 註冊失敗',
    err_no_vapid: '伺服器尚未設定推播金鑰（VAPID）',
    err_push_key: '取得推播金鑰失敗：{0}',
    err_push_sub: '建立推播訂閱失敗：{0}',
    err_push_save: '推播訂閱寫入資料庫失敗：{0}',
    alerts_on: '已啟用鈴聲與背景通知',
  },

  id: {
    app_name: 'ZhID Talk',
    lang_zh: 'Bahasa Mandarin',
    lang_id: 'Bahasa Indonesia',
    lang_pair: '{0} → {1}',
    ui_lang_switched: 'Tampilan diubah ke Bahasa Indonesia',
    update_prompt: 'Ada versi baru, ketuk untuk memperbarui',

    // Layar utama
    my_account: 'Akun saya: {0}',
    no_account: 'Akun belum diatur',
    standby_title: 'Status siaga',
    standby_offline: 'Belum online, panggilan tidak akan masuk',
    standby_online: 'Online: {0}',
    standby_reconnecting: 'Koneksi terputus, menyambung ulang…',
    enable_alerts: 'Aktifkan dering',
    enabling: 'Mengaktifkan…',
    enabled: 'Aktif',
    enable_again: 'Coba lagi',
    alerts_all_on: 'Nada dering dan notifikasi latar sudah aktif',
    alerts_ring_only: 'Nada dering aktif; notifikasi latar belum aktif: {0}',
    alerts_notify_granted: 'Notifikasi sudah diizinkan, tekan tombol sekali untuk memastikan langganan',
    alerts_ios_install: 'Di iPhone, pakai menu Bagikan lalu "Tambah ke Layar Utama" agar bisa menerima panggilan',
    dial_title: 'Mulai panggilan terjemahan',
    peer_hint: 'Akun lawan bicara',
    call_button: 'Panggil',
    setup_hint: 'Isi dulu akun dan alamat database di pengaturan',
    history_title: 'Riwayat panggilan',
    clear_all: 'Hapus semua',
    no_history: 'Belum ada riwayat panggilan',

    // Panggilan masuk
    incoming_call: 'Panggilan terjemahan masuk',
    accept: 'Jawab',
    reject: 'Tolak',
    speaks: 'Dia berbicara {0}',

    // Saat panggilan
    status_calling: 'Memanggil…',
    status_connected: 'Tersambung',
    status_translating: 'Menerjemahkan…',
    no_transcript: 'Belum ada percakapan di panggilan ini',
    mic_on_hint: 'Mendengarkan… tekan mikrofon lagi setelah selesai',
    mic_off_hint: 'Mikrofon mati, ketuk untuk mulai bicara',
    mic_auto_off: 'Mikrofon ditutup, tekan 🎙 untuk bicara',
    tap_to_replay: 'Ketuk untuk dengar lagi',
    tts_test: 'Coba suara',
    tts_test_desc: 'Pastikan HP ini bisa bersuara',
    tts_test_sample: 'Halo, ini tes suara.',
    end_call_q: 'Akhiri panggilan?',
    call_rejected: 'Panggilan ditolak',
    call_peer_hung_up: 'Lawan bicara menutup telepon',
    call_no_answer: 'Tidak dijawab',
    speak_on: 'Baca otomatis diaktifkan',
    speak_off: 'Baca otomatis dimatikan',

    // Riwayat
    call_missed: 'Panggilan tak terjawab',
    duration_fmt: 'Durasi {0}',
    sentence_count: '{0} kalimat',
    today: 'Hari ini',
    yesterday: 'Kemarin',
    delete_record_q: 'Hapus riwayat dan transkrip dengan {0}?',
    clear_all_q: 'Hapus semua riwayat dan transkrip? Tindakan ini tidak bisa dibatalkan.',
    history_detail: 'Transkrip panggilan',
    delete_record: 'Hapus catatan ini',
    delete_this_q: 'Hapus catatan panggilan ini?',

    // Pengaturan
    settings: 'Pengaturan',
    back: 'Kembali',
    settings_account: 'Akun',
    settings_account_desc:
      'Beritahu akun Anda ke lawan bicara supaya dia bisa menelepon. Kedua sisi harus memakai akun yang berbeda.',
    my_account_hint: 'Akun saya',
    peer_account_hint: 'Akun lawan bicara (boleh kosong)',
    settings_lang: 'Bahasa yang saya pakai',
    settings_lang_desc: 'Pihak lain otomatis memakai bahasa satunya.',
    settings_ui_lang: 'Bahasa tampilan',
    settings_ui_lang_desc: 'Hanya mengubah tulisan di layar, tidak mempengaruhi terjemahan panggilan.',
    settings_db: 'Koneksi (Firebase Realtime Database)',
    settings_db_desc: 'Kedua sisi memakai alamat yang sama supaya bisa saling menelepon.',
    db_url_hint: 'Alamat database',
    db_secret_hint: 'Kunci database (boleh kosong)',
    settings_translate: 'Layanan terjemahan',
    settings_translate_desc:
      'Sebaiknya simpan kunci di environment variable Netlify (TRANSLATE_API_KEY) supaya tidak bocor. Kolom di bawah hanya cadangan.',
    api_key_hint: 'Kunci API (cadangan, disimpan di perangkat ini)',
    settings_ring: 'Nada dering',
    settings_ring_desc:
      'Halaman web tidak bisa memakai nada dering bawaan ponsel, jadi memakai nada bawaan aplikasi dan berhenti setelah jumlah yang diatur.',
    ring_times: 'Berdering {0} kali',
    ring_test: 'Coba',
    auto_listen: 'Nyalakan mikrofon otomatis saat tersambung',
    auto_speak: 'Bacakan otomatis ucapan lawan bicara',
    test_connection: 'Uji koneksi dan terjemahan',
    testing: 'Menguji…',
    test_ok: 'Koneksi normal, uji terjemahan: 你好 → {0}',
    test_db_fail: 'Koneksi database gagal: {0}',
    test_tr_fail: 'Database normal, tetapi terjemahan gagal: {0}',
    reset_state: 'Bersihkan sisa status panggilan',
    reset_state_desc:
      'Kalau tidak bisa menelepon, atau muncul panggilan masuk padahal tidak ada yang menelepon, tekan ini. Pengaturan dan riwayat tidak terhapus.',
    reset_done: 'Sudah dibersihkan, silakan menelepon lagi',
    reset_fail: 'Gagal membersihkan: {0}',
    save: 'Simpan',
    saved: 'Tersimpan',
    browser_note: 'Pengenalan suara memerlukan Chrome atau Edge, dan situs harus HTTPS.',

    // Pesan kesalahan
    err_need_peer: 'Masukkan akun lawan bicara',
    err_call_self: 'Tidak bisa menelepon diri sendiri',
    err_setup_first: 'Isi dulu akun dan alamat database di pengaturan',
    err_finish_setup: 'Selesaikan pengaturan dulu',
    err_account_required: 'Isi akun Anda',
    err_db_url: 'Alamat harus diawali https://',
    err_dial: 'Gagal menelepon: {0}',
    err_send: 'Gagal mengirim pesan: {0}',
    err_no_stt: 'Peramban ini tidak mendukung pengenalan suara, pakai Chrome atau Edge',
    err_stt_stopped: 'Pengenalan suara terus terputus dan dihentikan. Ketuk mikrofon untuk mulai lagi',
    err_stt_start: 'Tidak bisa memulai pengenalan suara, ketuk mikrofon untuk mencoba lagi',
    err_mic_permission: 'Perlu izin mikrofon untuk bicara',
    err_tts_silent: 'Tidak ada suara. Periksa volume media dan pengaturan text-to-speech HP',
    err_stt_network: 'Koneksi pengenalan suara tidak stabil',
    err_tts_voice: 'Perangkat belum punya suara {0}, pengucapan mungkin tidak tepat',
    err_no_push: 'Peramban ini tidak mendukung notifikasi latar',
    err_ios_install: 'Di iPhone, pakai menu Bagikan lalu "Tambah ke Layar Utama", lalu buka dari sana',
    err_no_notify_perm: 'Tidak ada izin notifikasi, panggilan tidak masuk saat aplikasi tertutup',
    err_sw_failed: 'Pendaftaran Service Worker gagal',
    err_no_vapid: 'Server belum mengatur kunci notifikasi (VAPID)',
    err_push_key: 'Gagal mengambil kunci notifikasi: {0}',
    err_push_sub: 'Gagal membuat langganan notifikasi: {0}',
    err_push_save: 'Gagal menyimpan langganan notifikasi: {0}',
    alerts_on: 'Nada dering dan notifikasi latar sudah aktif',
  },
};

let UI_LANG = 'zh';

/** 取得翻譯字串，{0} {1} 會被後面的參數依序取代。 */
function t(key, ...args) {
  const dict = I18N[UI_LANG] || I18N.zh;
  let s = dict[key];
  if (s == null) s = I18N.zh[key];
  if (s == null) return key;
  args.forEach((v, i) => {
    s = s.split('{' + i + '}').join(String(v));
  });
  return s;
}

function setUiLang(lang) {
  UI_LANG = lang === 'id' ? 'id' : 'zh';
  document.documentElement.lang = UI_LANG === 'id' ? 'id' : 'zh-Hant';
}

/** 把畫面上所有標了 data-i18n 的文字換掉。 */
function applyI18n(root) {
  const scope = root || document;
  scope.querySelectorAll('[data-i18n]').forEach((n) => {
    n.textContent = t(n.getAttribute('data-i18n'));
  });
  scope.querySelectorAll('[data-i18n-ph]').forEach((n) => {
    n.placeholder = t(n.getAttribute('data-i18n-ph'));
  });
  scope.querySelectorAll('[data-i18n-title]').forEach((n) => {
    const label = t(n.getAttribute('data-i18n-title'));
    n.title = label;
    n.setAttribute('aria-label', label);
  });
}
