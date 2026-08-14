# 譯通 部署與設定筆記

> 建立日期：2026-08-13　最後更新：2026-08-14
> 這份筆記記錄從零建立整套系統的完整步驟、所有帳號與金鑰的位置、
> 實際踩到的問題與解法，以及日後維護要注意的事。
>
> **想新增客戶、把網址給印尼買家用，看另一份 `CUSTOMERS.md`**——
> 那裡有帳號命名規則、客戶端設定步驟，以及可以直接貼給對方的印尼文說明。

---

## 一、成品清單

| 項目 | 位置 |
| --- | --- |
| 網頁版 | <https://zhid-talk.netlify.app> |
| Netlify 後台 | <https://app.netlify.com/projects/zhid-talk> |
| 程式碼（目前備份處） | <https://github.com/Aicom885/zhidtalk> |
| 程式碼（原始 repo） | <https://github.com/hsienchenglu/hsienchenglu> |
| 分支 | `claude/chinese-indonesian-translation-app-lqptxh` |
| Android APK | GitHub → Actions → Build APK → Artifacts |
| VAPID 金鑰產生器 | <https://zhid-talk.netlify.app/vapid.html> |

> 原始 repo 屬於 `hsienchenglu` 帳號，但日常登入的是 `Aicom885`，
> 推不上去（見 6-4b），所以改推到 `Aicom885/zhidtalk`。**以這個為準。**

---

## 二、系統架構

### 核心設計：不傳語音，只傳文字

這套系統**沒有語音串流**，走的是「本地辨識 → 翻譯 → 傳文字 → 對方本地朗讀」：

```
   我這一端                    雲端                     對方那一端
┌──────────────┐                                    ┌──────────────┐
│ 1. 語音辨識   │                                    │ 4. 顯示文字   │
│   （手機／    │                                    │ 5. 語音朗讀   │
│    瀏覽器）   │                                    │   （手機／    │
└──────┬───────┘                                    │    瀏覽器）   │
       │                                            └──────▲───────┘
       │ 2. 翻譯                                           │
       ▼                                                   │
┌──────────────┐                                           │
│ OpenAI API   │                                           │
│（經 Netlify   │                                           │
│  Function）   │                                           │
└──────┬───────┘                                           │
       │ 3. 寫入原文 + 譯文                                  │ 即時推送
       ▼                                                   │
┌───────────────────────────────────────────────────────────┴──┐
│         Firebase Realtime Database（REST / SSE）              │
└───────────────────────────────────────────────────────────────┘
```

**為什麼這樣設計**

- 一般 4G 就跑得動，不需要 WebRTC 的打洞與 TURN 伺服器
- 流量極低（只有文字）
- 雙方都留有完整逐字稿
- 代價：每句約 1～2 秒延遲，要一句一句講

### 三個外部服務的角色

| 服務 | 角色 | 可否替換 |
| --- | --- | --- |
| Firebase Realtime Database | 訊令（誰撥給誰）+ 逐句文字傳遞 | 可換成任何支援 SSE 的即時資料庫 |
| OpenAI API | 中↔印翻譯 | 可換 Google 翻譯或 Gemini，設定頁可選 |
| Netlify | 靜態網頁託管 + 兩支 Serverless 函式 | 可換 Vercel／Cloudflare，函式要改寫 |

---

## 三、完整部署步驟（從零重建）

### 步驟 1：建立 Firebase Realtime Database

1. 開 <https://console.firebase.google.com>，用 Google 帳號登入
2. **新增專案** → 取名（例如 `zhid-talk`）→ Google Analytics 可以關掉
3. 左側選 **建構 → Realtime Database → 建立資料庫**
4. 位置選 **Singapore (asia-southeast1)**（台灣與印尼連過去都近）
5. 安全性規則選 **以測試模式啟動**
6. 建好後，**資料庫頁面內容區上方**那一行網址就是要用的，長這樣：

```
https://專案名-default-rtdb.asia-southeast1.firebasedatabase.app
```

> ⚠️ 不要複製瀏覽器網址列的 `console.firebase.google.com/...`，那是後台頁面不是資料庫。

**測試模式 30 天後會過期**，要長期使用就到「規則」分頁改成：

```json
{
  "rules": {
    "users": { ".read": true, ".write": true },
    "calls": { ".read": true, ".write": true },
    "healthcheck": { ".read": true, ".write": true }
  }
}
```

