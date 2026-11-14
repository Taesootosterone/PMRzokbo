# 리햅 · PMRZokbo

맥미니에서 독립 실행하는 개인용 재활의학 문제은행입니다. 한국어 화면으로 **단원별 학습 → 문제 풀이 → 해설 → 관련 개념 → 오답 복습**을 제공합니다. 맞춤 시험은 단원·시험 종류·연도·풀이 상태로 구성합니다. UI와 코드는 새로 작성했습니다.

**PMRtest/NOAH와 별도 프로젝트입니다.** NOAH의 소스·노트·DB·설정·백업을 수정하거나 공유하지 않습니다. NOAH를 중지해도 문제은행과 개념별 문제 목록은 동작합니다. 이번 범위에 두 앱의 실제 통합은 포함하지 않습니다.

**처음 사용하는 분을 위한 설명서:** [Word 다운로드](https://github.com/Taesootosterone/PMRzokbo/blob/main/docs/manual/PMRZokbo_User_Guide_v1.2.0.docx?raw=true) · [PDF 보기](docs/manual/PMRZokbo_User_Guide_v1.2.0.pdf). 앱 v1.2.0 기준 17쪽이며, 실행·자동 시작·Tailscale·문항 등록·학습·오답 복습·백업·복원·업데이트를 실제 데모 화면으로 설명합니다. [설명서 안내](docs/manual/README.md)에서 파일을 다시 찾을 수 있습니다.

## 1. 맥미니 최초 설치

Node.js **24 LTS**를 [공식 설치 프로그램](https://nodejs.org/)으로 설치하세요. 기본 앱 실행에 Homebrew·Docker·별도 SQLite 설치는 필요 없습니다. **GitHub 업데이트 기능에는 Git도 필요**합니다. 이 프로젝트의 파일을 NOAH와 다른 폴더(예: `~/Projects/PMRzokbo`)에 저장하세요. 아래 명령은 이 버전의 코드가 해당 폴더에 있다는 전제입니다.

```sh
cd "$HOME/Projects/PMRzokbo"
node --version             # v24.x 확인
npm ci
npm run build
npm start
```

브라우저 주소: **http://127.0.0.1:4310**. 중지: 실행한 터미널에서 **Ctrl+C**.

이후 실행은 같은 폴더에서 `npm start`만 하면 됩니다. 개발 시에는 `npm run dev`를 사용합니다. 처음에는 문항이 없습니다. ‘문항 관리 → 새 문항 등록’으로 시작하거나 ‘단원별 학습 → 데모 문항으로 둘러보기’를 누르세요. 데모 2개는 직접 작성한 예시로, 실제 기출이 아닙니다. `npm run demo`도 동일하게 추가하며 여러 번 실행해도 중복되지 않습니다.

### v1.2: 전용 Mac 앱으로 열기·업데이트

**기존 v1.1 사용자는 웹의 톱니바퀴 → 앱 업데이트 → 업데이트 확인·다운로드 → 업데이트 적용을 이번에 한 번 실행하세요.** 새 버전이 정상 시작되면 현재 사용자의 `~/Applications/`에 **리햅 열기.app / 리햅 업데이트.app / 리햅 중지.app / 리햅 상태.app**을 자동으로 만듭니다. Finder에서 **이동 → 홈 → Applications**로 들어가세요. 누락된 경우 웹 설정의 **Mac 앱 설치/복구**를 누릅니다.

이후 **리햅 업데이트.app을 더블클릭**하면 GitHub main 확인 → 다운로드 → 의존성 설치·빌드 → DB·이미지 전체 백업 → 재시작 → 완료 안내를 한 번에 진행합니다. 웹 업데이트 버튼도 계속 쓸 수 있습니다. 업데이트 앱을 실행하지 않았을 때는 종전처럼 새 코드 확인·다운로드까지만 자동으로 합니다.

‘리햅 열기’는 서버를 백그라운드로 시작하고 브라우저를 엽니다. 이미 실행 중이면 그 서버를 그대로 사용합니다. **지금 터미널에서 켜 둔 서버를 백그라운드 실행으로 바꾸려면 ‘리햅 중지’ → ‘리햅 열기’를 한 번 실행하세요.** 이후 터미널 창을 계속 열어 둘 필요가 없습니다. 브라우저를 닫아도 서버는 동작하고 ‘리햅 중지’로 종료합니다. macOS 로그인 시 자동 시작이나 절전 방지는 설정하지 않습니다.

처음부터 이 소스를 설치했다면 `npm run mac:setup` 또는 `mac/처음설정.command` 더블클릭으로 설치할 수도 있습니다. NVM의 Node 24도 찾으며 Finder 실행용으로 **현재 Node 24의 절대 경로**를 기억합니다. 현재 데이터 폴더·포트·`PMRZ_HOST=0.0.0.0` 등도 유지합니다. [Mac 앱 설치·복구·Tailscale 안내](docs/MAC_APPS.md)를 참고하세요.

### 포트·데이터 경로 변경

처음 설정이 필요할 때만 `.env.example`을 `.env.local`로 복사해 편집하세요. 이미 있는 `.env.local`은 덮어쓰지 마세요.

```dotenv
PMRZ_PORT=4310
PMRZ_HOST=127.0.0.1
# 필요할 때만, 자신의 실제 절대 경로로 지정
# PMRZ_DATA_DIR=/Users/your-name/Library/Application Support/PMRZokbo
```

설정 변경 후 서버를 재시작합니다. 임시 포트 변경 예: `PMRZ_PORT=4312 npm start`. NOAH 기본 `3000`과 다르지만 실제 NOAH의 사용 포트는 직접 확인하세요. 이미 사용 중인 포트라면 이 앱의 포트를 바꾸세요. 다른 앱을 종료시키지 않습니다.

아이패드·아이폰은 같은 신뢰할 수 있는 개인 LAN에서 `.env.local`의 `PMRZ_HOST=0.0.0.0`으로 변경하고 재시작한 뒤 `http://맥미니의-LAN-IP:4310`으로 접속할 수 있습니다. 기기에서 `127.0.0.1`은 맥미니가 아닙니다. 개인 단일 사용자 앱으로 계정·접근 제어가 없으므로 공용망이나 인터넷에 공개하지 마세요. 필요 시 macOS 로컬 네트워크/방화벽 허용을 확인합니다.

## 2. 데이터는 코드 폴더 밖에 보관

| 항목 | 기본 위치 |
| --- | --- |
| macOS 전체 데이터 | `~/Library/Application Support/PMRZokbo/` |
| Linux 전체 데이터 | `~/.local/share/pmrzokbo/` |
| DB | 데이터 경로의 `bank.sqlite` (실행 중 `-wal`, `-shm` 동반 가능) |
| 문제·해설 이미지 | 데이터 경로의 `images/` |
| 실행 잠금 | 데이터 경로의 `.server.lock`, `.launcher.lock` |

DB에는 문항, 개념, 다대다 연결, 각 시도, 제출 당시 문항 사본, 별표, 메모, 진행 중인 시험과 선택 답이 들어갑니다. 이미지는 원본 바이트를 SHA-256 파일명으로 저장합니다. 제목과 문제번호가 바뀌어도 문항 ID는 유지됩니다. 이미지는 변경본을 새 파일로 보관하며 기존 이미지는 자동 삭제하지 않습니다. 업로드 후 등록을 취소한 이미지도 남을 수 있습니다.

코드 업데이트·앱 재시작·브라우저 창 닫기는 데이터를 초기화하지 않습니다. 브라우저 localStorage가 아닌 서버 SQLite에 저장합니다. 답을 누른 뒤 **‘서버에 저장 완료’**를 확인하세요. 저장 실패 시 경고가 나오며 성공한 것처럼 표시하지 않습니다. 메모는 별도의 **‘메모 저장’** 버튼으로 저장합니다. 같은 데이터 폴더를 두 서버가 동시에 사용하지 마세요. `.env.local`도 코드 갱신 시 보존해야 합니다.

**v1.1.0부터 GitHub 업데이트를 지원합니다.** 앱 시작 시와 기본 6시간마다 새 코드를 자동 확인·다운로드하고 **톱니바퀴 → 설정 → 앱 업데이트 → 업데이트 적용** 또는 v1.2의 **리햅 업데이트.app**으로 설치·빌드·전체 백업·재시작합니다. 직접 확인하려면 ‘업데이트 확인·다운로드’를 누르세요. 기존 코드 폴더와 `.env.local`을 덮어쓰지 않고 데이터 경로의 `updates/releases/`에서 새 버전을 실행합니다. 자세한 최초 설정·비공개 저장소 인증·복구는 [GitHub 업데이트 안내](docs/UPDATES.md)를 참고하세요.

자동 업데이트가 없던 이전 앱은 이 버전의 코드를 한 번 수동으로 설치해야 합니다. 기존 앱 중지 → `.env.local` 보존 → 이 프로젝트 코드만 갱신 → `npm ci` → `npm run build` → `npm start`. 이후에는 최초 설치한 폴더에서 계속 `npm start`를 사용하세요. NOAH 폴더나 사용자 데이터 폴더를 새 코드로 덮어쓰지 않습니다. DB 스키마는 `PRAGMA user_version=1`이며 자동 업데이트도 동일 스키마만 받습니다. 향후 DB 마이그레이션은 별도 설계가 필요합니다.

## 3. 문항 등록과 학습

**문항 관리 → PPTX 자동 가져오기**에서 **v1.4.0부터 PPTX만 올리면 앱 내부에서 PDF를 생성·저장하고 그 PDF로 분석을 이어갑니다.** 별도 문서 프로그램 설치나 PDF 준비가 필요 없습니다. 생성 PDF는 화면에서 열거나 다운로드할 수 있고 코드 밖의 데이터 경로에 보관합니다. PPTX의 구조·노트·정답 표시도 함께 읽으며 이미지형 슬라이드는 로컬 OCR로 분석합니다. 검토한 문항만 등록하고 같은 원본 문항은 중복 등록하지 않습니다. 입력은 256MiB·1,200장까지입니다. 지원 범위·일부 복잡한 개체의 수동 PDF 대안·저장 위치는 [PPTX 가져오기 안내](docs/PPT_IMPORT.md)에 정리했습니다. 위 Word/PDF 설명서는 v1.2.0 기준이므로 새 PPT 기능은 이 별도 안내를 따르세요.

**v1.3.1**은 반복되는 문항 번호·문제/정답 머리글, 정답 선지의 형광펜 표시, 해설 뒤에 붙은 문제 그림 확대도 처리합니다. 복원 이견이나 서로 다른 답이 있으면 정답을 비워 두고 확인하도록 표시합니다. 원본 머리글의 대단원 이름도 유지합니다.

- **이미지형이 기본**: 문제 이미지 + 정답·해설 이미지 한 쌍을 선택하고 정답 ①~⑤를 지정합니다. 선지를 다시 입력할 필요가 없습니다. PNG/JPEG/WebP/GIF, 한 장 12MiB·4천만 픽셀 이하. SVG·PDF·구형 .ppt는 수동 문항 이미지로 직접 등록할 수 없습니다. PPTX와 OCR은 위의 전용 가져오기 기능을 사용합니다. 원본 비율로 표시하고 클릭하면 확대합니다.
- **텍스트형**: 지문·선지 5개·정답·해설을 입력합니다. 이미지도 추가할 수 있습니다. 직접 만든 예시는 ‘데모 문항’ 체크박스를 선택하세요.
- 대단원·소단원·시험 종류·연도·원래 문제번호와 별개로 안정적인 `q_UUID` ID를 부여합니다. `척수 → 신경인성 방광` 목차나 `2022년 전공의평가시험 35번` 검색은 같은 문항을 엽니다. 문항 관리에서 수동 수정합니다.
- **단원별 학습**: 대단원 전체 또는 소단원을 선택하면 바로 풉니다.
- **시험 만들기**: 단원·시험 종류·연도·전체/미풀이/최근 오답/별표, 문항 수(1~1,000), 원래 순서/무작위, 학습/시험 모드를 조합합니다. 시작 전에 일치하는 수를 보여주며 요청 수보다 적으면 실제 보유 수만 출제합니다. 원래 순서는 연도 오름차순 → 시험 이름 → 원래 문제번호입니다.
- **학습 모드**: 답 선택 후 ‘답 제출하고 해설 보기’. 제출한 답은 해당 시도에서 고정됩니다. 다시 풀기는 새 시도를 만듭니다.
- **시험 모드**: 최종 제출 전 답·문항 위치를 계속 저장합니다. 전후 이동·답 수정·창 닫은 뒤 URL 또는 ‘이어서 학습하기’로 재개할 수 있습니다. 최종 제출 전에는 세션 API에서도 정답·해설·해설 이미지·개념 연결을 제외합니다. 최종 제출 시 미응답은 오답입니다. 제출 후 문항 탐색과 해설 복습은 가능합니다.
- **풀이 기록**: 제출마다 별도 기록이며 최초 오답을 지우지 않습니다. 최근 시도가 정답이면 최근 오답에서 제외합니다. 별표는 정오답과 독립적입니다. ‘마이노트’에서 최근 오답·별표·메모 목록을 검색하고 **현재 목록 다시 풀기**를 누릅니다.
- 세션에는 출제 당시 문항 사본이 저장됩니다. 문항을 수정해도 과거 정답/해설/채점은 변하지 않습니다. 같은 세션을 여러 창에서 수정하면 revision 충돌을 알리며 새로고침이 필요합니다. 제출되지 않은 학습 답은 시도 기록으로 집계하지 않습니다.

## 4. 전체 백업과 복원 (DB + 모든 이미지)

문항 JSON은 콘텐츠 이동용이고 **전체 백업과 다릅니다**. 모든 풀이 기록·진행 상태·별표·메모까지 보존하려면 `.pmrz` 전체 백업을 사용하세요. 백업 파일에는 개인 자료가 있으므로 안전한 저장장치에 보관하세요. 암호화·자동 스케줄 백업은 이 버전에 포함하지 않았습니다.

### 백업

화면 오른쪽 위 **톱니바퀴 → 설정 → 전체 백업 다운로드**를 누르면 `.pmrz` 파일 하나를 내려받습니다. 실행 중인 앱을 중지할 필요가 없습니다. 생성 중에는 버튼이 비활성화되고, 실패하면 오류를 표시해 다시 시도할 수 있습니다.

문항·문제/해설 이미지·풀이 기록·별표·메모·개념/노트 연결·진행 중인 시험과 선택 답이 모두 포함됩니다. **파일은 버튼을 누른 브라우저의 다운로드 위치에 저장됩니다.** 맥미니 서버에 맥북으로 접속해 눌렀다면 맥북에 저장됩니다. 다운로드 목록에서 파일이 저장되었는지 확인하세요. 파일명에는 한국 시간(KST)과 구분자가 자동으로 들어갑니다. 앱 설치 파일·`.env.local`은 포함되지 않습니다.

터미널 백업 명령도 계속 사용할 수 있습니다.

```sh
cd "$HOME/Projects/PMRzokbo"
npm run backup -- "$HOME/PMRZokbo-backups/rehab-2026-11-09.pmrz"
```

실행 중에도 Node SQLite online backup으로 일관된 DB 사본을 만들고, 그 DB에 등록된 **모든 문제·해설 이미지**를 포함합니다. 각 파일 크기·SHA-256을 기록합니다. 기존 백업 파일은 덮어쓰지 않습니다. `.env.local`과 앱 코드는 포함하지 않으니 별도로 보관하세요. 백업 형식은 `pmrzokbo-full-backup`, version `1`이며 NOAH 백업과 다릅니다.

### 별도 테스트 폴더에 복원해 먼저 확인

```sh
# PMRZokbo-RestoreTest는 비어 있거나 없는 별도 전용 경로여야 합니다.
PMRZ_DATA_DIR="$HOME/Library/Application Support/PMRZokbo-RestoreTest" \
  npm run restore -- "$HOME/PMRZokbo-backups/rehab-2026-11-09.pmrz"

PMRZ_DATA_DIR="$HOME/Library/Application Support/PMRZokbo-RestoreTest" \
  PMRZ_PORT=4311 npm start
```

http://127.0.0.1:4311 에서 문항 수, 문제·해설 이미지, 기록, 별표, 메모와 개념 연결을 확인합니다. 기존 앱은 4310에서 계속 독립 실행할 수 있습니다. 데이터 경로만 바꾸면 기존 데이터를 자동으로 옮기지 않습니다. 옮길 때는 위처럼 백업·복원을 사용하세요.

### 운영 데이터에 복원

**경고: 병합이 아니라 전체 교체입니다. 기존 앱을 중지하고, 현재 데이터를 먼저 별도 백업하세요.**

```sh
# 실행 중인 앱의 터미널에서 Ctrl+C
npm run restore -- "$HOME/PMRZokbo-backups/rehab-2026-11-09.pmrz"
# 기존 데이터가 있으면 위 명령은 경고하고 거부합니다. 내용을 확인한 뒤:
npm run restore -- "$HOME/PMRZokbo-backups/rehab-2026-11-09.pmrz" --confirm-overwrite
npm start
```

실행 잠금, 파일 경로, 중복 파일, SHA-256, SQLite 무결성·스키마·외래 키, 필요한 이미지 포함 여부를 확인한 뒤 별도 staging 폴더를 교체합니다. 기존 폴더는 `.before-restore-시각-임의문자`로 옆에 보존합니다. 백업 파일은 대상 데이터 폴더 **밖**에 두세요. 복원 실패 시 기존 데이터는 교체하지 않습니다. 잠금의 PID가 살아 있으면 복원을 거부합니다. 비정상 종료로 잠금이 남아도 실제 PID가 종료된 경우 다음 실행에서 정리합니다.

DB만 복사하거나 실행 중인 SQLite 파일을 클라우드 동기화로 복제하지 마세요. NOAH의 백업 복원은 두 앱의 데이터 병합 수단이 아닙니다.

## 5. 문항·개념·연결 JSON v1

‘문항 관리’에서 내보내고 가져옵니다. `GET /api/v1/export`, `POST /api/v1/import`도 동일합니다. **NOAH의 `pmr-notes`·`pmr-server-backup`은 받지 않습니다.**

```json
{
  "format": "pmrzokbo-content",
  "version": 1,
  "questions": [{
    "id": "q_10000000-0000-4000-8000-000000000001",
    "title": "직접 만든 예시",
    "major": "척수", "minor": "신경인성 방광",
    "examType": "직접 만든 데모", "year": 2026, "originalNumber": 1,
    "stem": "앱 사용법 확인용 문항입니다. 1번을 선택하세요.",
    "choices": ["예시 A", "예시 B", "예시 C", "예시 D", "예시 E"],
    "correctAnswer": 1, "explanation": "직접 만든 데모 해설입니다.",
    "questionImage": null, "explanationImage": null, "isDemo": true
  }],
  "concepts": [{
    "id": "c_20000000-0000-4000-8000-000000000001",
    "name": "척수손상", "noahNoteId": "", "externalUrl": ""
  }],
  "links": [{
    "questionId": "q_10000000-0000-4000-8000-000000000001",
    "conceptId": "c_20000000-0000-4000-8000-000000000001"
  }],
  "assets": []
}
```

위 JSON은 그대로 가져올 수 있습니다. 이미지형은 `questionImage`·`explanationImage`에 `<SHA256>.png|jpg|webp|gif`를 넣고 `assets`에 `{"id":"<SHA256>.png","base64":"원본 파일의 base64"}`를 포함하세요. 파일명과 실제 해시·이미지 형식을 검사합니다. 이미지 대신 임의 로컬 경로나 원격 URL을 받지 않습니다. 수동 등록은 POST 이미지 API로 얻은 ID를 사용합니다. JSON의 필수 배열은 questions/concepts/links/assets이며 이미지 없는 경우에도 assets:[]가 필요합니다.

바로 선택해 가져올 수 있는 파일은 [examples/content-v1.json](examples/content-v1.json)에 있습니다.

**중복 정책**: ID가 새로우면 삽입합니다. 기존 문항·개념 ID가 있으면 **기존 내용을 유지**하고 덮어쓰지 않습니다. 연결 관계는 기존+가져온 관계를 합치고 같은 쌍은 한 번만 보관합니다. ID를 자동으로 재발급하지 않습니다. 가져온 배열 자체에 중복 ID가 있거나 존재하지 않는 연결·손상된 이미지가 있으면 실패하며 DB 변경 전체를 취소합니다. 기존 내용을 수정할 때는 수동 수정 UI/PUT API를 사용하세요. 가져오기로 관계 삭제는 하지 않습니다. 같은 JSON을 두 번 가져오는 테스트, 사용자 수정 보존, 연결 재결합, 잘못된 JSON의 무변경을 자동 검증합니다.

이 콘텐츠 형식에는 풀이 기록·별표·메모·세션을 포함하지 않습니다. JSON 가져오기는 요청당 64MiB, 문항 10,000개/개념 10,000개/연결 100,000개 이하입니다. 큰 자료는 나누어 가져오세요. 현재 JSON/전체 백업은 메모리에 읽으므로 아주 큰 이미지 은행에는 스트리밍 형식이 후속 과제입니다.

## 6. NOAH와의 실제 확인 범위와 연동 경계

확인일: **2026-11-09**. 원격 `Taesootosterone/PMRtest`의 `main`을 별도 임시 bare 저장소로 읽기만 했습니다. 기준 커밋: **`ed3412405efc2fe164be57105659851987dee0c4`** (커밋 시각 2026-11-09T04:49:12Z). 맥미니 자체에는 접근하지 못했으므로 **실제 설치 버전·실행 포트·설정·노트/계정 데이터는 확인하지 않았습니다.**

| 실제 소스에서 확인한 항목 | 근거 |
| --- | --- |
| NOAH 노트 전용 앱, 문제 API 제공 안 함 | `README.md`, `server/app.js` |
| Node >=24, Express 5.2.1, Vite 8.3.5, 브라우저 JS/CodeMirror | `package.json` |
| 노트 ID UUID, `notes/<UUID>.md`, 메타데이터+Markdown, history 수정 이력 | `server/store.js` |
| 계정·폴더·권한은 별도 SQLite | README, `server/access.js` |
| 노트 열기 `http://서버:포트/#note/<UUID>` | `src/main.js`의 해시 라우터 |
| `/api/health`, `/api/session`, 권한 검사 있는 `/api/notes`, `/api/notes/:id` | `server/app.js` |
| 기본 `127.0.0.1:3000`, PORT/PMR_DATA_DIR/PMR_CONFIG_FILE 등 설정 가능 | `server/config.js` |
| Mac 설치 도우미 기본 자료 `~/Library/Application Support/Munmaek/data`, 설정 `~/.config/munmaek/server.json` | `scripts/mac-service.js` (기존 내부 이름 보존) |
| 전체 백업 `pmr-server-backup` v1: SQLite·Markdown·이력·첨부·템플릿 등 + 체크섬 | `server/backup.js`; 노트 내보내기 `pmr-notes` v1과도 구분 |

이 앱은 확인한 NOAH API를 호출하거나 계정 인증·노트 동기화를 구현하지 않았습니다. **문제 API가 있다는 가정, 기존 문제 데이터가 있다는 가정, DB 직접 공유를 하지 않습니다.**

`lib/notes.mjs`가 외부 노트 URL 검증 경계입니다. 개념마다 `c_UUID`, 표시 이름, 선택적 `noahNoteId`(순수 UUID), `externalUrl`을 저장합니다. 문항은 `q_UUID`이며 NOAH UUID와 같은 값으로 식별하지 않습니다. 한 개념에 여러 문항, 한 문항에 여러 개념을 연결합니다. 노트 본문은 이 앱에 복사하거나 편집하지 않습니다.

예: 개념에 `noahNoteId=노트UUID`, `externalUrl=http://127.0.0.1:3000/#note/노트UUID`를 입력합니다. **사용자가 실제 노트 주소를 등록**하며 ID만으로 URL을 만들어내지 않습니다. 서버·포트가 바뀌면 개념의 URL을 한 번 수정하면 연결된 모든 문항에서 반영됩니다. 아이패드에서 열 때는 맥미니의 실제 LAN 주소로 등록해야 합니다. HTTP(S)만 허용하고 사용자 이름·암호가 든 URL은 거부합니다.

노트가 없거나 NOAH가 꺼져 있거나 로그인 권한이 없으면 외부 창에서 접근 실패할 수 있습니다. 문제 데이터나 연결은 삭제하지 않습니다. 문항 사본에는 개념 ID만 연결되며 노트 링크는 현재 개념 설정으로 표시합니다.

**브라우저 외부 링크 테스트는 데모 응답을 주입한 페이지로 실시합니다. 실제 NOAH 로그인·노트 열기·최신 맥미니 데이터와의 연동은 미검증입니다.** 기존 NOAH를 실행하거나 데이터를 변경하지 않았습니다.

### 고정 링크와 로컬 API v1

문항 화면의 링크 아이콘으로 `http://현재-호스트:포트/questions/q_UUID`를 복사합니다. ID와 상대 경로는 고정되고 서버 주소/포트는 현재 위치를 따릅니다. 주소를 바꾸면 외부 앱의 기준 주소만 바꿔야 합니다. 개념 목록 링크는 `/concepts/c_UUID`입니다.

```sh
curl 'http://127.0.0.1:4310/api/v1/concepts/c_20000000-0000-4000-8000-000000000001/questions'
```

```json
{
  "apiVersion": 1,
  "concept": {"id":"c_20000000-0000-4000-8000-000000000001","name":"척수손상","noahNoteId":"","externalUrl":""},
  "questions": [{
    "id":"q_10000000-0000-4000-8000-000000000001",
    "title":"직접 만든 예시","major":"척수","minor":"신경인성 방광",
    "year":2026,"examType":"직접 만든 데모","originalNumber":1,
    "path":"/questions/q_10000000-0000-4000-8000-000000000001"
  }]
}
```

외부 앱은 `new URL(question.path, configuredBankBaseUrl)`로 현재 기준 주소에 상대 경로를 결합합니다.

| API | 용도 |
| --- | --- |
| GET `/api/v1/health` | SQLite 읽기와 통계 확인 |
| GET `/api/v1/questions?major=척수&status=wrong` | 목록/필터, 정답·해설 제외 |
| GET `/api/v1/questions/:id` | 문항 상세 (관리용 정답 포함) |
| GET `/api/v1/questions/:id/history` | 시도별 제출 당시 사본과 채점 |
| POST/PUT `/api/v1/questions[/:id]` | 등록/수정 |
| PATCH `/api/v1/questions/:id/personal` | `{ "starred":true, "memo":"..." }` |
| GET/POST/PUT `/api/v1/concepts[/:id]` | 개념 메타데이터 조회/등록/수정 |
| GET `/api/v1/concepts/:id/questions` | 버전 명시 개념별 문항 목록 |
| POST `/api/v1/images` | multipart의 `file`, 이미지 ID 반환 |
| GET `/api/v1/images/:id` | 검증된 이미지 원본 |
| POST `/api/v1/sessions` | `{ "mode":"study", "questionIds":["q_UUID"] }` 또는 filters/count/order |
| GET/PATCH `/api/v1/sessions/:id` | 진행 조회/저장 (revision 필수) |
| GET `/api/v1/export`, POST `/api/v1/import` | 콘텐츠 JSON v1 |
| POST `/api/v1/backup` | 설정에서 사용하는 전체 `.pmrz` 백업 다운로드 (읽기 전용 스냅샷, 캐시 금지) |
| GET `/api/v1/updates`, POST `/api/v1/updates/check`, POST `/api/v1/updates/apply` | GitHub 업데이트 상태, 확인·다운로드, 선택한 커밋 적용 |
| GET `/api/v1/desktop`, POST `/api/v1/desktop/install` | Mac 앱 설치 가능 여부·설치 상태 조회, macOS에서 전용 앱 설치/복구 |
| POST `/api/v1/desktop/stop` | 현재 서버 정상 종료 (업데이트 작업 중 거부, Mac 제어 앱용) |
| GET/POST `/api/v1/ppt-imports`, GET/PATCH/DELETE `/api/v1/ppt-imports/:id` | PPTX 업로드·기능 확인·분석 목록/상태·묶음 수정·분석 자료 삭제 |
| POST `/api/v1/ppt-imports/:id/draft`, `/commit`, `/retry`, `/cancel` | 검토 초안 저장·확인한 문항 등록·재분석·분석 중지 |
| POST `/api/v1/ppt-imports/:id/pdf` | 같은 PPT의 화면용 PDF 업로드(원본과 같은 페이지 수), 각 256MiB 제한 |
| GET `/api/v1/ppt-imports/:id/pdf` | 저장한 PDF 스트리밍, `?download=1`이면 다운로드 |

학습 도구이므로 소유자가 관리 화면/API로 정답을 보는 것을 차단하는 시험 감독 기능은 없습니다. 세션 API의 정답 은닉은 풀이 흐름을 위한 것입니다. CORS 허용은 열어두지 않았습니다. 외부 앱의 서버/로컬 프로세스에서 GET API를 읽을 수 있으며 다른 origin의 브라우저에서 직접 연동하려면 향후 명시적인 CORS·인증 정책을 설계해야 합니다. 변경 API는 다른 Origin의 요청을 거부합니다.

### 나중에 합칠 때 필요한 작업

1. 실제 운영 NOAH의 커밋·노트 UUID·권한·라우팅·기준 주소를 다시 확인합니다. 현재 이 앱은 NOAH API 세션 인증을 구현하지 않습니다.
2. UI를 합치면 NOAH는 Vite/Express이고 이 앱은 Next/React라는 차이가 있습니다. HTTP API/내보내기 형식과 독립 도메인 모델로 먼저 연결하고, 필요하면 UI 포팅 또는 공통 호스트 아래 reverse proxy를 선택하세요. React 클라이언트 때문에 현재 NOAH 화면에 단순 파일 복사로 합칠 수 없습니다. NOAH에 맞춘 Express/Vite로 이식하는 대안도 있지만 첫 버전은 요청한 Next.js를 따랐습니다.
3. `lib/store.mjs`를 서비스 또는 공통 패키지로 분리하고 버전·마이그레이션을 설계합니다. Node 24 기본 SQLite를 사용해 Apple Silicon 네이티브 DB 패키지 빌드를 피했습니다. TypeScript는 UI/API 경계에 적용했고 독립 실행 CLI와 공유하는 저장소 코드는 ES 모듈입니다.
4. NOAH 노트 UUID ↔ 개념 ID를 별도 매핑으로 유지하고 다대다 관계를 이관합니다. 기존 백업으로 DB를 덮어쓰는 병합은 하지 않습니다.
5. 권한·읽기 전용 노트 조회·정책에 맞는 API를 합의한 다음 어댑터에 구현합니다. 노트 삭제 감지·이름 동기화·자동 노트 발견·양방향 링크는 아직 구현하지 않았습니다.

## 7. 검증과 개발

```sh
npm test                 # 임시 독립 SQLite와 실제 이미지로 도메인/백업 검사
npm run typecheck
npm run build
# 브라우저 테스트 (macOS에서 Playwright Chromium 사용 시)
npx playwright install chromium
CHROMIUM_PATH="$(node -e "const {chromium}=require('@playwright/test'); process.stdout.write(chromium.executablePath())")" npm run test:e2e
```

테스트용 데이터는 OS 임시 경로에 만들며 운영 데이터 경로를 사용하지 않습니다. 테스트 브라우저 기본 경로는 Linux `/usr/bin/chromium`, `CHROMIUM_PATH`로 바꿀 수 있습니다. E2E는 빌드된 앱을 14310에서 실행하고 전체 백업을 별도 경로로 복원해 14311에서도 확인합니다. 이 포트는 테스트 시 비어 있어야 합니다. 테스트 보고서는 `playwright-report/`, 스크린샷·trace는 `test-results/`에 생성됩니다.

검증 결과와 범위는 [검증 기록](docs/VALIDATION.md)에 기록합니다. Linux Chromium 검사이며 실제 macOS Safari·iOS Safari·맥미니 절전/자동 시작·실제 NOAH 연동을 대신하지 않습니다. 앱에 자동 실행 LaunchAgent·클라우드 배포·회원가입·의료 지식 자동 생성은 포함하지 않았습니다.
