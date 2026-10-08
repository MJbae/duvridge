이 서비스는 Duvridge 모노레포의 `@duvridge/autobio-bae` 워크스페이스입니다. 설치는 저장소 루트에서 `npm ci`로 한 번만 합니다. 개발·빌드는 루트에서 `npm run dev --workspace @duvridge/autobio-bae`, `npm run build --workspace @duvridge/autobio-bae`로 실행합니다. 배포 정책은 [루트 README](../../README.md)를 따릅니다.

원고는 `packages/memoir-content/배병희_자서전.md`, 공통 자료·음악·삽화는 `packages/memoir-content/content/`와 `packages/memoir-content/site/public/`에서만 수정합니다. 앱 안의 동일 경로는 준비 단계에서 만든 무시된 작업 사본이며 다음 실행 때 교체됩니다. 공통 문체·본문·목차·기본 컴포넌트는 `packages/reader-core/`에서 관리합니다. 삭제·이름 변경한 공통 입력은 생성 목록에 따라 작업 사본에서도 제거되며, 오디오 앱의 낭독 음성·자막은 보존됩니다.

<p align="center">
  <img src="../../packages/memoir-content/site/public/images/home-cover-1280.jpg" alt="가을 논을 배경으로 정장을 입은 배병희의 수채화 초상" width="100%">
</p>

<h1 align="center">내 논을 파는 한이 있어도</h1>

<p align="center">
  배병희 자전소설 · 가족이 휴대폰으로 함께 읽는 서재<br>
  <sub>프롤로그 · 23화 · 에필로그 · 외전</sub>
</p>

<p align="center">
  <a href="https://mjbae.github.io/bae-memoir/"><b>읽으러 가기 →</b></a>
</p>

<p align="center">
  <i>“내 논을 파는 한이 있어도, 농사지은 사람 볏값은 밀려선 안 된다.”</i>
</p>

<br>

<table align="center">
  <tr>
    <td align="center" width="33%">
      <img src="docs/readme/home.jpg" alt="수채화 표지 아래 제목과 작품 소개가 보이는 첫 화면" width="240"><br>
      <sub><b>표지</b><br>다시 오면 소개를 접고 이어서 읽기</sub>
    </td>
    <td align="center" width="33%">
      <img src="docs/readme/reader.jpg" alt="1화 어머니의 쇠갈고리의 수채화 삽화와 본문" width="240"><br>
      <sub><b>회차</b><br>수채화 삽화와 넉넉한 글씨</sub>
    </td>
    <td align="center" width="33%">
      <img src="docs/readme/contents.jpg" alt="읽은 회차와 읽는 중인 회차가 왼쪽 줄에 표시되고 1983 독정 정미소 이정표가 보이는 목차" width="240"><br>
      <sub><b>목차</b><br>읽은 곳·읽는 곳·남은 곳이 한 줄에</sub>
    </td>
  </tr>
</table>

원고·목차·주소·음악·삽화는 음악 파일명과 같은 회차 ID를 사용합니다. 본편은 `ep01`~`ep23`, 소개는 `intro`, 프롤로그는 `prolog`, 에필로그는 `epilog`, 외전은 `side`입니다. 예를 들어 원고 `{#ep01}`, 주소 `/read/ep01.html`, 음악 `/music/ep01.mp3`, 반응 저장 경로 `pages/memoir-ep01`이 같은 1화를 가리킵니다.

원고의 `# 1977. 남양만 간척지` 같은 1단계 제목은 목차의 터전 이정표입니다. 네 자리 연도와 1~20자 장소를 적고, 연도는 앞 터전보다 뒤여야 합니다. 그 아래 본편 회차가 목차에서 이 이정표 뒤에 놓입니다. 형식이 틀리거나 회차가 없는 터전이 있으면 빌드가 중단됩니다.

음원은 `packages/memoir-content/site/public/music/`에 두고 `packages/memoir-content/content/music.json`의 `tracks[].id`로 연결합니다. 삽화는 `ep08-01`, `ep08-02`처럼 회차 ID에 장 번호를 붙이고 `packages/memoir-content/content/episode-illustrations.json`에서 연결합니다. 두 번째 외전부터는 `side-02`, `side-03`을 사용합니다. 원고 순서를 바꾸면 회차 ID와 관련 음악·삽화도 함께 정리해야 하며, 번호나 파일명이 어긋나면 빌드가 중단됩니다.

표지와 회차 첫 삽화만 화면 크기에 맞는 WebP를 사전 로딩하고, 본문 삽화는 지연 로딩합니다. 이미지 전송이 실패하면 720px JPG로 복구하며, 두 형식 모두 실패하면 다시 불러오기 버튼을 표시합니다. 삽화 위치를 옮길 때는 캐시된 페이지에서도 그림을 볼 수 있도록 이전 공개 파일 주소를 보존합니다.

본문 중간 삽화 앞에는 장면 전환 표시를 자동으로 넣고, 이미 원고에 표시가 있으면 중복하지 않습니다. 회차 첫 삽화에는 넣지 않습니다. 그 밖에는 시간·장소·사건이 크게 달라질 때만 원고에 `* * *`를 남기고, 같은 이야기의 흐름은 일반 문단 간격으로 이어갑니다.

회차 반응은 누른 즉시 선택과 숫자를 표시하고, 연속으로 누른 선택을 모아 서버에 비동기로 저장합니다. 초기 집계 조회는 버튼을 막지 않으며, 저장 대기 중인 마지막 선택은 브라우저에 보관해 다음 화 이동이나 새로고침 뒤에도 이어서 저장합니다.

콘텐츠 준비 단계에서 참고 이미지 인덱스와 참고 목록 화면의 회차 번호·제목·원고 해시도 자동 갱신합니다. 옛 제목·연대 주소는 새 번호 주소로 이동하고, 브라우저의 읽던 위치와 완독 기록도 자동 변환합니다.

운영 반응 데이터를 옮길 때는 `node scripts/migrate-reaction-ids.mjs --project=<프로젝트 ID>`로 대상 건수를 먼저 확인한 다음 `--apply`를 붙여 실행합니다. 작성자 UID와 선택값·시각을 보존하며, 이미 옮긴 데이터보다 오래된 값은 덮어쓰지 않습니다. 기존 경로의 데이터는 보관합니다.
