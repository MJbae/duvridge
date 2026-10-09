# 삽화 편집 안내

삽화 위치는 원고의 고정 표시로 관리합니다. 표시 앞뒤의 문장을 고치거나 문단을 추가·삭제해도 위치 계산이나 JSON의 문단 문구 갱신이 필요하지 않습니다. 두 읽기 서비스와 오디오북 제작 도구가 같은 표시를 사용합니다.

정본은 `content/books/bae-byunghee/manuscript.md`입니다. 앱 안의 원고와 자료는 자동으로 만든 작업 사본이므로 정본에서 편집하세요.

## 기존 본문을 고칠 때

문장은 자유롭게 윤문합니다. 삽화가 들어갈 곳의 아래 표시를 그대로 두면 해당 자리에 같은 삽화가 들어갑니다.

```md
앞 장면의 마지막 문단입니다.

<!-- illustration: ep01-02 -->

삽화 다음에 이어지는 문단입니다.
```

삽화 표시 앞뒤에는 빈 줄을 두고 표시 한 줄에는 다른 글을 쓰지 않습니다. 하나의 다음 문단 앞에는 표시를 하나만 두며, 본문 문단 없이 여러 표시를 연달아 놓지 않습니다. 삽화를 옮기려면 이 표시 한 줄을 원하는 문단 앞에 옮기세요. 장면이나 여러 문단을 이동할 때는 그 장면에 붙은 표시도 함께 이동합니다. 문단을 복사할 때 같은 표시가 두 번 들어가지 않도록 확인하세요.

`* * *` 장면 구분이 이미 있다면 표시 바로 앞에 둡니다. 본문 중간 삽화 앞에는 장면 구분을 자동으로 넣고, 기존 구분과 중복하지 않습니다.

## 대표 그림과 본문 첫 삽화

`episode-illustrations.json`에서 회차마다 한 그림에 `representative: true`를 지정합니다. 대표 그림은 플레이어 썸네일과 메타데이터 로딩에 쓰며, 본문 표식 위치와 분리해 관리합니다. 기존 대표 그림의 ID는 그대로 두고 본문 표시만 해당 장면 앞으로 옮길 수 있습니다.

본문 첫 문단 앞에 삽화를 넣고 싶다면 회차 제목과 시점 줄 다음에 표시를 둡니다. 회차 시작에 그림을 강제로 넣을 필요는 없습니다. 먼저 서두를 읽고 나중의 장면에서 첫 삽화가 나와도 됩니다.

```md
## 어머니의 쇠갈고리 {#ep01}

*1930년대 · 안면도 중장리*

<!-- illustration: ep01-01 -->

1936년, 배병희는 충청남도 태안군 안면도 남쪽 중장리에서 태어났다.
```

첫 본문 문단 앞의 삽화에는 별도 장면 구분을 넣지 않습니다. 본문을 읽은 뒤 나오는 삽화에는 기존 규칙대로 장면 구분을 넣습니다. 표시는 화면이나 낭독·자막에 노출되지 않습니다. 위 본문은 표시 방법을 설명하는 예시입니다.

## 새 삽화를 등록할 때

1. `ep01-oyster-work` 또는 `ep01-03`처럼 소속 회차 ID와 하이픈으로 시작하는 미사용 ID를 정합니다. 새 삽화에는 의미를 드러내는 이름을 권장하며 기존 번호 ID도 그대로 쓸 수 있습니다. 원고의 원하는 문단 앞에 해당 표시를 넣습니다. 기존 `ep01-01`과 `ep01-02` 사이에 `ep01-03`을 넣어도 기존 ID와 파일명을 바꾸지 않습니다. 숫자는 식별용이며 화면의 순서는 원고 표시 위치가 결정합니다.
2. `content/books/bae-byunghee/illustrations/manifest.json`의 `images`에 같은 `id`와 `episodeId`, 설명 `alt`, 크기 `width: 1280`, `height: 720`, 공개 파일 목록을 등록합니다. 매니페스트는 `version: 2`이며 `position`, 문단 번호, 본문 문구는 넣지 않습니다. 매니페스트 행 순서는 삽화 표시 순서와 무관합니다. 회차마다 `representative: true`인 그림은 하나만 유지합니다.
3. 승인된 이미지의 JPG를 `content/books/bae-byunghee/public/images/episodes/<ID>-360.jpg`, `-720.jpg`, `-1280.jpg`로 준비합니다. WebP를 사용할 때는 같은 세 크기의 `.webp` 파일과 `webpSources`도 등록합니다.
4. 기존 대체 원본 등록 방식을 쓰면 `content/books/bae-byunghee/illustrations/source-images/regeneration-prompts.json`에 ID와 원본 경로를 등록하고, 루트에서 아래 명령을 실행해 승인된 원본을 크기별로 인코딩합니다.

