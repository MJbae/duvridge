# 모노레포 CI/CD 정책

## 배포 단위와 변경 영향

`services.json`이 서비스 경로·워크스페이스·검증 명령·공개 경로·Cloudflare 프로젝트의 단일 목록이다. `scripts/affected.mjs`는 Git의 변경 파일과 각 워크스페이스 `package.json`의 내부 의존성을 읽는다. 공유 패키지 변경은 직접 소비자와 간접 소비자로 전파한다. 이름 변경은 이전 경로와 새 경로를 모두 검사하고, 삭제 파일도 검사한다. 비교 기준 커밋을 찾을 수 없으면 전체 검증으로 전환한다.

| 변경 | 영향받는 서비스 | 운영 빌드·배포 |
| --- | --- | --- |
| 회사 HTML·번역·CSS | company | duvridge만 |
| ToldLife 홈 | toldlife | ToldLife 전체 |
| 소설 전용 코드 | autobio-bae | ToldLife 전체 |
| 오디오 전용 코드·음성·SRT | autobio-audiobook | ToldLife 전체 |
| 공통 원고·독자 UI | 의존성 그래프의 두 소비자 | ToldLife 전체 |
| 회사의 공통 brand/social 자산 | company, toldlife | 두 프로젝트 |
| 루트 lockfile·도구·워크플로·저장소 테스트·서비스 목록 | 전체 | 두 프로젝트 |
| 루트/워크스페이스 README·docs, 오디오 제작 도구만 | 없음 | 배포 없음 |

워크스페이스 최상위 `README.md`와 `docs/`는 실행 코드에서 참조하지 않는 문서 전용 영역이다. 서비스 본문의 Markdown은 `site/`, `content/` 또는 공유 콘텐츠 패키지에 두므로 변경 영향에서 제외하지 않는다.

`duvridge` 프로젝트와 `toldlife` 프로젝트는 각각 독립 배포한다. `/novels/`와 `/audiobooks/`는 같은 `toldlife` 프로젝트 안에 있으므로 홈·두 서비스를 함께 조립한 **완전한 스냅샷**만 업로드한다. 한 서비스 폴더만 업로드하면 다른 서비스 파일이 배포에서 사라질 수 있다. 영향 분석은 배포할 프로젝트를 줄이고, 같은 프로젝트 내부의 파일은 모두 보존한다. 이 프로젝트 단위는 Cloudflare Direct Upload가 폴더의 미리 빌드된 자산을 배포한다는 모델에 맞춰 정했다. [Cloudflare Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)

서비스 규모가 늘면 별도 도메인/프로젝트가 필요한 서비스는 새로운 `deployGroups`에 등록한다. 같은 프로젝트에 경로를 추가하는 경우 해당 그룹의 조립 명령과 전체 스냅샷 검사를 함께 확장한다. 별도 저장소의 최신 브랜치를 빌드 도중 가져오는 방식은 사용하지 않는다.

## Pull request와 운영 배포

`.github/workflows/ci.yml`은 모든 PR과 main push에서 시작한다. 필수 워크플로 자체에 경로 필터를 걸지 않고 내부의 서비스 매트릭스를 줄인다. 이렇게 해야 문서만 바꾼 PR에서도 필수 체크가 완료된다. 경로 필터로 워크플로를 건너뛰면 필수 체크가 Pending으로 남을 수 있다는 GitHub 안내를 따른다. [필수 상태 체크와 건너뛴 워크플로](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks)

1. 체크아웃은 모두 `github.sha`로 고정한다. PR은 해당 테스트 대상 SHA, 운영은 main 이벤트의 SHA를 검증한다.
2. 루트 `npm ci`와 단일 `package-lock.json`으로 설치한다. 잠금 파일이 manifest와 다르면 설치가 실패하며 CI에서 잠금 파일을 갱신하지 않는다. [npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci/)
3. 저장소의 영향 분석·조립 테스트와 단일 정본 Firebase 규칙의 Firestore 에뮬레이터 검사를 항상 실행한다. Java 21과 demo 프로젝트를 사용하며 운영 Firebase에는 쓰지 않는다. PR은 영향받은 서비스만, main은 영향받은 배포 그룹의 모든 서비스를 테스트하고 빌드한다.
4. 소설/오디오북은 콘텐츠 테스트, 운영 경로 빌드, 공유 메타데이터 테스트, 타입 검사를 수행한다. 오디오북은 휴대폰·데스크톱 낭독 상호작용 E2E도 실행한 뒤 운영 경로로 다시 빌드한다.
5. `Monorepo required`가 계획·저장소 테스트·전체 서비스 매트릭스의 성공을 확인한다. 서비스가 없는 변경은 명시적인 skipped 결과를 허용한다. 브랜치 보호의 필수 상태 체크로 이 이름을 지정한다.
6. main과 수동 main 실행만 검증한 아티팩트를 배포한다. PR에는 Cloudflare 토큰을 전달하지 않는다. 수동 실행은 전체 그룹을 검증·배포하므로 누락된 운영 갱신 복구에도 사용한다.

