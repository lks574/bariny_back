# Requirements Document

## Introduction

Brainy Backend API는 iOS 퀴즈 앱을 지원하는 백엔드 시스템입니다. 사용자 인증, 퀴즈 데이터 관리, 진행 상황 동기화를 담당하며, Supabase를 기반으로 구축되어 확장성과 실시간 기능을 제공합니다. 최소한의 API 호출로 효율적인 데이터 동기화를 지원하고, 오프라인 우선 아키텍처를 고려한 설계를 제공합니다.

## Requirements

### Requirement 1

**User Story:** 개발자로서, Firebase Remote Config와 통합된 유연하고 안전한 사용자 인증 시스템을 구축하고 싶습니다. 그래야 iOS 앱에서 다양한 로그인 방식을 지원하고 실시간으로 인증 정책을 조정할 수 있습니다.

#### Acceptance Criteria

1. WHEN Firebase Remote Config에서 인증 설정을 확인하면 THEN 시스템은 허용된 로그인 방식과 보안 정책을 실시간으로 반환해야 합니다
2. WHEN 이메일 로그인 요청이 오면 THEN 시스템은 Remote Config의 설정에 따라 이메일과 비밀번호를 검증하고 JWT 토큰을 반환해야 합니다
3. WHEN Google OAuth 토큰이 전달되면 THEN 시스템은 소셜 로그인 허용 여부를 확인하고 사용자 계정을 생성하거나 로그인해야 합니다
4. WHEN Apple Sign-in 토큰이 전달되면 THEN 시스템은 Apple 인증을 검증하고 사용자 계정을 생성하거나 로그인해야 합니다
5. WHEN 게스트 로그인 요청이 오면 THEN 시스템은 Remote Config의 게스트 모드 허용 여부를 확인하고 임시 계정을 생성해야 합니다
6. WHEN 사용자 등록 요청이 오면 THEN 시스템은 이메일 중복을 확인하고 Remote Config의 비밀번호 정책에 따라 새 계정을 생성해야 합니다
7. WHEN 로그아웃 요청이 오면 THEN 시스템은 토큰을 무효화하고 세션을 종료해야 합니다
8. WHEN 사용자 정보 요청이 오면 THEN 시스템은 인증된 사용자의 프로필 정보와 권한을 반환해야 합니다
9. WHEN 세션 만료 시간이 도달하면 THEN 시스템은 Remote Config의 설정에 따라 자동으로 세션을 갱신하거나 로그아웃해야 합니다
10. WHEN 앱 버전이 최소 요구 버전보다 낮으면 THEN 시스템은 인증을 거부하고 업데이트 안내를 표시해야 합니다
11. WHEN 최대 로그인 시도 횟수를 초과하면 THEN 시스템은 계정을 일시적으로 잠그고 보안 로그를 기록해야 합니다
12. WHEN 비정상적인 로그인 패턴이 감지되면 THEN 시스템은 추가 인증을 요구하고 보안 알림을 발송해야 합니다

### Requirement 2

**User Story:** 개발자로서, 퀴즈 데이터 관리 시스템을 구축하고 싶습니다. 그래야 iOS 앱에서 최신 퀴즈 데이터를 비용 효율적으로 받을 수 있습니다.

#### Acceptance Criteria

1. WHEN Firebase Remote Config에서 퀴즈 버전을 확인하면 THEN 시스템은 현재 퀴즈 데이터 버전과 다운로드 URL을 완전 무료로 반환해야 합니다
2. WHEN 퀴즈 파일 생성 요청이 오면 THEN 시스템은 DB에서 데이터를 조회하여 JSON 파일을 생성하고 Storage에 업로드해야 합니다
3. WHEN JSON 파일이 생성되면 THEN 시스템은 공개 다운로드 URL을 반환하고 Firebase Remote Config를 자동으로 업데이트해야 합니다
4. WHEN 퀴즈 데이터가 업데이트되면 THEN 시스템은 버전 번호를 증가시키고 새 JSON 파일을 생성한 후 Firebase Remote Config에 실시간으로 반영해야 합니다
5. WHEN 음성 모드 퀴즈가 포함되면 THEN 시스템은 오디오 파일 URL을 JSON에 포함해야 합니다
6. WHEN 앱에서 JSON 파일을 다운로드하면 THEN 시스템은 CDN을 통해 정적 파일을 제공해야 합니다
7. WHEN Firebase Remote Config에서 force_update가 true면 THEN 앱은 반드시 새 버전을 다운로드해야 합니다
8. WHEN Firebase Remote Config에서 maintenance_mode가 true면 THEN 앱은 점검 화면을 표시해야 합니다

### Requirement 3

**User Story:** 개발자로서, 사용자 진행 상황 동기화 시스템을 구축하고 싶습니다. 그래야 iOS 앱에서 여러 기기 간 데이터를 동기화할 수 있습니다.

#### Acceptance Criteria

1. WHEN 사용자 진행 상황 업로드 요청이 오면 THEN 시스템은 퀴즈 결과를 데이터베이스에 저장해야 합니다
2. WHEN 사용자 진행 상황 다운로드 요청이 오면 THEN 시스템은 해당 사용자의 모든 퀴즈 기록을 반환해야 합니다
3. WHEN 중복된 퀴즈 결과가 업로드되면 THEN 시스템은 최신 데이터로 업데이트해야 합니다
4. WHEN 배치 동기화 요청이 오면 THEN 시스템은 여러 퀴즈 결과를 한 번에 처리해야 합니다
5. WHEN 동기화 충돌이 발생하면 THEN 시스템은 타임스탬프를 기준으로 최신 데이터를 우선해야 합니다

### Requirement 4

