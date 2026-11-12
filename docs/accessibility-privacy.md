# 접근성과 데이터 처리

## 실제 제공하는 대체 경로

`KECHAP_PASSKEY_RECOVERY=true npm run demo:web`로 로컬 예제의 등록된 패스키 대체 경로를 활성화할 수 있다. 기본은 비활성화다. 사용자는 과제 대신 이미 등록한 패스키로 같은 데모 제출 액션에 접근할 수 있다. `@simplewebauthn/server`의 실제 등록/서명 검증과 user verification을 요구하며, 등록 전 제품의 이전 인증/권한이 필요하다. 예제는 먼저 정상 검증 후 한정된 시간 동안 등록을 허용한다. **최초 가입에서 등록 권한을 누구에게 주는지는 별도 제품 정책**이며 이 예제 정책을 인간성 증명으로 사용하면 안 된다.

패스키 결과는 `account-continuity`다. PoW나 봇 완화 결과와 같은 보안 신호라고 표시하지 않고, 실제 인간 존재·실명 신원·유일성·선의를 주장하지 않는다. 제품이 계정 연속성으로 해당 작업을 허용할 수 있을 때만 선택하는 경로다. 사전 등록이 없거나 기기/플랫폼이 지원하지 않으면 이 경로도 사용할 수 없으므로 실제 지원 승인·복구 체계를 제품이 추가해야 한다.

등록 시작과 완료 모두 `authorizeEnrollment`를 확인한다. 요청은 서버 context/action/tenant·nonce·짧은TTL·CSRF에 묶이고 challenge와 복구 토큰은 일회성이다. credential counter는 저장소에서 CAS 갱신한다. 기본 메모리 credential repository는 예제이며 운영에서는 계정별 소유권·중복·CAS·등록 상한을 원자적으로 처리하는 데이터베이스 구현이 필요하다.

## 검증한 것과 사용자 평가의 차이

`npm run test:passkeys`는 Chromium의 실제 WebAuthn 가상 인증기로 등록→서버 검증→키보드 재인증→대체 제출→서버 credential 삭제를 실행한다. reduced-motion 설정에서 버튼을 키보드로 활성화한다. 가상 인증기는 사람·장애 사용자·실제 플랫폼 인증기가 아니므로 WCAG 준수 인증이나 사용자 완료율로 보고하지 않는다.

실제 사용자 평가에는 다음을 별도 기록한다.

- 키보드만 사용해 모든 조작·취소·retry·대체 경로에 도달하고 focus가 보존되는지.
- NVDA/VoiceOver/Orca 등 실제 screen reader에서 제목·안내·상태·실패가 읽히는지.
- reduced motion, zoom200/400%, 고대비, 좁은 모바일 viewport, 저사양/저대역폭에서 수행 가능한지.
- 시각·청각·운동·인지 제약별 선택 가능한 경로, 제한시간 연장과 사전 등록 없는 사용자의 지원 UX.
- 성공·실패·이탈 분모, 각 경로의 보증 범주와 실험 동의·철회.

지원 메일 링크나 취소 버튼만으로 동등한 인증 대안이 있다고 주장하지 않는다. 테스트 계획과 실제 관찰 결과는 별도다. 아직 독립 보조공학/사용자 테스트가 없으므로 추천 엔진의 `requiredAccessibility` 조건을 충족했다고 자동 표시하지 않는다.

## 데이터 흐름과 보존

| 데이터 | 수신·처리 | 기본 보존/삭제 | 외부 전달 |
| --- | --- | --- | --- |
| 제품 opaque subject/context | 제품 서버→Kechap binding hash | challenge2분/attestation1분 또는 명시TTL | SDK 기본 외부 전달 없음 |
| ALTCHA/Cap work | 브라우저→제품 서버→공식 로컬 verifier | 일회성 challenge, TTL 후 삭제 | 네트워크 서비스 호출 없음 |
| 상용 토큰 | 브라우저→제품 서버→공식 siteverify | 검증 후 토큰 저장/로그 금지 | 선택한 Cloudflare/hCaptcha/Google, 각 서비스 약정 필요 |
| passkey credential ID·공개키·counter | 브라우저→제품 서버 | 계정 삭제/등록 해제 시 삭제, 제품 정책 | verifier 로컬. 기기 biometric 원본 전달/수집 없음 |
| 이벤트 통계 | SDK→설정된 observer | 고정 label·bounded최근표본, reset/외부 집계 정책 | 기본 외부 전송 없음 |
| 사람 연구 event | 명시적 동의→연구 도구 | 연구 protocol의 최소보존·철회 | 원본 public 게시 금지 |

메모리 예제 세션은15분·서버 재시작 때 사라진다. 패스키 credential은 개발 메모리에 있어 재시작 시 사라지고 삭제 버튼/API로도 해제된다. 기기에 저장된 패스키의 삭제는 기기 설정에서 별도로 관리한다. Redis store는 설정한 TTL로 상태를 지우지만 persistence·snapshot·백업은 배포자의 정책이므로 별도 삭제·보존 규칙이 필요하다.

처리자 목록은 실제 선택한 공급자에 따라 달라진다. self-host 패키지 설치가 해당 회사에 자동 사용자 데이터를 보내는 것은 아니지만 브라우저 외부 widget을 선택하면 그 공급자로 통신이 발생한다. MyProxy benchmark는 명시적으로 opt-in할 때 소유 실험 화면만 전송하며 제품 이용자의 원본 생체정보·IP·토큰을 보내지 않는다. 생체정보/영상/음성 수집은 기본 비활성화이고 현재 공통 SDK가 원본을 수집하는 API는 없다.
