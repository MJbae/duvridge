# duvridge

JavaScript 없이도 회사 소개, 제품 설명, 개발 현황, 집필 성과, 개인정보 보호 안내와 연락처를 읽을 수 있는 정적 홈페이지입니다. 언어 선택은 각 언어의 HTML 페이지로 이동하는 일반 링크입니다.

| 언어 | 경로 |
| --- | --- |
| 영어 (기본) | `/` |
| 한국어 | `/ko/` |
| 일본어 | `/ja/` |
| 중국어 간체 | `/zh-Hans/` |
| 중국어 번체 | `/zh-Hant/` |

## 수정 및 생성

본문은 `site/translations.json`, 공통 HTML 구조는 `site/template.html`, 디자인은 `assets/site.css`에서 수정합니다. 제목·검색 설명·언어 경로·운영 도메인은 `scripts/build-site.py`에서 관리합니다. `assets/site.js`는 헤더 및 스크롤 애니메이션만 담당합니다.

```sh
python3 scripts/build-site.py
python3 scripts/build-site.py --check
python3 -m unittest discover -s tests
```

Python 표준 라이브러리만 사용합니다. 생성된 `index.html`, 각 언어 폴더의 `index.html`, `sitemap.xml`, `robots.txt`를 소스와 함께 커밋합니다. 기존처럼 저장소 루트를 정적 호스팅하면 되며, 서버 렌더링이나 런타임 번역 API는 필요하지 않습니다. 운영 도메인의 기본값은 기존 가이드북 페이지의 홈 링크와 같은 `https://www.duvridge.com`입니다.

로컬 확인:

```sh
python3 -m http.server 8000
curl http://localhost:8000/ko/
```

브라우저에서 `http://localhost:8000`을 열면 됩니다. `curl` 응답 자체에 소개 본문이 포함됩니다. 스크립트가 차단되거나 실행 중 오류가 나도 본문과 언어 이동, 이메일 및 외부 링크를 사용할 수 있습니다.

여행 가이드북 지원 및 개인정보처리방침 페이지는 기존 `/guidebook/`, `/guidebook/privacy/`에 유지됩니다.

## ToldLife 서비스 배포

`https://toldlife.duvridge.com`에서 두 서비스를 하나의 Cloudflare Pages 프로젝트로 제공합니다.

| 경로 | 서비스 | 소스 프로젝트 |
| --- | --- | --- |
| `/` | ToldLife 공통 홈 | 이 저장소의 `toldlife/index.html` |
| `/novels/` | ToldLife Novels · 웹소설 읽기 | `autobio-bae` |
| `/audiobooks/` | ToldLife Audiobooks · 오디오북 듣기 | `autobio-audiobook/web` |

Node.js 22 이상과 각 서비스의 npm 의존성이 필요합니다. 기존 GitHub 저장소의 공개 Firebase 설정값을 재사용하려면 인증된 GitHub CLI도 필요합니다.

```sh
python3 scripts/build-toldlife.py --github-vars
npx --yes wrangler@4.148.0 pages deploy .deploy/toldlife --project-name toldlife --branch main
```

빌드 도구는 두 프로젝트의 테스트·빌드·공유 정보 검증·타입 검사를 실행한 뒤 `.deploy/toldlife/`에 배포용 파일만 모읍니다. 각 서비스의 `SITE_BASE`는 `/novels/`, `/audiobooks/`, `SITE_ORIGIN`은 `https://toldlife.duvridge.com`으로 설정됩니다. `.deploy/`는 Git에 포함하지 않습니다.

기본 소스 경로는 `~/orca/projects/autobio-bae`, `~/orca/projects/autobio-audiobook/web`입니다. 다른 위치에서는 `--novels-source`, `--audiobooks-source`로 지정할 수 있습니다. Firebase 설정을 환경변수나 각 서비스의 로컬 `.env`에 이미 등록했다면 `--github-vars`를 생략합니다.

Cloudflare Pages 프로젝트의 Custom domains에 `toldlife.duvridge.com`을 연결합니다. 회사 홈페이지의 `duvridge` 배포 프로젝트와 서비스의 `toldlife` 배포 프로젝트는 각각 갱신합니다. 회사 홈페이지는 다음 명령으로 공개 HTML과 자산만 별도 폴더에 준비하여 업로드합니다.

```sh
python3 scripts/build-site.py --output .deploy/company
npx --yes wrangler@4.148.0 pages deploy .deploy/company --project-name duvridge --branch main
```

## GitHub 푸시 후 자동 배포

`MJbae/duvridge`, `MJbae/bae-memoir`, `MJbae/autobio-audiobook`의 `main` 브랜치 변경을 GitHub Actions로 배포합니다. 웹소설과 오디오북은 이 저장소의 `.github/workflows/toldlife.yml`을 함께 사용하여 최신 `main` 소스 두 개와 공통 홈을 한 번에 빌드합니다. 오디오북은 `web/` 변경에 반응하며, 루트의 음성 제작 도구만 바뀌면 사이트를 다시 배포하지 않습니다.

빌드 중 다른 프로젝트의 `main`이 바뀌면 오래된 결과를 건너뛰고 새 빌드를 예약합니다. 업로드 도중 소스가 바뀐 경우에도 최신 소스로 다시 갱신합니다. 기존 각 프로젝트의 GitHub Pages 워크플로는 유지됩니다.

각 저장소에 아래 설정이 필요합니다.

- Actions secret `CLOUDFLARE_API_TOKEN`: 해당 계정의 **Cloudflare Pages 편집** 권한을 가진 배포 전용 토큰.
- Actions variable `CLOUDFLARE_ACCOUNT_ID`: Cloudflare 계정 ID.
- 네 가지 `VITE_FIREBASE_*` 공개 설정: 세 저장소에 같은 Firebase 웹 앱 설정을 사용합니다.

회사 홈페이지의 `.github/workflows/company.yml`은 정적 HTML 검증 후 `duvridge` Pages 프로젝트를 갱신합니다. Pull request에서는 검증만 실행합니다. Cloudflare API 토큰은 배포 단계에만 전달하며 저장소 코드나 공개 파일에 넣지 않습니다.

## 공유 미리보기와 로고

루트의 `기본로고.png`, `심볼로그.png`를 원본으로 사용합니다. `assets/brand/`에는 원본 로고의 복사본과 브라우저·모바일 아이콘, `assets/social/`에는 1200×630 공유 이미지가 있습니다. 회사 홈페이지는 duvridge 이미지, ToldLife 홈은 ToldLife 이미지를 사용하며, 각 작품은 기존 작품 표지를 유지합니다.

공유용 제목·설명·이미지·대표 주소·언어 정보는 Open Graph와 X 카드 메타데이터로 초기 HTML에 포함됩니다. 회사와 ToldLife의 관계는 JSON-LD에도 제공합니다.

로고나 공유 이미지 구성을 바꿀 때는 Playwright가 설치된 환경에서 다음 명령으로 다시 렌더링한 뒤, 생성된 이미지를 함께 커밋합니다.

```sh
python3 scripts/render-social-assets.py
python3 scripts/build-site.py
python3 -m unittest discover -s tests
```

ToldLife 공통 홈의 문구와 배치는 [토스의 라이팅 원칙](https://toss.tech/article/21022), [리디 웹소설](https://ridibooks.com/webnovel/recommendation), [윌라의 서비스 안내](https://www.welaaa.com/), [KRDS 타이포그래피](https://www.krds.go.kr/html/site/style/style_03.html)를 참고했습니다. 한국어 서비스명과 행동을 먼저 보여주고, 제목의 크기·여백·두 서비스의 시각적 비중을 조정했습니다.
