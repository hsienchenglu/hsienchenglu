#!/usr/bin/env python3
"""每月密碼換一批時，用這支重新產生雜湊並寫回 web/app.js。

用法：
    python3 tools/make-passwords.py A6B648 52C6D4 ... （十二組，一月到十二月）
    python3 tools/make-passwords.py --random          （隨機產生十二組）

產生完會把明碼印出來，記得抄走——程式裡只留雜湊，之後查不回來。

⚠️ 這是「門檻」不是加密。網頁原始碼公開，六位英數的密碼用程式跑幾秒
就能反推。它擋的是「拿到網址就亂用」的人，不是有心破解的人。
"""

import hashlib
import re
import secrets
import sys
from pathlib import Path

APP = Path(__file__).resolve().parent.parent / 'web' / 'app.js'
MONTHS = ['1 月', '2 月', '3 月', '4 月', '5 月', '6 月',
          '7 月', '8 月', '9 月', '10 月', '11 月', '12 月']


def random_password():
    """六位十六進位，跟現有格式一致，看起來不像有規律。"""
    return secrets.token_hex(3).upper()


def main(argv):
    if '--random' in argv:
        passwords = [random_password() for _ in range(12)]
    else:
        passwords = [a.strip().upper() for a in argv if not a.startswith('-')]

    if len(passwords) != 12:
        print('需要剛好十二組密碼（一月到十二月），或用 --random 隨機產生。')
        print(__doc__)
        return 1

    if len(set(passwords)) != 12:
        print('有重複的密碼，十二個月請用不同的。')
        return 1

    hashes = [hashlib.sha256(p.encode()).hexdigest() for p in passwords]

    print('把下面這份抄走保存，程式裡只會留雜湊：\n')
    for month, pw in zip(MONTHS, passwords):
        print(f'  {month:>5}：{pw}')

    src = APP.read_text(encoding='utf-8')
    block = '  HASHES: [\n' + '\n'.join(f"    '{h}'," for h in hashes).rstrip(',') + '\n  ],'
    new, n = re.subn(r'  HASHES: \[.*?\],', block, src, count=1, flags=re.S)
    if n != 1:
        print('\n找不到 app.js 裡的 HASHES 區塊，沒有改動任何東西。')
        return 1

    APP.write_text(new, encoding='utf-8')
    print(f'\n已寫回 {APP}')
    print('別忘了跑 python3 tools/stamp-version.py 再部署。')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
