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

App 支援兩種，擇一即可：

| 服務 | 取得方式 | 特性 |
| --- | --- | --- |
| Google 翻譯 API | Google Cloud Console 啟用 Cloud Translation API，建立 API 金鑰 | 延遲最低，通話體驗最好 |
| Gemini API | <https://aistudio.google.com/apikey> 直接產生 | 有免費額度，語氣較自然，稍慢 |

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
