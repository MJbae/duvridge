# ToldLife Videos

작품 홈은 `/videos/<작품 ID>/`, 영상 회차는 `/videos/<작품 ID>/<회차 ID>`입니다. `.html`을 붙이지 않습니다. 원고·그림·음악은 `content/books/*/book.json`에서 발견한 작품 목록을 사용합니다. 영상 재생·장면 이동 코드는 이 앱이 소유합니다.

회차 화면은 제작 도구가 만든 MP4를 그대로 재생합니다. 자막은 영상에 들어 있으므로 화면에 따로 그리지 않습니다. 영상 목록은 `content/books/<작품>/video/media.json`(파일·크기·SHA-256·길이)이고, 문장 시각은 `video/timings/<회차>.srt`입니다. 준비 단계는 영상의 문장이 오디오북 녹음의 문장과 같은지 확인하고, 다르면 빌드를 멈춥니다. 오디오북과 영상은 `family-library:<작품 ID>:narration` 위치 하나를 공유합니다. 위치는 녹음의 시각으로 저장하고 문장 번호로 영상 시각과 바꿉니다(영상은 0.9배속).

첫 작품의 승인된 MP3/SRT/장면 목록은 오디오북 앱의 기존 입력 경로에서 빌드 때 복사합니다. 다른 작품은 책 원본 폴더의 `narration/record`와 `narration/timings`를 사용합니다. 웹 빌드는 녹음·시각·영상을 만들지 않습니다. MP4는 Git에 넣지 않습니다. 개발 서버와 빌드는 `TOLDLIFE_VIDEO_MEDIA=<웹 사본 폴더>`가 있으면 그 파일을 연결합니다. `TOLDLIFE_VIDEO_FIXTURES=1`이면 회차 길이만큼의 소리 없는 검은 영상을 ffmpeg로 만듭니다. 브라우저 테스트는 `TOLDLIFE_VIDEO_MEDIA`가 없을 때 이 대체 영상을 씁니다. 배포에서는 조립 단계가 Release에서 받은 실제 영상을 넣습니다.

단일 영상과 시리즈 회차는 상단 뒤로, 영상, 제목, 마음 남기기, 오리지널 시리즈 표지 카드의 구조를 공유합니다. `VideoControls.vue`가 재생·일시 정지, ±10초, 시간, 전체 화면과 재생 위치를 제공합니다. 시리즈 회차에는 기본 접힘인 장면 보기, 다음 화 카드, 이전 화·전체 회차 링크가 추가되고, 끝난 뒤에는 자동 다음 화와 취소 동작을 유지합니다.

영상의 기본 상태는 음소거 해제입니다. 단일 영상 페이지를 열면 소리 있는 자동 재생을 시도합니다. 브라우저가 자동 재생을 차단하면 소리가 켜진 상태로 재생 버튼을 표시하고, 사용자가 누르면 재생합니다.

원작으로 만든 영상(각색 영상)은 회차와 따로 `/videos/<작품 ID>/<영상 ID>`에 한 쪽씩 둡니다.
- 제목과 그림(2:3 카드, 영상 첫 화면 포스터)은 `content/books/<작품>/book.json`의 `films`에 적습니다.
- 파일 목록은 `video/media.json`의 `films`에 적습니다(파일·크기·SHA-256·길이·가로·세로).
- 파일은 회차 영상처럼 Release에 올립니다.
- 영상 화면의 마음 남기기는 `film-<영상 ID>`로 저장합니다. '오리지널 시리즈' 카드는 작품 전체(`/novels/<작품>/?from=<영상 ID>`)로 갑니다. 소설 작품 홈은 이 주소로 오면 '<영상 제목>의 원작' 줄을 맨 위에 보여 줍니다.

새 영상을 더하는 순서:
1. 웹용 사본(25MiB 미만)에 내용 해시를 붙여 `<영상 ID>.<해시 10자>.mp4`로 만듭니다.
2. `gh release upload <media.json의 tag> <파일> --repo MJbae/duvridge`로 올립니다.
3. 두 목록에 영상을 적고 커밋합니다.

루트에서 `npm run dev:videos`, `npm run test --workspace @duvridge/toldlife-videos`, `npm run typecheck --workspace @duvridge/toldlife-videos`, `npm run test:e2e --workspace @duvridge/toldlife-videos`로 실행합니다. 옛 `/audiobooks/watch/` 주소는 배포 조립 단계에서 새 영상 주소로 직접 301 이동합니다.
