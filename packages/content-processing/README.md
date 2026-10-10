# content-processing

책의 Markdown과 자산 목록을 읽고, 검증하고, 리더 입력을 만드는 공통 Node.js 코드입니다. 원고·삽화·음악·참고 자료는 이 패키지에 두지 않습니다. 앱은 선택한 책의 경로와 `book.json` 설정을 넘깁니다.

- `src/manuscripts`: 회차·터전 제목 파싱과 책별 옛 ID 대응표 계산
- `src/illustrations`: 독립 삽화 표시 파싱과 자산 목록 검증
- `src/background-music`: 회차 음악 목록과 파일 검증
- `src/source-files`: 책 원본을 앱의 임시 입력으로 복사하고 이전 입력 정리
- `src/catalog`: 회차 페이지·목차·연결 자료 생성
- `src/assets`: 승인된 원본의 반응형 이미지·아이콘 인코딩

`materializeBookContent(appRoot, { source, book })`는 원본 경로를 명시적으로 받습니다. 앱의 `.book-content-inputs.json`으로 복사 목록을 관리하고 기존 `.memoir-content-manifest.json` 목록도 읽어 이전 입력을 안전하게 정리하며, 낭독 음성 `site/public/record/`와 시각 자료 `content/narration/`는 소유하거나 삭제하지 않습니다.

`prepareContent({ root, book, extendCatalog })`는 `manuscript.md`와 준비된 자산을 읽습니다. `book`을 생략하면 앱의 `content/book.json`을 읽습니다. 오디오북의 낭독 확장은 앱이 `extendCatalog`로 추가합니다.

회차 첫 줄의 독립된 `*때 · 곳*` 표기는 선택 사항입니다. 없으면 `time`은 빈 문자열이고 본문을 그대로 보존합니다. 연도·장소 형식의 터전 제목도 생략할 수 있으며, 사용하는 작품에는 기존 형식·순서 검증을 적용합니다. 삽화 목록은 일부 회차에만 이미지를 등록할 수 있지만 등록한 이미지와 원고 표시의 일치 검증은 유지합니다.

자산 인코딩은 `buildCoverAssets`, `buildIllustrationAssets`, `buildShareAssets`를 별도 명령으로 호출할 때만 수행합니다. 일반 웹 준비·빌드는 음성 생성이나 자산 재인코딩을 호출하지 않습니다. 공개 URL과 안정적인 삽화 ID는 책의 목록에서 유지합니다.

설치는 저장소 루트의 `npm ci`, 패키지 검증은 `npm test --workspace @duvridge/content-processing`로 실행합니다.
