"""Prepare existing APK/Studio ZIP downloads without rebuilding or changing signing."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import zipfile

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', required=True, type=Path)
args = parser.parse_args()
version = json.loads((root / 'package.json').read_text())['version']
if not re.fullmatch(r'\d+\.\d+\.\d+', version):
    raise SystemExit('Expected a numeric major.minor.patch app version.')

apk = root / 'releases' / f'yeobaek-{version}.apk'
studio = root / 'releases' / f'PDF_VIEWER_M-{version}-AndroidStudio.zip'
for path in [apk, studio]:
    if not path.is_file():
        raise SystemExit(f'Missing current-version artifact: {path.name}')
    with zipfile.ZipFile(path) as archive:
        if archive.testzip() is not None:
            raise SystemExit(f'Corrupt archive: {path.name}')
        if path == apk and 'AndroidManifest.xml' not in archive.namelist():
            raise SystemExit('The APK is missing AndroidManifest.xml.')
        if path == studio:
            packaged = json.loads(archive.read('PDF_VIEWER_M/package.json'))
            if packaged['version'] != version:
                raise SystemExit('The signing project version does not match package.json.')
args.output.mkdir(parents=True, exist_ok=True)
for source, alias in [(apk, 'yeobaek.apk'), (studio, 'PDF_VIEWER_M-AndroidStudio.zip')]:
    for name in [source.name, alias]:
        target = args.output / name
        shutil.copy2(source, target)
        checksum = hashlib.sha256(target.read_bytes()).hexdigest()
        target.with_suffix(target.suffix + '.sha256').write_text(f'{checksum}  {name}\n')

notes = f'''여백 {version}

휴대폰에서는 Assets의 **yeobaek.apk**를 다운로드하세요.
다운로드가 시작되지 않으면 GitHub 앱의 메뉴에서 브라우저로 열어 주세요.

- yeobaek.apk: 현재 버전 APK와 동일한 파일을 고정 이름으로 제공합니다.
- PDF_VIEWER_M-AndroidStudio.zip: Android Studio에서 기존 키로 서명할 수 있는 프로젝트입니다.
- 각 .sha256 파일로 내려받은 파일의 무결성을 확인할 수 있습니다.

APK는 저장소의 파일을 그대로 배포하며 서명은 변경하지 않습니다.
기존 설치 앱과 서명이 다르면 업데이트 설치가 되지 않습니다.
현재 1.0.6 저장소 APK는 개발용 디버그 서명 파일입니다.
기존에 릴리스 키로 서명한 앱은 서명용 ZIP을 기존 키로 서명해 업데이트하세요.
앱을 삭제하면 앱 안의 책장·주석 데이터도 삭제되므로 업데이트 문제를 해결하려고 삭제하지 마세요.
'''
(args.output / 'NOTES.md').write_text(notes)
print(version)
