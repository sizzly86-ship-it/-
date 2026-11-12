# 컨디션 노트 (안드로이드)

아침 컨디션 점수를 매기고, 전날 먹은 것·한 것·스트레스·수면·날씨(일교차, 미세먼지)와 연결해 분석하는 개인용 앱.

- 설치 파일: `release/condition-note.apk` (안드로이드 9 이상)
- 수면 시간: 폰 사용 기록(사용 정보 접근 권한)으로 자동 추정
- 날씨·대기질: Open-Meteo (키 필요 없음, CC BY 4.0)
- 데이터: 폰 내부 `data.json` 에만 저장. 설정에서 백업 파일/CSV 내보내기

## 구조

화면은 WebView 안의 웹 페이지가 그리고, 안드로이드 코드는 폰 기능만 연결한다.

| 위치 | 역할 |
|---|---|
| `app/src/main/assets/www/logic.js` | 화면과 무관한 순수 로직: 데이터 정리·버전 올림, 통계, 내보내기 |
| `app/src/main/assets/www/sleep.js` | 폰 사용 세션 → 수면 구간 추정 |
| `app/src/main/assets/www/views.js` | 화면 그리기 (오늘, 달력, 분석, 설정, 첫 실행 안내) |
| `app/src/main/assets/www/app.js` | 상태·저장·이벤트·날씨 요청 |
| `app/src/main/java/app/condition/` | 사용 기록 읽기, 알림, 파일 내보내기/가져오기 |

브라우저에서 `index.html?demo` 로 열면 예시 데이터로, `?demo&onboard` 로 열면 첫 실행 안내부터 미리 볼 수 있다.

## 테스트

    node tests/logic.test.js
    node tests/sleep.test.js

## 빌드

    ./gradlew assembleRelease
    cp app/build/outputs/apk/release/app-release.apk release/condition-note.apk

`keystore/condition.jks` 는 업데이트 설치 때 데이터가 유지되도록 고정해 둔 서명 키다.
