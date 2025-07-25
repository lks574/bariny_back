# Firebase Remote Config 설정 가이드

Firebase Remote Config를 Supabase Edge Functions와 연동하기 위한 단계별 설정 가이드입니다.

## 🔥 **1. Firebase 프로젝트 생성**

### 1.1 Firebase Console 접속
```bash
# Firebase CLI 설치
npm install -g firebase-tools

# Firebase 로그인
firebase login
```

### 1.2 새 프로젝트 생성
```bash
# 프로젝트 생성
firebase projects:create brainy-quiz-app

# 프로젝트 선택
firebase use brainy-quiz-app
```

또는 [Firebase Console](https://console.firebase.google.com)에서 직접 생성:
1. "새 프로젝트 만들기" 클릭
2. 프로젝트 이름: `brainy-quiz-app`
3. Google Analytics 활성화 (선택사항)

## 🔧 **2. Remote Config 활성화**

### 2.1 Firebase Console에서 활성화
1. Firebase Console → 프로젝트 선택
2. 좌측 메뉴 → "원격 구성(Remote Config)" 클릭
3. "시작하기" 클릭

### 2.2 CLI로 초기화
```bash
# Firebase 프로젝트 초기화
firebase init remoteconfig

# 설정 파일 배포
firebase deploy --only remoteconfig
```

## 🔑 **3. 서비스 계정 키 생성**

### 3.1 Google Cloud Console 접속
1. [Google Cloud Console](https://console.cloud.google.com) 접속
2. 프로젝트 선택: `brainy-quiz-app`

### 3.2 서비스 계정 생성
1. IAM 및 관리자 → 서비스 계정
2. "서비스 계정 만들기" 클릭
3. 이름: `brainy-backend-service`
4. 설명: `Brainy Backend API Service Account`

### 3.3 권한 부여
서비스 계정에 다음 역할 부여:
- `Firebase Remote Config Admin`
- `Firebase Admin SDK Administrator Service Agent`

### 3.4 키 파일 다운로드
1. 생성된 서비스 계정 클릭
2. "키" 탭 → "키 추가" → "새 키 만들기"
3. 형식: JSON 선택
4. 다운로드된 JSON 파일 내용을 환경변수로 설정

## 📝 **4. 환경 변수 설정**

### 4.1 서비스 계정 JSON 파일 분석
다운로드한 JSON 파일의 구조:
```json
{
  "type": "service_account",
  "project_id": "brainy-quiz-app",
  "private_key_id": "key-id-here",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "brainy-backend-service@brainy-quiz-app.iam.gserviceaccount.com",
  "client_id": "123456789012345678901",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token"
}
```

### 4.2 환경 변수 설정
`supabase/.env.local` 파일에 다음 값들 추가:

```env
# Firebase Remote Config
FIREBASE_PROJECT_ID=brainy-quiz-app
FIREBASE_PRIVATE_KEY_ID=your-private-key-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour-Private-Key-Content\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=brainy-backend-service@brainy-quiz-app.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=123456789012345678901
FIREBASE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
FIREBASE_TOKEN_URI=https://oauth2.googleapis.com/token
```

### 4.3 프로덕션 환경 설정
Supabase Dashboard에서 환경 변수 설정:
1. Supabase Dashboard → 프로젝트 선택
2. Settings → Edge Functions
3. Environment Variables에 위 값들 추가

## 🧪 **5. 테스트**

### 5.1 로컬 테스트
```bash
# Supabase 로컬 서버 시작
supabase start

# Edge Functions 서빙
supabase functions serve --env-file supabase/.env.local

# 헬스체크 테스트
curl http://localhost:54321/functions/v1/health

# 퀴즈 파일 생성 테스트
curl -X POST http://localhost:54321/functions/v1/quiz-data \
  -H "Content-Type: application/json" \
  -d '{"version": "1.0.0-test"}'
```

### 5.2 Remote Config 확인
Firebase Console에서 확인:
1. Remote Config → 매개변수
2. `quiz_version`, `download_url` 등 파라미터 생성 확인

## 📱 **6. iOS 앱 연동**

### 6.1 Firebase SDK 설치
```swift
// Package.swift
dependencies: [
    .package(url: "https://github.com/firebase/firebase-ios-sdk", from: "10.0.0")
]
```

### 6.2 GoogleService-Info.plist 다운로드
1. Firebase Console → 프로젝트 설정
2. iOS 앱 추가 (또는 기존 앱 선택)
3. Bundle ID 입력: `com.yourcompany.brainyquiz`
4. `GoogleService-Info.plist` 다운로드 후 앱에 추가

### 6.3 iOS 코드 예시
```swift
import FirebaseCore
import FirebaseRemoteConfig

@main
struct BrainyQuizApp: App {
    init() {
        FirebaseApp.configure()
        setupRemoteConfig()
    }
    
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
    
    private func setupRemoteConfig() {
        let remoteConfig = RemoteConfig.remoteConfig()
        let settings = RemoteConfigSettings()
        settings.minimumFetchInterval = 0 // 개발용, 프로덕션에서는 3600 (1시간)
        remoteConfig.configSettings = settings
        
        // 기본값 설정
        remoteConfig.setDefaults([
            "quiz_version": "1.0.0" as NSObject,
            "download_url": "" as NSObject,
            "force_update": false as NSObject
        ])
    }
}

// 사용 예시
class QuizVersionManager: ObservableObject {
    @Published var currentVersion = ""
    @Published var downloadUrl = ""
    @Published var forceUpdate = false
    
    func fetchRemoteConfig() async {
        do {
            let remoteConfig = RemoteConfig.remoteConfig()
            try await remoteConfig.fetchAndActivate()
            
            DispatchQueue.main.async {
                self.currentVersion = remoteConfig.configValue(forKey: "quiz_version").stringValue ?? ""
                self.downloadUrl = remoteConfig.configValue(forKey: "download_url").stringValue ?? ""
                self.forceUpdate = remoteConfig.configValue(forKey: "force_update").boolValue
            }
        } catch {
            print("Remote Config fetch failed: \(error)")
        }
    }
}
```

## 🚀 **7. 배포**

### 7.1 Edge Functions 배포
```bash
# 프로덕션 배포
supabase functions deploy --project-ref your-prod-project-ref

# 특정 함수만 배포
supabase functions deploy quiz-data --project-ref your-prod-project-ref
```

### 7.2 Remote Config 배포
```bash
# Remote Config 템플릿 배포
firebase deploy --only remoteconfig --project brainy-quiz-app
```

## ✅ **8. 검증 체크리스트**

- [ ] Firebase 프로젝트 생성 완료
- [ ] Remote Config 활성화 완료
- [ ] 서비스 계정 생성 및 권한 부여 완료
- [ ] 환경 변수 설정 완료
- [ ] 로컬 테스트 성공
- [ ] 헬스체크 API 정상 동작
- [ ] 퀴즈 파일 생성 API 정상 동작
- [ ] Remote Config 파라미터 업데이트 확인
- [ ] iOS 앱 연동 테스트 완료
- [ ] 프로덕션 배포 완료

## 🔧 **트러블슈팅**

### 인증 오류
```
Error: Firebase 인증 실패: 401 Unauthorized
```
**해결방법:**
1. 서비스 계정 키가 올바른지 확인
2. 권한이 제대로 부여되었는지 확인
3. 환경 변수가 정확히 설정되었는지 확인

### Remote Config 업데이트 실패
```
Error: Remote Config 업데이트 실패: 403 Forbidden
```
**해결방법:**
1. 서비스 계정에 `Firebase Remote Config Admin` 역할 부여
2. Firebase API가 활성화되어 있는지 확인

### 파일 업로드 실패
```
Error: 파일 업로드 실패: Storage bucket not found
```
**해결방법:**
1. Supabase Storage에서 `quiz-files` 버킷 생성
2. 버킷을 public으로 설정
3. 올바른 권한 설정 확인

## 📞 **지원**

문제가 발생하면 다음을 확인하세요:
1. [Firebase 공식 문서](https://firebase.google.com/docs/remote-config)
2. [Supabase Edge Functions 문서](https://supabase.com/docs/guides/functions)
3. GitHub Issues에 문의 