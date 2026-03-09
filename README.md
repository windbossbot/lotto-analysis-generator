# 로또 번호 분석 생성기

동행복권 회차 데이터를 자동으로 동기화하고, 최근성 가중치, 번호 점수화, 백테스트, 패턴 필터를 섞어서 추천 조합과 맞춤 1조합을 만들어주는 Node.js 앱입니다.

## 기능

- 동행복권 공식 결과 데이터 자동 동기화
- 번호 순위, 핫/콜드 번호, 구간 분포, 동반 출현 페어 분석
- 추천 5조합 생성
- 목표 5등권 추정 확률 기반 맞춤 1조합 생성
- 원하는 번호 1개 고정 후 맞춤 조합 생성
- 최근 구간 백테스트

## 로컬 실행

```bash
npm install
npm start
```

기본 주소는 `http://localhost:3210` 입니다.

## Render 배포

이 프로젝트는 `render.yaml` 을 포함하고 있어서 Render의 Blueprint 또는 새 Web Service로 바로 올릴 수 있습니다.

기본값:

- Environment: `Node`
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/api/lotto`

주의:

- 이 앱은 `data/lotto-draws.json`, `data/lotto-sync-state.json` 을 파일로 씁니다.
- Render 웹 서비스 파일시스템은 기본적으로 영구 저장소가 아니므로 재배포나 재시작 시 상태가 초기화될 수 있습니다.
- 현재 앱은 공식 사이트에서 다시 동기화할 수 있어서 치명적이진 않지만, 장기 보존이 필요하면 Render Persistent Disk 또는 외부 저장소로 옮기는 것이 좋습니다.

## 주요 파일

- `server.js`: API, 데이터 동기화, 분석, 추천, 백테스트
- `public/index.html`: 메인 화면
- `public/app.js`: 클라이언트 로직
- `public/styles.css`: UI 스타일
- `data/lotto-draws.json`: 저장된 회차 데이터
- `data/lotto-sync-state.json`: 최근 동기화 상태
