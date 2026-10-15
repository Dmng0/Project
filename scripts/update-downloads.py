"""Keep README downloads in sync with the app version and stable release assets."""
import argparse
import json
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--check', action='store_true', help='Fail if the download section is stale.')
args = parser.parse_args()
version = json.loads((root / 'package.json').read_text())['version']
if not re.fullmatch(r'\d+\.\d+\.\d+', version):
    raise SystemExit('Expected a numeric major.minor.patch app version.')
if not (root / 'releases' / f'yeobaek-{version}.apk').is_file():
    raise SystemExit(f'The APK for {version} has not been prepared.')
repository = 'https://github.com/Dmng0/Project'
raw = 'https://raw.githubusercontent.com/Dmng0/Project/refs/heads/main/releases'
start = '<!-- downloads:start -->'
end = '<!-- downloads:end -->'
block = f'''{start}
**최신 버전: {version}**

[⬇️ APK 바로 다운로드]({repository}/releases/latest/download/yeobaek.apk)

[릴리스 페이지에서 다운로드]({repository}/releases/latest) · [모바일용 대체 직접 링크]({raw}/yeobaek-{version}.apk)

[Android Studio 서명용 프로젝트 다운로드]({repository}/releases/latest/download/PDF_VIEWER_M-AndroidStudio.zip)

GitHub 모바일 앱에서 다운로드가 시작되지 않으면 메뉴의 **브라우저에서 열기**로 Chrome/Samsung Internet에서 열어 주세요. 릴리스 페이지에서는 **Assets → yeobaek.apk**를 선택하세요. 대체 직접 링크도 사용할 수 있습니다.

업데이트에는 기존 앱과 같은 서명이 필요합니다. 개발용 APK는 별도 릴리스 키로 서명한 앱을 덮어쓸 수 없으므로, 해당 경우에는 서명용 프로젝트를 기존 키로 서명하세요.
{end}
'''
readme = root / 'README.md'
text = readme.read_text()
if start in text and end in text:
    a, b = text.index(start), text.index(end) + len(end)
    updated = text[:a] + block.rstrip('\n') + text[b:]
else:
    heading = re.search(r'^### \d+\.', text, re.MULTILINE)
    if not text.startswith('# PDF_VIEWER_M\n') or not heading:
        raise SystemExit('README download section could not be located safely.')
    updated = '# PDF_VIEWER_M\n\n' + block + '\n' + text[heading.start():]
if args.check:
    if updated != text:
        raise SystemExit('README download links are stale. Run scripts/update-downloads.py.')
elif updated != text:
    readme.write_text(updated)
print(f'README download links are current: {version}')
