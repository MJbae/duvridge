# Company site

`@duvridge/company-site`는 회사 소개·다국어 페이지·가이드 문서를 제공하는 서비스입니다. 설치는 저장소 루트의 `npm ci`, 검증과 빌드는 `npm test --workspace @duvridge/company-site`와 `npm run build --workspace @duvridge/company-site`로 실행합니다.

`site/template.html`과 `site/translations.json`이 다국어 페이지 입력이며, `scripts/build-company-site.py`가 공개 페이지를 생성합니다. `assets/brand/`는 브랜드 자산, `assets/social/`은 공유 미리보기 자산입니다. 서비스 이름·파일 이름은 [네이밍 정책](../../docs/naming-policy.md), 배포는 [루트 README](../../README.md)를 따릅니다.

공유 그림을 수정할 때는 루트에서 `node scripts/render-sharing-cards.mjs`를 실행합니다. 회사·인생원작·작품의 1200×630 PNG를 만들며, 작품의 문구와 표지는 `content/books/<book-id>/book.json`에서 읽습니다. 웹 빌드는 커밋된 PNG를 사용합니다.

한국어 소개는 ‘한 사람의 인생을 이야기로 남깁니다.’를 사용합니다. 본문은 내용이 이어지는 문단으로 작성하고 문장 사이에 실제 공백이나 줄바꿈을 둡니다. 집필 경험 문단의 줄바꿈은 완결된 문장 사이에만 넣습니다. 한 줄에 맞추려고 문장을 잘게 쪼개지 않으며, 좁은 화면에서는 어절 단위로 자연스럽게 줄을 바꿉니다. 본문 글자 크기는 16px 이상으로 유지합니다.

‘부모님의 젊은 날’, ‘조부모님의 이야기’, ‘집필 시스템’처럼 함께 읽을 구절은 `&nbsp;`로 묶어 줄 끝에서 따로 떨어지지 않게 합니다.

다른 언어의 제목과 짧은 문구는 구절 단위로 줄을 바꿉니다. 영어는 함께 읽혀야 하는 어절 사이를 `&nbsp;`로 묶고, 일본어·중국어는 구절 경계에 `<wbr>`을 넣습니다. 일본어·중국어 제목은 `<wbr>`과 문장부호에서만 줄을 바꾸므로 문구를 고칠 때 경계 표시도 함께 고칩니다. 한·중·일 본문 폭은 라틴 숫자 폭인 `ch`가 아니라 글자 폭인 `em`으로 정합니다.
