# Memoir content

`@duvridge/memoir-content`는 최신 autobio-bae의 정본 원고·자료·삽화·음악을 보존한 단일 원본입니다. 원고는 `배병희_자서전.md`, 자료와 이미지 위치는 `content/`, 공개 자산은 `site/public/`에서 수정합니다. 두 서비스의 본문과 터전 구분은 항상 이 원본을 사용합니다.

앱의 `prepare:content`는 원본을 무시된 작업 사본으로 복사합니다. `.memoir-content-manifest.json`은 복사한 파일의 목록만 기록하며 삭제·이름 변경한 공통 파일을 다음 실행에서 지웁니다. 앱 자체의 `content/narration/`과 `site/public/record/`는 복사·삭제 대상이 아닙니다. 패키지에는 심볼릭 링크를 넣지 않습니다.

이미지 재생성 명령은 각 앱의 `assets:share`, `assets:cover`, `assets:episodes`에서 호출해도 이 패키지의 원본 자산에 씁니다. 생성 후 앱을 다시 빌드하면 두 서비스에 같은 결과가 적용됩니다. 기존 그림을 크기별로 인코딩하는 작업이며 새로운 이미지 생성 서비스를 호출하지 않습니다.

낭독 녹음은 기존 원고 버전이므로 최신 문장과 일부 다릅니다. `content/narration-compatibility.json`에는 이번 통합에서 검토한 2화 녹음만 등록합니다. 정본·MP3·SRT 해시와 일치 문장 수를 모두 확인하고, 실제 최신 본문과 정확히 일치하는 문장만 강조합니다. 이 예외는 다른 녹음이나 추후 변경으로 확장되지 않습니다.

검증: 저장소 루트에서 `npm test --workspace @duvridge/memoir-content`로 공통 입력 정리와 앱 전용 파일 보존을 확인합니다. 두 앱의 콘텐츠·화면·플레이어 검증은 각 앱 테스트 명령으로 실행합니다.
