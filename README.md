# 譯通（ZhIdTalk）— 中文 ↔ 印尼文即時翻譯通話

一個 Android App。你說中文，對方的手機顯示印尼文並唸出來；對方說印尼文，你的手機顯示中文並唸出來。
支援帳號撥號、來電顯示與內建鈴聲、掛斷，以及可刪除的通話紀錄。

## 它是怎麼運作的

這個 App **不傳送語音串流**，而是走「本地辨識 → 翻譯 → 傳文字 → 對方本地朗讀」：

1. 手機用內建的語音辨識，把你說的話轉成文字
2. 呼叫翻譯 API 翻成對方的語言
3. 把原文與譯文一起送到訊令伺服器
4. 對方手機收到後顯示出來，並用內建語音朗讀

這樣做的好處：一般行動網路就跑得動、耗流量極低、雙方都留有完整逐字稿。
代價是會有大約一到兩秒的延遲，講話時請一句一句說，停頓一下系統就會自動送出。

訊令與文字傳輸走 Firebase Realtime Database 的 REST / SSE 介面，
所以**不需要 google-services.json**，也不需要架自己的伺服器。

## 安裝

### 方法一：直接下載編譯好的 APK（建議）

1. 進入這個 repo 的 **Actions** 分頁
2. 點最新一次 **Build APK** 的執行紀錄
3. 在下方 **Artifacts** 下載 `zhidtalk-debug-apk`
4. 解壓縮後把 `app-debug.apk` 傳到手機安裝（要允許「安裝未知來源應用程式」）

有 `adb` 的話也可以直接灌：

```
adb install -r app-debug.apk
```

### 方法二：用 Android Studio 開啟

直接開啟這個資料夾，等 Gradle 同步完成後按執行即可。

## 使用前的設定（兩支手機都要做）

### 1. 建立 Firebase Realtime Database（免費，約三分鐘）

1. 到 <https://console.firebase.google.com> 建立一個專案
2. 左側選 **建構 → Realtime Database → 建立資料庫**
3. 位置選離你近的（例如 `asia-southeast1`），安全性規則先選 **測試模式**
4. 複製資料庫網址，長得像 `https://你的專案-default-rtdb.asia-southeast1.firebasedatabase.app`

測試模式的規則 30 天後會過期。要長期使用，把規則改成這樣就好
（只開放這個 App 用到的兩個節點）：

```json
{
  "rules": {
    "users": { ".read": true, ".write": true },
    "calls": { ".read": true, ".write": true },
    "healthcheck": { ".read": true, ".write": true }
  }
}
```

> 這組規則是公開讀寫的，適合自己人小範圍使用。若要更嚴謹，
> 可在 Firebase 專案設定 → 服務帳戶 產生資料庫密鑰，填進 App 的「資料庫密鑰」欄位，
> 並把規則改成 `false`（密鑰擁有完整權限，可繞過規則）。

### 2. 準備翻譯 API 金鑰

App 支援三種，擇一即可：

| 服務 | 取得方式 | 特性 |
| --- | --- | --- |
| Google 翻譯 API | Google Cloud Console 啟用 Cloud Translation API，建立 API 金鑰 | 延遲最低（約 0.3 秒），通話體驗最順 |
| Gemini API | <https://aistudio.google.com/apikey> 直接產生 | 有免費額度，口語語氣自然，約慢 1 秒 |
| OpenAI API | <https://platform.openai.com/api-keys> 產生 | 用 `gpt-4o-mini`，口語與稱謂處理好，約慢 1 秒 |

> 通話講求即時，若覺得對話節奏被拖慢，改用 Google 翻譯 API 會明顯順一些；
> 若在意語氣自然（例如長輩、雇主與看護之間的對話），用 Gemini 或 OpenAI 較好。

### 3. 在 App 內填寫設定

打開 App 右上角的齒輪：

- **我的帳號**：兩支手機要填**不同**的名字，例如一支填 `ayah`、另一支填 `sari`
- **常用對方帳號**：可留空，填了主畫面會自動帶入
- **我說的語言**：中文那支選「中文」，印尼文那支選「印尼文」
- **資料庫網址**：兩支手機填**一樣**的網址
- **翻譯服務 + API 金鑰**：選服務並貼上金鑰
- **來電鈴聲**：預設連續響 2 次，可調 1～5 次
- 最後按「測試連線與金鑰」確認都正常，再按儲存

### 4. 手機端的語音資料

