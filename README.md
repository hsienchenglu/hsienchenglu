# 阿嬤照護 SOP PWA — 手機可用 OpenAI 翻譯版

印尼看護輸入印尼文 → Netlify Function → OpenAI 翻譯繁體中文 → 中印並列。

## 部署
整個資料夾部署到 Netlify，不要只上傳 index.html。

## Netlify 環境變數
OPENAI_API_KEY = 新的 OpenAI API Key

可選：OPENAI_MODEL = gpt-5.6

API Key 不要寫進 HTML。

## PWA
Android Chrome：選單 → 安裝應用程式／加入主畫面
iPhone Safari：分享 → 加入主畫面

若更新後仍看到舊版，移除舊的主畫面 App 後重新加入。
