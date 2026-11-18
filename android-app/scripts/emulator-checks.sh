#!/usr/bin/env bash
set -euo pipefail
mkdir -p evidence
capture_failure() {
  local code=$?
  if [ "$code" -ne 0 ]; then
    adb shell screencap -p /sdcard/lae-check-failure.png || true
    adb pull /sdcard/lae-check-failure.png evidence/failure.png || true
    adb logcat -d -t 500 > evidence/failure-logcat.txt || true
  fi
  return "$code"
}
trap capture_failure EXIT
adb install -r apk/app-debug.apk
adb install -r testapk/app-debug-androidTest.apk
run_case() {
  local test_case="$1" output="$2"
  adb shell am instrument -w -r -e class "$test_case" com.laemusic.listener.preview.test/androidx.test.runner.AndroidJUnitRunner > "evidence/$output.txt"
  cat "evidence/$output.txt"
  python3 - "evidence/$output.txt" <<'PYTEST'
import re,sys
text=open(sys.argv[1]).read()
assert re.search(r"OK \([0-9]+ tests?\)",text), "Android instrumentation did not report success"
assert not re.search(r"FAILURES!!!|INSTRUMENTATION_FAILED|Process crashed",text)
PYTEST
}
run_case com.laemusic.listener.NativeListeningTest native-listening
adb pull /sdcard/Android/data/com.laemusic.listener.preview/files/discover.png evidence/discover-fixture.png
run_case 'com.laemusic.listener.OfflinePersistenceTest#prepare' offline-before-reboot
adb shell am force-stop com.laemusic.listener.preview
adb reboot
adb wait-for-device
for i in $(seq 1 90); do
  if [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = "1" ]; then break; fi
  sleep 2
done
[ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = "1" ]
adb shell input keyevent 82
run_case 'com.laemusic.listener.OfflinePersistenceTest#verifyAfterReboot' offline-after-reboot
# One short guest smoke check of the real public catalogue. No purchase, paid
# generation or qualifying 30-second stream is initiated.
adb shell pm clear com.laemusic.listener.preview
adb shell pm grant com.laemusic.listener.preview android.permission.POST_NOTIFICATIONS
adb shell am start -W -n com.laemusic.listener.preview/com.laemusic.listener.MainActivity
sleep 12
adb shell screencap -p /sdcard/lae-catalogue.png
adb pull /sdcard/lae-catalogue.png evidence/discover-public-catalogue.png
adb shell dumpsys media_session > evidence/media-session-smoke.txt
adb shell am force-stop com.laemusic.listener.preview
