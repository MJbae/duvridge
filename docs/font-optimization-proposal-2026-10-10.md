# 소설과 오디오북 폰트 최적화 제안서

폰트 최적화는 필요하다. 우선 저장한 서체를 첫 렌더링 전에 반영하고, 공통 폰트 CSS와 첫 화면에 필요한 글자만 담은 폰트를 정리하는 순서를 권한다. 현재의 Hahmlet 명조와 IBM Plex Sans KR 고딕은 유지하는 방향이다.

소설과 오디오북 탭은 같은 화면의 상태 전환이 아니라 별도 앱의 문서로 이동한다. 따라서 폰트 요청과 로딩 이벤트는 다시 생긴다. 다만 이번 Chromium 측정에서는 반복 전환의 폰트와 폰트 CSS가 모두 캐시에서 처리됐다. **요청 목록이 반복된다는 사실만으로 매번 재다운로드한다고 판단할 수는 없다.** 캐시가 있는 반복 전환에서 추가 폰트 전송과 관측 구간의 레이아웃 이동은 확인되지 않았다.

## 현재 구성

| 영역 | 서체와 굵기 | 설정 위치 |
| --- | --- | --- |
| 소설과 오디오북 및 영상 | Hahmlet 400 500 700 800과 IBM Plex Sans KR 400 500 600 700 | [공통 VitePress 설정](../packages/vitepress-reader/src/config/create-reader-config.mts) |
| 포털 | Hahmlet 700 800과 IBM Plex Sans KR 400 500 600 | [포털 HTML](../apps/toldlife-portal/index.html) |
| 제목과 워드마크 | Hahmlet 명조 | [공통 리더 CSS](../packages/reader-ui/src/styles/reader.css) |
| 탭과 버튼 및 회차 목록 | IBM Plex Sans KR 고딕 | 같은 공통 CSS |
| 소설 본문 | 기본 Hahmlet이며 독자가 고딕을 선택할 수 있음 | [소설 레이아웃](../apps/toldlife-novels/site/.vitepress/theme/NovelReaderLayout.vue) |

두 외부 도메인에 `preconnect`가 있고 `display=swap`을 사용한다. 폰트는 이미 WOFF2이며 Google의 `unicode-range` 분할을 사용한다. 저장소에는 자체 호스팅하는 WOFF2 파일과 폰트 전용 preload가 없다. 커스텀 테마를 사용하므로 VitePress 기본 Inter 폰트를 제거하는 조치는 현재 문제에 해당하지 않는다.

[형식 링크](../packages/reader-ui/src/series/series-tabs.mjs)는 `/novels/<work>/`와 `/audiobooks/<work>/`를 가리킨다. [작품 홈](../packages/reader-ui/src/components/WorkHome.vue)의 링크에는 `target="_self"`가 있고, 측정에서도 탭 클릭마다 Document 요청과 새로운 `performance.timeOrigin`이 확인됐다.

## 배포 사이트 측정

2026년 10월 10일 23시 35분 59초부터 23시 36분 35초 KST까지 `https://toldlife.duvridge.com`에서 측정했다. 배포 커밋은 `5a2f149acf52f22e0ec57e97b13efa7b1f44a88a`이며 `sourceDirty=false`다. 측정 시작과 종료 사이 배포는 바뀌지 않았다. 분석 기준 소스 `0cdcadb`와 배포 커밋 사이에서 아래 대상 앱과 공통 폰트 소스의 차이는 없다.

Chromium `153.0.8010.12`의 390×844 및 1440×1000 뷰포트에서 캐시를 켰다. 각 방문 시나리오는 새 브라우저 컨텍스트로 시작하고, 시나리오 안에서는 캐시를 유지했다. 실제 휴대폰이나 Safari 측정은 아니며, 사용자 기기의 반복적인 시각적 교체 원인을 확정하려면 그 브라우저의 캐시 상태와 렌더링도 확인해야 한다.

아래 KB는 1,000바이트 단위다. 전송량은 CDP `encodedDataLength`로 집계한 실제 네트워크 응답량이며 응답 오버헤드가 포함된다. CSS 원문 크기와 구분한다.