**User Story:** 개발자로서, 퀴즈 히스토리 조회 시스템을 구축하고 싶습니다. 그래야 iOS 앱에서 사용자의 학습 기록을 표시할 수 있습니다.

#### Acceptance Criteria

1. WHEN 사용자 히스토리 요청이 오면 THEN 시스템은 날짜순으로 정렬된 퀴즈 세션 목록을 반환해야 합니다
2. WHEN 특정 기간 히스토리 요청이 오면 THEN 시스템은 해당 기간의 기록만 필터링하여 반환해야 합니다
3. WHEN 카테고리별 히스토리 요청이 오면 THEN 시스템은 해당 카테고리의 기록만 반환해야 합니다
4. WHEN 히스토리 상세 요청이 오면 THEN 시스템은 특정 세션의 모든 문제와 답안을 반환해야 합니다
5. WHEN 통계 요청이 오면 THEN 시스템은 정답률, 평균 점수, 카테고리별 성과를 계산하여 반환해야 합니다

### Requirement 5

**User Story:** 개발자로서, AI 기반 퀴즈 생성 시스템을 구축하고 싶습니다. 그래야 iOS 앱에서 동적으로 생성된 퀴즈를 제공할 수 있습니다.

#### Acceptance Criteria

1. WHEN AI 퀴즈 생성 요청이 오면 THEN 시스템은 OpenAI API를 호출하여 새로운 문제를 생성해야 합니다
2. WHEN 특정 난이도 요청이 오면 THEN 시스템은 해당 난이도에 맞는 문제를 생성해야 합니다
3. WHEN 카테고리별 AI 퀴즈 요청이 오면 THEN 시스템은 해당 주제에 맞는 문제를 생성해야 합니다
4. WHEN AI 생성 문제를 검증하면 THEN 시스템은 부적절한 내용을 필터링해야 합니다
5. WHEN AI 퀴즈 생성이 실패하면 THEN 시스템은 기본 퀴즈 데이터를 반환해야 합니다

### Requirement 6

**User Story:** 개발자로서, 실시간 기능을 구축하고 싶습니다. 그래야 iOS 앱에서 실시간 업데이트를 받을 수 있습니다.

#### Acceptance Criteria

1. WHEN 퀴즈 데이터가 업데이트되면 THEN 시스템은 연결된 클라이언트에게 실시간 알림을 보내야 합니다
2. WHEN 사용자가 퀴즈를 완료하면 THEN 시스템은 실시간으로 진행 상황을 업데이트해야 합니다
3. WHEN 새로운 퀴즈가 추가되면 THEN 시스템은 구독 중인 클라이언트에게 알림을 보내야 합니다
4. WHEN 실시간 연결이 끊어지면 THEN 시스템은 자동으로 재연결을 시도해야 합니다

### Requirement 7

**User Story:** 개발자로서, 관리자 기능을 구축하고 싶습니다. 그래야 퀴즈 데이터를 효율적으로 관리할 수 있습니다.

#### Acceptance Criteria

1. WHEN 관리자 로그인 요청이 오면 THEN 시스템은 관리자 권한을 확인하고 토큰을 발급해야 합니다
2. WHEN 퀴즈 추가 요청이 오면 THEN 시스템은 새로운 문제를 데이터베이스에 저장해야 합니다
3. WHEN 퀴즈 수정 요청이 오면 THEN 시스템은 기존 문제를 업데이트해야 합니다
4. WHEN 퀴즈 삭제 요청이 오면 THEN 시스템은 해당 문제를 비활성화해야 합니다
5. WHEN 사용자 통계 요청이 오면 THEN 시스템은 전체 사용자의 활동 데이터를 반환해야 합니다

### Requirement 8

**User Story:** 개발자로서, 안정적이고 확장 가능한 시스템을 구축하고 싶습니다. 그래야 장기적으로 서비스를 운영할 수 있습니다.

#### Acceptance Criteria

1. WHEN API 요청이 오면 THEN 시스템은 요청 제한(Rate Limiting)을 적용해야 합니다
2. WHEN 에러가 발생하면 THEN 시스템은 적절한 HTTP 상태 코드와 에러 메시지를 반환해야 합니다
3. WHEN 데이터베이스 연결이 실패하면 THEN 시스템은 자동으로 재시도해야 합니다
4. WHEN API 응답 시간이 느리면 THEN 시스템은 캐싱을 통해 성능을 개선해야 합니다
5. WHEN 보안 위협이 감지되면 THEN 시스템은 요청을 차단하고 로그를 기록해야 합니다
6. WHEN 시스템 부하가 높으면 THEN 시스템은 자동으로 스케일링해야 합니다
7. WHEN 데이터 백업이 필요하면 THEN 시스템은 정기적으로 백업을 수행해야 합니다
8. WHEN 모니터링 요청이 오면 THEN 시스템은 헬스체크 정보를 반환해야 합니다

### Requirement 9

**User Story:** 개발자로서, 비용 효율적인 버전 체크 시스템을 구축하고 싶습니다. 그래야 API 호출 비용을 최소화하면서도 앱에서 최신 퀴즈 버전을 확인할 수 있습니다.

#### Acceptance Criteria

1. WHEN Firebase Remote Config를 사용하면 THEN 버전 체크가 완전 무료로 제공되어야 합니다
2. WHEN Supabase Storage 직접 접근을 사용하면 THEN Edge Function 호출 없이 정적 파일로 버전 정보를 제공해야 합니다  
3. WHEN GitHub Raw 파일을 사용하면 THEN 무료 CDN을 통해 설정 파일을 제공해야 합니다
4. WHEN 버전 정보가 캐싱되면 THEN 동일한 버전에 대해서는 추가 요청을 하지 않아야 합니다
5. WHEN 앱이 오프라인이면 THEN 마지막으로 캐싱된 버전 정보를 사용해야 합니다