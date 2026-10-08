# Company site

`@duvridge/company-site`는 회사 소개·다국어 페이지·가이드 문서를 제공하는 서비스입니다. 설치는 저장소 루트의 `npm ci`, 검증과 빌드는 `npm test --workspace @duvridge/company-site`와 `npm run build --workspace @duvridge/company-site`로 실행합니다.

`site/template.html`과 `site/translations.json`이 다국어 페이지 입력이며, `scripts/build-company-site.py`가 공개 페이지를 생성합니다. `assets/brand/`는 브랜드 자산, `assets/social/`은 공유 미리보기 자산입니다. 서비스 이름·파일 이름은 [네이밍 정책](../../docs/naming-policy.md), 배포는 [루트 README](../../README.md)를 따릅니다.
