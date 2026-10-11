# EVRIMA 스탯 비교

The Isle Evrima 공룡 성장 비교 사이트. 빌드 도구나 백엔드 없이 GitHub Pages에서 동작합니다.

## 기능

- 여러 공룡을 체중 / 달리기 / 공격력 그래프에 동시에 비교
- 그래프마다 공룡 표시 켜기·끄기
- 질주, 차징/Ambush, 갈리미무스 영양·Mobilize·무리 보정, 스태미나 항목 선택
- 물기와 추가 공격 종류별 표시 켜기·끄기
- 공통 성장률 슬라이더, 숫자 입력, 그래프 포인터로 수치 조회
- Prime/Frail 경로, 체중 로그 눈금, 미출시 공룡 포함
- 원본 사이트 최신 버전 및 특수능력 보정값 연결 / 수동 업데이트
- 마지막 성공 데이터 브라우저 저장, 연결 실패 시 저장 데이터 유지
- 현재 표시 설정대로 성장률 0~100% / 1% 간격 CSV 내보내기

## GitHub Pages

대상 저장소: https://github.com/OilerFormula/temp

1. 이 폴더의 파일을 저장소 `main`에 올립니다.
2. 저장소 **Settings → Pages → Build and deployment → Source → GitHub Actions**를 선택합니다.
3. push 시 `.github/workflows/pages.yml`이 수치 검증과 배포를 수행합니다. 기존 파일 업로드 후에는 Actions에서 **Deploy Evrima Compare → Run workflow**로 실행할 수 있습니다.
4. 일반적인 기본 주소는 `https://oilerformula.github.io/temp/`입니다. 실제 배포 성공 주소는 Actions의 deployment output에서 확인하세요.

모든 내부 경로는 상대 경로이므로 `/temp/` 같은 저장소 하위 경로에서도 동작합니다. 사용자별 공룡 선택과 데이터 캐시는 해당 브라우저에 저장됩니다.

## 로컬 실행

Windows에서는 `start-preview.cmd`를 두 번 클릭하면 브라우저와 로컬 미리보기가 열립니다. Python 3이 필요합니다. 실행 창을 닫으면 서버가 종료됩니다.

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

브라우저에서 http://127.0.0.1:4173/ 을 엽니다. ES modules와 JSON 요청을 사용하므로 `index.html`을 파일로 직접 여는 방식 대신 HTTP 서버를 사용하세요.

```powershell
node --test
node scripts/build.mjs
```

추가 패키지 설치 없이 실행됩니다. Node 22 이상 또는 24, Python 3 권장.

## 데이터 갱신

사이트의 **데이터 업데이트** 버튼은 원본의 `/data/index.json`을 읽고 최신 버전의 `species.json`, `foods.json`을 받습니다. 원본 HTML에서 현재 JavaScript 경로를 찾아 특수능력 상수를 안전하게 읽습니다. 내려받은 JavaScript를 실행하지 않습니다.

첫 화면은 포함된 JSON 또는 마지막 성공 캐시로 즉시 표시합니다. 이후 원본을 확인합니다. 업데이트 실패 시 현재 그래프 데이터는 유지하고 실패 상태를 표시합니다. 원본 구조가 변경되면 기존 값으로 조용히 덮어쓰지 않습니다. 특수능력만 갱신에 실패한 경우 같은 버전의 캐시만 사용하며 상태를 알립니다. 과거 버전에는 최신 버전의 능력 보정값을 적용하지 않습니다.

배포에 포함할 기본 데이터 스냅샷도 갱신하려면:

```powershell
node scripts/update-data.mjs
node --test
```

`data/` 변경을 커밋하고 push하면 Pages가 다시 배포됩니다. 방문자의 데이터 업데이트는 저장소를 수정하지 않습니다.

## 원본과 계산 기준

- 원본: https://evrima-viewer.com/
- 초기 데이터: 0.21.784, 원본 추출일 2026-08-30, 확인일 2026-10-11
- 기본 능력치: https://evrima-viewer.com/data/v/0.21.784/species.json
- 성장률 t=0~1. 75% 미만은 Frail, 이후 선택한 Prime/Frail 경로.
- Linear / cubic Hermite / weighted tangent 보간과 마지막 키 고정을 재현.
- 질주: cm/s ×0.036 → km/h. 물기: AttackPower ×damageBite.
- 카르노 차징과 티렉스 Ambush는 원본 프런트엔드의 서버 측정 보정값.
- 스태미나 -0.78/s는 세부 단위가 미제공이므로 %/s로 해석하지 않음.
- 미출시·누락 항목은 `null` / 자료 없음. 전체 공룡의 스태미나 소모/회복/총량 자료는 원본에서 제공하지 않음.
- 게임 버전 최신 여부는 이 도구에서 별도로 확인하지 않음. '최신'은 원본 데이터 목록 기준.

Google Fonts 사용에 실패하면 시스템 글꼴로 표시됩니다. 로그인, 분석 추적 및 API 키 없이 동작합니다.
