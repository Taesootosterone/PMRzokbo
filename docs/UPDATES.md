# GitHub에서 다운로드하고 버튼으로 적용하기

v1.1.0부터 지원합니다. 앱을 `npm start`로 실행하면 시작 시와 기본 6시간마다 지정한 GitHub 브랜치를 확인해 새 코드만 내려받습니다. **예약 확인은 자동 적용하지 않습니다.** v1.2.0부터는 **리햅 업데이트.app을 더블클릭하면 확인·다운로드부터 적용까지 한 번에 진행**합니다. Mac 앱은 기존 웹 업데이터의 백업·빌드·실행 확인·실패 복구를 그대로 사용합니다. [Mac 앱 안내](MAC_APPS.md)를 참고하세요.

1. 오른쪽 위 **⚙ 설정**을 엽니다.
2. **앱 업데이트** 탭의 **GitHub 업데이트**에서 현재 버전과 내려받은 버전·커밋을 봅니다.
3. 필요하면 **업데이트 확인·다운로드**를 눌러 다시 확인합니다.
4. 작성 중인 문항·메모를 저장하고 **업데이트 적용**을 누릅니다.
5. 별도 폴더에서 의존성 설치와 빌드를 마친 뒤 서버를 잠시 중지하고 전체 백업을 만듭니다. 새 서버 실행과 버전 응답까지 확인되면 브라우저를 새로고침합니다.

설치/빌드 중에는 기존 앱이 유지됩니다. 빌드가 실패하면 기존 서버를 멈추지 않습니다. 새 서버가 정상 응답하지 않으면 이전 코드를 다시 시작합니다. UI에 성공·실패·복구 상태가 표시됩니다. 다른 창의 저장하지 않은 입력은 자동 보관하지 않으므로 적용 전에 저장 완료를 확인하세요.

## 최초 한 번 준비할 것

이 업데이트 기능이 없는 이전 설치본은 먼저 v1.1.0을 수동 설치해야 합니다. 앱 중지 후 코드만 갱신하고 `.env.local`과 코드 밖의 사용자 데이터는 보존하세요.

```sh
cd "$HOME/Projects/PMRzokbo"
npm ci
npm run build
npm start
```

Git과 tar가 필요합니다. macOS에 tar는 기본 제공됩니다. `git --version`으로 Git을 확인하고 설치 안내가 나오면 macOS 명령줄 도구 설치를 마치세요. macOS에서 Git을 새로 설치해야 할 때 `xcode-select --install`을 사용할 수 있습니다. 앱의 일반 문제 풀이와 백업은 Git 없이도 동작하지만 업데이트 확인은 실패합니다.

기본 원본은 **`Taesootosterone/PMRzokbo`의 `main`**입니다. GitHub 저장소 최상위에 `package.json`, `package-lock.json`, `pmrzokbo.json`, `app/`, `lib/`, `scripts/` 등 프로젝트 파일이 있어야 합니다. ZIP 파일만 있거나 프로젝트가 한 단계 더 안에 들어 있으면 업데이트 소스로 사용할 수 없습니다. `node_modules`, `.next`, `.env.local`, 개인 데이터와 백업은 GitHub에 올리지 마세요.

**업데이트 원본은 이 저장소의 `main` 브랜치입니다.** 이후 수정 코드를 main에 푸시하면 앱에서 받을 수 있습니다. 버전 번호가 같아도 커밋이 다르면 새 코드로 구분하므로 GitHub에 올린 커밋과 화면의 짧은 ID를 비교하세요. 클라우드 환경을 게시하는 동작과 GitHub의 코드 커밋·푸시는 별개입니다.

GitHub Desktop을 쓴다면 압축을 푼 프로젝트 파일을 저장소에 넣고 main으로 커밋·푸시하세요. 이미 Git으로 관리하는 작업 폴더는 기존 원격 설정을 그대로 사용합니다. **`.git`이 없는 새 ZIP 폴더를 빈 저장소에 처음 올릴 때만** 다음 절차를 사용할 수 있습니다.

