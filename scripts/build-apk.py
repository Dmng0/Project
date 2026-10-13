"""Build a personally installable debug APK; honor local Android SDK/JDK configuration."""
import hashlib
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import urllib.parse

root = Path(__file__).resolve().parents[1]
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
subprocess.run([wrapper, *proxy_args, '--no-daemon', '--max-workers=2', 'assembleDebug', 'lintDebug'],
               cwd=root / 'android', env=settings, check=True)
apk = root / 'android/app/build/outputs/apk/debug/app-debug.apk'
output = root / 'releases/yeobaek-1.0.0.apk'
output.parent.mkdir(exist_ok=True)
shutil.copy2(apk, output)
digest = hashlib.sha256(output.read_bytes()).hexdigest()
output.with_suffix('.apk.sha256').write_text(digest + '  ' + output.name + '\n')
print('APK:', output)
print('SHA-256:', digest)