第一次使用前，請確認手機已安裝兩種語言的語音資料：

- **設定 → 系統 → 語言與輸入設定 → 文字轉語音輸出**，
  在 Google 語音服務裡下載「中文」與「Indonesia」的語音資料
- 語音辨識同樣建議下載離線資料，辨識會更快

## 使用方式

1. 兩支手機都打開 App（App 會在背景保持連線，才接得到來電）
2. 在主畫面輸入對方帳號，按「撥號」
3. 對方手機會響鈴（手機內建的預設鈴聲，響完設定的次數就停）並跳出全螢幕來電畫面；
   如果 App 正開著，主畫面上方也會出現來電卡片
4. 接聽後直接說話。停頓約一秒，系統就會自動辨識、翻譯並送給對方
5. 畫面上每一則都會同時顯示原文（小字）與譯文（大字），自己的靠右、對方的靠左
6. 按紅色按鈕掛斷

通話中還可以：

- 點中間的麥克風按鈕暫時關閉／開啟收音
- 點左邊的喇叭按鈕切換擴音

## 通話紀錄

主畫面下方就是通話紀錄，會標示撥出、接聽、未接與通話時間。

- 點一筆 → 看完整逐字稿
- 點右側垃圾桶或長按 → 刪除單筆
- 右上角「全部刪除」→ 清空全部

所有紀錄只存在手機本機，刪除後不會留存。

## 小提醒

- 這個 App 只在中文與印尼文之間互譯，所以兩支手機的「我說的語言」請設成不同的兩種
- 朗讀時會自動暫停收音，避免把喇叭的聲音又辨識一次
- 通話中請讓 App 保持在前景；螢幕會自動保持開啟
- 翻譯 API 會依用量計費，請自行留意 Google Cloud 的帳單設定

## 專案結構

```
app/src/main/java/com/hsienchenglu/zhidtalk/
├── MainActivity.kt          撥號、來電卡片、通話紀錄
├── CallActivity.kt          通話畫面：辨識、翻譯、收發、朗讀
├── IncomingCallActivity.kt  全螢幕來電畫面
├── SettingsActivity.kt      設定
├── HistoryDetailActivity.kt 單筆逐字稿
├── CallService.kt           背景來電監聽與響鈴
├── Signaling.kt             Firebase REST / SSE 訊令
├── TranslateClient.kt       Google 翻譯 / Gemini
├── SpeechManager.kt         語音辨識與朗讀
├── Ringer.kt                內建鈴聲，可設定次數
└── HistoryStore.kt          通話紀錄本機儲存
```

---

# 網頁版（web/）

同一套通訊協定的瀏覽器版本，可以部署到 Netlify。**網頁版和 Android 版互通**——
只要兩邊填同一個 Firebase 資料庫網址，網頁可以撥給手機 App，手機也可以撥給網頁。

## 部署到 Netlify

**方法一：拖曳上傳（最快）**

把 `web` 資料夾整個拖進 <https://app.netlify.com/drop> 即可。

**方法二：連結 GitHub（建議，之後改動會自動更新）**

在 Netlify 選 Add new site → Import an existing project → 選這個 repo，然後設定：

- Base directory：`web`
- Build command：留空
- Publish directory：`.`

## 設定翻譯金鑰（重要）

金鑰若寫在前端，任何人打開網頁都能看到。所以網頁版預設走一個 Netlify Function 代理，
金鑰只留在伺服器：

1. Netlify 後台 → Site configuration → Environment variables
2. 新增 `TRANSLATE_API_KEY`，值是你的 Google 翻譯、Gemini 或 OpenAI 金鑰
3. 若用 Gemini，再加一個 `TRANSLATE_PROVIDER` = `gemini`
   （OpenAI 金鑰因為固定是 `sk-` 開頭，會被自動辨識，不設也可以）
4. 想換模型的話（僅 Gemini／OpenAI），可再加 `TRANSLATE_MODEL`，
   例如 `gpt-4o` 或 `gemini-2.5-pro`；不設就用預設的 `gpt-4o-mini`／`gemini-2.5-flash`
5. 重新部署一次讓變數生效

沒有設環境變數時，網頁會退回使用設定頁裡填的金鑰（存在瀏覽器本機）。
這種情況請務必到 Google Cloud 主控台幫金鑰加上 HTTP 參照網址限制，只允許你的網域。

## 設定背景通知（PWA + Web Push）

做完這一段，網頁**關著也能收到來電通知**。沒做的話，網頁必須開著才收得到。

