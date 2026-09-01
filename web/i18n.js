/*
 * 介面語言：中文 / 印尼文 / 英文。
 *
 * 這裡只管「介面上的字」，和通話翻譯是兩回事——
 * 印尼客戶把介面切成印尼文，仍然是說印尼文、聽到自己語言的翻譯。
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
    lang_en: '英文',
    lang_pair: '{0} → {1}',
    ui_lang_switched: '介面已切換成中文',
    update_prompt: '有新版本，點一下更新',

    // 主畫面
    my_account: '我的帳號：{0}',
    my_lang: '我說：{0}',
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
    alerts_pc_install: '電腦版：視窗關掉就收不到來電。按網址列的「安裝」把它裝成應用程式，才會在背景等來電',
    alerts_ios_install: 'iPhone 請用分享選單「加入主畫面」，才能在背景收到來電',
    dial_title: '撥打翻譯通話',
    peer_hint: '對方帳號',
    call_button: '撥號',
    setup_hint: '請先到設定填入帳號、資料庫網址',
    setup_hint_account: '請先到設定填入你的帳號',
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
    status_reconnecting: '連線中斷，重新連線中…',
    status_translating: '翻譯中…',
    no_transcript: '這通電話還沒有對話內容',
    mic_on_hint: '聆聽中…說完請再按一下麥克風',
    mic_off_hint: '麥克風已關閉，點一下開始說話',
    mic_auto_off: '麥克風已收起，要說話請按一下 🎙',
    send_failed_retry: '這句沒送出去，點一下重送',
    tap_to_replay: '點一下重聽',
    tts_test: '試唸',
    tts_test_desc: '確認這支手機唸得出聲音',
    tts_test_sample: '你好，這是朗讀測試。',
    tts_via_server: '✅ 用的是網路語音',
    tts_via_builtin: '⚠️ 退回手機內建的聲音（網路語音失敗）',
    tts_via_none: '❌ 完全沒唸出來，請檢查媒體音量',
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
    settings_text_size: '字級',
    settings_text_size_desc: '看不清楚就調大一點，整個 App 都會跟著變',
    text_size_m: '標準',
    text_size_l: '大',
    text_size_xl: '特大',
    settings_account: '帳號',
    settings_account_desc: '你的帳號要告訴對方，對方才撥得進來。兩邊請填不同帳號。',
    my_account_hint: '我的帳號',
    peer_account_hint: '常用對方帳號（可留空）',
    settings_lang: '我說的語言',
    settings_lang_desc: '你講的語言。對方講什麼語言由他自己設定，接通後會自動對上。',
    settings_ui_lang: '介面語言',
    settings_ui_lang_desc: '只影響畫面上的文字，不影響通話翻譯。',
    settings_db: '連線（Firebase Realtime Database）',
    settings_db_desc: '已經預先填好了，一般不用動。兩邊網址一樣才能互相撥號。',
    db_url_hint: '資料庫網址',
    db_secret_hint: '資料庫密鑰（測試規則可留空）',
    settings_translate: '翻譯服務',
    settings_translate_desc:
      '建議把金鑰放在 Netlify 的環境變數（TRANSLATE_API_KEY），網頁會自動走伺服器代理，金鑰不會外流。下面的欄位只在沒有代理時當備援用。',
    api_key_hint: 'API 金鑰（備援，會存在這台裝置）',
    settings_ring: '來電鈴聲',
    settings_ring_desc: '網頁無法讀取手機內建鈴聲，改用內建的電話鈴聲音效，響完設定的次數就停。',
    ring_times: '連續響 {0} 次',
    ring_vol: '鈴聲音量',
    ring_vol_level: '第 {0} 段',
    ring_test: '試聽',
    auto_listen: '接通後自動打開麥克風',
    server_tts: '用網路語音朗讀（比較自然）',
    server_tts_desc: '關掉的話改用手機內建的聲音，不需要網路也不會產生費用。網路語音失敗時會自動退回內建的。',
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
    version_label: '版本 {0}',

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
    err_storage_full: '手機的儲存空間滿了，設定沒有存起來。請刪掉一些通話紀錄再試',
    err_sw_failed: 'Service Worker 註冊失敗',
    err_sw_activating: '背景服務還沒啟動完成（{0}），請過幾秒再按一次「重新啟用」',
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
    lang_en: 'Bahasa Inggris',
    lang_pair: '{0} → {1}',
    ui_lang_switched: 'Tampilan diubah ke Bahasa Indonesia',
    update_prompt: 'Ada versi baru, ketuk untuk memperbarui',

    // Layar utama
    my_account: 'Akun saya: {0}',
    my_lang: 'Saya bicara: {0}',
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
    alerts_pc_install: 'Di komputer: kalau jendela ditutup, panggilan tidak masuk. Tekan "Install" di bilah alamat agar aplikasi menunggu di latar belakang',
    alerts_ios_install: 'Di iPhone, pakai menu Bagikan lalu "Tambah ke Layar Utama" agar bisa menerima panggilan',
    dial_title: 'Mulai panggilan terjemahan',
    peer_hint: 'Akun lawan bicara',
    call_button: 'Panggil',
    setup_hint: 'Isi dulu akun dan alamat database di pengaturan',
    setup_hint_account: 'Isi dulu akun Anda di pengaturan',
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
    status_reconnecting: 'Koneksi terputus, menyambung ulang…',
    status_translating: 'Menerjemahkan…',
    no_transcript: 'Belum ada percakapan di panggilan ini',
    mic_on_hint: 'Mendengarkan… tekan mikrofon lagi setelah selesai',
    mic_off_hint: 'Mikrofon mati, ketuk untuk mulai bicara',
    mic_auto_off: 'Mikrofon ditutup, tekan 🎙 untuk bicara',
    send_failed_retry: 'Kalimat ini gagal terkirim, ketuk untuk kirim ulang',
    tap_to_replay: 'Ketuk untuk dengar lagi',
    tts_test: 'Coba suara',
    tts_test_desc: 'Pastikan HP ini bisa bersuara',
    tts_test_sample: 'Halo, ini tes suara.',
    tts_via_server: '✅ Memakai suara dari internet',
    tts_via_builtin: '⚠️ Kembali ke suara bawaan HP (suara internet gagal)',
    tts_via_none: '❌ Tidak ada suara sama sekali, periksa volume media',
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
    settings_text_size: 'Ukuran huruf',
    settings_text_size_desc: 'Kalau kurang jelas, perbesar saja — seluruh aplikasi ikut berubah',
    text_size_m: 'Normal',
    text_size_l: 'Besar',
    text_size_xl: 'Sangat besar',
    settings_account: 'Akun',
    settings_account_desc:
      'Beritahu akun Anda ke lawan bicara supaya dia bisa menelepon. Kedua sisi harus memakai akun yang berbeda.',
    my_account_hint: 'Akun saya',
    peer_account_hint: 'Akun lawan bicara (boleh kosong)',
    settings_lang: 'Bahasa yang saya pakai',
    settings_lang_desc: 'Bahasa yang Anda pakai. Lawan bicara mengatur bahasanya sendiri, dan akan dicocokkan otomatis saat tersambung.',
    settings_ui_lang: 'Bahasa tampilan',
    settings_ui_lang_desc: 'Hanya mengubah tulisan di layar, tidak mempengaruhi terjemahan panggilan.',
    settings_db: 'Koneksi (Firebase Realtime Database)',
    settings_db_desc: 'Sudah terisi otomatis, biasanya tidak perlu diubah. Kedua sisi harus memakai alamat yang sama.',
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
    ring_vol: 'Volume dering',
    ring_vol_level: 'Tingkat {0}',
    ring_test: 'Coba',
    auto_listen: 'Nyalakan mikrofon otomatis saat tersambung',
    server_tts: 'Pakai suara dari internet (lebih alami)',
    server_tts_desc: 'Kalau dimatikan, memakai suara bawaan HP — tanpa internet dan tanpa biaya. Kalau suara internet gagal, otomatis kembali ke suara bawaan.',
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
    version_label: 'Versi {0}',

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
    err_storage_full: 'Penyimpanan penuh, pengaturan tidak tersimpan. Hapus beberapa riwayat panggilan lalu coba lagi',
    err_sw_failed: 'Pendaftaran Service Worker gagal',
    err_sw_activating: 'Layanan latar belum siap ({0}), tunggu beberapa detik lalu tekan lagi',
    err_no_vapid: 'Server belum mengatur kunci notifikasi (VAPID)',
    err_push_key: 'Gagal mengambil kunci notifikasi: {0}',
    err_push_sub: 'Gagal membuat langganan notifikasi: {0}',
    err_push_save: 'Gagal menyimpan langganan notifikasi: {0}',
    alerts_on: 'Nada dering dan notifikasi latar sudah aktif',
  },
  en: {
    app_name: 'ZhID Talk',
    lang_zh: 'Chinese',
    lang_id: 'Indonesian',
    lang_en: 'English',
    lang_pair: '{0} \u2192 {1}',
    ui_lang_switched: 'Interface switched to English',
    update_prompt: 'A new version is available \u2014 tap to update',

    // 主畫面
    my_account: 'My account: {0}',
    my_lang: 'I speak: {0}',
    no_account: 'No account set yet',
    standby_title: 'Standby',
    standby_offline: 'Offline \u2014 cannot receive calls',
    standby_online: 'Online: {0}',
    standby_reconnecting: 'Connection lost, reconnecting\u2026',
    enable_alerts: 'Enable ringtone & alerts',
    enabling: 'Enabling\u2026',
    enabled: 'Enabled',
    enable_again: 'Enable again',
    alerts_all_on: 'Ringtone and background alerts are on',
    alerts_ring_only: 'Ringtone on; background alerts off: {0}',
    alerts_notify_granted: 'Notifications allowed \u2014 tap once more to confirm the push subscription',
    alerts_pc_install: 'On a computer: close the window and calls stop arriving. Use "Install" in the address bar so it waits for calls in the background',
    alerts_ios_install: 'On iPhone, use Share \u2192 Add to Home Screen to receive calls in the background',
    dial_title: 'Start a translated call',
    peer_hint: "Other person's account",
    call_button: 'Call',
    setup_hint: 'Fill in your account and database URL in Settings first',
    setup_hint_account: 'Fill in your account in Settings first',
    history_title: 'Call history',
    clear_all: 'Delete all',
    no_history: 'No calls yet',

    // 來電
    incoming_call: 'Incoming translated call',
    accept: 'Answer',
    reject: 'Decline',
    speaks: 'They speak {0}',

    // 通話中
    status_calling: 'Calling\u2026',
    status_connected: 'Connected',
    status_reconnecting: 'Connection lost — reconnecting…',
    status_translating: 'Translating\u2026',
    no_transcript: 'Nothing has been said on this call yet',
    mic_on_hint: 'Listening\u2026 tap the mic again when you are done',
    mic_off_hint: 'Mic is off \u2014 tap to start speaking',
    mic_auto_off: 'Mic closed. Tap \ud83c\udf99 to speak',
    send_failed_retry: 'This line was not sent — tap to send again',
    tap_to_replay: 'Tap to hear it again',
    tts_test: 'Test voice',
    tts_test_desc: 'Check that this phone can speak',
    tts_test_sample: 'Hello, this is a voice test.',
    tts_via_server: '\u2705 Using the online voice',
    tts_via_builtin: '\u26a0\ufe0f Fell back to the phone voice (online voice failed)',
    tts_via_none: '\u274c No sound at all \u2014 check the media volume',
    end_call_q: 'End this call?',
    call_rejected: 'They declined',
    call_peer_hung_up: 'They hung up',
    call_no_answer: 'No answer',
    speak_on: 'Auto read-aloud on',
    speak_off: 'Auto read-aloud off',

    // 通話紀錄
    call_missed: 'Missed call',
    duration_fmt: 'Call {0}',
    sentence_count: '{0} lines',
    today: 'Today',
    yesterday: 'Yesterday',
    delete_record_q: 'Delete the call record and transcript with {0}?',
    clear_all_q: 'Delete every call record and transcript? This cannot be undone.',
    history_detail: 'Call transcript',
    delete_record: 'Delete this record',
    delete_this_q: 'Delete this call record?',

    // 設定
    settings: 'Settings',
    back: 'Back',
    settings_text_size: 'Text size',
    settings_text_size_desc: 'Hard to read? Make it bigger — the whole app follows',
    text_size_m: 'Normal',
    text_size_l: 'Large',
    text_size_xl: 'Extra large',
    settings_account: 'Account',
    settings_account_desc: 'Tell the other person your account so they can call you. The two sides must use different accounts.',
    my_account_hint: 'My account',
    peer_account_hint: 'Usual contact (optional)',
    settings_lang: 'The language I speak',
    settings_lang_desc: 'The language you speak. The other side sets their own, and the two are matched automatically once connected.',
    settings_ui_lang: 'Interface language',
    settings_ui_lang_desc: 'Only changes the words on screen; it does not affect call translation.',
    settings_db: 'Connection (Firebase Realtime Database)',
    settings_db_desc: 'Already filled in for you — normally no need to change it. Both sides must use the same URL.',
    db_url_hint: 'Database URL',
    db_secret_hint: 'Database secret (leave blank with test rules)',
    settings_translate: 'Translation service',
    settings_translate_desc:
      'Keep the key in a Netlify environment variable (TRANSLATE_API_KEY) so the page goes through the server proxy and the key never leaks. The field below is only a fallback when there is no proxy.',
    api_key_hint: 'API key (fallback, stored on this device)',
    settings_ring: 'Ringtone',
    settings_ring_desc: 'A web page cannot use the phone ringtone, so a built-in ring sound is used and stops after the set number of rings.',
    ring_times: 'Ring {0} times',
    ring_vol: 'Ring volume',
    ring_vol_level: 'Level {0}',
    ring_test: 'Preview',
    auto_listen: 'Open the mic automatically when connected',
    server_tts: 'Use the online voice (sounds more natural)',
    server_tts_desc: 'Turn this off to use the phone voice instead \u2014 no internet needed and no cost. If the online voice fails it falls back automatically.',
    auto_speak: 'Read the other side aloud',
    test_connection: 'Test connection & translation',
    testing: 'Testing\u2026',
    test_ok: 'Connection fine. Translation test: hello \u2192 {0}',
    test_db_fail: 'Database connection failed: {0}',
    test_tr_fail: 'Database is fine, but translation failed: {0}',
    reset_state: 'Clear leftover call state',
    reset_state_desc: 'If you cannot place calls, or phantom calls keep appearing, tap this to clear the stuck state. Settings and call history are not affected.',
    reset_done: 'Cleared \u2014 you can call again',
    reset_fail: 'Could not clear: {0}',
    save: 'Save',
    saved: 'Saved',
    browser_note: 'Speech recognition needs Chrome or Edge, and the site must be HTTPS.',
    version_label: 'Version {0}',

    // 錯誤與提示
    err_need_peer: "Enter the other person's account",
    err_call_self: 'You cannot call yourself',
    err_setup_first: 'Fill in your account and database URL in Settings first',
    err_finish_setup: 'Finish the setup first',
    err_account_required: 'Enter your account',
    err_db_url: 'The URL must start with https://',
    err_dial: 'Could not place the call: {0}',
    err_send: 'Could not send the message: {0}',
    err_no_stt: 'This browser does not support speech recognition \u2014 use Chrome or Edge',
    err_stt_stopped: 'Speech recognition keeps dropping, so it is paused. Tap the mic to start again',
    err_stt_start: 'Could not start speech recognition. Tap the mic to retry',
    err_mic_permission: 'Microphone permission is needed to speak',
    err_tts_silent: 'The phone made no sound. Check the media volume and the text-to-speech settings',
    err_stt_network: 'Speech recognition connection is unstable',
    err_tts_voice: 'No {0} voice installed \u2014 the pronunciation may be off',
    err_no_push: 'This browser does not support background push',
    err_ios_install: 'On iPhone, use Share \u2192 Add to Home Screen, then open it from there',
    err_no_notify_perm: 'Without notification permission you will miss calls in the background',
    err_storage_full: 'Storage is full, so the settings were not saved. Delete some call history and try again',
    err_sw_failed: 'Service Worker registration failed',
    err_sw_activating: 'The background service is not ready yet ({0}) — wait a few seconds and tap again',
    err_no_vapid: 'The server has no push key (VAPID) configured',
    err_push_key: 'Could not get the push key: {0}',
    err_push_sub: 'Could not create the push subscription: {0}',
    err_push_save: 'Could not save the push subscription: {0}',
    alerts_on: 'Ringtone and background alerts enabled',
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

/** 介面語言的循環順序，也是設定頁選項的順序 */
const UI_LANGS = ['zh', 'id', 'en'];
const HTML_LANG = { zh: 'zh-Hant', id: 'id', en: 'en' };

function setUiLang(lang) {
  UI_LANG = UI_LANGS.includes(lang) ? lang : 'zh';
  document.documentElement.lang = HTML_LANG[UI_LANG];
}

/** 左上角切換鍵：回傳下一個語言 */
const nextUiLang = (lang) => UI_LANGS[(UI_LANGS.indexOf(lang) + 1) % UI_LANGS.length];

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