| 방문 상황 | 폰트 요청 | 네트워크 응답 / 캐시 응답 | 폰트 전송 | 폰트 CSS 전송 |
| --- | ---: | ---: | ---: | ---: |
| 소설 작품 홈 첫 방문 | 32 | 32 / 0 | 425.1 KB | 104.9 KB |
| 작품 홈에서 오디오북으로 전환 | 32 | 0 / 32 | 0 KB | 0 KB |
| 소설로 돌아와 다시 왕복 | 매번 32 | 매번 0 / 32 | 0 KB | 0 KB |
| 포털 첫 방문 | 20 | 20 / 0 | 451.3 KB | 66.0 KB |
| 포털 다음 소설 작품 홈 | 35 | 15 / 20 | 추가 118.8 KB | 추가 104.4 KB |
| 프롤로그 읽기 첫 방문 기본 명조 | 34 | 34 / 0 | 902.0 KB | 104.9 KB |
| 다음 회차 직접 방문 | 41 | 7 / 34 | 추가 135.2 KB | 0 KB |
| 고딕 설정을 저장한 뒤 프롤로그 첫 방문 | 51 | 51 / 0 | 1,037.8 KB | 104.9 KB |
| 오디오북 프롤로그 첫 방문 | 30 | 30 / 0 | 393.9 KB | 104.9 KB |

캐시가 있는 작품 홈 전환은 데스크톱과 제한한 네트워크에서도 폰트 추가 전송이 0바이트였다. 관측 구간의 레이아웃 이동 합도 0이었다. 반면 1.6Mbps 다운로드와 150ms 추가 지연을 적용한 첫 방문에서는 첫 콘텐츠가 약 1.96초에 나타났고 초기 폰트 로딩 완료 이벤트는 약 6.17초에 발생했다. 첫 표시 이후 약 4.21초 동안 서체가 뒤늦게 적용될 수 있는 조건이다. 이 시간은 한 번의 실험 결과이며 사용자 전체의 성능 지표로 해석하지 않는다.

현재 Google 응답의 캐시 정책은 다음과 같다.

