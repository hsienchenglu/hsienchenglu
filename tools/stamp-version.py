#!/usr/bin/env python3
"""
每次要部署網頁版之前跑一次，蓋上版本戳記。

網頁靠「頁面裡烙印的版本」和「伺服器上的 version.json」比對，
兩者不一樣就代表使用者手上的是舊版，於是跳出更新提示。
沒有這個戳記，兩邊永遠相同，提示就永遠不會出現。

用法：
    python3 tools/stamp-version.py
"""
import json
import pathlib
import re
import sys
from datetime import datetime, timezone, timedelta

WEB = pathlib.Path(__file__).resolve().parent.parent / 'web'

# 用台北時間，看起來比較直覺
version = datetime.now(timezone(timedelta(hours=8))).strftime('%Y%m%d-%H%M')

(WEB / 'version.json').write_text(
    json.dumps({'version': version}, ensure_ascii=False) + '\n',
    encoding='utf-8',
)

index = WEB / 'index.html'
html = index.read_text(encoding='utf-8')
new_html, n = re.subn(
    r'(<meta name="app-version" content=")[^"]*(">)',
    lambda m: m.group(1) + version + m.group(2),
    html,
)
if n != 1:
    sys.exit('index.html 裡找不到 app-version 這個 meta 標籤，戳記沒有蓋上')
index.write_text(new_html, encoding='utf-8')

print(f'版本戳記：{version}')
