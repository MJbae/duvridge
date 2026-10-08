# Reader core

`@duvridge/reader-core`는 두 자서전 서비스의 콘텐츠 준비, 회차 ID·터전 파싱, 이미지 처리, 독서 기록 변환, 반응 저장, 기본 UI·CSS·메타데이터를 한 곳에서 관리합니다.

`components/WorkHome.vue`는 최신 읽기 서비스의 터전 이정표와 연속된 목차 줄을 렌더링합니다. 오디오 앱은 슬롯으로 청취 상태·시간·완료 표시를 넣고 `episode` 이벤트로 재생합니다. 앱의 오디오 플레이어와 회차 이동 동작은 이 패키지에 포함하지 않습니다.

`createReaderConfig`는 앱마다 전달하는 생성 카탈로그·환경 경로·브랜드 이름으로 VitePress 설정을 만듭니다. 오디오의 Markdown 문장 표시 플러그인은 앱이 추가합니다. `prepareContent`는 루트 디렉터리를 명시적으로 받고, `extendCatalog`로 오디오 자료를 덧붙일 수 있습니다. 앱끼리 직접 소스 코드를 가져오지 않습니다.

기존 상대 경로 진입점은 작은 재내보내기 파일로 유지해 테스트와 도구의 계약을 보존합니다. 공통 콘텐츠 테스트는 `tests/content.test.mjs` 하나이며 각 앱 워크스페이스에서 같은 검증을 실행합니다. 새 공통 기능은 앱 특유의 플레이어 상태·저장 키·재생 이벤트를 건드리지 않고 추가합니다.

두 앱이 사용하는 Firebase 보안 규칙·인덱스와 26개 규칙 검증은 `firebase/`의 단일 정본입니다. 루트 `firebase.json`이 이를 참조합니다. 루트 `npm run test:rules`는 Java 21의 로컬 demo Firestore 에뮬레이터로 검사하며 운영 Firebase 규칙은 배포하지 않습니다.