- 폰트 CSS는 `private, max-age=86400, stale-while-revalidate=604800`이다.
- WOFF2는 `public, max-age=31536000`이다.
- 두 형식은 같은 사이트의 경로이므로 이번 전환에서 캐시를 공유했다. 다른 사이트에서 Google Fonts를 방문했다는 이유로 캐시가 준비되어 있다고 가정할 수는 없다. [Chrome 캐시 분할 설명](https://developer.chrome.com/blog/http-cache-partitioning/).

## 개선이 필요한 원인

### 저장한 고딕이 첫 렌더링에 반영되지 않음

측정한 배포의 소설 레이아웃은 `face = ref('serif')`로 시작하고 `onMounted`에서 `family-library:face`를 읽는다. 서버가 만든 본문은 명조로 시작하며, 브라우저가 앱을 활성화한 뒤 고딕으로 바뀐다.

분석 중 메인에 반영된 `01d850c`는 기본 설정을 `readingSettings()`에서 가져오고 기본 줄 간격을 넓게 바꾼다. 기본 서체는 여전히 명조이며 저장한 서체를 `onMounted`에서 복원하는 순서도 유지된다. 아래 전송량은 위에 명시한 배포 버전의 측정값이고, 최신 설정에서도 초기 서체 복원은 별도 개선 항목이다.

고딕을 저장한 첫 방문에서 실제 본문은 최종적으로 IBM Plex Sans KR로 표시됐지만, Hahmlet 19개 파일 약 771.5 KB도 함께 내려왔다. 이는 기본 명조 방문과 같은 Hahmlet 파일 수다.

브라우저 안에서만 첫 렌더링의 본문 CSS를 고딕으로 지정한 실험에서는 폰트 전송이 **1,037.8 KB에서 266.5 KB로 약 74% 감소**했고, 실제 본문 서체는 동일했다. 이 실험은 초기 진입만 검증하는 프로토타입이다. 설정 변경과 이전 페이지 복원까지 처리하는 제품 구현은 별도로 필요하다.

관측 구간의 레이아웃 이동 합은 기존 고딕 진입에서 0.0252, 초기 고딕 실험에서 0.0018이었다. 전체 이용 세션의 CLS 점수는 아니며, 이동 전부를 폰트에만 귀속시키지는 않는다.

### 외부 CSS가 크고 같은 정보를 반복함

공통 Google CSS 원문은 **465,436바이트**이고 `@font-face` 선언이 **744개**다. Hahmlet은 굵기별 368개 선언이 같은 92개 파일 URL을 재사용한다. IBM Plex Sans KR은 네 굵기에 대해 376개 파일 URL을 선언한다. 실제 작품 홈에서 내려오는 파일은 이 중 32개다. 모든 선언이나 모든 굵기가 자동으로 다운로드되는 것은 아니다. [폰트 요청 시점과 필요한 파일 선택](https://web.dev/learn/performance/optimize-web-fonts).

포털은 리더와 Google CSS URL이 다르다. 그래서 포털에서 작품으로 들어갈 때 이미 받은 폰트는 일부 재사용하지만 CSS는 별도로 받아 파싱한다. 이 경로의 추가 폰트 15개는 필요한 문자와 굵기의 차이도 포함하므로 CSS URL 통일만으로 모두 없어지지는 않는다.

### 첫 화면에 필요한 글자보다 분할 파일이 큼

작품 홈의 Hahmlet은 5개 파일 약 207.1 KB, IBM Plex Sans KR은 27개 파일 약 218.0 KB다. 짧은 제목과 워드마크도 한글 분할 범위 여러 개에 걸쳐 있다. 자체 호스팅만 하면 이 파일 크기가 자동으로 줄어들지는 않는다. 공통 UI 글자 묶음과 본문용 분할을 함께 설계해야 한다.

`swap`은 대체 글꼴로 먼저 표시하고 웹폰트가 준비되면 교체한다. 느린 첫 방문에서는 이 교체가 눈에 띌 수 있다. `preconnect`와 WOFF2는 이미 적용되어 있으므로 추가할 항목으로 다시 제시할 필요가 없다. [폰트 표시 전략](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@font-face/font-display).

## 권장 작업 순서

| 순서 | 작업 | 기대 효과 | 완료 확인 |
| --- | --- | --- | --- |
| 1 | 저장된 서체를 첫 스타일 계산 전에 반영 | 명조를 먼저 받고 고딕으로 바꾸는 낭비 제거 | 고딕 초기 진입에서 본문용 명조 요청이 발생하지 않음 |
| 2 | 공통 폰트 선언과 UI 글자 묶음을 설계 | 큰 외부 CSS와 첫 화면 폰트 전송량 축소 | 제목과 탭의 서체 및 굵기를 유지하면서 전송량 비교 |
| 3 | 동일 출처의 공통 폰트 경로와 캐시 적용 | 외부 연결과 CSS 발견 지연 제거 및 앱 간 캐시 유지 | 반복 왕복 폰트 전송 0바이트 유지 |
| 4 | 필요한 폰트만 preload하고 대체 글꼴 간격 조정 | 첫 표시 뒤 서체 교체와 줄바꿈 변화 완화 | 느린 네트워크와 실제 모바일 브라우저에서 화면 비교 |

### 저장된 서체를 먼저 적용

현재 테마를 복원하는 head 스크립트와 같은 시점에 검증된 서체 설정을 HTML 속성으로 복원하고, 본문 CSS가 처음부터 선택한 서체를 사용하도록 한다. Vue 상태와 설정 버튼도 같은 값을 사용한다. 저장소 접근이 막히거나 값이 잘못됐을 때는 기존 기본 명조로 시작한다.

이 항목은 폰트를 교체하거나 본문을 편집하지 않고 진행할 수 있다. 사용자 선택 변경, 새로고침, 회차 이동, 뒤로 가기와 저장된 스크롤 위치를 함께 검증한다. 초기 CSS를 강제로 고정한 실험 코드를 제품에 그대로 옮기면 설정 변경을 막을 수 있으므로 설정과 HTML 속성의 동기화가 필요하다.

### 공통 선언과 글자 묶음 구성

Hahmlet은 가변 굵기 폰트이고 현재 IBM Plex Sans KR 배포는 정적 굵기 파일이다. 두 폰트 모두 가변 폰트라고 가정하지 않는다. [Hahmlet 공식 메타데이터](https://github.com/google/fonts/blob/main/ofl/hahmlet/METADATA.pb), [IBM Plex Sans KR 공식 메타데이터](https://github.com/google/fonts/blob/main/ofl/ibmplexsanskr/METADATA.pb).

Google API에서 Hahmlet만 `400..800` 범위로 요청한 비교 결과는 다음과 같다. 범위 요청 문법은 [Google Fonts CSS API](https://developers.google.com/fonts/docs/css2)에서 지원한다.

| 항목 | 현재 개별 굵기 요청 | 가변 범위 요청 실험 |
| --- | ---: | ---: |
| CSS 원문 | 465,436 B | 297,393 B |
| 선언 수 | 744 | 468 |
| 고유 폰트 URL 수 | 468 | 468 |
| 같은 gzip 방식으로 계산한 크기 | 105,402 B | 66,436 B |

CSS 원문은 36.1%, gzip 계산 크기는 37.0% 감소했다. gzip 수치는 실제 배포 전송량을 보장하는 수치가 아니다. **파일 URL 수는 그대로이므로 폰트 파일 전송량도 37% 줄어든다고 해석하면 안 된다.**

가변 범위에는 기존에 선언되지 않은 Hahmlet 600도 포함된다. 현재 600을 요청하는 텍스트 목록과 선택한 설정의 샘플은 기존 인접 굵기 대신 실제 600으로 표시될 수 있다. 현재 굵기 표현을 유지하려면 이 사용처를 확인하고 필요한 명시적 굵기를 정한 뒤 적용한다. 소설 본문을 포함한 화면 비교 없이 CSS URL만 교체하지 않는다.

포털과 리더가 공통 선언을 사용하도록 한다. 제목, 워드마크, 탭, 고정 UI 문구와 모든 작품의 메타데이터를 포함하는 작은 UI 글자 묶음을 먼저 만들고, 본문과 새로운 글자는 전체 문자 범위를 지원하는 분할 파일로 처리한다. `unicode-range`의 중복 적용과 누락을 검사한다. 공통 UI는 처음 받은 파일을 앱 사이에서 재사용하도록 경로를 고정한다.

새로운 작품명, 한자, 따옴표, 숫자, 자막과 사용자 입력도 표시되어야 한다. 본문용 폰트를 현재 프롤로그나 첫 화면의 `text=` 값으로만 제한하면 다음 회차나 새로운 글자가 빠질 수 있다. 원고를 읽어 문자 목록을 검증할 수는 있지만 폰트에 맞춰 원고를 바꾸지는 않는다. WOFF2 제작에는 [FontTools subset](https://fonttools.readthedocs.io/en/latest/subset/index.html)을 사용할 수 있다.

### 공통 경로에 자체 호스팅

폰트 원본과 배포할 WOFF2 및 라이선스는 패키지 밖의 공통 자산 경로인 `assets/fonts/`에 두는 방안을 권한다. 파일마다 원본 버전과 체크섬을 고정한다. 재사용하는 CSS와 폰트 설정 코드는 `packages/reader-ui`에 두고, head 생성은 `packages/vitepress-reader`에서 담당한다. 포털도 사용하는 공통 설정의 워크스페이스 의존성을 선언한다.

조립 스크립트가 최종 Pages 산출물의 `/assets/fonts/`에 한 번 복사하고, 포털과 소설 및 오디오북과 영상은 같은 절대 경로를 참조한다. 앱별 `/novels/assets/`와 `/audiobooks/assets/`에 같은 폰트를 복제하면 서로 다른 캐시 키가 된다.

콘텐츠 해시가 있는 WOFF2와 폰트 CSS에만 다음 캐시 정책을 적용한다.

```text
/assets/fonts/*
  Cache-Control: public, max-age=31536000, immutable
```

Cloudflare Pages의 기본 브라우저 정책은 재검증 방식이다. 자체 호스팅하면서 이를 그대로 두면 현재 Google의 장기 캐시보다 불리해질 수 있다. 정책은 조립기가 만드는 `_headers`에 넣고 실제 응답에서 확인한다. 내용이 바뀌면 반드시 URL도 바뀌어야 하므로 해시 없는 파일이나 HTML 전체에 적용하지 않는다. [Pages 캐시 기본값](https://developers.cloudflare.com/pages/configuration/serving-pages/#caching-and-performance), [Pages 헤더 설정](https://developers.cloudflare.com/pages/configuration/headers/).

자체 호스팅의 효과는 CDN 전송과 파일 크기 및 폰트 발견 시점을 함께 비교해 판단한다. 먼저 기존 분할과 서체를 유지해 외부 의존성을 제거하고, UI 글자 묶음으로 전송량을 줄이는 방법을 비교할 수 있다. [폰트 전달 방식 비교](https://web.dev/articles/font-best-practices).

원본과 함께 OFL 저작권 및 라이선스를 포함한다. IBM 폰트의 예약명은 `Plex`다. 직접 서브셋을 제작하는 경우 수정본의 이름 조건도 적용해야 하므로 배포 파일의 내부 이름과 CSS 이름을 일관되게 정한다. [Hahmlet 배포 라이선스](https://github.com/google/fonts/blob/main/ofl/hahmlet/OFL.txt), [IBM Plex Sans KR 배포 라이선스](https://github.com/google/fonts/blob/main/ofl/ibmplexsanskr/OFL.txt).

### 처음 필요한 폰트만 먼저 발견

실제로 첫 화면에 필요한 작은 UI 파일을 우선 대상으로 삼는다. 폰트 preload는 `as="font"`, `type="font/woff2"`, `crossorigin`을 사용한다. 같은 출처의 폰트도 `crossorigin`이 필요하다. 한글 전체 분할이나 사용하지 않는 굵기를 모두 preload하면 표지와 CSS의 전송을 방해할 수 있다. 첫 도입은 화면별 핵심 파일 한두 개부터 측정한다. [폰트 preload의 적용 조건](https://web.dev/learn/performance/optimize-web-fonts#preload).

현재 서체를 유지하는 기본안은 `swap`과 빠른 폰트 발견 및 대체 글꼴의 간격 보정이다. Apple 계열과 Android 계열 대체 글꼴에 대해 `size-adjust`, `ascent-override`, `descent-override`, `line-gap-override`를 측정해 적용한다. 같은 글자 크기에서도 실제 글자 폭과 줄바꿈이 일치하는지 확인한다. [대체 글꼴 크기 보정](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@font-face/size-adjust).

늦은 교체 자체를 없애는 것이 더 중요하다면 UI에 `font-display: optional`을 사용하는 선택지도 있다. 다만 늦게 도착한 웹폰트가 해당 방문에서 적용되지 않아 시스템 글꼴로 남을 수 있다. `font-display`는 서체 선언 단위이므로 같은 IBM 폰트를 쓰는 고딕 본문까지 바뀌는 영향을 고려해야 한다. 명조 본문과 브랜드 제목까지 일괄 적용하는 기본안으로 삼지 않는다. [표시 전략의 선택 기준](https://web.dev/articles/font-best-practices#choose_an_appropriate_font-display_strategy).

## 변경 범위와 검증 기준

| 대상 | 후속 구현 내용 |
| --- | --- |
| `apps/toldlife-novels` | 저장한 서체의 초기 적용과 설정 변경 및 읽기 위치 검증 |
| `packages/reader-ui` | 공통 폰트 CSS와 토큰 및 대체 글꼴 보정 |
| `packages/vitepress-reader` | 공통 head와 화면별 preload |
| `apps/toldlife-portal` 및 `scripts/render-toldlife-portal.mjs` | 공통 설정 의존성과 포털 폰트 연결 |
| `assets/fonts` 및 `scripts/assemble-toldlife-pages.py` | 버전 고정 자산과 단일 경로 복사 및 캐시 헤더 |
| `service-registry.json` | 공통 폰트 자산 변경을 포털과 모든 ToldLife 리더가 감지하도록 등록 |

기존 별도 앱 구조에서도 위 순서로 개선할 수 있다. 폰트만을 이유로 앱을 먼저 통합할 필요는 없다. 이후에도 캐시가 있는 탭 전환에서 사용자 기기의 교체 현상이 남으면 작품 홈을 같은 문서 안에서 전환하는 구조를 별도 검토한다. 이때도 앱 구현을 서로 가져오는 방식은 사용하지 않으며, 기존 주소와 새 탭 열기 및 뒤로 가기 동작을 함께 검토한다.

후속 구현의 완료 기준은 다음과 같다. 아직 달성된 제품 성능 수치가 아니라 적용 후 확인할 조건과 목표다.

- 고딕을 저장한 초기 진입의 폰트 전송량을 같은 조건에서 300 KB 이하로 낮추고, 기본 명조 본문용 파일의 선행 요청을 제거한다. 초기 고딕 실험은 266.5 KB였다.
- 작품 홈 첫 방문의 폰트 전송량을 425 KB에서 200 KB 이하로 낮추는 것을 UI 글자 묶음의 초기 목표로 삼는다. 기본 명조 본문의 크기는 별도로 비교하며 현재 902 KB보다 증가시키지 않는다.
- 포털과 형식 전환에서 공통 CSS와 폰트 URL이 같고, 필요한 글자가 이미 받은 범위에 있으면 추가 폰트 전송량은 0바이트다. 새로운 회차의 새로운 글자 요청은 정상 동작으로 구분한다.
- 제한한 네트워크에서 첫 표시부터 폰트 로딩 완료까지의 간격을 줄인다. 다섯 번의 새 컨텍스트 방문 중앙값과 화면 녹화로 비교하며 사용자 기기의 반복 교체도 확인한다.
- 모바일 Chromium과 실제 iOS Safari에서 제목과 탭 및 줄바꿈을 비교한다. 고딕과 명조 전환, 글자 크기와 줄 간격, 회차 이동, 새로고침, 뒤로 가기 및 오디오북 재생 UI를 확인한다.
- 폰트 요청 실패와 저장소 접근 실패에서도 내용이 표시되고 조작할 수 있다. 새 작품과 원고의 문자 및 기존 자막이 전체 폰트 범위에 포함되는지 검증한다.
- 저장소 오케스트레이션 테스트와 영향을 받는 리더의 테스트 및 build와 typecheck를 실행한다. 원고와 기존 오디오 및 타이밍을 변경하지 않는다.
- 배포는 한 커밋에서 검증한 완전한 ToldLife 산출물을 사용한다. 포털과 소설 및 오디오북과 영상을 함께 포함하고, 실제 캐시 헤더와 배포 SHA를 `docs/deployment-verification.md`에 기록한다.

## 측정 재현과 이번 작업 범위

[측정 결과 JSON](font-audit/baseline-2026-10-10.json)에는 19개 페이지 관측, 요청별 캐시와 전송량, 폰트 로딩 이벤트, 실제 표시된 서체, CSS 비교와 초기 고딕 실험을 담았다. [측정 스크립트](font-audit/measure-fonts.mjs)는 프로덕션 소스를 수정하지 않고 브라우저에서 읽기와 형식 이동을 수행한다. 초기 고딕 실험의 CSS는 해당 테스트 컨텍스트에만 적용된다.

Node.js 22와 npm 10 환경에서 저장소 루트를 기준으로 실행한다.

```sh
npm ci
npx playwright install chromium
mkdir -p _workspace/font-audit
node docs/font-audit/measure-fonts.mjs > _workspace/font-audit/current.json
```

`FONT_AUDIT_ORIGIN`으로 조립한 테스트 서버를 지정할 수 있다. 이 스크립트는 알려진 작품 경로와 `deployment.json`이 있는 완전한 사이트를 대상으로 한다. 일반 개발 서버와 캐시 헤더가 없는 로컬 서버의 결과를 배포 CDN 결과로 해석하지 않는다.

이번 변경은 분석과 제안서 및 측정 도구에 한정한다. 제품의 폰트 설정과 본문, 음원 및 배포 산출물은 변경하지 않았다. `npm run test:repo`의 Node 테스트 32개와 Python 테스트 10개가 통과했다. 문서 경로 변경의 서비스 선택 결과를 확인해 웹 배포 대상이 생기지 않도록 한다.
