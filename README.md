# 로또 번호 분석 생성기

동행복권 회차 데이터를 자동으로 동기화하고, 최근성 가중치, 번호 점수화, 백테스트, 패턴 필터를 섞어서 추천 조합과 맞춤 1조합을 만들어주는 Node.js 앱입니다.

## 기능

- 동행복권 공식 결과 데이터 자동 동기화
- 번호 순위, 핫/콜드 번호, 구간 분포, 동반 출현 페어 분석
- 추천 5조합 생성
- 목표 5등권 추정 확률 기반 맞춤 1조합 생성
- 원하는 번호 1개 포함 또는 제외 후 맞춤 조합 생성
- 추천 세트 간 특정 번호가 과도하게 반복되지 않도록 분산 보정
- 균형 조건을 통과한 후보만 남기고, 5세트 전체 커버리지를 넓히는 추천 보정
- 이번 추천 평균/최고 5등권 추정치 요약 표시
- 실시간 추천에만 적용되는 `운적인 요소` 10% 옵션
- 최근 구간 백테스트

## 로컬 실행

```bash
nvm use
npm install
npm run start:safe
```

기본 주소는 `http://localhost:3210` 입니다.

권장 Node 버전은 `22.14.0` 입니다. 저장소의 `.nvmrc`를 사용해 `nvm use`로 맞출 수 있습니다.

실행 전에 기존 3210 포트 점유 프로세스를 정리하려면 아래 명령을 먼저 사용할 수 있습니다.

```bash
npm run stop:port
```

수정 후 서버 상태를 확인하고, 필요하면 다시 띄운 뒤 브라우저까지 여는 미리보기 흐름은 아래 명령 하나로 처리할 수 있습니다.

```bash
npm run preview
```

임시 로그와 브라우저 캐시를 정리하려면 아래 명령을 사용합니다.

```bash
npm run cleanup:temp
```

환경 변수는 `.env.example`을 참고해 `.env.local`로 분리해서 관리하는 것을 권장합니다.

화면 수정과 미리보기 진행 방식은 [docs/preview-workflow.md](C:\Users\KGWPC\workspace\lotto\docs\preview-workflow.md)에 정리돼 있습니다.

## Render 배포

이 프로젝트는 `render.yaml` 을 포함하고 있어서 Render의 Blueprint 또는 새 Web Service로 바로 올릴 수 있습니다.

기본값:

- Environment: `Node`
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/health`

주의:

- 이 앱은 `data/lotto-draws.json`, `data/lotto-sync-state.json` 을 파일로 씁니다.
- Render 웹 서비스 파일시스템은 기본적으로 영구 저장소가 아니므로 재배포나 재시작 시 상태가 초기화될 수 있습니다.
- 현재 앱은 공식 사이트에서 다시 동기화할 수 있어서 치명적이진 않지만, 장기 보존이 필요하면 Render Persistent Disk 또는 외부 저장소로 옮기는 것이 좋습니다.

## 주요 파일

- `server.js`: API, 데이터 동기화, 분석, 추천, 백테스트
- `scripts/run-local.js`: 포트 정리 후 서버를 안전하게 실행
- `scripts/kill-port.js`: 개발 중 남은 포트 점유 프로세스를 정리
- `scripts/cleanup-temp.js`: 임시 로그와 Playwright 캐시를 정리
- `public/index.html`: 메인 화면
- `public/app.js`: 클라이언트 로직
- `public/styles.css`: UI 스타일
- `data/lotto-draws.json`: 저장된 회차 데이터
- `data/lotto-sync-state.json`: 최근 동기화 상태

## 추천 로직 메모

- 기본 추천은 최근성, 번호별 백테스트, 페어 흐름을 합쳐 후보를 만들고, 마지막 5세트 선택에서는 숫자 재사용과 세트 간 과한 겹침을 더 강하게 줄여 5등권 커버리지를 넓히도록 보정합니다.
- `운적인 요소` 체크박스를 켜면 실시간 추천과 맞춤 1조합 생성에만 점수 기준 최대 10% 랜덤 가산이 들어갑니다.
- 비교 기준을 흔들지 않기 위해 백테스트 계산에는 `운적인 요소`를 반영하지 않습니다.
