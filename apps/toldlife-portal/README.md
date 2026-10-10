# ToldLife portal

`@duvridge/toldlife-portal`은 ToldLife의 `/`에서 소설(`/novels/`)·오디오북(`/audiobooks/`)·영상(`/videos/`) 서비스를 연결합니다. 설치는 저장소 루트의 `npm ci`, 검증은 `npm test --workspace @duvridge/toldlife-portal`로 실행합니다.

이 앱의 `index.html`·`404.html`은 루트의 `scripts/assemble-toldlife-pages.py`가 세 리더의 검증된 빌드와 함께 조립합니다. 브랜드와 공유 미리보기는 `apps/company-site/assets/brand/`·`assets/social/`을 사용합니다. ToldLife 업로드에는 포털과 세 리더가 항상 함께 포함됩니다. 이름은 [네이밍 정책](../../docs/naming-policy.md), 배포는 [루트 README](../../README.md)를 따릅니다.

포털 HTML은 `index.html` 템플릿과 각 리더 산출물의 `work-index.json`을 `scripts/render-toldlife-portal.mjs`로 합쳐 만듭니다. 작품 카드와 영상 보기 버튼은 JavaScript 없이도 새 주소를 제공합니다. 탭은 `오리지널 시리즈`(`#novels`)와 `영상`(`#videos`) 둘입니다. 오디오북은 오리지널 시리즈 안에 있어, 대표 작품 카드 전체가 소설 작품 상세로 연결됩니다. 홈에는 소설·오디오북 실행 버튼을 두지 않고, 작품 상세의 같은 폭 형식 탭과 회차가 든 실행 버튼에서 시작합니다. 대표 작품은 아래 목록에서 제외하며 의뢰 카드만 남으면 가로형으로 펼칩니다. '원작 의뢰하기' 칸은 오리지널 시리즈 탭에만 있습니다. `#video`, 옛 `#audiobooks`, 옛 탭 저장값도 인식합니다. 영상 탭은 원작으로 만든 영상이 있으면 첫 영상을 대표로 두고, 그 아래에 '원작 · <작품 제목>'을 적습니다. 대표 영상의 '보기' 버튼은 유지하고, 아래 목록에서는 대표 영상을 제외한 영상들 다음에 작품별 회차 영상을 둡니다. 형식 첫 주소의 `/?tab=novels`, `/?tab=videos`를 지원하며, `/audiobooks/`와 `/?tab=audiobooks`는 오리지널 시리즈 탭을 엽니다.