### 1. 產生 VAPID 金鑰

打開網站的 <code>/vapid.html</code>（例如 `https://你的網站.netlify.app/vapid.html`），
按「產生金鑰」。金鑰是在你的瀏覽器裡產生的，不會傳到任何伺服器。

### 2. 填進 Netlify 環境變數

| Key | Value |
| --- | --- |
| `VAPID_PUBLIC_KEY` | 上一步的公開金鑰 |
| `VAPID_PRIVATE_KEY` | 上一步的私密金鑰（不要外流） |
| `VAPID_SUBJECT` | 選填，例如 `mailto:you@example.com` |

存好後**重新部署一次**，函式才讀得到。

### 3. 手機端加入主畫面

- **Android Chrome**：選單 → 「安裝應用程式」或「加到主畫面」
- **iPhone Safari**：分享 → 「加入主畫面」。**iOS 必須從主畫面圖示開啟才收得到推播**，
  而且需要 iOS 16.4 以上

### 4. 按一次「啟用鈴聲與通知」

主畫面上方那顆按鈕。這一下點擊做三件事：解鎖瀏覽器的音訊播放（否則鈴聲響不出來）、
要求通知權限、建立推播訂閱。每支裝置只需要按一次。

## 介面語言（中文／印尼文）

網頁介面本身支援中文與印尼文，**和通話翻譯是兩回事** ——
印尼看護把介面切成印尼文，仍然是說印尼文、聽到中文的翻譯。

- **自動判斷**：第一次使用時，介面語言會跟著「我說的語言」走。
  設成印尼文的那支手機，介面就自動是印尼文。
- **手動切換**：主畫面左上角的 `中` / `ID` 按鈕，一鍵切換。
  設定頁最上方也有同樣的選項。
- 背景通知的文字也會跟著切換。

## 使用方式

1. 用手機或電腦的 **Chrome／Edge** 開啟網站（必須是 HTTPS，Netlify 預設就是）
2. 第一次會直接進設定頁：填帳號、我說的語言、Firebase 資料庫網址
3. 回主畫面按一次 **「啟用鈴聲與通知」**
4. 輸入對方帳號按撥號；對方的網頁會響鈴並跳出全螢幕來電畫面，
   若對方沒開著網頁則會收到系統通知，點一下就進入接聽畫面
5. 接聽後直接說話，停頓一下就會自動辨識、翻譯並送出

## 背景通知是怎麼運作的

推播刻意設計成**不夾帶任何內容**，只是「敲一下」對方的瀏覽器：

1. 撥號方寫入 Firebase，並呼叫 `/api/push`
2. 函式用 VAPID 簽一個 JWT，送一則空推播到對方的推播端點
3. 對方的 Service Worker 被系統喚醒，自己去 Firebase 查是誰在撥
4. 顯示通知，點一下開啟網頁進入接聽畫面

這樣就不需要實作 RFC 8291 的內容加密，也不需要任何 npm 套件，
而且來電資訊不會經過 Google 或 Apple 的推播伺服器。

## 網頁版與 Android 版的差別

| | Android App | 網頁版（已設定推播） |
| --- | --- | --- |
| 來電鈴聲 | 手機內建的預設鈴聲，連響 2 次 | 網頁開著時：合成鈴聲連響 2 次<br>網頁關著時：**只有一聲系統通知音** |
| 背景接聽 | 前景服務常駐，App 關著也接得到 | 收得到通知，但可能延遲數秒到數十秒 |
| 來電呈現 | 全螢幕跳出，鎖定畫面也會亮 | 一則通知，點開才進入接聽畫面 |
| 省電模式 | 前景服務較不受影響 | 可能被系統延後 |
| iPhone | 不支援 | 支援（iOS 16.4+，須加入主畫面） |
| 語音辨識與朗讀 | 系統內建 | 瀏覽器內建（需 Chrome／Edge；iOS Safari 支援不完整） |

**Android 手機建議裝 App**，來電體驗和真的電話一樣；
**iPhone 只能用網頁版**，加入主畫面後可以收到通知，但它是「通知」不是「來電」——
不會持續響鈴，比較容易漏接。

## 本機測試

```
cd web && python3 -m http.server 8899
```

然後開 <http://localhost:8899>。注意 `localhost` 才允許使用麥克風，
用 IP 位址開會被瀏覽器擋下。翻譯代理只有部署到 Netlify（或用 `netlify dev`）時才會生效。
