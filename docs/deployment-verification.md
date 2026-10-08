# 모노레포 배포 검증

2026-10-08~09 KST에 기존 프로젝트를 npm workspaces 모노레포로 이관했다. 소스 원본 두 경로는 수정하지 않았다. 운영 배포는 GitHub Actions 실행 결과 확인 후 아래에 추가한다.

## 사전 검증

- 변경 영향·포털 JavaScript 검사 10건, 완전한 ToldLife 조립 Python 검사 4건 통과.
- 회사 홈페이지 검사 6건, 공유 입력 삭제·보존 검사 2건 통과.
- 웹소설 콘텐츠 25건, 오디오북 콘텐츠·낭독·플레이어 47건 통과. 양쪽 타입 검사와 운영 경로 빌드 통과.
- 웹소설 E2E 전체 105건 통과. 오디오북 전체 실행에서 125건 통과 후, 최신 본문 문장 좌표 수정의 세 화면 재검증 3건 통과. 고유 사례 127건 검증, 모바일 새 탭 2건은 기존 명시적 제외.
- actionlint v1.7.12로 `.github/workflows/ci.yml` 구문 검사 통과.
- 원본 MP3·SRT·제작 대본·승인된 녹음 캐시 74개가 원본과 바이트 단위로 동일하다. [보존 해시](migration-audio-preservation.json).

## 실제 미리보기 배포

| Pages 프로젝트 | 실제 배포 주소 | 확인 |
| --- | --- | --- |
| duvridge | https://69be9706.duvridge.pages.dev | 5개 언어, 가이드북 2경로, 자산·공유 metadata, 휴대폰 화면 |
| toldlife | https://d3c047d8.toldlife.pages.dev | 홈, 두 서비스 52회차 경로, MP3 4개, 404, 휴대폰·데스크톱 상호작용 |

미리보기는 이관 중 작업 트리로 올린 스냅샷이다. 공개 marker의 원래 HEAD는 `8d17cddb53fbccf7903a7a773193101e01f72c79`, `sourceDirty=true`이며 운영 커밋 확인용으로 사용하지 않는다.

`verify-deployment.mjs`는 두 앱의 터전 목차와 최신 2화 본문이 동일한지 확인했다. 오디오 플레이어의 재생·일시정지·1.25배 속도·다음 문장 이동·펼친 화면·가로 넘침도 검사했다. 스크린샷과 JSON은 로컬 `.deploy/verification-preview-company`, `.deploy/verification-preview-toldlife`에 있다. `smoke-deployment.py`의 HTTP·자산 검증도 통과했다. 초기 검증의 느린 플레이어 활성화 대기는 음성 요소가 준비될 때까지 기다리도록 보완했고 재실행이 통과했다.

## 배포 실행자 전환

- `MJbae/bae-memoir`와 `MJbae/autobio-audiobook`의 ToldLife 호출 워크플로를 `disabled_manually`로 변경했다. 진행 중인 호출은 없었다.
- 회사 Pages 프로젝트의 Git 연결은 보존하면서 `production_deployments_enabled=false`, `preview_deployment_setting=none`, `deployments_enabled=false`를 적용하고 GET으로 재확인했다.
- 구 GitHub Pages 워크플로는 이전 버전 주소를 위해 유지한다. 새 Cloudflare 배포는 모노레포 Actions만 실행한다.

## 보존 범위와 제한

최신 정본과 기존 녹음의 문장이 일부 다르다. 본문은 최신 원고, 음성·SRT는 기존 원본을 사용한다. 정확히 일치하는 문장만 강조한다. 본문 문장 매칭은 프롤로그 9/15, 1화 18/32, 2화 12/27, 3화 21/32다. 2화 예외는 정본·MP3·SRT 해시와 매칭 수 모두에 제한되어 있으며 임의의 후속 변경을 허용하지 않는다. 재녹음이나 유료 API는 호출하지 않았다.

Cloudflare 미리보기의 MP3 Range 요청은 전체 파일 HTTP 200으로 응답했다. 파일 해시는 원본과 동일하며 실제 Chromium 재생·배속·문장 이동은 정상이다. 검증한 웹 화면 크기는 320px, 390px 및 1440px이다. 실제 iOS Safari 하드웨어 검증은 포함하지 않는다.
