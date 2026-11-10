# 컨디션 노트 (안드로이드)

아침 컨디션 점수를 매기고, 전날 먹은 것·한 것·스트레스·일교차·수면 시간과 연결해 분석하는 개인용 앱.

- 설치 파일: `release/condition-note.apk` (안드로이드 9 이상)
- 수면 시간: 폰 사용 기록(사용 정보 접근 권한)으로 자동 추정. 로직은 `app/src/main/assets/www/sleep.js`
- 날씨: Open-Meteo (키 필요 없음)
- 데이터: 폰 내부 `data.json` 에만 저장. 설정 탭에서 파일로 내보내기/가져오기

## 구조

- `app/src/main/assets/www/` — 화면과 데이터 로직 (HTML/JS). 브라우저에서 `index.html?demo` 로 열면 예시 데이터로 미리 볼 수 있다
- `app/src/main/java/app/condition/` — 폰 기능 연결 (사용 기록 읽기, 알림, 백업)

## 빌드

    ./gradlew assembleRelease
    cp app/build/outputs/apk/release/app-release.apk release/condition-note.apk

`keystore/condition.jks` 는 업데이트 설치 때 데이터가 유지되도록 고정해 둔 서명 키다.
