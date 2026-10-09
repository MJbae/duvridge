# ToldLife Videos

작품 홈은 `/videos/<작품 ID>/`, 영상 회차는 `/videos/<작품 ID>/<회차 ID>`입니다. `.html`을 붙이지 않습니다. 원고·그림·음악은 `content/books/*/book.json`에서 발견한 작품 목록을 사용합니다. 영상 재생·장면 이동 코드는 이 앱이 소유합니다.

회차 화면은 제작 도구가 만든 MP4를 그대로 재생합니다. 자막은 영상에 들어 있으므로 화면에 따로 그리지 않습니다. 영상 목록은 `content/books/<작품>/video/media.json`(파일·크기·SHA-256·길이)이고, 문장 시각은 `video/timings/<회차>.srt`입니다. 준비 단계는 영상의 문장이 오디오북 녹음의 문장과 같은지 확인하고, 다르면 빌드를 멈춥니다. 오디오북과 영상은 `family-library:<작품 ID>:narration` 위치 하나를 공유합니다. 위치는 녹음의 시각으로 저장하고 문장 번호로 영상 시각과 바꿉니다(영상은 0.9배속).

첫 작품의 승인된 MP3/SRT/장면 목록은 오디오북 앱의 기존 입력 경로에서 빌드 때 복사합니다. 다른 작품은 책 원본 폴더의 `narration/record`와 `narration/timings`를 사용합니다. 웹 빌드는 녹음·시각·영상을 만들지 않습니다. MP4는 Git에 넣지 않습니다. 개발 서버와 빌드는 `TOLDLIFE_VIDEO_MEDIA=<웹 사본 폴더>`가 있으면 그 파일을 연결합니다. `TOLDLIFE_VIDEO_FIXTURES=1`이면 회차 길이만큼의 소리 없는 검은 영상을 ffmpeg로 만듭니다. 브라우저 테스트는 `TOLDLIFE_VIDEO_MEDIA`가 없을 때 이 대체 영상을 씁니다. 배포에서는 조립 단계가 Release에서 받은 실제 영상을 넣습니다.

루트에서 `npm run dev:videos`, `npm run test --workspace @duvridge/toldlife-videos`, `npm run typecheck --workspace @duvridge/toldlife-videos`, `npm run test:e2e --workspace @duvridge/toldlife-videos`로 실행합니다. 옛 `/audiobooks/watch/` 주소는 배포 조립 단계에서 새 영상 주소로 직접 301 이동합니다.