```sh
npm run assets:episodes --workspace @duvridge/toldlife-novels -- ep01-02
```

이 명령은 기존 이미지 파일을 변환하며 이미지 생성 API를 호출하지 않습니다. 표지와 공유 아이콘을 다시 인코딩하는 명령은 각각 `assets:cover`, `assets:share`입니다. 어느 읽기 앱에서 실행해도 정본 패키지에 결과를 씁니다.

등록 예시는 다음과 같습니다. JPG 세 크기는 필수이고 WebP 목록은 선택입니다.

```json
{
  "id": "ep01-02",
  "episodeId": "ep01",
  "alt": "황토 비탈밭에서 작물을 거두는 가족",
  "width": 1280,
  "height": 720,
  "sources": [
    { "src": "/images/episodes/ep01-02-360.jpg", "width": 360 },
    { "src": "/images/episodes/ep01-02-720.jpg", "width": 720 },
    { "src": "/images/episodes/ep01-02-1280.jpg", "width": 1280 }
  ]
}
```

## 편집 결과 확인

저장소 루트에서 실행합니다.

```sh
npm test --workspace @duvridge/toldlife-novels
npm test --workspace @duvridge/toldlife-audiobooks
npm run build --workspace @duvridge/toldlife-novels
npm run build --workspace @duvridge/toldlife-audiobooks
```

미등록·누락·중복·다른 회차의 표시, 소속 회차와 맞지 않는 ID, 본문 뒤에 남은 표시, 누락된 이미지 파일은 준비 단계에서 오류가 납니다. 코드 블록 안의 표시 예시는 실제 위치로 읽지 않습니다. 렌더러도 원고 표시와 등록 자산의 불일치를 확인하므로 이미지가 조용히 사라지지 않습니다.

브라우저에는 표시 문구 없이 기존 삽화만 렌더링됩니다. 생성 카탈로그의 `position.start`와 `position.paragraphIndex`는 본문 시작 위치·순서 검증에 쓰는 계산 결과이며 직접 편집하지 않습니다. 대표 그림 선택은 별도의 `representative` 값으로 합니다. 제작 도구도 현재 원고를 읽어 본문 위치를 계산합니다. 이번 장면 배치 조정은 [삽화와 장면 정렬 기록](illustration-story-alignment.md)에 정리했습니다.

현재 오디오는 재생성 예정이므로 기존 녹음과의 일치 여부에 맞추어 본문·제목·시점·삽화 편집을 제한하지 않습니다. 삽화 편집이나 웹 빌드는 기존 음성·SRT·제작 클립을 변경하지 않으며, 정확히 일치하는 문장만 강조합니다. 새 음성을 반영하는 별도 제작 작업에서는 최신 원고와의 일치를 검증합니다.

구현은 [VitePress의 Markdown 플러그인 설정](https://vitepress.dev/guide/markdown#advanced-configuration)과 [markdown-it의 블록 규칙 확장](https://markdown-it.github.io/markdown-it/interfaces/Ruler.html)을 사용합니다. 표시에 필요한 좁은 규칙만 추가하며 임의 HTML 실행은 계속 비활성화합니다.
