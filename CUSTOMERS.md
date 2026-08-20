# 新增客戶與賣貨使用手冊

給賣家（你）看的操作手冊。要怎麼把一位新客戶加進來、
怎麼用譯通跟他談生意、以及有哪些地方要注意。

**支援三種語言：中文、印尼文、英文。** 每個人只設定「自己講什麼」，
對方講什麼由對方自己設，接通後兩邊會自動對上——所以同一個帳號可以
今天跟印尼客戶講、明天跟講英文的客戶講，不必改設定。

---

## 一、先建立一個觀念：帳號沒有註冊

譯通的「帳號」不是會員帳號，**沒有註冊、沒有密碼、沒有審核**。
它只是一個你自己決定的代號，填進設定就生效。

所以「新增一位客戶」實際上只有兩件事：

1. 你幫他想一個代號
2. 你把**網址**和**資料庫網址**給他，請他填進設定

沒有後台、不用你去哪裡按「新增使用者」。

---

## 二、幫客戶取帳號的規則

| 規則 | 說明 |
| --- | --- |
| 不分大小寫 | `Sari` 和 `sari` 是同一個人 |
| 空白和 `.` `$` `#` `[` `]` `/` 會被自動換成底線 | 所以不要用這些字元 |
| **絕對不能重複** | 兩個人用同一個代號會互相搶來電 |
| 建議用英數 | 客戶也好打好記 |

**建議取法**（挑一種，全部客戶統一）：

- 名字＋編號：`sari01`、`budi02`、`dewi03`
- 名字＋手機末四碼：`sari8821`（幾乎不會撞名）

**你自己的代號固定一個就好**，例如 `aicom` 或 `laoban`，
所有客戶的「對方帳號」都填這個。你不需要為每個客戶換帳號。

> 建議開一份記事本或 Excel 記下「客戶姓名 → 代號」，
> 因為 App 目前沒有聯絡人清單（見第七節）。

---

## 三、新增一位客戶：你要做的

只要傳兩樣東西給他：

1. **網站網址**：你的 Netlify 網址（例如 `https://zhid-talk.netlify.app`）
2. **資料庫網址**：Firebase 那一串
   `https://xxx-default-rtdb.asia-southeast1.firebasedatabase.app`

> ⚠️ 資料庫網址**兩邊一定要一模一樣**，差一個字就永遠接不到對方。
> 建議直接複製貼上，不要用手打。

然後告訴他代號是什麼（例如 `sari01`），以及你的代號（`aicom`）。

**你這邊完全不用做設定。** 撥號時直接在撥號欄打他的代號就會通，
不需要事先「新增」到任何地方。

---

## 四、客戶那邊的五個步驟

把第五節的訊息（印尼文或英文）直接貼給他就好，以下以印尼文為例對照說明。
講英文的客戶步驟一樣，只是第 2 步選 **English**。

### 1. 用手機瀏覽器開網址

- Android → 用 **Chrome**
- iPhone → 用 **Safari**

### 2. 第一次開會直接停在設定頁

介面預設是中文。設定頁**最上面第一張卡片**就是介面語言，
請他點 **Bahasa Indonesia**，整個畫面會**立刻**變成印尼文，不必先按儲存。

（之後在主畫面隨時可以用左上角的 **ID／中** 按鈕切換。）

### 3. 填四個地方

| 印尼文畫面上的字 | 要填什麼 |
| --- | --- |
| **Akun saya**（我的帳號） | 你給他的代號，例如 `sari01` |
| **Akun lawan bicara**（對方帳號） | 你的代號，例如 `aicom` |
| **Bahasa yang saya pakai**（我說的語言） | 選 **Bahasa Indonesia** |
| **Alamat database**（資料庫網址） | 你給的 Firebase 網址 |

翻譯服務那格**留空就好**，網頁版的金鑰放在伺服器，客戶不需要填。

### 4. 按最下面綠色的 **Simpan**（儲存）

### 5. 回到主畫面按 **Aktifkan dering**（啟用鈴聲），並允許通知

這一步不能省。瀏覽器規定要使用者親自按過，才准許出聲和跳通知。

### 6.（重要）加到主畫面

- **iPhone**：Safari 下方分享鍵 → 加入主畫面。
  **iPhone 不加主畫面就收不到通知**，一定要做。
- **Android**：Chrome 右上角三個點 → 加到主畫面