這組規則是公開讀寫的。以自家兩三個人使用來說可接受（網址不好猜，通話內容講完就沒保留價值）。
要更嚴謹的話，到「專案設定 → 服務帳戶 → 資料庫密鑰」產生密鑰，填進 App 的「資料庫密鑰」欄位，
再把規則全改成 `false`（密鑰可繞過規則）。

### 步驟 2：取得 OpenAI API 金鑰

1. <https://platform.openai.com/api-keys> → **Create new secret key**
2. 取個名字（例如 `zhid-talk`），建立後**立刻複製**，那串只會顯示一次
3. 到 <https://platform.openai.com/settings/organization/limits> 設每月用量上限（建議 5 美元），
   萬一金鑰外流也有停損

> 也可以改用 Google 翻譯 API（延遲最低）或 Gemini（有免費額度），三選一即可。

### 步驟 3：部署網頁到 Netlify

**建立站台**

1. <https://app.netlify.com> 登入
2. 把 `web` 資料夾**裡面的內容**拖到 <https://app.netlify.com/drop>
3. 站台建立後可在 Site configuration → General → Change site name 改成好記的名稱

**之後每次更新網頁**

1. **先蓋版本戳記**（在專案根目錄執行）：

   ```
   python3 tools/stamp-version.py
   ```

   它會把當下的台北時間寫進 `web/version.json`，同時改掉 `index.html`
   裡的 `<meta name="app-version">`。

2. 到 <https://app.netlify.com/projects/zhid-talk/deploys>，把 `web` 資料夾再拖一次。

> ⚠️ 拖曳型站台**沒有** Trigger deploy 按鈕（那是連結 Git 的站台才有），
> 更新網頁或環境變數生效都靠重新拖曳。

> ⚠️ **戳記不能省略。** 網頁是拿「頁面裡烙印的版本」跟「伺服器上的
> version.json」比對，不一樣才會跳出「有新版本，點一下更新」。
> 忘了跑這個指令，兩邊永遠相同，使用者手上就會一直停在舊版而不自知。

### 步驟 4：設定 Netlify 環境變數

位置：**Site configuration → Environment variables → Add a variable**

每個變數的設定：
- **Scopes**：選 **All scopes**（Specific scopes 是付費功能）
- **Values**：選 **Same value for all deploy contexts**
- 「Contains secret values」如果被鎖在付費方案後面，跳過即可

| Key | Value | 必填 |
| --- | --- | --- |
| `TRANSLATE_API_KEY` | OpenAI／Google／Gemini 的金鑰 | ✅ |
| `TRANSLATE_PROVIDER` | `openai`／`gemini`／`google` | 選填 |
| `TRANSLATE_MODEL` | 例如 `gpt-4o`，不設用 `gpt-4o-mini` | 選填 |
| `VAPID_PUBLIC_KEY` | 步驟 5 產生的公開金鑰 | 背景通知才需要 |
| `VAPID_PRIVATE_KEY` | 步驟 5 產生的私密金鑰 | 背景通知才需要 |
| `VAPID_SUBJECT` | 例如 `mailto:you@example.com` | 選填 |

> `TRANSLATE_PROVIDER` 其實可以不填 —— 程式會從金鑰格式自動判斷（`sk-` 開頭就是 OpenAI）。
> 這個自動判斷是後來加的，就是為了避免忘記設這個變數造成的錯誤（見第六節）。

**設完環境變數一定要重新部署**（把 `web` 資料夾再拖一次），函式才讀得到新值。

### 步驟 5：產生 VAPID 金鑰（背景通知用）

1. 開 <https://zhid-talk.netlify.app/vapid.html>
2. 按 **產生金鑰** —— 金鑰是在你的瀏覽器裡用 Web Crypto 產生的，不會傳到任何伺服器
3. 一次會產生**成對的兩把**：

| 欄位 | 長度 | 性質 |
| --- | --- | --- |
| `VAPID_PUBLIC_KEY` | 87 字元 | 公開，會送到瀏覽器 |
| `VAPID_PRIVATE_KEY` | 43 字元 | **私密**，只能放 Netlify 環境變數 |

4. 兩個都貼到 Netlify 環境變數，然後重新部署

