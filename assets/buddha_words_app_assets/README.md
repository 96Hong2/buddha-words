# 부처의 말 — 앱 에셋 패키지

## 구성
- `images/`: 시안에서 분리한 개별 PNG + WebP
- `html/`: 앱 화면 재현용 HTML (반응형)
- `manifest.json`: 파일명/크기/원본 crop 좌표

## 폰트
생성된 원본 이미지는 AI가 픽셀로 렌더링한 이미지라 실제 폰트 파일/정확한 폰트명이 포함되어 있지 않습니다.
가장 비슷한 재현 조합으로 아래를 권장합니다.

- UI / 본문: `Pretendard` → `SUIT` → `Apple SD Gothic Neo`
- 제목 / 경전 / 인용문: `MaruBuri` → `Noto Serif KR` → `AppleMyungjo`

HTML에는 폰트 파일을 포함하지 않고 위 family 이름만 지정했습니다.

## 앱 적용 권장
- 실제 앱 배포에서는 PNG보다 WebP를 우선 사용
- 감정 이미지 파일명:
  - buddha_anxiety
  - buddha_anger
  - buddha_loss
  - buddha_comparison
  - buddha_choice
  - buddha_sleep
  - buddha_relationship
  - buddha_growth

## 주의
이 패키지는 한 장짜리 AI 생성 시안을 잘라 분리한 버전입니다.
따라서 텍스트가 포함된 일부 이미지(스플래시/공유 카드/배너)는 최종 프로덕션에서는
이미지를 배경으로 사용하고 텍스트를 HTML/CSS로 다시 올리는 방식을 권장합니다.
