# 모노레포 배포 검증

2026-10-08~09 KST에 기존 프로젝트를 npm workspaces 모노레포로 이관했다. 소스 원본 두 경로는 수정하지 않았다.

2026-10-09 세 시리즈 탭 개편 당시 운영 소스는 `22d79ba0fb0bc1138216d1e66dc18f8ae961716a`다. 이 커밋은 배포 확인 스크립트만 고쳤다. 그래서 [Actions 실행 37928823351](https://github.com/MJbae/duvridge/actions/runs/37928823351)이 두 Pages 프로젝트에 새로 올린 파일은 각각 배포 정보 1개뿐이고, 화면과 미디어는 `f7e8798a0b96fa65465664af6e445f32ea3cdebf`과 같다. f7e8798의 [Actions 실행 37926878727](https://github.com/MJbae/duvridge/actions/runs/37926878727)에서는 네 서비스 검증, 공통 검사, 두 Pages 배포와 배포 후 HTTP 검사가 모두 성공했다. 웹소설 26회차의 제목과 본문 문단 419건을 정본과 직접 대조했다. 세 시리즈 탭, 세 작품 홈, 소설 리더, 오디오북 플레이어와 영상 화면도 휴대폰과 데스크톱에서 확인했다(아래 '세 시리즈 탭 개편'). [기계 판독 검증 결과](latest-deployment-check.json)에 커밋·원고 해시·확인 시각을 보존한다. 이전 운영 소스 `9efd8a8`의 11화 삽화 확인 결과도 같은 파일에 남아 있다.

## 사전 검증

- 변경 영향·포털 JavaScript 검사 10건, 완전한 ToldLife 조립 Python 검사 4건 통과.
- 회사 홈페이지 검사 6건, 공유 입력 삭제·보존 검사 2건 통과.
- 공통 Firebase 보안 규칙을 단일 정본으로 모으고 Java 21 Firestore 에뮬레이터의 26건 검사를 통과했다. 규칙·인덱스·검증 내용은 원본과 동일하며 운영 Firebase는 변경하지 않았다.
- 웹소설 콘텐츠 25건, 오디오북 콘텐츠·낭독·플레이어 47건 통과. 양쪽 타입 검사와 운영 경로 빌드 통과.
- 웹소설 E2E 전체 105건 통과. 오디오북 전체 실행에서 125건 통과 후, 최신 본문 문장 좌표 수정의 세 화면 재검증 3건 통과. 고유 사례 127건 검증, 모바일 새 탭 2건은 기존 명시적 제외.
- actionlint v1.7.12로 `.github/workflows/monorepo-ci.yml` 구문 검사 통과.
- 원본 MP3·SRT·제작 대본·승인된 녹음 캐시 74개가 원본과 바이트 단위로 동일하다. [보존 해시](migration-audio-preservation.json).

## 실제 미리보기 배포

| Pages 프로젝트 | 실제 배포 주소 | 확인 |
| --- | --- | --- |
| duvridge | https://69be9706.duvridge.pages.dev | 5개 언어, 가이드북 2경로, 자산·공유 metadata, 휴대폰 화면 |
| toldlife | https://d3c047d8.toldlife.pages.dev | 홈, 두 서비스 52회차 경로, MP3 4개, 404, 휴대폰·데스크톱 상호작용 |

미리보기는 이관 중 작업 트리로 올린 스냅샷이다. 공개 marker의 원래 HEAD는 `8d17cddb53fbccf7903a7a773193101e01f72c79`, `sourceDirty=true`이며 운영 커밋 확인용으로 사용하지 않는다.

`check-deployment-browser.mjs`는 두 앱의 터전 목차와 최신 2화 본문이 동일한지 확인했다. 오디오 플레이어의 재생·일시정지·1.25배 속도·다음 문장 이동·펼친 화면·가로 넘침도 검사했다. 스크린샷과 JSON은 로컬 `.deploy/verification-preview-company`, `.deploy/verification-preview-toldlife`에 있다. `check-deployment-http.py`의 HTTP·자산 검증도 통과했다. 초기 검증의 느린 플레이어 활성화 대기는 음성 요소가 준비될 때까지 기다리도록 보완했고 재실행이 통과했다.

## 배포 실행자 전환

- `MJbae/bae-memoir`와 `MJbae/autobio-audiobook`의 ToldLife 호출 워크플로를 `disabled_manually`로 변경했다. 진행 중인 호출은 없었다.
- 회사 Pages 프로젝트의 Git 연결은 보존하면서 `production_deployments_enabled=false`, `preview_deployment_setting=none`, `deployments_enabled=false`를 적용하고 GET으로 재확인했다.
- 중지된 네이티브 빌드 설정도 새 `apps/company-site` 명령과 `.deploy/company` 출력에 맞추었다. 저장소 루트를 공개하는 설정은 제거했다.
- 구 GitHub Pages 워크플로는 이전 버전 주소를 위해 유지한다. 새 Cloudflare 배포는 모노레포 Actions만 실행한다.

## GitHub Actions 운영 배포

첫 모노레포 커밋 `700f543b87e2c6c8491643770dba8de72982ba03`을 `main`에 반영했고 [Actions 실행 37797128868](https://github.com/MJbae/duvridge/actions/runs/37797128868)의 모든 검증·서비스 빌드·두 Pages 프로젝트 배포·배포 후 HTTP smoke 검사가 성공했다. 별도 레포 체크아웃 없이 깨끗한 작업 공간에서 루트 `npm ci`와 공유 패키지 연결을 검증했다.

Firebase 중복 제거 커밋 `198c33cb16f3a57177bfd0ddbfdf4128dd9d2e52`의 [Actions 실행 37797900403](https://github.com/MJbae/duvridge/actions/runs/37797900403)도 전부 성공했다. Java 21의 규칙 검사 26건과 두 앱 검증, 두 Pages 배포, 운영 SHA·경로 검사를 포함한다.

운영 주소 `https://www.duvridge.com`과 `https://toldlife.duvridge.com`에서도 회사 7경로, 두 앱 52회차·음원 4개, 목차·본문 일치, 휴대폰·데스크톱 실제 오디오 조작을 확인했다. 초기 HTML의 플레이어 버튼이 활성화되기 전에 누르는 검증 경합을 피하도록 펼친 플레이어를 먼저 열어 상호작용 준비를 확인한다. 이 조정은 검증 도구에만 적용되며 서비스 UI는 변경하지 않는다.

## 추가 요청: 기능별 네이밍과 고정 삽화 표식

서비스를 `company-site`, `toldlife-portal`, `toldlife-novels`, `toldlife-audiobooks`로 통일하고 공통 리더를 `story-reader`, 제작 코드를 `tools/audiobook-production`으로 분리했다. 파일·컴포넌트·CSS·명령·레지스트리·CI 경로를 함께 이관했다. 서비스 폴더·등록 ID·workspace 이름과 실제 소스 경로의 일치도 자동 검사한다.

기존 46개 삽화는 본문 문구 위치 대신 원고의 `<!-- illustration: stable-id -->`에 연결했다. 표식을 제거하면 변경 전 원고 bytes가 그대로 복원되며 26회차 렌더링 HTML과 46개 배치 위치는 기존과 같다. 새 삽화를 기존 두 그림 사이에 넣어도 기존 ID·파일명을 바꾸지 않는다. 자산 manifest에는 위치를 저장하지 않는다. 오디오 호환성용 원고 해시는 표식을 제외한 본문을 검사하므로 표식만 편집할 때 예외 정보를 갱신할 필요가 없다.

이 이관 단계의 단위 검증은 웹소설 29건, 오디오북 51건, 제작 파서 10건, 보안 규칙 26건, 저장소 JavaScript 11건·Python 4건, 회사 홈페이지 6건, 공통 입력 정리 2건이다. 양쪽 타입 검사와 운영 경로 빌드도 통과했다. 새 이름과 경로에서 화면 회귀 검증은 웹소설 105건, 오디오북 127건 통과이며 모바일 새 탭 2건은 기존 명시적 제외다.

추가 요청의 실제 미리보기는 https://75763e38.toldlife.pages.dev 에 업로드했다. 원본 녹음·자막·승인된 대본·클립 74개는 [보존 기록](migration-audio-preservation.json)의 새 목적 경로에서도 해시가 일치한다. 유료 생성 작업과 운영 Firebase 배포는 실행하지 않았다.

## 추가 요청: 꼭 필요한 여섯 회차의 삽화 정렬

실제 그림과 26회차 본문을 대조해 6·8·11·13·14·15화의 표식 8개만 해당 장면 앞으로 이동했다. 그림 재생성·본문 재배열 없이 처리했고, 나머지 20회차의 본문 HTML과 모든 문장·문단 순서가 동일함을 확인했다. 상세 대상과 전후 장면은 [삽화 변경 기록](illustration-story-alignment.md)에 있다.

대표 그림을 본문 배치와 분리해 기존 26개 `-01` 썸네일·펼친 플레이어·잠금 화면 이미지를 유지했다. 6회차×3화면의 대표 그림 검사를 포함해 오디오 낭독 E2E 73건, 읽기 E2E 75건, 웹소설 E2E 108건이 통과했다. 총 256건 통과, 모바일 새 탭 2건은 명시적 제외다. 최종 단위 검증은 웹소설 30건, 오디오북 52건, 제작 파서·자산 선택 16건이며 양쪽 타입 검사와 운영 빌드도 통과했다.

보존한 347개 그림·원본·MP3·SRT 해시와 승인된 대본·클립·자막 74개를 재확인했다. 9화 제작 도구가 잘못된 바인더 원본을 선택하던 경로를 승인된 웹 트럭 JPEG로 수정했다. 기존 실제 오디오·영상·대본은 다시 만들지 않았다. 2화 호환 예외도 해당 회차의 텍스트에만 한정하여 다른 회차나 삽화 표식 편집이 영향을 주지 않는다.

## 후속 정책: 기존 오디오는 재생성 예정

사용자가 현재 오디오를 다시 생성할 예정이라고 명시했다. 이에 따라 기존 문장 일치율로 웹 빌드를 차단하던 검사와 2화의 임시 해시 예외를 제거했다. 원고·제목·시점·삽화는 기존 낭독에 제약받지 않고 편집한다. 일치하는 문장만 강조하고 없는 문장은 강조하지 않으며, 재생 시각과 트랙 정보는 그대로 유지한다.

MP3·SRT 짝, 회차 ID, 비어 있는 음성, 안전한 파일 경로, 겹치거나 잘못된 시각과 끝 음악의 순서는 계속 검사한다. 새 녹음을 가져오는 `narration:sync`의 최신 원고 일치 검증도 유지한다. 문장을 전부 바꿔도 기존 트랙을 유지하는 검증과 부분적으로 남은 문장만 강조하는 검증을 포함해 오디오 단위 검사 52건, 웹소설 30건, 저장소 검사 11·4건 및 양쪽 빌드·타입 검사가 통과했다. 음성·SRT·클립은 재생성하지 않았다.

위의 과거 배포 기록에 나타난 호환 예외는 해당 검증 시점의 정책이며, 현재 정책에는 적용되지 않는다.

## 후속 구조 개선: 편집 자료와 공통 기능 분리

원문·삽화·음악·참고 자료 493개를 `content/books/bae-byunghee`로 옮겼다. 원문은 `manuscript.md`, 자산·공유 정보·이전 ID 대응은 `book.json`에서 관리한다. 사용자 작성 중 원문 수정 7줄 추가·5줄 삭제는 새 위치의 작업 트리에 보존하고 구조 변경 커밋과 분리한다. 사용자 초안 복사본도 수정하거나 추적하지 않는다.

기존의 두 포괄적 패키지를 원고·자산 처리(`content-processing`), 읽기 UI(`reader-ui`), 반응·Firebase 저장(`reader-reactions`), 플랫폼 설정·Markdown 연동(`vitepress-reader`)으로 나누었다. 패키지에는 책 원본이나 미디어를 두지 않고 기능별 `src/manuscripts`, `src/components`, `src/persistence`, `src/markdown` 경계를 사용한다. 편집 자료 변경은 서비스 레지스트리의 책 연결로 두 리더와 ToldLife 전체 배포에 전파된다.

순환 의존성·패키지 안의 원고/미디어 재유입·소비자 전파를 검사하는 저장소 테스트와 자료 변경 전파 검증을 추가했다. 공통 처리 5건, 플랫폼 설정 1건, 반응 상태 5건, 보안 규칙 26건, 제작 파서/자산 16건이 통과했다. 웹소설 브라우저 108건, 오디오북 148건 통과와 기존 모바일 새 탭 2건의 명시적 제외를 확인했다. 타입 검사와 공유 메타데이터 검사도 통과했다.

구조 변경 커밋 `fa1748b49696080ff66ce0e3fc7144647cb39e68`의 [Actions 실행 37866445862](https://github.com/MJbae/duvridge/actions/runs/37866445862)에서 깨끗한 checkout의 루트 `npm ci`, 네 서비스 검증, 두 Pages 배포와 HTTP 검사를 모두 통과했다. 공개 운영 사이트에서도 새 SHA와 `sourceDirty=false`, 두 서비스의 동일한 목차·본문, 플레이어 재생·일시정지·1.25배속·다음 문장 이동을 확인했다.

이어 공통 패키지 단위 검증을 CI에 자동 포함한 `9645c6c805271297bd384d95224eda4abb6ede93`의 [Actions 실행 37866920128](https://github.com/MJbae/duvridge/actions/runs/37866920128)도 모두 성공했다. 저장소 JavaScript 15건·Python 4건, 공통 패키지 11건, 제작 파서/자산 16건, Firebase 규칙 26건과 서비스 검증을 통과했다. 실제 업로드 주소는 회사 `https://5776fbf8.duvridge.pages.dev`, ToldLife `https://b65147d8.toldlife.pages.dev`이며 두 운영 도메인이 같은 최종 SHA를 제공한다. 조정한 여섯 회차를 두 서비스에서 다시 열어 삽화 26개 배치·이미지 로딩·직후 장면과 기존 오디오 대표 그림을 확인했다. 원고 수정 7줄 추가·5줄 삭제와 사용자 초안은 커밋·배포에 포함하지 않고 새 원고 위치의 작업 트리에 보존했다.

## 수정한 자서전 원문 그대로 게시

사용자가 수정한 `content/books/bae-byunghee/manuscript.md`를 위 운영 커밋에 포함했다. 작업을 시작할 때의 사용자 원고, 커밋 원고와 최종 원고의 SHA256은 모두 `3320ade338ebf179ed6779540a315cb8253cc0c9f71bccaa30ed17bbcbd266f4`로 동일하다. 본문을 기존 오디오나 테스트에 맞춰 수정하지 않았다. 위 구조 이관 때 분리해 보존했던 원고 수정도 이번 게시 요청에 따라 포함했다.

두 앱의 작업 사본을 정본과 비교하고 생성된 26개 회차의 제목·본문·시점·목차·이전/다음 링크를 검증하도록 보완했다. 서술 문단 150자 제한을 제거하고 긴 문단과 작성한 줄바꿈을 보존하는 검증으로 바꿨다. `editorial-notes/`는 파일명이나 하위 폴더와 무관하게 게시 대상에서 제외한다. 삽화 수는 manifest에서 계산하며, 현재 47개 삽화와 본문 표식이 일치한다. 참고 이미지 인덱스와 내장 뷰어의 원고 해시·11화 제목·대표 장면도 갱신했다.

로컬 검증에서 양쪽 타입 검사·운영 빌드·공유 정보 검사를 통과했다. 웹소설 단위 32건, 오디오북 단위 54건, 공통 패키지 11건, 제작 파서/자산 16건과 저장소 JavaScript 15건·Python 4건이 통과했다. 웹소설 브라우저 검사에서는 기존 105건 통과 후 변경된 삽화 검증 6건을 재검증했고, 오디오북 전체 브라우저 검사는 151건 통과·기존 모바일 새 탭 2건 제외를 확인했다. 녹음과의 불일치는 원문 게시를 막지 않도록 시험 입력만 조정했으며 실제 MP3·SRT·승인된 대본·클립 74개는 보존 해시가 같다.

운영 CI도 웹소설 32건, 오디오북 54건, 공유 정보 각 6건, 낭독 상호작용 51건 통과·기존 모바일 새 탭 1건 제외와 Firebase 규칙 26건을 통과했다. 실제 업로드 주소는 회사 `https://5bf9ae34.duvridge.pages.dev`, ToldLife `https://6be893a5.toldlife.pages.dev`다. 공개 주소의 배포 marker는 같은 최종 SHA와 `sourceDirty=false`를 제공한다.

배포 후 회사 7경로, 두 리더 52페이지의 제목과 정본 본문 문단 838건, 음원 4개와 휴대폰·데스크톱 상호작용을 확인했다. 11화는 `자식들만큼은` 제목, `ep11-family-care`와 `ep11-01` 순서, 각 그림 직후 장면, 24개 공개 이미지의 정본 해시 일치와 4개 화면의 이미지 로딩·가로 넘침·브라우저 오류를 검증했다. 원문 중심 정책은 `AGENTS.md`와 루트 README에도 명시했다.

## 세 시리즈 탭 개편

포털 첫 화면을 `오리지널 시리즈 · 오디오북 · 영상` 세 탭으로 나눴다. 고른 탭이 작품 홈과 회차 화면의 형식을 정한다. 오리지널 시리즈는 소설 리더(`/novels/`)를, 오디오북은 낭독 플레이어(`/audiobooks/`)를, 영상은 극장형 플레이어(`/audiobooks/watch/`)를 쓴다. 영상은 MP4를 만들지 않고 낭독 MP3·삽화·SRT 자막을 브라우저에서 합친다. 장면이 바뀌는 시점은 `content/narration/<id>.scenes.json`에 둔다. 오디오북과 영상 화면에는 원고 본문을 싣지 않으므로, 배포 후 본문 대조는 웹소설 26회차만 한다. 커밋은 `8c1db52a588a13937b06eff5a6b9c423040f8b25`(구현)와 `f7e8798a0b96fa65465664af6e445f32ea3cdebf`(리뷰 수정)다.

f7e8798의 깨끗한 checkout에서 단위 검사가 모두 통과했다. 저장소 JavaScript 15건·Python 4건, 회사 홈페이지 11건, 포털 2건, 웹소설 32건, 오디오북 53건, 공통 패키지 16건이다. 양쪽 타입 검사도 통과했다. 브라우저 검사는 구현 커밋에서 실행했다. 웹소설 72건(휴대폰·작은 휴대폰·데스크톱), 오디오북·영상 39건, Java 21 Firestore 에뮬레이터를 쓰는 두 앱의 반응 검사 각 6건이 통과했다. 리뷰 수정 뒤에는 낭독 상호작용 26건(휴대폰·데스크톱)을 다시 실행해 통과했다.

`main`에 반영한 f7e8798의 [Actions 실행 37926878727](https://github.com/MJbae/duvridge/actions/runs/37926878727)에서 네 서비스 검증, 공통 검사, 두 Pages 배포와 배포 후 SHA·HTTP 검사가 모두 성공했다. 실제 업로드 주소는 회사 `https://29a7c13a.duvridge.pages.dev`, ToldLife `https://5f7c7e0a.toldlife.pages.dev`다. 두 운영 도메인의 배포 marker는 같은 SHA와 `sourceDirty=false`를 제공한다.

배포 후 2026-10-09 21:03 KST에 `https://toldlife.duvridge.com`을 확인했다.

- 웹소설 26회차의 제목과 본문 문단 419건을 정본과 대조했다. 원고 SHA256은 이전 게시와 같은 `3320ade338ebf179ed6779540a315cb8253cc0c9f71bccaa30ed17bbcbd266f4`다.
- 오디오북 26회차와 영상 4회차의 canonical과 제목, 녹음 4개의 Range 응답, 없는 경로의 404를 확인했다.
- 휴대폰(390px)과 데스크톱(1440px)에서 다음을 검사했다.
  - 세 탭의 큰 버튼(읽기·듣기·보기)과 세 작품 홈의 26회차 목록
  - 소설 리더 상단의 조작 3개와 읽기 설정
  - 오디오북 재생, 10초 앞으로, 1.25배속, 현재 문장
  - 영상 자막 띠
  - 가로 넘침과 브라우저 오류

스크린샷과 JSON은 로컬 `.deploy/verification-series-tabs`에 있다. 첫 확인은 커밋되지 않은 원고 수정이 있는 작업 트리에서 실행해서 실패했다. 프롤로그 문단이 배포본과 달랐기 때문이다. 같은 커밋의 깨끗한 checkout에서 다시 실행해 통과했다.

회사 사이트도 같은 실행에서 같은 SHA로 배포되었다. 처음 실행한 브라우저 검사는 `/ko/`에서 `ToldLife` 문구를 찾지 못해 실패했다. 회사 사이트 개편(`a96c5aa`)으로 제품 이름이 인생원작으로 바뀌었는데 검사 문구를 갱신하지 않았기 때문이다. 검사 문구를 인생원작으로 고친 뒤 21:13 KST에 다시 실행했다. SHA, 7경로의 HTML, h1 1개와 제품 이름을 확인해 통과했다.

## 보존 범위와 제한

오디오 재생성 전에는 기존 낭독과 다른 문장이 있을 수 있으며, 문장 일치는 편집·빌드의 차단 조건이 아니다. 오디오북과 영상 화면은 원고 본문 대신 낭독 자막(SRT)의 문장을 보여 준다. 실제 음성 제작은 별도 요청된 작업에서 수행하며 이번 웹 수정에서는 재녹음이나 유료 API를 호출하지 않았다.

Cloudflare 미리보기의 MP3 Range 요청은 전체 파일 HTTP 200으로 응답했다. 파일 해시는 원본과 동일하며 실제 Chromium 재생·배속·문장 이동은 정상이다. 검증한 웹 화면 크기는 320px, 390px 및 1440px이다. 실제 iOS Safari 하드웨어 검증은 포함하지 않는다.

## 2026-10-09 작품별 URL 개편 — 로컬 검증, 운영 미배포

`duvridge-work-urls` 워크트리의 `feat/work-urls`에서 주소 개편을 완료했다. 기준 HEAD는 `90a06917e43d08fe2f5847ceba78b6a4a62b6efd`이고 변경은 미커밋 상태다. 아래 결과는 로컬 산출물의 검증이며 Cloudflare 운영 배포 증거가 아니다. 기존 운영 배포 기록과 `latest-deployment-check.json`은 갱신하지 않았다. R2·운영 Firebase·녹음 제작은 실행하지 않았다.

- 세 형식의 작품 홈과 회차를 `/novels/bae-byunghee/`, `/audiobooks/bae-byunghee/`, `/videos/bae-byunghee/` 아래에 만들었다. 회차 canonical과 공유 주소에서 `.html`을 제거했다. 포털과 회사 사이트 링크, 작품별 sitemap, 영상 앱 등록, 코드·원고 변경 영향 계산도 확인했다.
- `npm run test:repo`: Node 16건과 Pages 조립 Python 5건 통과. 공통 패키지는 원고 처리 8건, 리더 UI 7건, 반응 6건, VitePress 설정 5건 통과. 회사 사이트 11건도 통과했다.
- `npm run build:toldlife`: 소설 콘텐츠 34건, 오디오북 콘텐츠·낭독·플레이어 55건, 영상 카탈로그 1건, 세 리더 빌드·타입 검사 통과. 마지막 공유 검사에서는 각 형식 4건씩 통과하여 작품·회차 metadata, 옛 주소 목록, 정본 본문, 아이콘·공유 이미지 크기를 확인했다.
- 기존 브라우저 회귀: 소설 66개 시나리오를 검증했다(첫 실행 54건 통과 후 옛 경로 기대값을 고친 12건의 재실행 통과). 오디오북 33건, 영상 9건 통과. 휴대폰·작은 휴대폰·데스크톱에서 읽기·음악 3% 음량·이동·배속·자막·장면 선택·화면 폭을 확인했다. 반응 브라우저 6건과 Java 21 Firestore 규칙 26건도 통과했다.
- `npm run test:urls`: 두 회차짜리 `url-rehearsal` 작품을 `.deploy/`에만 만들고 휴대폰·데스크톱 14건을 통과했다. 작품별 페이지·미디어·카탈로그 청크·읽기 기록·낭독 위치 분리, 옛 키 보존, `#video` 호환, 미등록 주소 404, 음원의 Range 206을 확인했다. 시험 작품은 별도 `.deploy/work-url-fixture`에 조립했다. 기본 `.deploy/toldlife`에는 시험 작품이 없다.
- `check-deployment-http.py --group toldlife --origin http://127.0.0.1:4191`: 로컬 Pages 재현 서버에서 smoke HTML·필수 자산·음원과 **388개 전체 규칙의 301/Location/도착 200**을 확인했다. 이 검사는 실제 Cloudflare의 동작 확인을 대신하지 않는다.
- `check-deployment-browser.mjs`의 같은 로컬 산출물 검사에서 원고 26회차·419문단과 공유 제목을 대조하고 휴대폰·데스크톱 재생·10초 이동·1.25배속·영상 자막을 확인했다. 확인 시각은 `2026-10-09T13:29:16.626Z`, 해당 워크트리 정본 원고 SHA-256은 `3320ade338ebf179ed6779540a315cb8253cc0c9f71bccaa30ed17bbcbd266f4`다. JSON과 화면 캡처는 `.deploy/work-url-verification/`에 보존했다.

현재 기본 산출물은 포털과 세 리더를 포함한 2,359개 파일, sitemap 82개 URL이며 `deployment.json`에 `sourceDirty: true`를 명시한다. 업로드하지 않았다. 회사·ToldLife CI에는 같은 커밋의 검증 산출물만 업로드하는 기존 절차를 유지하고, 두 작품 URL 리허설을 배포의 필수 검사에 추가했다. YAML 구문과 URL 검사 연결을 로컬에서 확인했으며 이 브랜치의 GitHub Actions는 아직 실행하지 않았다.

현재 주 작업 폴더의 미커밋 원고·삽화·프롤로그 녹음 교체와 1~3화 녹음 삭제는 건드리지 않았다. 위 검증은 해당 변경 전의 워크트리 정본과 승인된 녹음 4개를 기준으로 한다. 그 변경이 커밋된 뒤 URL 브랜치를 rebase하고 새 정본으로 다시 빌드해야 한다. 운영 반영 후 공개 `redirects.json` 388개 전체의 실제 Cloudflare 301과 도착 주소, 운영 브라우저 재생을 확인해 이 문서에 실제 배포 URL·커밋·Actions 결과를 추가한다.

## 2026-10-09 전체 제작본과 URL 통합 — 배포 전 검증

사용자의 전체 커밋·푸시 요청에 따라 원고·삽화·승인된 낭독·제작 코드·대본·유료 원본 클립을 `1a26809`에 보존하고, URL 개편을 그 위로 rebase했다. 로컬 `output/`의 제작 MP4 26개와 `.env`, 빌드 결과는 Git에 넣지 않았다. R2는 변경하지 않았다.

- 승인된 MP3/SRT/장면 목록은 각각 26개이며 모든 회차의 녹음이 연결된다. ffprobe와 자막 시각 비교에서 최대 차이는 0.001초였다.
- 저장소 테스트(Node 16건, Python 조립 5건), 공통 패키지, 제작 파서 16건, 회사 사이트 11건과 빌드, 세 리더의 콘텐츠·낭독·공유·빌드·타입 검사를 통과했다.
- 소설 브라우저 66건과 영상 9건 통과. 오디오북은 30개 시나리오를 확인했고, 모든 회차가 준비되어 미녹음 회차 검사 3개는 조건에 따라 제외했다. 초기 SSR 버튼 클릭 경합은 화면 활성화 표식을 기다리도록 보완한 뒤 세 화면에서 재검증했다. 표시 공백 비교는 HTML이 합치는 일반 공백만 정규화하며 원고와 줄바꿈 불가 공백은 보존했다.
- 두 작품 URL 리허설 14건 통과. 로컬 완전한 Pages 산출물에서 옛 주소 388개 전체의 단일 301과 도착 200, 소설·오디오북·영상 78회차 URL과 MP3 26개, 최신 정본 26회차·409문단을 확인했다.
- 로컬 확인 시각 `2026-10-09T14:12:34.307Z`, 검증 산출물의 기준 커밋 `8f8bc1424f7a97de427412cc1cef094b0268100c`, 최신 원고 SHA-256 `5d88def59565bb38611c64ce0d36d33f4be51cb74c54568037f017be16ac106d`. JSON과 휴대폰·데스크톱 화면 캡처는 `.deploy/latest-urls-verification/`에 있다. 실제 운영 배포 결과는 아래에 별도로 기록한다.

## 2026-10-09 MJbae 이력 정리와 CI 화면 활성화 확인

사용자 요청에 따라 원격 세 브랜치의 41개 커밋 작성자·커미터를 `MJbae <16694346+MJbae@users.noreply.github.com>`로 변경했다. 이력 정리는 `/tmp/duvridge-mjbae-identity-20261009.git`과 별도 작업 사본에서 수행한다. 원래 두 작업 폴더의 파일·브랜치·Git 설정은 변경하지 않는다. 전체 복구용 bundle은 `/tmp/duvridge-before-mjbae-20261009.bundle`, 옛/새 커밋 대응표는 `/tmp/mjbae-history-rewrite.json`에 보존한다. 이력 변경의 모든 원본/새 커밋 쌍에서 tree ID가 같은지 확인했다.

앞선 Actions `37943421166`은 작성자 수정 요청으로 취소했다. 그 실행에서 영상의 직접 회차 진입 후 재생 버튼을 화면 활성화 전에 누르는 경합도 확인했다. 오디오북·영상의 모든 재생 버튼 검사도 동일한 `data-reader-ready` 표식을 기다리도록 보완하며, 실제 재생 UI는 변경하지 않는다. 새 이력 기준으로 전체 검증·배포를 다시 실행한다.

## 2026-10-10: 공유 정보와 회사 홈페이지 문구

공유 정보는 `d011aa155eff11ff5e376ec2d4f1466672ebab84`, 회사 문구는 `8ac34e9f348a87a18fe399ea2433dcc81e71bdac`에서 배포했다. 현재 회사는 8ac34e9, 인생원작 포털과 세 리더는 d011aa1을 제공하며 두 배포 모두 `sourceDirty=false`다. 최종 회사 확인 시각은 2026-10-10 12:25 KST다. [기계 판독 검증 결과](sharing-and-company-verification-2026-10-10.json).

### 공유 정보

- 작품·서비스·회사에 각각 다른 1200×630 PNG를 연결했다. 첫 작품 그림의 회사명과 오리지널 표기를 제거했다.
- 작품·서비스 사이트명은 인생원작, 회사는 duvridge다. 서비스·회사 설명은 자전소설을 원작으로 다양한 콘텐츠를 만든다는 뜻으로 수정했다.
- [공유 배포 실행](https://github.com/MJbae/duvridge/actions/runs/38018648376)의 최종 시도에서 저장소·공통 패키지·다섯 서비스·브라우저·두 Pages 업로드와 배포 후 HTTP 검사가 성공했다. 첫 시도의 데스크톱 페이지 전환 검사 한 건은 실패했고, 동일 코드의 로컬 14건과 CI 재검증이 모두 통과한 뒤 업로드했다.
- 세 운영 URL의 최초 HTML에서 제목·설명·사이트명·canonical·OG·X 정보를 확인했다. 이미지 세 개는 HTTPS 200, PNG 1200×630이며 커밋한 파일과 바이트가 일치했다.
- 두 프로젝트를 같은 커밋의 완전한 artifact로 배포했다. 인생원작에는 포털·소설·오디오북·영상과 기존 영상 29개를 함께 포함했다.
- 실제 사이트에서 회사 7경로, 독자 앱 78회차 경로, 녹음 26개를 확인했다. 소설 26회차의 본문 문단 409건을 배포 커밋의 정본과 대조했고 휴대폰·데스크톱 오디오 재생·일시정지·배속·문장 이동을 확인했다.

### 회사 문구와 디자인 보존

- 회사의 배포 기준 `020f3ff1f89209a9fc31771475aa941929b8b8d8`을 로컬 복원 기준으로 삼았다. 수정 전 로컬 변경은 `_workspace/social-metadata-deploy/local-before-restore/`에 보관했다.
- 3번째 why와 4번째 proof의 문구만 줄였다. 5개 언어의 번역 입력과 생성 HTML 6개 파일이 문구 커밋의 전부다. 템플릿·CSS·JavaScript·이미지·글꼴·배치·여백은 수정하지 않았다. 기존 강조·문구 줄바꿈·링크와 실적 값 10+·출간·3세대도 유지했다.
- 한국어는 why 67.3%, proof 48.2% 줄였다. 비교 기준은 제목·본문·링크 문구·마지막 소개문이며 HTML 태그는 제외했다. 숫자와 집필 실적은 유지하고 장황한 수식과 번역투를 덜었다.
- [회사 문구 배포 실행](https://github.com/MJbae/duvridge/actions/runs/38020121584)에서 회사 16개 검사·빌드, 저장소 검사, Pages 업로드와 운영 7경로 HTTP 검사가 성공했다. 변경 선택은 company 그룹만 포함했다.
- 배포 후 5개 언어의 why·proof가 로컬 원본과 일치했다. 첫 두 섹션은 변경 전 운영 페이지와도 일치했다.
- 320·390·1440px의 5개 언어, 총 15개 실제 운영 브라우저 화면에서 문구·기존 강조·오픈소스 링크·공유 이미지 경로를 확인했다. 브라우저 오류와 가로 넘침은 0건이다.
- 운영 CSS와 JavaScript는 변경 전 다운로드·커밋·로컬 복사본과 바이트가 같다. CSS SHA256은 `8602f391c6d3e4ee1aefccc910242702d7612816ce438396e4c268f4699d2e1c`, JavaScript는 `fee0caa12c0bc970c0619cb05023e6dec5875b3027c589d74f7f77decdfdf4b8`다.

### 4-A 작품 공유 이미지 변경 절차 (배포 전)

작품의 기본 `sharing.image`는 소설·오디오북용 오리지널 카드이며, `sharing.images.video`는 영상용 카드다. 다른 작품도 기본 이미지를 제공하고 필요한 형식만 덮어쓸 수 있다. 배병희 작품의 새 파일명은 `share-bae-byunghee-original-v3.png`, `share-bae-byunghee-video-v3.png`다. 작품 홈 공유 제목은 작품명만, 설명은 “갯벌에서 들녘까지, 가족과 이웃을 위해 살아온 한평생.”으로 쓴다.

루트에서 `node scripts/render-sharing-cards.mjs --books-only`로 1200×630 PNG를 생성한다. Google Fonts 접근과 Chromium 실행이 필요하며, 제목이 두 줄을 넘거나 단색 패널 끝에서 24px의 여유를 확보하지 못하면 저장을 거절한다. 옵션 없이 실행하면 기존 서비스·회사 카드도 생성한다. 새 PNG의 시각 검수 후, 포털·회사·테스트에서 옛 이미지를 참조하지 않는지 확인하고 v2 작품 파일을 정리한다. 과거 배포 증거의 URL은 보존한다.

세 앱 빌드 후 각각 `npm run test:sharing --workspace @duvridge/toldlife-novels`, `npm run test:sharing --workspace @duvridge/toldlife-audiobooks`, `npm run test:sharing --workspace @duvridge/toldlife-videos`를 실행한다. PNG 생성·로컬 공유 검증과 운영 배포 검증은 아래에 기록했다. 카카오 공유의 남은 사람 확인 절차도 아래 배포 기록에 남겼다.

### 2026-10-10 확정 디자인 통합 QA (배포 전 로컬)

단독으로 전체 변경과 W1–W5 보고서를 대조했다. 포털·소설 README의 오래된 설명을 갱신하고, URL 브라우저 테스트의 대표 작품/대표 영상 목록 개수를 중복 제거 후 동작으로 맞췄다. 읽기 설정의 배경음악 스위치는 보이는 32px 트랙을 유지하며 터치 영역을 44px로 늘렸다. 오류 재시도 버튼에도 44px 높이를 적용하고 글자색을 대비 기준에 맞췄다. 설정의 키보드 포커스 색은 선택 테두리색을 따른다. 기존 키보드·오류 회복 브라우저 테스트에 터치 높이 검증을 추가했다.

두 v3 PNG를 직접 열어 제목이 단색 영역 안에 있고 큰 형식 배지가 보이는 것을 확인했다. 두 파일 모두 1200×630이다. 오케스트레이터가 제공한 제목 오른쪽 실측은 414.4px로 허용 경계 504px 안이다. 활성 소스·메타·테스트에서 v2 참조가 없음을 확인하고 옛 PNG를 삭제했다. 이전 배포 증거 JSON의 v2 URL은 역사 기록으로 유지했다.

| 실행 명령 | 실제 결과 |
| --- | --- |
| `node -v`, `npm -v`, `npm ci` | Node 22.23.2 / npm 10.9.8, 설치 성공. npm의 기존 의존성 감사 결과 27건(중간 14, 높음 13), lockfile 변경 없음 |
| `git status --short`, `git diff --stat`, `git diff --check` | 전체 변경 확인, 공백 오류 0 |
| `gh variable list --json name,value` (공개 Firebase 값만 선택) | 네 `VITE_FIREBASE_*` 값 확보; 비밀 배포 토큰 조회 없음 |
| `npm run test:repo` | Node 32 + Python 10 통과, 실패 0 |
| `npm test` (수정 후 재실행 포함) | 저장소 42 + 모든 workspace 177 = 219 통과, 실패·건너뜀 0 |
| `npm run typecheck` | 세 리더 통과, 오류 0 |
| `python3 scripts/assemble-toldlife-pages.py --github-vars` | `/novels/`, `/audiobooks/`, `/videos/` + 포털 빌드·조립 성공, `SITE_ORIGIN=https://toldlife.duvridge.com`, 실제 공개 Firebase 설정 사용 |
| 위 조립 명령의 각 앱 `test`, `build`, `test:sharing`, `typecheck` | 앱 테스트 34/58/6, 공유 검사 각 4(총 12) 통과, 세 빌드·typecheck 성공 |
| `python3 scripts/assemble-toldlife-pages.py --skip-build --video-media release` | 실제 MP4 29개 다운로드, 크기·SHA-256 검증 후 조립 성공 |
| `python3 scripts/assemble-toldlife-pages.py --github-vars --video-media .deploy/toldlife/videos/works/bae-byunghee/media` | 최종 CSS로 세 리더의 검사·빌드·공유·typecheck 재검증. 검증한 MP4를 재사용하여 2,513개 파일, sitemap 85주소 조립 |
| `node scripts/serve-pages.mjs .deploy/toldlife 4196` + Python HTTP 검증 | 페이지 9, 공유 PNG 3, 음원/영상 Range 4, 리다이렉트 388, 없는 주소 1 = 405 통과. 모든 리다이렉트는 단일 301 → 200. 검증 후 서버 종료 |
| 변경 선택 함수의 실제 변경·앱 코드·책 메타·문서 입력 검사 | 4개 시나리오 통과. 책 메타는 포털과 세 리더, 소설 코드는 소설 검사 + ToldLife 네 서비스 전체 조립을 선택 |
| 세 앱 e2e (샌드박스 밖 실행) | 소설 84건 통과, 오디오북 30건 통과·3건 건너뜀, 영상 39건 통과 |
| `test:urls` (샌드박스 밖 실행) | 14건 통과 |
| 화면 QA (샌드박스 밖 실행) | 105/105 통과, 휴대폰 390×844·데스크톱 1440×900 |
| 외부 실행용 스크립트 `bash -n`, `node --check`, `qa-screens.mjs --help`, `playwright-core` 경로 확인 | 모두 성공 |
| 원고의 현재 바이트와 `git show HEAD:content/books/bae-byunghee/manuscript.md` 비교 | 일치. SHA-256 `cf2af92f0f335428250489c48d3e60772fafde0b4778d67cb8a5db7aad8347a0` |

Workspace 177개는 회사 16, 오디오북 58, 소설 34, 포털 15, 영상 6, content-processing 11, reader-reactions 6, reader-ui 21, vitepress-reader 10개다. 공유 검사는 모든 소설 회차의 공개 제목·본문도 정본과 대조한다. 공개 Firebase 설정을 확보했으므로 더미 설정 대안은 사용하지 않았다. 작품 홈의 운영 공유 정보는 아래 배포 기록에 모았다.

정적 대비 계산: 비선택 형식 탭 9.27:1, 금색 실행 버튼 글자 9.01:1, 종이 설정 선택 글자 5.35:1, 밤 설정 글자 10.87:1, 오디오 주변 문장과 가장 밝은 배경 4.83:1이다.

정본 원고·녹음·SRT는 수정하거나 재생성하지 않았다. 통합 QA 당시 `.deploy/toldlife/deployment.json`의 기준 SHA는 `a8f3496ad8c4babcfe98326e07603b4c576a8d09`, `sourceDirty: true`였으며 로컬 QA 산출물의 기록이다. 배포 전 로컬 브라우저 검증은 샌드박스 밖에서 완료했고 결과는 위 표에 반영했다. 운영 배포의 커밋과 공개 marker는 아래에 별도로 기록한다.

## 2026-10-10: 확정 리더·홈·영상·공유 디자인 운영 배포

커밋 `5a2f149acf52f22e0ec57e97b13efa7b1f44a88a`(`feat: apply the confirmed 2026-10-10 reader, home, video and sharing designs`)을 `a8f3496`에서 `main`으로 fast-forward 푸시했다.

- [monorepo-ci 실행 38055283351](https://github.com/MJbae/duvridge/actions/runs/38055283351)이 성공했다. `plan`, `repository`, `urls`, `service`의 다섯 서비스(`toldlife-novels`, `toldlife-audiobooks`, `toldlife-videos`, `toldlife-portal`, `company-site`), `Monorepo required`, `deploy(company)`, `deploy(toldlife)` 모두 `success`다.
- 공개 [deployment.json](https://toldlife.duvridge.com/deployment.json)의 `sourceRevision`은 `5a2f149acf52f22e0ec57e97b13efa7b1f44a88a`다.
- `scripts/check-deployment-http.py`를 `--group toldlife`와 `--group company` 각각에 `--revision 5a2f149acf52f22e0ec57e97b13efa7b1f44a88a`로 실행해 통과했다. [상세 로그](/private/tmp/claude-501/-Users-baemanjin-orca-projects-autobio-bae/ab248ef8-f8d7-4e8d-a668-e55cf410020d/scratchpad/impl/http-check.log)는 종료 코드 0이며, ToldLife의 `/videos/works/bae-byunghee/record/prolog.mp3`, 영상 29개의 Range 응답, 옛 주소 388개의 단일 영구 리다이렉트와 회사의 `/zh-Hant/`, `/guidebook/`, `/guidebook/privacy/` 성공을 기록했다.
- 공개 포털의 오리지널 시리즈 탭에는 버튼이 없고 작품 카드가 `/novels/bae-byunghee/`로 연결된다. 카드 링크의 `aria-label`은 `내 논을 파는 한이 있어도 작품 보기`다.

세 작품 URL의 공개 `og:title`은 모두 `내 논을 파는 한이 있어도`, `og:description`은 `갯벌에서 들녘까지, 가족과 이웃을 위해 살아온 한평생.`이다.

| 공개 작품 URL | `og:image` 파일 | 이미지 응답 |
| --- | --- | --- |
| https://toldlife.duvridge.com/novels/bae-byunghee/ | `share-bae-byunghee-original-v3.png` | HTTP 200, 688145 bytes |
| https://toldlife.duvridge.com/audiobooks/bae-byunghee/ | `share-bae-byunghee-original-v3.png` | HTTP 200, 688145 bytes |
| https://toldlife.duvridge.com/videos/bae-byunghee/ | `share-bae-byunghee-video-v3.png` | HTTP 200, 687705 bytes |

남은 사람 확인: 카카오 공유 디버거로 위 세 작품 URL의 캐시를 초기화한 후 새 메시지로 공유 미리보기를 확인한다.

## 2026-10-10: 회사 홈페이지 ‘이야기’ 안 적용 및 운영 검증

제안 이미지를 확인한 사용자가 ‘이야기로 가자’라고 요청하여 추천 시안을 적용했다. 구현 커밋은 `fa7f9f19855a935a18e42e32cf544b568934bb9b` (`copy: apply the approved story wording to the company site`)이다. 최신 배포 기록 커밋 `b640240` 위에 반영했다.

- 한국어 제목은 ‘오래도록 남을 당신의 삶.’, 소개는 ‘한 사람의 인생을 이야기로 남깁니다.’다. 본문은 짧은 완결 문장별로 배치하고, 한국어 제목·소개·본문·표지 제목의 폭과 줄바꿈을 조정했다. 한국어 페이지의 검색·공유 제목도 같은 제목으로 갱신했다.
- ‘AI 낭독 · 재구성 삽화’ 행을 공통 템플릿에서 제거하고, 5개 언어의 `ai_note` 키와 관련 CSS를 함께 삭제했다. 언어별 생성 HTML 5개를 갱신했다.
- 로컬 검증에서 회사 테스트 16건, 저장소 Node 32건·Python 10건, 회사 빌드와 공백 오류 검사가 통과했다. 변경 선택은 `company-site`와 `company` 그룹만 포함했다.
- [Actions 실행 38056580200](https://github.com/MJbae/duvridge/actions/runs/38056580200)에서 저장소·회사 서비스·`Monorepo required`·회사 배포·운영 HTTP 검사가 모두 성공했다. 회사 Pages 업로드 주소는 [758570e5.duvridge.pages.dev](https://758570e5.duvridge.pages.dev)다.
- 운영 확인 시각은 **2026-10-10 22:44 KST**다. 공개 [deployment.json](https://www.duvridge.com/deployment.json)의 `sourceRevision`은 위 구현 SHA이며 `sourceDirty=false`, `group=company`다.
- `check-deployment-http.py --group company --revision fa7f9f19855a935a18e42e32cf544b568934bb9b`로 회사의 7경로와 정적 자산 응답을 확인했다. 운영 CSS·JavaScript의 SHA-256이 커밋 소스와 일치했다.
- 실제 운영 Chromium에서 320·375·390·768·1024·1440px의 제목·소개·본문 문장·표지 제목이 한 줄인 것을 확인했다. 가로 넘침·텍스트 영역 이탈·브라우저 오류는 0건이며 본문은 16px 이상이고 기존 글꼴 4종과 표지가 정상 로드됐다. PC 첫 화면과 모바일 전체 화면도 육안 검수했다.
- 5개 언어 페이지에서 삭제 문구가 없고 소설·오디오북·영상 링크가 유지됨을 확인했다. JavaScript를 끈 한국어 페이지에도 승인한 소개와 본문 13문장, 문의 주소가 표시됐다.

[기계 판독 검증 결과](company-story-deployment-2026-10-10.json)에 배포 marker, 실행 주소, 자산 해시와 화면별 결과를 기록했다. 전체 화면 캡처·상세 JSON·HTTP 로그는 작업 사본의 `.deploy/verification/company-story-production/`에 보존했다.

## 2026-10-10: 한국어 문장 공백·표현·줄바꿈 교정

사용자가 문장 사이 공백 누락, 어색한 문장 분리와 한국어 표현을 지적했다. 앞선 검증은 한 줄 표시와 가로 넘침을 확인했지만 문장 공백과 문맥 검토가 부족했다. 운영 본문을 추출하여 `기록합니다.조부모…`처럼 붙은 문장 경계 8곳을 확인했다.

- 한국어 본문 5개 항목을 교정해 13개의 짧은 문장을 의미가 이어지는 7문장으로 정리했다. ‘기억이 흐려지기 전에 시작합니다’는 기록할 대상과 시점을 함께 밝히는 문장으로, ‘한국어 소설 집필 AI’는 ‘한국어 소설을 쓰는 AI 시스템’으로 고쳤다. 실적·수치·개발 경험과 승인한 제목·소개는 유지했다.
- 공백 없이 붙어 있던 `copy-sentence` 태그와 블록 스타일을 제거했다. 문단의 문장 사이에 실제 줄바꿈을 넣고 완결된 문장 뒤에서만 줄을 나눈다. 좁은 화면에서는 어절 단위로 줄바꿈하며 ‘조부모님의 이야기’, ‘집필 시스템’, ‘출판 계약’ 등 연결된 구절은 함께 읽히게 했다. 본문은 16px 이상이다.
- 문장 경계의 실제 공백을 확인하는 회귀 검사는 이전 배포 소스에서 실패하고 교정 소스에서 통과했다. 회사 검사 17건, 저장소 Node 32건·Python 10건, 회사 빌드와 공백 오류 검사도 통과했다.
- 구현 커밋은 `0cdcadb9ceec799e26835044b539f0ec0ec8cf9a`다. [Actions 실행 38059192757](https://github.com/MJbae/duvridge/actions/runs/38059192757)에서 저장소·회사 서비스·필수 검사·회사 배포와 운영 HTTP 검사가 성공했다. 회사 Pages 업로드 주소는 [745ef0c8.duvridge.pages.dev](https://745ef0c8.duvridge.pages.dev)다.
- **2026-10-10 23:25 KST**에 운영 7경로를 확인했다. 공개 marker는 위 구현 SHA와 `sourceDirty=false`를 제공했고 운영 한국어 본문 5개와 CSS·JavaScript 해시는 검증한 소스와 일치했다.
- 운영 Chromium의 320·375·390·768·1024·1440px에서 붙은 문장·강제 문장 블록·가로 넘침은 0건이다. JavaScript 없이도 공백과 본문이 유지되며 글꼴 4종이 정상 로드됐다. PC·모바일의 본문 문구와 구절·문장 줄바꿈을 육안 검수했다. 브라우저 오류는 0건이다.

[교정 배포 검증 결과](company-korean-copy-correction-2026-10-10.json)에 실제 배포 증거를 기록했다. 화면과 상세 결과는 `.deploy/verification/company-natural-production/`에 보존했다. 앞선 `company-copy`·`company-story-production` 화면은 교정 전 상태를 기록한 자료다.

## 2026-10-10: 소설 읽기 기본값을 넓은 줄 간격·명조로 적용

구현 커밋은 `01d850cb8ff3b0fc1122f458c70ab37554281c09`다. 별도 워크트리 `duvridge-reading-defaults`에서 작업하고 최신 원격 `main` 위에 충돌 없이 반영한 뒤 fast-forward 푸시했다. 설정을 저장하지 않은 독자는 줄 간격 ‘넓게’와 서체 ‘명조’로 시작한다. 최초 HTML과 브라우저 초기 상태도 같은 설정 함수를 사용하며, 이미 저장한 ‘보통’·‘고딕’ 선택은 계속 복원한다.

- Node 22.23.2 / npm 10.9.8, 루트 `npm ci` 성공. 로컬 `npm test` 220건, 제작 파서 20건, 세 리더 typecheck·빌드, 공유 검사 12건이 통과했다.
- 전체 브라우저 검사는 소설 84건, 오디오북 30건(기존 조건부 3건 건너뜀), 영상 39건이 통과했다. 메인의 프롤로그·회차 이동 수정까지 통합한 뒤 소설 설정·위치 유지·회차 이동·자바스크립트 없는 화면 12건, 오디오북 20건(2건 건너뜀), 영상 26건도 통과했다. 저장한 보통/명조와 넓게/고딕 조합을 다시 방문했을 때 복원함을 확인했다.
- [구현 커밋 검증 실행](https://github.com/MJbae/duvridge/actions/runs/38060629090)의 저장소·포털·세 리더·URL·필수 검증이 성공했다. 이후 다른 세션의 문서 커밋이 추가되어 최신 메인 기준으로 배포가 자동 재실행됐다.
- [실제 배포 실행](https://github.com/MJbae/duvridge/actions/runs/38061068359)은 `1436d4594014dfe728bf864b9b72d4ba41b52f15`를 검증했다. 이 커밋이 구현 커밋을 포함함을 Git ancestry로 확인했다. 저장소·다섯 서비스·URL·필수 검사, ToldLife와 회사의 실제 Pages 업로드·배포 후 HTTP 검사가 모두 성공했다. ToldLife에는 포털·세 리더와 기존 영상 29개가 함께 포함됐다.
- 운영 확인 시각은 **2026-10-10 23:55 KST**다. 공개 [deployment.json](https://toldlife.duvridge.com/deployment.json)의 `sourceRevision`은 위 실제 배포 SHA이며 `sourceDirty=false`다.
- 실제 운영 Chromium의 휴대폰 390×844와 PC 1440×1000에서 ‘넓게’·‘명조’ 선택, 본문 20px·줄 높이 42px(2.1), `leading-wide face-serif` 클래스를 확인했다. 가로 넘침과 브라우저 오류는 0건이다. 자바스크립트를 끈 화면에서도 같은 기본 클래스와 42px 줄 높이를 확인했다. 두 설정 화면을 육안 검수했다.

[기계 판독 검증 결과](novel-reading-defaults-2026-10-10.json)에 공개 marker, CI 실행, 화면별 실측과 로컬 검증을 기록했다. 화면 캡처와 상세 로그는 작업 사본의 `_workspace/reading-defaults-qa/`에 보존했다.
