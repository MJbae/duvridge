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