서비스 빌드 결과는 경로를 보존하는 tar 아티팩트로 전달한다. 운영 배포에서는 같은 실행의 아티팩트만 복원하고, ToldLife 조립 전에 두 서비스의 홈·대표 회차·필수 음원·canonical base를 확인한다. 25 MiB 파일 제한, 20,000개 파일 제한, 공개 폴더의 환경 설정 파일도 검사한다. [Cloudflare 업로드 제한](https://developers.cloudflare.com/pages/get-started/direct-upload/#limits)

## 동시 실행, 비밀값, 검증과 복구

운영 배포는 프로젝트별 concurrency 그룹으로 직렬화하고 진행 중인 업로드를 취소하지 않는다. 서로 다른 프로젝트의 배포는 병렬로 진행할 수 있다. 업로드 직전·직후 원격 main SHA를 비교한다. 오래된 실행은 업로드를 건너뛰고 현재 main의 전체 재검증을 예약한다. 업로드 중 main이 바뀌어도 최신 main 실행을 예약한다. concurrency의 보류 실행 교체는 GitHub의 기본 동작이므로, 프로젝트를 갱신하는 후속 실행은 해당 프로젝트 전체를 조립한다. [GitHub concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)

루트 저장소에 secret `CLOUDFLARE_API_TOKEN`, variable `CLOUDFLARE_ACCOUNT_ID`, 공개 Firebase variable `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`를 등록한다. Cloudflare 토큰은 해당 계정의 Pages Edit 권한을 부여한 배포 전용 토큰을 사용하며 업로드 단계에만 전달한다. [Cloudflare CI 자격 증명](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/)

공개 `deployment.json`의 `sourceRevision`으로 실제 배포한 커밋을 확인한다. `scripts/smoke-deployment.py`는 이 SHA, 각 서비스·회사 언어·가이드북 URL, 정적 자산, 음원 Range 응답을 확인한다. 브라우저 검증 도구는 화면과 오디오 상호작용을 추가로 확인할 수 있다. 배포 실패 시 기존 프로젝트 배포를 유지하고 원인을 수정한 뒤 main 수동 실행으로 재시도한다. 긴급 복구는 검증했던 이전 전체 스냅샷을 Cloudflare에서 rollback하거나 해당 코드로 다시 배포한다. [Cloudflare rollback](https://developers.cloudflare.com/pages/configuration/rollbacks/)

## 단일 배포 권한으로 전환

구 저장소의 ToldLife 호출 워크플로를 비활성화하고 이미 실행 중인 호출도 종료한 뒤 모노레포를 배포한다. 회사 프로젝트의 Cloudflare Git 자동 빌드도 비활성화하여 GitHub Actions만 업로드하게 한다. 이전 `exit 0` + 저장소 루트 공개 설정은 모노레포에서 소스 폴더를 공개하거나 검증한 결과를 덮어쓸 수 있다. Git 연결 자체는 보존할 수 있지만 운영·미리보기 자동 배포는 꺼야 한다. Git 연동 프로젝트도 Wrangler 업로드가 가능하다. [Git 연동 프로젝트의 수동 업로드](https://developers.cloudflare.com/pages/get-started/direct-upload/)

구 GitHub Pages URL은 이전 배포를 보존하는 호환 주소다. 서비스의 신규 개발과 Cloudflare 운영 배포는 이 모노레포가 기준이다. 신규 서비스도 별도의 레포 호출 워크플로 대신 `services.json`과 내부 패키지 의존성으로 등록한다. npm workspaces는 루트 설치에서 로컬 패키지를 자동 연결하고 `--workspace`로 서비스 명령을 실행할 수 있어 현재 구성에 적합하다. 원격 빌드 캐시와 대규모 작업 그래프가 필요해지면 이 목록과 경계를 유지한 채 Turborepo/Nx를 도입할 수 있다. [npm workspaces](https://docs.npmjs.com/cli/using-npm/workspaces/), [Cloudflare 모노레포 안내](https://developers.cloudflare.com/pages/configuration/monorepos/)