> ⚠️ 兩把金鑰數學上成對，不能分開產生也不能混用不同批次的。
> 重新產生的話兩個都要換，而且所有裝置要重新按一次「啟用鈴聲與通知」。

### 步驟 6：手機端設定（網頁版）

**Android Chrome**
1. 開 <https://zhid-talk.netlify.app>
2. 選單 → **安裝應用程式**（或「加到主畫面」）
3. 從主畫面圖示開啟

**iPhone Safari**（需要 iOS 16.4 以上）
1. 開 <https://zhid-talk.netlify.app>
2. 分享 → **加入主畫面**
3. **必須從主畫面圖示開啟**，直接用 Safari 開是收不到推播的

**兩邊都要做的設定**

進設定頁（右上齒輪）：

| 欄位 | 手機 A | 手機 B |
| --- | --- | --- |
| 我的帳號 | `ayah` | `sari` |
| 我說的語言 | 中文 | 印尼文 |
| 資料庫網址 | **同一個** | **同一個** |
| API 金鑰 | 留空（走伺服器代理） | 留空 |

> 帳號**必須不同**，語言**必須一個中文一個印尼文**（一樣的話翻譯會空轉）。

按 **測試連線與翻譯** 確認通過，儲存後回主畫面，按一次 **啟用鈴聲與通知**。
這一下點擊做三件事：解鎖瀏覽器音訊（否則鈴聲響不出來）、要求通知權限、建立推播訂閱。
每支裝置只需要按一次。

### 步驟 7：編譯 Android APK

1. 把程式碼推到 GitHub 的指定分支
2. GitHub Actions 會自動觸發 **Build APK**，約 3 分鐘
3. 到 <https://github.com/hsienchenglu/hsienchenglu/actions> → 點最新一次執行 →
   下方 **Artifacts** 下載 `zhidtalk-debug-apk`
4. 解壓縮得到 `app-debug.apk`，傳到手機安裝（要允許「安裝未知來源應用程式」）

有 `adb` 的話：

```
adb install -r app-debug.apk
```

**App 內的設定**與網頁版相同，但要注意：

- App 沒有伺服器代理，**API 金鑰要直接填在設定頁**（存在手機本機）
- 要到 **手機設定 → 系統 → 語言與輸入設定 → 文字轉語音輸出**，
  在 Google 語音服務裡下載「中文」與「Indonesia」的語音資料，否則對方的話唸不出來

---

## 四、環境變數與金鑰總表

| 名稱 | 放在哪裡 | 是否機密 | 用途 |
| --- | --- | --- | --- |
| Firebase 資料庫網址 | App 設定頁 / 網頁設定頁 | 否 | 訊令與訊息傳遞 |
| Firebase 資料庫密鑰 | App 設定頁（選填） | **是** | 繞過安全性規則 |
| `TRANSLATE_API_KEY` | Netlify 環境變數 | **是** | 翻譯 |
| `VAPID_PUBLIC_KEY` | Netlify 環境變數 | 否 | 建立推播訂閱 |
| `VAPID_PRIVATE_KEY` | Netlify 環境變數 | **是** | 簽署推播請求 |

**外洩後果比較**

- OpenAI 金鑰：別人可以拿去用並算在你帳上 → 最嚴重，務必設用量上限
- Firebase 網址：別人可以讀寫通話訊令 → 中等，可用資料庫密鑰加強
- VAPID 私鑰：別人最多能對已訂閱裝置發推播，不會產生費用也拿不到通話內容 → 較輕

---

## 五、Firebase 資料結構

```
users/
  {帳號}/
    incoming/          ← 目前的來電，沒來電時為 null
      callId, from, fromLang, ts
    push/              ← 推播訂閱（網頁版用）
      endpoint, keys
calls/
  {通話ID}/
    meta/              ← caller, callerLang, callee, startTs
    state              ← ringing / accepted / rejected / ended
    msgs/
      {自動ID}/        ← from, srcLang, dstLang, src, dst, ts
healthcheck/           ← 「測試連線」寫入的位置
```

**Android 版與網頁版用完全相同的結構**，所以兩者可以互相撥號。

通話結束後 `calls/` 底下的資料會留著（沒有自動清理）。想清空的話到 Firebase 主控台
手動刪除 `calls` 節點即可，不影響功能。

---

## 六、這次實際踩到的問題與解法

> 這一節是這份筆記最有價值的部分，日後遇到類似狀況可直接對照。