```sh
cd "$HOME/Projects/PMRzokbo"
git init -b main
git add .env.example .gitignore .node-version README.md package.json package-lock.json pmrzokbo.json tsconfig.json next-env.d.ts next.config.ts playwright.config.ts app components lib scripts test docs examples
git commit -m "Add PMRZokbo 1.1.0 with GitHub updater"
git remote add origin https://github.com/Taesootosterone/PMRzokbo.git
git push -u origin main
```

Git 사용자 정보와 저장소 쓰기 인증은 본인 Mac의 Git/GitHub 설정을 사용합니다. 위 커밋 목록에는 사용자 DB·이미지 저장 폴더·`.env.local`·백업·`node_modules`·`.next`를 넣지 않습니다.

### 비공개 저장소

이 앱은 실행하는 Mac의 기존 HTTPS Git 인증을 사용합니다. 원시 토큰을 앱이나 채팅에 넣을 필요가 없습니다. 그 Mac에서 아래 읽기 명령이 작동해야 합니다.

```sh
git ls-remote https://github.com/Taesootosterone/PMRzokbo.git refs/heads/main
```

비공개 저장소라 인증이 필요하면 Git credential helper를 설정하거나 GitHub CLI를 설치한 뒤 `gh auth login`, `gh auth setup-git`으로 본인 계정의 읽기 권한을 준비하세요. 앱에서는 인증 창을 띄우지 않고 실패 원인을 안내합니다. GitHub 연결에 성공했다고 다른 저장소/API/푸시 권한까지 확인한 것은 아닙니다.

### 원본 설정

최초 설치 폴더의 기존 `.env.local`에 필요한 항목만 추가하고 재시작하세요.

```dotenv
PMRZ_UPDATE_REPOSITORY=Taesootosterone/PMRzokbo
PMRZ_UPDATE_BRANCH=main
PMRZ_AUTO_UPDATE_CHECK=1
PMRZ_UPDATE_CHECK_HOURS=6
```

`PMRZ_AUTO_UPDATE_CHECK=0`이면 자동 확인·다운로드를 끄고 설정 버튼만 사용합니다. 자동 확인 간격은 `PMRZ_UPDATE_CHECK_HOURS`로 1~168시간 중 지정합니다. 새 커밋을 바로 확인하려면 수동 확인 버튼을 누르세요. 원본 주소나 명령을 웹 요청으로 임의 변경할 수 없습니다. PMRtest 저장소는 원본으로 거부하고 프로젝트 식별자도 검사합니다.

개발은 원본 폴더의 `npm run dev`로 합니다. 개발 모드는 업데이트를 적용하지 않으며 로컬 편집 코드를 사용합니다. 운영 `npm start`는 마지막으로 정상 적용된 버전을 실행합니다. 같은 데이터 경로를 사용하는 개발/운영 서버는 동시에 실행할 수 없습니다.

## 코드·설정·데이터 보존

최초 설치한 폴더는 실행 진입점이며 `.git`·로컬 수정·`.env.local`을 자동으로 덮어쓰지 않습니다. 업데이트는 사용자 데이터 폴더 아래 별도 공간에 보관합니다.

```text
PMRZokbo 데이터 경로/
├── bank.sqlite                 # 기존 사용자 DB
├── images/                     # 기존 이미지
├── .launcher.lock              # 업데이트 중에도 유지되는 실행 잠금
├── .server.lock
└── updates/
    ├── downloads/<커밋>/       # 아직 실행하지 않은 소스
    ├── releases/<커밋>/        # 의존성 설치·빌드가 완료된 실행본
    ├── backups/*.pmrz          # 적용 직전 자동 전체 백업
    ├── active.json             # 다음 실행 버전
    ├── pending.json            # 재시작 확인 중에만 존재
    ├── state.json
    └── npm-cache/
```

