# 오디오북 제작과 모노레포

제작 도구는 `apps/autobio-audiobook/tools/`, 승인된 대본은 `scripts/`, 유료 생성 원본과 검수 기록은 `clips/`에 있다. 원고·삽화·음악은 `packages/memoir-content/`에서 읽는다. 웹 빌드와 배포는 TTS를 호출하지 않는다.

| 설정 | 기본값 | 용도 |
| --- | --- | --- |
| `MEMOIR_CONTENT_ROOT` | 모노레포의 `packages/memoir-content` | 제작용 공유 원고·삽화·음악 경로 |
| `ELEVENLABS_SCRIPT` | `~/.claude-work/skills/showreel/scripts/eleven.py` | 사용자 환경에 설치한 외부 ElevenLabs helper |
| `ELEVENLABS_ENV_FILE` | `apps/autobio-audiobook/.env` | `ELEVENLABS_API_KEY`가 들어 있는 로컬 키 파일 |
| `ELEVENLABS_API_KEY` | 설정 없음 | 셸에서 전달하면 키 파일보다 우선 사용 |

경로를 재정의할 때는 절대 경로를 사용한다. 외부 helper, API 키, 키 파일은 저장소와 웹 CI에 포함하지 않는다. 제작에는 Python, numpy, Pillow, ffmpeg와 macOS의 Apple SD Gothic Neo 글꼴이 필요하다.

## 작업 흐름

모노레포 루트에서 `cd apps/autobio-audiobook`으로 이동한다. `bash tools/run_all.sh <회차 ID…>`는 대본 작성, TTS·검수, MP3·MP4·SRT 조립을 수행하며 크레딧이 들 수 있다. 필요한 회차에만 실행한다. 생성된 웹 오디오는 `web/`에서 `npm run narration:sync -- <회차 ID…>`로 반영한다. 이 명령은 서비스의 `out/`를 읽으며 `--from` 또는 `NARRATION_SOURCE`로 결과물 경로를 바꿀 수 있다.

원고 변경만으로 기존 대본·녹음을 일괄 재생성하지 않는다. `scripts/`와 `clips/`는 동일한 줄 번호와 낭독 문장 해시를 유지해야 기존 녹음과 사람의 승인 기록을 재사용할 수 있다. `out/`, `work/`, `voices/`는 저장소에 넣지 않는다. 웹 낭독 MP3·SRT는 공개 가능하지만 제작 MP4와 가족 재무 자료는 공개하지 않는다.

## 유지할 동작

Rei 목소리, Eleven v4 모델, 시드 1936, 자동 재녹음 기본값 0, 받아쓰기 검수와 사람 승인 규칙을 유지한다. 웹 MP3는 1.0배속, 영상 MP4는 0.9배속이며 자막·쉼·음량·삽화 전환 규칙도 [제작 가이드](../apps/autobio-audiobook/README.md)를 따른다.

공통 목차와 자서전 내용은 공유 패키지에서 최신 autobio-bae 기준으로 관리한다. 플레이어 막대·시트, 낭독 문장 표시, 자동 스크롤, 회차 이동 재생과 다음 화 이어 듣기는 오디오북 서비스의 기존 동작을 유지한다. 웹 배포 정책은 [루트 README](../README.md)에서 관리한다.
