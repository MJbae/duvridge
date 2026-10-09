# 오디오북 제작과 모노레포

제작 도구는 `tools/audiobook-production/src/`, 승인된 대본은 같은 제작 폴더의 `narration-scripts/`, 유료 생성 원본과 검수 기록은 `narration-clips/`에 있다. 원고·삽화·음악은 `content/books/bae-byunghee/`에서 읽는다. 웹 앱은 `apps/toldlife-audiobooks/`에 있으며 웹 빌드와 배포는 TTS를 호출하지 않는다.

| 설정 | 기본값 | 용도 |
| --- | --- | --- |
| `MEMOIR_CONTENT_ROOT` | `content/books/bae-byunghee` | 제작용 원고·삽화·음악 경로 |
| `ELEVENLABS_SCRIPT` | `~/.claude-work/skills/showreel/scripts/eleven.py` | 사용자 환경에 설치한 외부 ElevenLabs helper |
| `ELEVENLABS_ENV_FILE` | `tools/audiobook-production/.env` | `ELEVENLABS_API_KEY`가 들어 있는 로컬 키 파일 |
| `ELEVENLABS_API_KEY` | 설정 없음 | 셸에서 전달하면 키 파일보다 우선 사용 |

경로를 재정의할 때는 절대 경로를 사용한다. 외부 helper, API 키, 키 파일은 저장소와 웹 CI에 포함하지 않는다. 제작에는 Python, numpy, Pillow, ffmpeg와 macOS의 Apple SD Gothic Neo 글꼴이 필요하다.

## 작업 흐름

모노레포 루트에서 `cd tools/audiobook-production`으로 이동한다. `bash src/produce-audiobooks.sh <회차 ID…>`는 대본 작성, TTS·검수, MP3·MP4·SRT 조립을 수행하며 크레딧이 들 수 있다. 필요한 회차에만 실행한다. 생성된 웹 오디오는 다시 루트에서 `npm run narration:sync --workspace @duvridge/toldlife-audiobooks -- <회차 ID…>`로 반영한다. 이 명령은 `tools/audiobook-production/output/`를 읽으며 `--from` 또는 `NARRATION_SOURCE`로 결과물 경로를 바꿀 수 있다.

삽화 위치는 원고의 독립된 `<!-- illustration: ep01-01 -->` 표시가 정한다. 표시의 앞뒤를 빈 줄로 구분하고 다음 본문 문단 앞에 둔다. version 2 자산 목록에는 위치를 저장하지 않는다. 웹과 제작 파서는 표시의 현재 문단 위치를 계산하므로 윤문이나 앞 문단 삽입에 영향을 받지 않는다. 표시는 낭독·자막에 포함되지 않고 대본 줄 번호를 추가하지 않는다. `npm run test:production-parser`는 유료 호출 없이 이 동작을 확인한다.

삽화 ID는 기존 자산의 이름을 유지하는 식별자다. `ep01-01`과 `ep01-02` 사이에 새 `ep01-03` 표시를 넣어도 기존 ID·파일명을 바꾸지 않는다. 표시의 실제 원고 순서가 장면 순서다. 회차 카드의 대표 삽화는 자산 목록의 `representative: true`로 따로 정하며 본문 삽화 위치를 강제하지 않는다. 모든 등록 삽화는 소유 회차에서 한 번씩 사용하고 표시 뒤에 본문 문단을 둔다. 한 본문 문단 앞에는 삽화 표시를 하나만 둘 수 있다. 마지막 문단 뒤의 표시만으로 끝 음악 삽화를 바꾸는 기능은 지원하지 않는다.

제작 영상의 본문 장면은 실제 표시를 만난 시점부터 해당 삽화를 사용한다. 첫 표시 이전에는 기존 자막 배치를 유지한 어두운 단색 배경을 사용하여 뒤에서 등장할 대표 장면을 앞선 본문에 미리 붙이지 않는다. 낭독 문장·줄 번호·쉼·재생 길이는 변하지 않는다. 삽화 파일은 자산 목록의 승인된 최고 해상도 JPEG로 찾으며, 이름이 같은 과거 제작용 PNG를 대신 사용하지 않는다.

현재 오디오는 최신 정본으로 재생성할 예정이며 기존 녹음과의 일치율을 원고·삽화 편집의 제약으로 사용하지 않는다. 웹 빌드는 음성이나 SRT를 자동 재생성하지 않으며 문장 일치율로 실패하지 않는다. 새 녹음을 반영하는 `narration:sync`는 최신 원고에 없는 문장을 계속 거절한다.

실제 음성 제작은 별도로 요청된 작업에서 수행한다. 기존 녹음과 사람의 승인 기록을 재사용하려는 경우 `narration-scripts/`와 `narration-clips/`의 줄 번호·낭독 문장 해시를 확인한다. `output/`, `work/`, `voice-samples/`는 저장소에 넣지 않는다. 웹 낭독 MP3·SRT는 공개 가능하지만 제작 MP4와 가족 재무 자료는 공개하지 않는다.

## 유지할 동작

Rei 목소리, Eleven v4 모델, 시드 1936, 자동 재녹음 기본값 0, 받아쓰기 검수와 사람 승인 규칙을 유지한다. 웹 MP3는 1.0배속, 영상 MP4는 0.9배속이며 자막·쉼·음량·삽화 전환 규칙도 [제작 가이드](../tools/audiobook-production/README.md)를 따른다.

정본은 `content/books`에서 관리하고 코드 패키지는 콘텐츠 처리·읽기 UI·반응 저장·VitePress 연동으로 분리한다. 플레이어 막대·시트, 낭독 문장 표시, 자동 스크롤, 회차 이동 재생과 다음 화 이어 듣기는 오디오북 앱의 기존 동작을 유지한다. 웹 배포 정책은 [루트 README](../README.md)에서 관리한다.
