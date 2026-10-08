# duvridge 모노레포

회사 홈페이지와 ToldLife 웹소설·오디오북을 이 저장소에서 관리합니다. 외부 서비스 저장소를 빌드 때 체크아웃하지 않습니다. 원고와 공통 읽기 화면을 한 번 수정하면 두 서비스에 함께 반영하고, 오디오 기능은 오디오북 서비스에서 독립적으로 관리합니다.

| 서비스 | 소스 | 운영 주소 | 배포 단위 |
| --- | --- | --- | --- |
| 회사 홈페이지 | `apps/company-site` | https://www.duvridge.com | Pages `duvridge` |
| ToldLife 홈 | `apps/toldlife-portal` | https://toldlife.duvridge.com | Pages `toldlife` |
| 웹소설 | `apps/toldlife-novels` | https://toldlife.duvridge.com/novels/ | `toldlife`에 함께 업로드 |
| 오디오북 | `apps/toldlife-audiobooks` | https://toldlife.duvridge.com/audiobooks/ | `toldlife`에 함께 업로드 |

## 구조와 공통 코드 정책

```text
apps/
  company-site/            회사 홈페이지, 언어별 HTML, 가이드북
  toldlife-portal/          ToldLife 서비스 홈
  toldlife-novels/          웹소설 읽기, 배경음악
  toldlife-audiobooks/      오디오북 듣기, 플레이어, 낭독 동기화
packages/
  memoir-content/          최신 원고·목차 구조·삽화·음악의 정본
  story-reader/            공통 읽기 UI, 회차 파싱, 반응·읽기 기록
tools/
  audiobook-production/    음성 제작 코드, 낭독 대본, 승인된 클립
scripts/                   변경 영향 계산, 배포 조립과 검증
service-registry.json              서비스와 배포 그룹 등록
```

