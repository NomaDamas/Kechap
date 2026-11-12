# Kechap 현재 상태와 다음 계획

2026-11-12 네트워크 권한 변경 후 실제 GitHub 인증·원격 권한을 확인했고 출처 조사를 완료했다. Aside와 Windows VM은 사용자 지시에 따라 제외했다.

| 범위 | 실제 완료한 내용 | 남은 확장 |
| --- | --- | --- |
| 카탈로그 | 역할별50개, revision고정 GitHub37개, 공식 문서10개, evidence79개 | 나머지3개 및 독립 고객/감사 근거 |
| 기존 생태계 조사 | awesome-captcha, personhood 목록, 솔버/사람판단 MCP, RL orchestration 비교 | 완전한 검색이나 최초 주장 아님 |
| 기존 OSS 통합 | ALTCHA2.8.0와 Cap0.1.15 실제 생성/검증/만료/재사용 + Chromium 폼 | Cap instrumentation/HashWX, mCaptcha 등 |
| 상용 연동 | 공식 Turnstile/hCaptcha/classic reCAPTCHA 어댑터와 계약 모의 테스트 | 실제 고객 키·운영환경 연동 |
| SDK/rotation | 문맥 결속, 일회성 토큰, TTL, server policy version, action/risk/health/가중치 | 분산 atomic store, 자체 risk signal 모델, 운영 계측 |
| 설치 | CLI/MCP가 요구사항 기반 공급자 선택과 신규 Node HTTP 프로젝트 파일 생성까지 연결, 기존 파일 덮어쓰기 거절 | 기존 제품 자동 패치·추가 framework |
| 브라우저 | 실제 Chromium에서 ALTCHA/Cap/PoW 교체·작업·서버 제출, HTTP smoke | 장애 사용자·실제 모바일/저사양·상용 widget |
| 실시간 연구 | 세 가지 toy surface, 서버 replay, rule-aware/fixed macro 실측 baseline | 실제 시각 UI·인간/VLM/computer-use 평가 |
| 벤치마크 | seed/nonce/hash·버전·표본 수와 공개 가능한 자동화 결과, 확장 계획 | 인간 완료율/p95/접근성·VLM비용·리더보드 |
| 커뮤니티 | 기여 계약, issue form, roadmap와 실제 이슈23개 | 외부 기여·응답 운영 실적 |
| Sponsors | NomaDamas FUNDING 설정 | 조직의 계정 개설·지급 심사 필요 |

모든 후보 `productionReady=false`다. source-reviewed는 실제 출처를 읽었다는 뜻이고 운영 승인·보안 감사와 다르다. 라이브 OSS integration은 소유 로컬 과제를 검증했다는 뜻이지 사람 구별 성능 인증이 아니다.

## 다음 순서

1. 실제 고객 키가 준비된 제품에서 상용 공급자 staging 검증과 보호된 업무의 멱등성 테스트.
2. Redis/DB atomic TTL 저장소와 multi-worker 동시성, 장애·관측성·privacy 정책.
3. 지원 framework 확대와 기존 제품에 대한 검토 가능한 설치 patch 생성.
4. 접근 가능한 동등 대체 경로와 모바일·저사양 사용자 평가.
5. 동의받은 인간 실험, owned-site VLM/computer-use benchmark와 신뢰구간·비용 비교.
6. 필요가 확인된 경우에만 생체정보를 최소 취급하는 liveness·identity·personhood 공식 공급자 승격.

세부 수용 기준·의존성은 [로드맵](roadmap.md)과 [원격 이슈](https://github.com/NomaDamas/Kechap/issues)에 있다. 후속 단계를 완료했다고 표시하지 않는다. 원격 커밋/CI 상태는 [게시 상태](publishing-status.md)를 따른다.
