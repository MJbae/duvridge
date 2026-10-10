# ToldLife portal

`@duvridge/toldlife-portal`은 ToldLife의 `/`에서 읽기 서비스(`/novels/`)와 오디오북 서비스(`/audiobooks/`)를 연결합니다. 설치는 저장소 루트의 `npm ci`, 검증은 `npm test --workspace @duvridge/toldlife-portal`로 실행합니다.

이 앱의 `index.html`·`404.html`은 루트의 `scripts/assemble-toldlife-pages.py`가 두 리더의 검증된 빌드와 함께 조립합니다. 브랜드와 공유 미리보기는 `apps/company-site/assets/brand/`·`assets/social/`을 사용합니다. ToldLife 업로드에는 포털과 두 리더가 항상 함께 포함됩니다. 이름은 [네이밍 정책](../../docs/naming-policy.md), 배포는 [루트 README](../../README.md)를 따릅니다.

포털 HTML은 `index.html` 템플릿과 각 리더 산출물의 `work-index.json`을 `scripts/render-toldlife-portal.mjs`로 합쳐 만듭니다. 작품 목록과 버튼은 JavaScript 없이도 새 주소를 제공합니다. 탭은 `오리지널 시리즈`(`#novels`)와 `영상`(`#videos`) 둘입니다. 오디오북은 오리지널 시리즈 안에 있어, 대표 작품에 넓은 '소설' 버튼과 좁은 '오디오북' 버튼을 둡니다. '원작 의뢰하기' 칸은 오리지널 시리즈 탭에만 있습니다. `#video`, 옛 `#audiobooks`, 옛 탭 저장값도 인식합니다. 형식 첫 주소의 `/?tab=novels`, `/?tab=videos`를 지원하며, `/audiobooks/`와 `/?tab=audiobooks`는 오리지널 시리즈 탭을 엽니다.
