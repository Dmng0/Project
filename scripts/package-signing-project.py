"""Package prebuilt web assets and native dependencies for Android Studio signing."""
from pathlib import Path
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parents[1]
version = json.loads((root / 'package.json').read_text())['version']
output = root / 'releases' / f'PDF_VIEWER_M-{version}-AndroidStudio.zip'
excluded = {'build', '.gradle', '.idea', '.git', '__pycache__'}
paths = []
for folder in ['android', 'node_modules/@capacitor/android', 'node_modules/@capacitor/app']:
    base = root / folder
    for path in base.rglob('*'):
        if not path.is_file():
            continue
        rel = path.relative_to(root)
        if excluded.intersection(path.relative_to(base).parts):
            continue
        if path.name == 'local.properties' or path.suffix in {'.jks', '.keystore'}:
            continue
        paths.append(path)
paths += [root / 'package.json', root / 'scripts/build-apk.py']
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(paths):
        archive.write(path, 'PDF_VIEWER_M/' + path.relative_to(root).as_posix())
    archive.writestr('PDF_VIEWER_M/START_HERE.txt', '''PDF_VIEWER_M Android Studio signing project

This package includes prebuilt app assets and native Capacitor dependencies.
Node.js/npm is not required to open and sign this prepared project.

Windows 11:
1. Extract the ENTIRE archive to a short path, for example C:\\Projects\\Yeobaek.
2. Android Studio > File > Open > PDF_VIEWER_M\\android (NOT the parent folder).
3. Wait for Gradle sync. Internet access is needed to download build dependencies.
4. If asked, select installed Android SDK 35 and Gradle JDK 21 (or newer compatible JDK).
5. Build > Generate Signed App Bundle or APK > APK.
6. Create a PRIVATE release keystore outside the project and back it up securely.
7. Select release and complete the wizard.

Never upload the keystore or passwords to GitHub or chat.
Unsigned release APKs cannot be installed. The wizard creates a signed APK.
Version: ''' + version + '\n')
output.with_suffix('.zip.sha256').write_text(hashlib.sha256(output.read_bytes()).hexdigest() + '  ' + output.name + '\n')
print(output)
print('Archive entries:', len(paths) + 1)