---

## 五、可以直接複製給客戶的印尼文訊息

把 `<>` 裡面三處換成你的資料，整段貼到 WhatsApp 傳給客戶：

```
Halo! Kita bisa mengobrol dengan penerjemah otomatis. Saya bicara bahasa
Mandarin, Anda bicara bahasa Indonesia — aplikasi akan menerjemahkan dan
membacakannya. Gratis, tidak perlu daftar.

Cara pasang (5 menit):

1. Buka tautan ini di HP:
   <你的網站網址>
   (iPhone pakai Safari, Android pakai Chrome)

2. Halaman pengaturan langsung muncul dalam bahasa Mandarin.
   Di kotak paling atas, pilih "Bahasa Indonesia" — seluruh tampilan
   langsung berubah, tidak perlu menekan apa pun dulu.

3. Isi bagian ini:
   • Akun saya            : <客戶代號，例如 sari01>
   • Akun lawan bicara    : <你的代號，例如 aicom>
   • Bahasa yang saya pakai : Bahasa Indonesia
   • Alamat database      : <你的 Firebase 網址>
   (Bagian API key dikosongkan saja)

4. Tekan tombol hijau "Simpan" di paling bawah.

5. Di halaman utama, tekan "Aktifkan dering" lalu izinkan notifikasi.

6. Tambahkan ke layar utama supaya bisa menerima panggilan:
   • iPhone : tombol Bagikan → "Tambah ke Layar Utama"  (WAJIB)
   • Android: menu titik tiga → "Tambahkan ke layar utama"

Selesai. Nanti saya yang menelepon. Tekan tombol hijau untuk menjawab.

Cara bicara saat panggilan:
- Tekan tombol mikrofon 🎙 satu kali untuk mulai bicara
- Bicara satu kalimat, lalu berhenti sebentar dan tunggu terjemahannya
- Setelah selesai, tekan tombol mikrofon sekali lagi
- Kalau tombolnya berubah jadi 🔇, artinya mikrofon tertutup —
  tekan sekali lagi untuk bicara
```

### 給講英文的客戶

同一套流程，把下面這段貼給他就好（一樣換掉 `<>` 三處）：

```
Hi! We can talk through an automatic translator. I speak Chinese, you speak
English — the app translates and reads it out loud. Free, no sign-up.

Setup (5 minutes):

1. Open this link on your phone:
   <你的網站網址>
   (Safari on iPhone, Chrome on Android)

2. The settings page opens in Chinese. In the very first box,
   choose "English" — the whole screen switches over immediately.

3. Fill in:
   • My account            : <客戶代號，例如 john01>
   • Other person's account: <你的代號，例如 aicom>
   • The language I speak  : English
   • Database URL          : <你的 Firebase 網址>
   (Leave the API key field empty)

4. Tap the green "Save" button at the bottom.

5. On the main screen, tap "Enable ringtone & alerts" and allow notifications.

6. Add it to your home screen so you can receive calls:
   • iPhone : Share button → "Add to Home Screen"  (REQUIRED)
   • Android: three-dot menu → "Add to Home screen"

Done — I'll call you. Tap the green button to answer.

How to talk during a call:
- Tap the microphone button 🎙 once to start speaking
- Say one sentence, then pause and wait for the translation
- Tap the microphone again when you're finished
- If the button turns to 🔇 the mic is closed — tap once to speak again
```

---

## 六、談生意時的實際流程

1. 你在撥號欄打客戶代號 → 按**撥號**
2. 對方接聽後，兩邊都會看到逐字稿
3. **按一下麥克風 🎙 開始說話，說完再按一下**（見下面說明）
4. **一句一句講，講完停一秒**，等翻譯出來再講下一句
5. 講完掛斷，這通的逐字稿會留在通話紀錄裡

### 麥克風是「按一下開始、再按一下結束」

接通時麥克風會自動打開一次。之後：

- 按鈕是 **🎙**（綠色）＝正在聽，可以講
- 按鈕是 **🔇** ＝已關閉，按一下才會開始聽
- 停下來一段時間沒講話，它會自己收起來，畫面會跳「麥克風已收起」，
  要繼續講就再按一下

**為什麼要這樣設計**：Android 手機每啟動一次語音辨識就會「叮」一聲，
那是系統發的，網頁關不掉。原本講完一句就自動重開，整通電話一直在叮。
改成由你控制之後，只有真正要開口的那一下才會響。