### 6-1　翻譯失敗：「API key not valid. Please pass a valid API key.」

**現象**：資料庫測試通過，翻譯測試失敗，錯誤訊息如上。

**真正原因**：這句是 **Google 的**錯誤訊息，不是 OpenAI 的。
代表函式拿著 OpenAI 金鑰去打了 Google 的 API —— 因為 `TRANSLATE_PROVIDER` 沒設定，
程式退回預設的 `google`。

**解法**：補上 `TRANSLATE_PROVIDER=openai` 並重新部署。

**後續改善**：程式已改成從金鑰格式自動判斷（`sk-` 開頭 → OpenAI），
現在就算沒設這個變數也能正常運作。

**教訓**：錯誤訊息的「口音」可以定位問題來源。Google 的 API 用
「API key not valid. Please pass a valid API key.」；OpenAI 用
「Incorrect API key provided: sk-...」。看到不屬於預期服務的錯誤訊息，
就代表請求送錯家了。

### 6-2　環境變數設了卻沒生效

**現象**：在 Netlify 後台加了環境變數，但函式行為沒變。

**原因有兩個，都遇到了**：

1. **沒有重新部署** —— Netlify 的函式在部署時綁定環境變數，改了變數要重新部署才生效
2. **變數根本沒寫進去** —— 透過 API 設定時回報成功，實際查詢卻不存在（疑似前一次呼叫逾時導致）

**解法**：設完變數後，**一定要回頭讀一次確認變數真的存在**，再重新部署。

### 6-3　找不到 Trigger deploy 按鈕

**原因**：拖曳上傳建立的站台沒有連結 Git，所以沒有這顆按鈕。

**解法**：重新部署的方式就是「把資料夾再拖一次」。

### 6-4　GitHub 推送被拒（403）

**現象**：`git push` 回 403；GitHub API 回
`403 Resource not accessible by integration`。

**判讀**：
- 回 **403** = repo 在授權範圍內，但 App 缺少 **Contents 寫入權限**
- 回 **404** = repo 根本不在授權範圍內

兩者意義不同，不要搞混。

**解法**：在本機自行推送。要注意解壓縮後**資料夾有兩層**，
要進到有 `app`、`web` 的那一層才是 git repo（`.git` 是隱藏資料夾，
用 `app`／`web` 在不在來判斷）。

```
git -C "解壓縮路徑\hsienchenglu" push -u origin claude/chinese-indonesian-translation-app-lqptxh
```

### 6-4b　本機推送也被拒：`denied to Aicom885`

**現象**：本機 `git push` 出現

```
remote: Permission to hsienchenglu/hsienchenglu.git denied to Aicom885.
fatal: ... The requested URL returned error: 403
```

**判讀**：這行已經把答案寫出來了——**登入的帳號（Aicom885）不是 repo 擁有者
（hsienchenglu）**。等於拿 A 的鑰匙開 B 的門，跟有沒有付費完全無關。
看到 `denied to XXX` 就先確認 XXX 是不是你以為的那個帳號。

**確認自己是誰**：開 <https://github.com/settings/profile> 看 Username。

**當時的解法**：不去動原本的帳號，改成**推到自己帳號底下的新 repo**。
這樣不必登出、不必清認證管理員，現有的憑證直接可用。

1. 用 Aicom885 開 <https://github.com/new> 建 `zhidtalk`
   （README／.gitignore／License 都不要勾，會跟既有紀錄打架）
2. 改遠端位址並推送：

```
git remote set-url origin https://github.com/Aicom885/zhidtalk
git push -u origin claude/chinese-indonesian-translation-app-lqptxh
```

3. 想讓程式碼直接顯示在 repo 首頁，再推一次到 `main`：

```
git push origin claude/chinese-indonesian-translation-app-lqptxh:main
```

> 專案裡已經預先設好 `aicom` 這個遠端捷徑，之後解開新的 zip 直接用
> `git push aicom claude/chinese-indonesian-translation-app-lqptxh:main` 即可，
> 不必再打 set-url。

**其他要分辨的訊息**：

| 訊息 | 意思 |
| --- | --- |
| `Everything up-to-date` | 站在舊資料夾，那份紀錄本來就推過了 |
| `rejected` / `non-fast-forward` | 遠端有本機沒有的東西，先 `git pull --rebase` |
| 要求輸入密碼 | 密碼欄要貼 Personal Access Token，不是登入密碼 |
| `denied to XXX` | 帳號不對，見上面 |