이전 실행본은 실패 복구를 위해 보존합니다. 각 버전의 의존성 때문에 디스크 공간이 늘어납니다. 이 버전에는 자동 정리 기능이 없으므로 실행 중인 `releases/`나 `active.json`을 임의 삭제하지 마세요. 업데이트를 적용할 디스크 공간과 npm 패키지를 받을 네트워크 접근이 필요합니다. 설치/빌드는 각각 최대 10분, 새 서버 확인은 기본 60초까지 기다립니다.

데이터는 그대로 사용합니다. **실패 복구는 코드만 이전 버전으로 되돌리며 사용자 DB를 자동으로 과거 백업으로 덮어쓰지 않습니다.** 적용 전 자동 백업에는 DB·이미지·기록·별표·메모·개념/노트 연결·진행 상태가 포함됩니다. 그 백업이 필요하면 앱을 중지하고 README의 전체 복원 절차를 사용하세요.

전체 `.pmrz` 백업에는 업데이트 코드·Git 인증·개인 실행 설정은 들어가지 않습니다. 새 Mac에는 최신 앱 코드와 `.pmrz` 백업을 함께 가져가고 인증/주소/포트는 새 Mac에 맞게 설정하세요. `.env.local`을 원격 코드에서 가져오거나 비밀 값을 복사하지 않습니다.

처음 설치한 실행 진입점의 프로토콜은 `launcherProtocol: 1`입니다. 업데이트된 앱의 supervisor도 함께 갱신됩니다. 향후 실행 프로토콜 자체가 바뀌면 수동 설치가 필요할 수 있으며, 현재는 프로토콜 1·DB 스키마 1인 앱만 허용합니다. 알 수 없는 DB 마이그레이션과 NOAH 통합은 자동 수행하지 않습니다.

## 다운로드 검증과 적용 경계

- 브랜치에서 확인한 정확한 커밋을 받아 Git 객체 검증과 소스 SHA-256 목록을 확인합니다. 다운로드 후 코드가 바뀌면 적용하지 않습니다.
- 코드 다운로드 단계에서는 새 코드의 `npm` 스크립트를 실행하지 않습니다. 사용자가 적용을 눌러야 의존성 설치·빌드를 실행합니다.
- 개인 설정·DB·백업·빌드 캐시·심볼릭 링크·서브모듈·경로 탈출·대소문자만 다른 중복 파일을 거부합니다. 소스는 100MB/20,000파일 이하입니다.
- 서버는 브라우저가 보낸 임의 명령을 실행하지 않습니다. 고정된 설치·빌드 절차와 사용자가 확인한 커밋만 받으며 다른 Origin의 변경 요청을 거부합니다.
- GitHub TLS와 npm 패키지 무결성 검사를 끄지 않습니다. 코드는 설정된 본인 저장소를 신뢰하는 모델이며 별도 서명된 릴리스/서명 키 검증 체계는 이 버전에 없습니다. 알려진 본인 저장소만 지정하세요.

## 검증 범위

초기 구현 검증은 원격 저장소에 코드가 올라가기 전에 진행했습니다. 격리된 로컬 Git 저장소를 Git 전송 설정으로 연결한 테스트에서 **자동 다운로드만 수행**, **브라우저 버튼 적용**, **의존성 설치·실제 Next 빌드**, **버전 전환·브라우저 새로고침**, **빌드 실패 시 기존 앱 유지**, **실행 실패 시 이전 버전 재시작**, **데이터·이미지·기록 유지**를 확인했습니다.

2026-11-11에 프로젝트 소스를 실제 GitHub `main`에 올렸습니다. 이후 제품의 `GitHubSource`로 원격 커밋 조회·해당 커밋 다운로드·v1.1.0 식별·소스 무결성 확인까지 통과했습니다. 자세한 실행 결과는 [검증 기록](VALIDATION.md)에 남깁니다. 실제 macOS/Safari·각 Mac의 비공개 GitHub 인증·대규모 자료와 전원 장애 상황은 별도 확인이 필요합니다.
