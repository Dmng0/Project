"""Build a personally installable debug APK; honor local Android SDK/JDK configuration."""
import argparse
import json
import hashlib
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import urllib.parse

parser = argparse.ArgumentParser(description='Build a debug APK or an unsigned release APK.')
parser.add_argument('--release', action='store_true', help='Build an unsigned release for private signing.')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
version = json.loads((root / 'package.json').read_text())['version']
variant = 'release' if args.release else 'debug'
build_task = 'assembleRelease' if args.release else 'assembleDebug'
lint_task = 'lintRelease' if args.release else 'lintDebug'
settings = os.environ.copy()
cloud_tools = Path('/workspace/android-tools')
if not settings.get('JAVA_HOME') and (cloud_tools / 'jdk/bin/javac').exists():
    settings['JAVA_HOME'] = str(cloud_tools / 'jdk')
if not settings.get('ANDROID_HOME'):
    if settings.get('ANDROID_SDK_ROOT'):
        settings['ANDROID_HOME'] = settings['ANDROID_SDK_ROOT']
    elif Path('/workspace/android-sdk').exists():
        settings['ANDROID_HOME'] = '/workspace/android-sdk'
if not settings.get('ANDROID_HOME'):
    raise SystemExit('Android SDK is required. Set ANDROID_HOME to your SDK directory.')
if cloud_tools.exists():
    settings.setdefault('GRADLE_USER_HOME', str(cloud_tools / 'gradle'))
    settings.setdefault('ANDROID_USER_HOME', str(cloud_tools / 'android-home'))
    options = settings.get('JAVA_TOOL_OPTIONS', '')
    options += ' -Duser.home=/workspace/android-tools/home'
    if Path('/etc/ssl/certs/java/cacerts').exists():
        options += ' -Djavax.net.ssl.trustStore=/etc/ssl/certs/java/cacerts'
    settings['JAVA_TOOL_OPTIONS'] = options.strip()
proxy = urllib.parse.urlsplit(settings.get('HTTPS_PROXY') or settings.get('https_proxy') or '')
proxy_args = []
if proxy.hostname:
    for protocol in ['http', 'https']:
        proxy_args += ['-D' + protocol + '.proxyHost=' + proxy.hostname,
                       '-D' + protocol + '.proxyPort=' + str(proxy.port or 80)]
    # Wrapper downloads happen before Gradle parses command line system properties.
    settings['JAVA_OPTS'] = (settings.get('JAVA_OPTS', '') + ' ' + shlex.join(proxy_args)).strip()
wrapper = 'gradlew.bat' if os.name == 'nt' else './gradlew'
subprocess.run([wrapper, *proxy_args, '--no-daemon', '--max-workers=2', build_task, lint_task],
               cwd=root / 'android', env=settings, check=True)
apk_name = 'app-release-unsigned.apk' if args.release else 'app-debug.apk'
apk = root / 'android/app/build/outputs/apk' / variant / apk_name
suffix = '-release-unsigned' if args.release else ''
output = root / 'releases' / f'yeobaek-{version}{suffix}.apk'
output.parent.mkdir(exist_ok=True)
shutil.copy2(apk, output)
digest = hashlib.sha256(output.read_bytes()).hexdigest()
output.with_suffix('.apk.sha256').write_text(digest + '  ' + output.name + '\n')
print('APK:', output)
print('SHA-256:', digest)

if args.release:
    print('This release APK is unsigned. Sign it with your private release key before installation.')