> 推之前先用 `git log --oneline -1` 確認站在正確的資料夾，
> 看到的應該是你最新那筆 commit 的訊息。

### 6-5　GitHub 網頁上傳顯示「Uploads are disabled」

網頁拖曳上傳這條路走不通，改用本機 `git push`。

### 6-6　Netlify 的 Specific scopes 要付費

環境變數的 Scopes 選 **All scopes** 即可，功能完全不受影響。
「Contains secret values」如果也被鎖，跳過沒關係 —— 差別只是值在後台是否明文顯示。

### 6-7　iPhone 通話中網頁自動關閉，之後打不開也不能通話

**現象**：iPhone 上講沒幾句，網頁就自己關掉；重開之後很難進入，也撥不出去。

**原因（三個疊在一起）**：

1. **波形動畫每一幀都重新配置 canvas 記憶體** —— 一秒 60 次，
   iOS 對記憶體壓力很敏感，會直接把網頁行程收掉
2. **語音辨識的重啟迴圈沒有煞車** —— iOS 的辨識服務常常「開始後立刻結束」，
   原本的程式會每 0.2 秒重試一次，等於每秒建立五個辨識物件，永不停止
3. **殘留的來電節點** —— 行程被砍掉時沒機會清理 Firebase，
   重開後又讀到那筆舊來電，看起來就像「怪怪的、不能用」

**解法**：

- canvas 只在尺寸真的改變時才重新配置，並把 devicePixelRatio 上限設為 2
- 辨識重啟改成指數退避（0.4→0.8→1.6→3.2→5 秒），連續 6 次失敗就停下來並提示
- 切到背景時主動關閉麥克風，回到前景再接回去
- 超過兩分鐘的來電視為殘留，自動忽略並清除
- 設定頁加上「清除殘留的通話狀態」按鈕作為自救出口

**教訓**：手機瀏覽器不會告訴你「記憶體不足」，它就只是把頁面關掉。
遇到「用一陣子就自己關閉」，先查每幀都在配置記憶體的地方，以及沒有上限的重試迴圈。

### 6-8　金鑰曾經明文出現在對話紀錄

查詢 Netlify 環境變數時，未標記為 secret 的值會**完整回傳**。
處理方式：到 OpenAI 產生新金鑰 → 在 Netlify 編輯變數換成新值 → 重新部署 →
確認可用後撤銷舊金鑰。

**日後原則**：金鑰一律自己在服務商後台貼上，不要經過對話。

### 6-9　印尼客戶卡在中文設定頁

**現象**：把網址給印尼客戶，他第一次打開會**直接停在設定頁**，
而切換介面語言的 `ID` 按鈕在主畫面，這時候根本看不到。
設定頁雖然有介面語言選項，但原本要**按下儲存才生效**——
看不懂中文的人找不到儲存鍵在哪，等於卡死。

**解法**：改成設定頁的介面語言**點下去就立刻換**並存檔，不必按儲存。

**後續**：把網址給客戶時，第一句話就告訴他
「最上面那格選 Bahasa Indonesia」。完整說明看 `CUSTOMERS.md`。

### 6-10　麥克風有時打不開，整通電話講不了

**現象**：通話中講著講著，麥克風就再也開不起來，按也沒用。

**原因**：朗讀對方的話時會先關掉麥克風，等朗讀結束再打開。但瀏覽器
（特別是 Android 的 Chrome）**有時候根本不會回報朗讀結束**——句子偏長、
缺少該語言的語音、朗讀途中切到背景都會發生。程式就一直停在「朗讀中」，
麥克風永遠等不到重新打開的信號。

**解法**：兩道保險。

1. 朗讀時同時開一個計時器（依字數估算，最多 30 秒），時間到還沒回報就
   強制當作結束，把麥克風接回去
2. 使用者親自按麥克風時，不管卡在什麼狀態都先清乾淨再重新開始

**使用者可以自救的做法**：按一下麥克風鍵。現在按下去一定會重來。

### 6-11　Android 通話中有持續雜音

**兩個來源，都處理掉了**：

1. **辨識重啟的提示音**——原本每講完一句就結束辨識再重開，Android 每次
   重啟都會發出一聲提示音，整通電話就一直有雜音。改成連續辨識模式，
   重啟次數大幅下降。（iOS 的連續模式很不穩，維持原本的單次模式。）