기존 두 앱이 쓰던 npm을 유지하여 **npm workspaces + 루트 lockfile 하나**로 설치와 버전을 통일했습니다. Node 22와 npm 10을 사용합니다. 현재 규모에서는 Python 정적 사이트와 VitePress 앱을 서비스 레지스트리로 조율하면 충분하므로 별도의 작업 실행 프레임워크를 추가하지 않았습니다. 빌드 비용이 커지면 현재 패키지 경계를 유지한 채 Turborepo 등을 도입할 수 있습니다. [npm workspaces](https://docs.npmjs.com/cli/v10/using-npm/workspaces/)와 [Turborepo의 저장소 구조 안내](https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository)를 참고했습니다.

- 앱은 다른 앱의 구현을 가져오지 않습니다. 공유가 필요하면 `packages/`로 추출하고 소비 앱의 `dependencies`에 명시합니다. Python 제작 도구의 정본 경로와 정적 브랜드 자산은 레지스트리 및 문서에 명시합니다.
- 모든 workspace 이름은 `@duvridge/<이름>`으로 유일하게 정하고 내부 패키지는 `private: true`로 둡니다. 설치·의존성 갱신은 루트에서 실행하며 앱별 lockfile은 만들지 않습니다.
- 원고, 터전별 목차, 공통 삽화·표지·음악은 `packages/memoir-content`에서만 수정합니다. 준비 단계가 만드는 앱 내부 사본은 Git에서 제외합니다. 최신 `autobio-bae` 작업 트리를 정본으로 가져왔습니다.
- 공통 읽기 화면은 `story-reader`에서 수정하고 두 앱을 검증합니다. 오디오 플레이어의 배치, 재생·일시정지·속도·이어듣기·자동 다음 화·문장 이동은 오디오 앱 소유입니다.
- 두 앱의 Firebase 보안 규칙과 인덱스도 `packages/story-reader/firebase`에서 한 번만 관리합니다. 에뮬레이터 설정은 루트 `firebase.json`을 사용합니다. 운영 Firebase 규칙 배포는 웹 배포와 별도 작업입니다.
- 서비스마다 `test`, `build`, 필요 시 `typecheck`를 제공합니다. 공유 코드와 소비 서비스를 같은 PR에서 검토하고, 배포 그룹별로 버전과 롤백을 관리합니다.
- 비밀값은 Actions secrets 또는 로컬 `.env`에만 둡니다. `VITE_*`는 브라우저 공개 값이므로 서비스 계정 키를 넣지 않습니다. 빌드 결과·동영상·임시 제작 파일은 커밋하지 않습니다.

## 개발과 검증

```sh
nvm use
npm ci
npm run dev:novels
npm run dev:audiobooks
npm run test:repo
npm test
npm run typecheck
npm run test:rules  # Java 21 필요, demo 프로젝트의 로컬 Firestore 에뮬레이터만 사용
```

앱 하나의 명령은 `npm run <명령> --workspace @duvridge/toldlife-novels` 또는 `@duvridge/toldlife-audiobooks`으로 실행합니다. 브라우저 회귀 테스트는 각 앱의 `test:e2e`를 사용합니다. 회사 홈페이지 본문은 `apps/company-site/site/translations.json`, 구조는 `template.html`, 디자인은 `assets/site.css`에 있습니다. `python3 apps/company-site/scripts/build-company-site.py`로 언어별 HTML을 갱신합니다.

서비스용 빌드에는 네 가지 `VITE_FIREBASE_*` 환경변수가 필요합니다. 기존 GitHub의 공개 설정은 다음 명령으로 가져올 수 있습니다. 배포 토큰은 가져오지 않습니다.

```sh
python3 scripts/assemble-toldlife-pages.py --github-vars
npm run build --workspace @duvridge/company-site
```

웹소설·오디오북은 각각 `/novels/`, `/audiobooks/`와 `https://toldlife.duvridge.com`을 기준으로 빌드됩니다. 공개 파일만 `.deploy/toldlife` 및 `.deploy/company`에 모으며 저장소 루트는 배포하지 않습니다.

## CI/CD 정책

모든 PR와 `main` 푸시에서 단일 모노레포 커밋을 검사합니다. 변경 영향은 workspace 의존성과 `service-registry.json`으로 계산합니다. 공통 원고·읽기 코드가 바뀌면 두 독자 앱을 검사하고, 앱 하나만 바뀌면 해당 앱을 검사합니다. 루트 lockfile·도구·워크플로 변경은 전체 검사, 문서만 바뀌면 저장소 검사만 실행합니다. 고정 이름의 `Monorepo required` 검사가 결과를 모으므로 브랜치 보호에서는 이 검사를 필수로 지정합니다.

PR에서는 테스트·빌드만 수행합니다. 운영 배포는 `main` 검증 성공 후에만 수행하며 Cloudflare 토큰은 업로드 단계에만 전달합니다. 검증된 배포 artifact를 업로드하고 회사 홈페이지와 ToldLife의 대기열을 분리합니다. 진행 중인 운영 배포를 취소하지 않으며, 오래된 커밋이 최신 운영 버전을 덮지 않도록 업로드 전후 `main` 리비전을 확인합니다.

**ToldLife는 한 Pages 프로젝트의 전체 스냅샷을 배포합니다.** 웹소설만 변경되어도 배포 폴더에는 홈과 웹소설·오디오북이 모두 있어야 합니다. 한 하위 폴더만 업로드하면 다른 서비스가 사라질 수 있으므로 배포 준비 단계에서는 두 앱을 같은 SHA로 검증·빌드하고 완성된 artifact를 업로드합니다. 회사 홈페이지는 별도로 배포합니다. [Cloudflare Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)와 [GitHub Actions 동시 실행 제어](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)를 기준으로 운영합니다.

저장소 `MJbae/duvridge`에 필요한 설정:

| 종류 | 이름 | 용도 |
| --- | --- | --- |
| Secret | `CLOUDFLARE_API_TOKEN` | Pages 편집 권한을 가진 배포 전용 토큰 |
| Variable | `CLOUDFLARE_ACCOUNT_ID` | 배포 계정 |
| Variables | `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` | 두 앱의 동일한 Firebase 공개 설정 |

이전 두 저장소의 ToldLife 호출 워크플로와 회사 Pages의 네이티브 Git 자동 배포는 전환 시 중지합니다. 배포 실행자는 이 저장소의 Actions로 통일합니다. 기존 GitHub Pages 사이트는 이전 버전 참고용이며 새 변경은 이 모노레포에서 관리합니다. 상세 정책은 [CI/CD 문서](docs/ci-cd.md)에 있습니다.

수동 배포도 같은 폴더를 사용합니다. 운영 테스트 전에는 미리보기를 만들어 검사합니다.

```sh
npx --yes wrangler@4.148.0 pages deploy .deploy/company --project-name duvridge --branch monorepo-validation
npx --yes wrangler@4.148.0 pages deploy .deploy/toldlife --project-name toldlife --branch monorepo-validation
```

롤백은 각 Pages 프로젝트에서 이전 정상 배포를 선택합니다. ToldLife 롤백은 두 서비스가 함께 이전 스냅샷으로 돌아갑니다. 원고와 녹음을 별도로 수정하지 말고 같은 커밋으로 다시 빌드합니다.

## 서비스 추가

1. `apps/<서비스>`에 유일한 이름의 manifest와 테스트·빌드 명령을 만듭니다. 웹 프레임워크 선택은 서비스에 맡깁니다.
2. 공통 기능은 `packages/<기능>`에 두고 명시적인 의존성을 추가합니다. 서비스별 기능은 앱에 남깁니다.
3. `service-registry.json`에 경로, workspace 이름, 검증 명령, 빌드 출력, 배포 그룹을 등록하고 변경 영향 테스트를 추가합니다.
4. 독립 서비스는 자체 Pages 프로젝트·도메인·배포 job을 사용합니다. ToldLife 하위 경로에 추가할 경우 전체 조립과 sitemap·redirect·라우트 검증을 확장합니다.
5. PR 검증, 미리보기 배포, 운영 smoke test를 통과하고 주소·설정·롤백 방법을 기록합니다.

## 이관과 오디오 보존

원본 저장소의 작업 트리를 복사했고 원본 경로는 수정하지 않았습니다. `autobio-bae`의 커밋되지 않은 설정·테스트 수정도 반영했습니다. 리비전은 [이관 기록](docs/migration-sources.json)에 있습니다. Git 이력은 원본 저장소에 보존하고 여기에는 검증된 스냅샷으로 가져왔습니다.

기존 MP3, SRT, 대본과 승인된 클립을 보존했습니다. 최신 원고와 다른 낭독 문장은 재생을 유지하되 강조 표시를 생략합니다. 2화의 기존 녹음은 최신 원고와 일치율이 낮아 확인한 원고·녹음·자막의 해시에만 연결된 호환 예외를 사용합니다. 원고나 녹음이 다시 바뀌면 재검증합니다. 제작 도구와 기존 음성·배속·검수 정책은 [오디오 제작 안내](docs/audio-production.md)를 따릅니다. 유료 TTS/STT는 CI에서 실행하지 않습니다.

파일·폴더·workspace는 제품과 기능을 기준으로 이름을 맞춥니다. 웹 서비스는 `toldlife-*`, 공통 독자 기능은 `story-reader`, 오프라인 제작은 `audiobook-production`으로 구분합니다. Vue 컴포넌트와 도구의 상세 기준은 [네이밍 정책](docs/naming-policy.md)을 따릅니다. 공개 주소·회차 ID·녹음 캐시 ID는 이용자 상태와 자료 참조의 계약이므로 유지합니다.

삽화는 원고의 원하는 위치에 `<!-- illustration: ep01-01 -->` 표식을 넣어 배치합니다. 본문 문구나 문단 번호를 다시 계산하지 않습니다. 자산 정보는 공통 삽화 manifest에서 관리하고 누락·중복 표식은 검증에서 거절합니다. 구체적인 추가·수정 방법은 [삽화 편집 안내](docs/illustration-authoring.md)에 있습니다.

실제 배포 결과와 검증 범위는 [배포 검증 기록](docs/deployment-verification.md)에 기록합니다.