### 沒聲音的時候

朗讀現在預設走**網路語音**（由伺服器產生聲音送到手機），
所以手機就算沒裝語音資料也唸得出來。萬一還是沒聲音：

- **點一下那則訊息**就會再唸一次
- 到 **設定 → 我說的語言 → 試唸** 確認這支手機出不出得了聲。
  唸完會跳訊息告訴你用的是「網路語音」還是「手機內建」
- 還是沒有：先看**媒體音量**是不是關的（按音量鍵時螢幕要顯示「媒體」）
- 網路不穩時會自動改用手機內建的聲音，聽起來會不太一樣，這是正常的

新客戶第一次設定完，建議請他按一次「試唸」，聽得到再開始通話。

> 網路語音每唸一句會產生少量費用。想省的話，設定頁可以關掉
> 「用網路語音朗讀」，改用手機內建的（免費，但要手機有裝語音資料）。

### 講價格和數量的訣竅

語音辨識最容易錯的就是數字。建議：

- 數字單獨講一句：「一箱三百五十元」→ 停 → 看螢幕
- 講完**看一眼螢幕上的譯文**，錯了就重講一次
- 重要的數字**請對方複誦一次**，兩邊逐字稿都留下記錄

### 逐字稿就是你的訂單依據

通話紀錄點進去可以看完整逐字稿，包含**原文和譯文兩行**，
談定的數量、價格、交期都在裡面。爭議時可以回頭查。

> 逐字稿存在手機本機。換手機、清瀏覽器資料就會不見，
> 重要的訂單建議另外抄一份或截圖。

---

## 七、目前的限制（先知道比較不會踩雷）

| 限制 | 影響 | 目前的做法 |
| --- | --- | --- |
| **沒有聯絡人清單** | 客戶多的時候要自己記代號 | 用記事本或 Excel 記「姓名 → 代號」 |
| **通話紀錄不能一鍵回撥** | 點紀錄是看逐字稿，不是回撥 | 撥號欄手動打代號 |
| **紀錄各存各的手機** | 你和客戶看到的是各自的紀錄，不同步 | 重要內容自己截圖 |
| **只能講不能打字** | 數字講錯只能重講 | 見上面「講價格的訣竅」 |

這幾項都可以做，需要的話再說。

---

## 八、安全性：客戶變多時要注意

所有客戶用的是**同一個 Firebase 資料庫**，而規則是公開讀寫的。
講白話就是：**拿到資料庫網址的人，技術上可以看到其他人的通話內容。**

一般客戶不會也不懂去翻，但既然是生意往來，還是說清楚：

- 客戶不多、彼此認識 → 可以接受
- 想降低風險 → 定期到 Firebase 主控台把 `calls` 節點整個刪掉
  （通話結束後那些資料就沒用了，刪掉不影響功能）
- 要真正做到客戶之間互相看不到 → 需要改成每個帳號各自登入驗證，
  這是比較大的改動

另外提醒：**測試模式的規則 30 天會過期**，過期後所有人都連不上。
到期前記得照 `DEPLOY.md` 步驟 1 把規則改成長期版本。

---

## 九、常見狀況

| 狀況 | 原因 | 處理 |
| --- | --- | --- |
| 撥過去對方沒反應 | 資料庫網址不一樣 | 兩邊逐字比對，最好複製貼上 |
| 對方收不到通知 | 沒按「啟用鈴聲」、iPhone 沒加主畫面 | 回第四節第 5、6 步 |
| 兩個客戶會互相搶到來電 | 代號重複了 | 改其中一個的「我的帳號」 |
| 翻成了錯的語言 | 有一邊還是舊版 | 兩邊都更新到最新版；新版才會宣告自己的語言 |
| 客戶說看不懂畫面 | 還是中文介面 | 主畫面按左上角「ID」，或設定頁最上面那張卡片選 Bahasa Indonesia |
| 對方的話沒唸出來 | 媒體音量關掉、或網路不通 | 先按設定頁的「試唸」測；再檢查媒體音量，見第六節「沒聲音的時候」 |
| 一直跳出沒人撥的來電 | 上次通話的殘留狀態 | 設定頁按「清除殘留的通話狀態」 |

其他問題看 `DEPLOY.md` 第八節的疑難排解表。