2. **音訊環境一直開著**——鈴聲用的 AudioContext 解鎖之後就沒有關過，
   維持 running 會讓手機喇叭線路一直開著，聽起來就是一層持續的底噪。
   改成沒在響鈴時自動暫停，要響鈴前再叫醒。

> 如果更新後還有雜音，先確認是「嗶嗶聲」還是「沙沙的底噪」，
> 兩者來源不同，回報時講清楚比較好找。

---

## 七、日常維護

### 更新網頁版

1. 改 `web/` 底下的檔案
2. 跑 `python3 tools/stamp-version.py` 蓋上新的版本戳記（**不可省略**）
3. 把 `web` 資料夾拖到 Netlify 的 Deploys 頁面
4. 使用者端不必做任何事：頁面回到前景時會自動比對版本，
   偵測到新版就在畫面下方跳出「有新版本，點一下更新」，點一下就換成新版

> 想立刻看到效果，也可以關掉 PWA 再重開。
> 通話中不會跳提示，以免打斷對話。

### 備份程式碼到 GitHub

解開新的 `zhidtalk-with-git.zip` 之後，進到**看得到 `app`、`web` 的那一層**，
先確認站對地方：

```
git log --oneline -1
```

看到的應該是最新那筆 commit。確認後推上去：

```
git push aicom claude/chinese-indonesian-translation-app-lqptxh:main
```

`aicom` 這個遠端捷徑已經設在專案裡，指向 <https://github.com/Aicom885/zhidtalk>。
若出現 `rejected`，先 `git pull --rebase aicom main` 再推一次。

> 這一步純粹是備份，**不做也不影響使用**。實際上線靠的是把 `web`
> 資料夾拖到 Netlify。

### 更新 Android App

1. 改 `app/` 底下的檔案，commit 後推到 GitHub
2. 等 Actions 編完，下載新的 APK
3. 直接覆蓋安裝即可（`adb install -r`），設定不會遺失

### 更換 API 金鑰

1. 服務商後台產生新金鑰
2. Netlify → Environment variables → 編輯 `TRANSLATE_API_KEY`
3. **重新部署**
4. 網站設定頁按「測試連線與翻譯」確認
5. 確認可用後，回服務商後台撤銷舊金鑰

> 順序很重要：先確認新的能用，再撤銷舊的，中間不會斷線。

### 費用注意

- **Firebase**：免費方案額度很大，這種用量幾乎不可能超過
- **Netlify**：免費方案含 100GB 流量、125,000 次函式呼叫／月，足夠有餘
- **OpenAI**：唯一會產生費用的。`gpt-4o-mini` 一句話約 $0.00002，
  講一小時大概幾分錢。記得設用量上限

### 定期檢查

| 項目 | 頻率 | 檢查什麼 |
| --- | --- | --- |
| Firebase 規則 | 建立後 30 天內 | 測試模式是否已過期 |
| OpenAI 用量 | 每月 | 有無異常用量 |
| 通話紀錄 | 隨意 | 手機本機的紀錄要不要清 |

---

## 八、疑難排解對照表

