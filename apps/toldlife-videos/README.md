# ToldLife Videos

작품 홈은 `/videos/<작품 ID>/`, 영상 회차는 `/videos/<작품 ID>/<회차 ID>`입니다. `.html`을 붙이지 않습니다. 원고·그림·음악은 `content/books/*/book.json`에서 발견한 작품 목록을 사용합니다. 영상 재생·자막·장면 이동 코드는 이 앱이 소유합니다.

첫 작품의 승인된 MP3/SRT/장면 목록은 오디오북 앱의 기존 입력 경로에서 빌드 때 복사합니다. 다른 작품은 책 원본 폴더의 `narration/record`와 `narration/timings`를 사용합니다. 웹 빌드는 녹음과 시각 파일을 생성하지 않습니다. 미디어는 Pages에서 제공합니다.

루트에서 `npm run dev:videos`, `npm run test --workspace @duvridge/toldlife-videos`, `npm run typecheck --workspace @duvridge/toldlife-videos`, `npm run test:e2e --workspace @duvridge/toldlife-videos`로 실행합니다. 오디오북과 영상은 `family-library:<작품 ID>:narration` 위치 하나를 공유합니다. 옛 `/audiobooks/watch/` 주소는 배포 조립 단계에서 새 영상 주소로 직접 301 이동합니다.
