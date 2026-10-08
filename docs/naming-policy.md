# 네이밍 정책

이름은 서비스의 역할과 코드의 책임을 설명해야 한다. 새 서비스·패키지를 추가할 때 이 문서의 기준을 적용하고, 같은 기능에는 같은 용어를 사용한다.

## 서비스와 워크스페이스

배포 서비스는 `apps/<서비스 이름>/`, 유지하는 공통 구현은 `packages/<기능 이름>/`, 별도 제작 도구는 `tools/<제작 기능>/`에 둔다. 폴더명·서비스 등록 ID·npm 워크스페이스 이름의 마지막 부분은 같은 이름을 사용한다. 소문자와 하이픈으로 단어를 구분한다.

| 경로 | 워크스페이스 / 역할 |
| --- | --- |
| `apps/company-site` | `@duvridge/company-site` · 회사 소개 사이트 |
| `apps/toldlife-portal` | `@duvridge/toldlife-portal` · ToldLife 서비스 입구 |
| `apps/toldlife-novels` | `@duvridge/toldlife-novels` · 본문 읽기 서비스 |
| `apps/toldlife-audiobooks` | `@duvridge/toldlife-audiobooks` · 낭독을 들으며 읽는 서비스 |
| `packages/story-reader` | `@duvridge/story-reader` · 공통 읽기 화면과 처리 |
| `packages/memoir-content` | `@duvridge/memoir-content` · 정본 원고·자료·삽화·음악 |
| `tools/audiobook-production` | 낭독·자막·영상의 별도 제작 도구 |

같은 제품군의 서비스에는 `toldlife-`처럼 공통 접두사를 붙이고, 뒷부분에서 역할을 구분한다. 작품명·인물명·이전 저장소 이름은 서비스 식별자로 쓰지 않는다. 공통 패키지는 소비 앱의 이름 대신 실제 공유 기능을 이름으로 사용한다. `core`, `common`, `utils`, `misc`, `new`, `v2`처럼 책임을 알 수 없는 이름으로 새 경계를 만들지 않는다.

`service-registry.json`에는 서비스별 경로와 워크스페이스를 등록한다. `workspaceScope`는 `@duvridge`이며 변경 영향 계산은 서비스 폴더·등록 ID·워크스페이스 이름의 일치와 실제 소스 경로를 검사한다. 배포 그룹 이름은 같은 배포 결과물의 단위이므로 개별 서비스 이름과 달라도 된다. 새로운 앱은 다른 앱의 구현을 가져오는 대신 선언한 공통 패키지 의존성을 사용한다.

## 코드와 파일

| 대상 | 형식 | 예시 |
| --- | --- | --- |
| Vue 컴포넌트 | 기능을 나타내는 PascalCase | `StoryHome.vue`, `AudiobookPlayerBar.vue` |
| JS·TS 모듈과 CSS | 기능을 나타내는 kebab-case | `reader-catalog.ts`, `narration-controller.ts`, `reader.css` |
| JS·셸 작업 스크립트 | 동사 + 대상의 kebab-case | `select-affected-services.mjs`, `prepare-reader-content.mjs`, `produce-audiobooks.sh` |
| Python 모듈 | import에 맞는 snake_case | `assemble_audiobook.py`, `render_caption_frames.py` |
| 문서 | 주제를 나타내는 kebab-case | `naming-policy.md`, `deployment-verification.md` |
| 테스트 | 검증 대상 + 테스트 도구 접미사 | `content.test.mjs`, `narration.spec.ts`, `test_static_site.py` |

컴포넌트 import 이름과 템플릿 이름은 파일 이름과 맞춘다. `ReaderIcon.vue`를 `ReaderIcon`으로, `AudiobookPlayerSheet.vue`를 `AudiobookPlayerSheet`로 사용한다. 프레임워크가 정한 속성명에는 명시적인 연결을 사용한다. 예를 들어 VitePress의 `Layout` 속성은 앱의 `NovelReaderLayout.vue` 또는 `AudiobookReaderLayout.vue`를 연결한다.

공통 기능에는 `Reader`, `Story`, `Reading`을 역할에 맞게 사용한다. 읽기 앱에만 필요한 기능은 `Novel`, 오디오 앱 화면은 `Audiobook`, 낭독 데이터·문장 강조·재생 제어는 `Narration`/`narration`, 재생 대상 선택은 `playback`으로 구분한다. 배경음악에는 `background-music`을 사용해 낭독 음성과 구별한다. 이미 기능이 명확한 `ResponsiveImage`, `ReadingLink`, `ReactionBar`에는 불필요한 접두사를 추가하지 않는다.

## 책임별 이름

공통 `StoryHome.vue`는 작품 소개와 터전별 목차를 그린다. `AudiobookHome.vue`는 공통 홈에 청취 상태를 연결한다. `NovelReaderLayout.vue`와 `AudiobookReaderLayout.vue`는 각 앱의 화면을 구성하고, `NovelEpisodeEnd.vue`와 `AudiobookEpisodeEnd.vue`는 각 앱의 회차 끝 동작을 관리한다.

`reaction-store.ts`는 브라우저 상태·구독·재시도를, `reaction-firestore.ts`는 반응 조회·저장을, `firebase-client.ts`는 Firebase 연결을 담당한다. `narration-controller.ts`는 낭독 재생 상태, `narration-dom.ts`는 문장 표시와 스크롤, `narration-device-controls.ts`는 잠금 화면과 화면 켜짐 유지, `narration-catalog.mjs`는 녹음·시각 자료의 로딩과 검증을 담당한다.

오디오 제작 도구의 실행 코드는 `src/`, 회차별 낭독 대본은 `narration-scripts/`, 생성한 음성 조각은 `narration-clips/`, 조립 결과는 `output/`에 둔다. 웹 빌드는 이 제작 작업을 실행하지 않는다.

## 유지해야 하는 이름과 변경 검증

VitePress의 `site/.vitepress/config.mts`와 `theme/index.ts`, npm의 `package.json`, TypeScript의 `tsconfig.json` 등 도구가 찾는 이름은 해당 계약을 따른다. 공유 설정 파일은 `packages/story-reader/vitepress-config.mts`이며 앱의 VitePress 진입점과 구분한다.

원고 제목·원자료 파일명·회차 앵커·삽화 ID·승인된 MP3/SRT·캐시 파일명은 자료 식별 계약을 따른다. 내부 코드의 이름을 정리하기 위해 이를 일괄 변경하지 않는다. 공개 주소, 브라우저 저장 키, Firebase 문서 ID와 앱 이름, 오디오 DOM 클래스와 `data-*` 속성도 기존 상태와 동작을 보존한다. 원본 저장소 경로와 이전 GitHub Pages 주소를 기록한 역사 문서는 당시 이름을 유지한다.

파일·폴더 이름을 바꾸면 import와 재내보내기, 대응 `.d.mts`, CSS import, 문자열로 만든 컴포넌트 태그, npm 명령, 서비스 등록 경로, 테스트의 요청 가로채기 패턴까지 확인한다. 워크스페이스 이름·경로 변경 시 루트 lockfile과 설치 링크도 함께 갱신한다. 저장소 오케스트레이션 테스트와 영향을 받는 앱의 테스트·빌드·타입 검사를 실행하고, UI·오디오 파일 경로 변경은 브라우저 검증으로 확인한다.
