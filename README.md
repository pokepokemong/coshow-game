# CO-SHOW 코아이 러너 🍌

CO-SHOW 행사장 체험객용 픽셀 미니게임.
코아이가 달리며 장애물을 피하고 컨소시엄 심볼을 먹어 점수를 올리는 러너 게임입니다.

- **사용자**: QR 접속 → 닉네임 입력 → 게임 → 결과 카드(이미지 저장) + TOP 10 리더보드
- **관리자**: `admin.html?key=관리자키` → 총 이용자 수 / 총 플레이 수 / 사용자별 스코어 KPI

## 파일 구성

| 파일 | 설명 |
|---|---|
| `index.html` | 게임 페이지 (QR코드가 가리킬 주소) |
| `admin.html` | 관리자 KPI 대시보드 |
| `js/game.js` | 게임 엔진 |
| `js/assets.js` | 에셋 로더 (이미지 없으면 픽셀 플레이스홀더) |
| `js/firebase.js` | Firebase 설정·연동 (**여기에 키 입력**) |
| `js/result.js` | 결과 카드 + 이미지 저장 |
| `assets/` | 코아이/바나나 이미지 넣는 곳 (`assets/README.md` 참고) |

## 실행 (로컬 테스트)

ES 모듈을 쓰므로 파일을 더블클릭하지 말고 간단한 서버로 여세요:

```bash
python -m http.server 8000
```

→ 브라우저에서 `http://localhost:8000` 접속.

## Firebase 설정 (온라인 랭킹 + 관리자 KPI)

키를 넣기 전까지는 **오프라인 모드**로 동작합니다 (게임 가능, 기록은 기기에만 저장).

1. [Firebase 콘솔](https://console.firebase.google.com)에서 프로젝트 생성 (Analytics는 꺼도 됨)
2. 프로젝트 개요 → 웹앱(`</>`) 추가 → 표시되는 `firebaseConfig` 값을 `js/firebase.js` 상단에 붙여넣기
3. **Authentication** → 로그인 방법 → **익명** 사용 설정
4. **Firestore Database** → 데이터베이스 만들기(프로덕션 모드, 리전 `asia-northeast3` 서울 권장)
5. Firestore → 규칙 탭에 아래 규칙 붙여넣고 게시:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == uid;
    }
    match /scores/{doc} {
      allow read: if true;
      allow create: if request.auth != null
        && request.resource.data.uid == request.auth.uid
        && request.resource.data.score is int
        && request.resource.data.score >= 0
        && request.resource.data.score < 100000;
      allow update, delete: if false;
    }
  }
}
```

6. `users` 컬렉션의 `bestScore` 내림차순 정렬을 처음 쓸 때 Firestore가 인덱스 생성 링크를 콘솔에 띄울 수 있음 → 링크 클릭해 생성 (단일 필드 정렬이라 대부분 자동)

### 관리자 키 변경

`js/firebase.js`의 `ADMIN_KEY` 값을 원하는 문자열로 바꾸세요. 접속은 `admin.html?key=그값`.

## 배포 (GitHub Pages)

```bash
git init
git add -A
git commit -m "CO-SHOW koai runner"
gh repo create coshow-game --public --source . --push
gh api repos/{owner}/coshow-game/pages -X POST -f "source[branch]=main" -f "source[path]=/"
```

배포 후 주소: `https://<계정명>.github.io/coshow-game/`
이 주소로 QR코드를 만들어 현장에 비치하면 됩니다.

## 현장 운영 팁

- QR 포스터에 "닉네임을 입력하면 랭킹에 올라가요!" 문구 추가 권장
- 현장 스크린에 리더보드를 띄우려면 게임오버 화면의 TOP 10을 그대로 쓰거나 `admin.html`을 크게 띄워두면 됨
- 행사 종료 후 Firestore 데이터는 콘솔에서 CSV 내보내기 가능 (또는 admin 화면 캡처)