| 現象 | 可能原因 | 處理 |
| --- | --- | --- |
| 測試連線失敗 | 資料庫網址填錯、規則過期 | 檢查網址結尾、看 Firebase 規則分頁 |
| 翻譯失敗，訊息像 Google 的 | provider 判斷錯誤 | 補 `TRANSLATE_PROVIDER`，重新部署 |
| 翻譯失敗，訊息像 OpenAI 的 | 金鑰失效或額度用盡 | 檢查 OpenAI 後台 |
| 環境變數改了沒反應 | 沒重新部署 | 把 `web` 再拖一次 |
| 撥號後對方沒反應 | 對方沒上線、帳號拼錯 | 確認對方網頁開著或已啟用推播 |
| 收不到背景通知 | VAPID 沒設、沒按啟用、iOS 沒加主畫面 | 依步驟 5、6 檢查 |
| 沒有鈴聲 | 沒按過「啟用鈴聲與通知」 | 瀏覽器規定要有使用者互動才能出聲 |
| 對方的話沒唸出來 | 缺少該語言的語音資料 | 手機設定 → 文字轉語音輸出 → 下載 |
| 語音辨識沒反應 | 麥克風權限、瀏覽器不支援 | 用 Chrome／Edge，檢查網址列權限圖示 |
| 講到一半麥克風打不開 | 朗讀沒回報結束（已加保險） | 按一下麥克風鍵即可重來，見 6-10 |
| 通話中一直有雜音 | 辨識重啟提示音／音訊環境沒關（已修正） | 更新到最新版，見 6-11 |
| 辨識不準 | 講太長、環境吵 | 一句一句講，講完停一秒 |
| 講話變成自己聽自己 | （已處理）朗讀時會自動停麥克風 | 若仍發生，關閉「自動朗讀」再試 |
| iPhone 通話中自己關閉 | 記憶體壓力（已修正） | 確認用的是最新版網頁 |
| 一直跳出沒人撥的來電 | 上次通話的殘留節點 | 設定頁按「清除殘留的通話狀態」 |
| 撥不出去、對方收不到 | 同上 | 同上 |
| 更新了卻沒跳「有新版本」 | 部署前忘了跑 `tools/stamp-version.py` | 補跑戳記後再拖一次 |
| 對方一直用舊版 | 頁面沒回到前景過 | 請對方切出去再切回來，或直接關掉重開 |

---

## 九、專案檔案結構

```
├── app/                                  Android App
│   └── src/main/java/com/hsienchenglu/zhidtalk/
│       ├── MainActivity.kt               撥號、來電卡片、通話紀錄
│       ├── CallActivity.kt               通話畫面
│       ├── IncomingCallActivity.kt       全螢幕來電
│       ├── SettingsActivity.kt           設定
│       ├── HistoryDetailActivity.kt      逐字稿
│       ├── CallService.kt                背景來電監聽與響鈴
│       ├── Signaling.kt                  Firebase REST / SSE
│       ├── TranslateClient.kt            三家翻譯服務
│       ├── SpeechManager.kt              語音辨識與朗讀
│       ├── Ringer.kt                     內建鈴聲，可設次數
│       └── HistoryStore.kt               通話紀錄本機儲存
│
├── web/                                  網頁版（部署到 Netlify）
│   ├── index.html                        全部畫面
│   ├── app.js                            所有邏輯
│   ├── i18n.js                           中文／印尼文介面字串
│   ├── styles.css                        深色主題
│   ├── sw.js                             Service Worker（背景通知）
│   ├── version.json                      版本戳記，供更新提示比對
│   ├── manifest.webmanifest              PWA 設定
│   ├── vapid.html                        VAPID 金鑰產生器
│   ├── icons/                            PWA 圖示
│   ├── netlify.toml                      部署設定與標頭
│   └── netlify/functions/
│       ├── translate.mts                 翻譯代理（金鑰留伺服器）
│       ├── push.mts                      送出無內容推播
│       └── push-key.mts                  提供 VAPID 公開金鑰
│
├── tools/stamp-version.py                部署前蓋版本戳記
├── .github/workflows/android.yml         自動編譯 APK
├── README.md                             使用說明
├── CUSTOMERS.md                          新增客戶與賣貨操作手冊
└── DEPLOY.md                             本筆記
```

---

## 十、背景通知的運作原理

推播刻意設計成**不夾帶任何內容**：

1. 撥號方寫入 Firebase 的 `users/{對方}/incoming`，並呼叫 `/api/push`
2. Netlify 函式用 VAPID 私鑰簽一個 ES256 的 JWT，送一則**空的**推播到對方的推播端點
3. 對方的 Service Worker 被系統喚醒，自己去 Firebase 讀 `users/{我}/incoming`
4. 顯示通知，點一下開啟網頁進入接聽畫面

**為什麼不夾帶內容**

- 夾帶內容需要實作 RFC 8291 的加密（ECDH + HKDF + AES-128-GCM），程式碼量大且容易出錯
- 不夾帶就完全不需要 npm 套件，Netlify 拖曳部署也能跑
- **來電資訊不會經過 Google 或 Apple 的推播伺服器** —— 他們只知道「有人敲了這台裝置」

**Service Worker 怎麼知道要去哪裡查**

網頁在設定完成時，把帳號與資料庫網址寫進 Cache Storage 的 `/__zhid_config`；
Service Worker 被喚醒後從那裡讀取。這是唯一能在「沒有任何頁面開著」時取得設定的方式。
