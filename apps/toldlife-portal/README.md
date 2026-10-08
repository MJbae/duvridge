# ToldLife portal

`@duvridge/toldlife-portal`은 ToldLife의 `/`에서 읽기 서비스(`/novels/`)와 오디오북 서비스(`/audiobooks/`)를 연결합니다. 설치는 저장소 루트의 `npm ci`, 검증은 `npm test --workspace @duvridge/toldlife-portal`로 실행합니다.

이 앱의 `index.html`·`404.html`은 루트의 `scripts/assemble-toldlife-pages.py`가 두 리더의 검증된 빌드와 함께 조립합니다. 브랜드와 공유 미리보기는 `apps/company-site/assets/brand/`·`assets/social/`을 사용합니다. ToldLife 업로드에는 포털과 두 리더가 항상 함께 포함됩니다. 이름은 [네이밍 정책](../../docs/naming-policy.md), 배포는 [루트 README](../../README.md)를 따릅니다.
