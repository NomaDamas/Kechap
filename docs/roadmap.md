# 실행 계획과 이슈 백로그

제품의 첫 약속은 **“레포를 에이전트에게 알려주면 제품 조건에 맞는 CAPTCHA 후보와 실제 서버 연동 경로를 얻는다”**다. 카탈로그의 폭, 연동 품질, 운영 정책, 검증 근거를 쌓고 이후 인간/자동화 벤치마크로 확장한다.

아래 항목은 GitHub 이슈로 옮길 수 있는 명세다. 체크되지 않은 항목과 목표치는 구현·측정 결과가 아니다. 실제 GitHub 발행 상태는 `docs/publishing-status.md`와 발행 도구 실행 결과로 확인한다. 해당 파일이 없으면 발행 여부가 확인되지 않은 상태다.

## 단계와 통과 기준

| 단계 | 산출물 | 다음 단계 조건 |
| --- | --- | --- |
| P0: 근거·계약 | 카탈로그, 선택 정책, 위협 모델, 공식 adapter 경계 | 출처·라이선스·보장 범주를 구분하고 미확인 수치를 표시 |
| P1: 설치 경험 | SDK/CLI/MCP/Skill, 최소 공식 adapter, 통합 예제 | 새 프로젝트에서 서버 검증까지 재현, 비밀키 노출 없음 |
| P2: 운영 | 세션 고정 로테이션, 분산 일회용 저장소, 관측성 | 재사용·downgrade·공급자 장애 계약 테스트 통과 |
| P3: 실험 벤치 | 통제된 challenge, 인간 파일럿, 자동화 baseline | 데이터 사용 동의와 재현 설정, 미측정 항목 명시 |
| P4: 생태계 | 기여 검토·버전 정책·호환성 배지·리더보드 | 독립 기여자가 adapter와 벤치를 재현 |

## P0 — 근거를 갖춘 공급자 레지스트리

## KEC-001: 공급자 manifest와 증거 스키마

목적: “목록에 있다”와 “검증된 production adapter가 있다”를 구분한다.

할 일:
- ID, 방법론, assurance 범주, upstream, 공식 문서, 라이선스, deployment, 데이터 처리 지역, 접근성 정보 정의.
- stars, 최신 release, archive 상태, 조회 시각, API 응답 출처를 수치와 함께 기록. 미조회는 null/unknown으로 유지.
- 상태를 candidate / metadata-reviewed / adapter-tested / production-evidence로 나누고 근거 링크 필수화.
- schema validation과 중복 ID·끊어진 필수 URL 형식 검사를 CI에 추가.

완료 기준: 미확인 stars를 10K 이상으로 취급하지 않는 테스트, 라이선스 미확인 후보의 기본 자동선택 제외. 의존: 없음.

## KEC-002: awesome list·MCP·인접 제품 경쟁 조사

할 일: GitHub API와 검색을 통해 CAPTCHA awesome list, provider abstraction 라이브러리, auth orchestration, CAPTCHA MCP, proof-of-personhood 목록을 조사한다. 설치 방어 MCP와 CAPTCHA 해제 MCP를 분리한다. 동일 프로젝트 fork를 별도 검증 사례로 세지 않는다.

완료 기준: 검색어·조회일·URL·활동성·차이점을 기록한 비교표와 “Kechap이 추가하는 가치” 1페이지. 결과가 없으면 검색 범위와 불확실성을 기록한다. 의존: KEC-001.

## KEC-003: 10K stars 선호와 실사용 증거 분리

할 일: stars 10,000 이상 필터, 사용자 지정 임계값, 별 수 미확인 결과 표시를 구현한다. 운영 실적은 공개 사례·다운로드·유지보수·보안 대응 등 별도 필드로 받는다. 별 수만으로 안전 배지를 부여하지 않는다.

완료 기준: 임계값을 만족하는 공급자가 없으면 후보를 꾸며내지 않고 조건 완화 선택지를 설명한다. 의존: KEC-001.

## KEC-004: 라이선스·공급자 도입 검토

할 일: upstream LICENSE의 버전·경로·조회일, MIT/Apache/AGPL 등 의무, 상업 API 이용약관, 클라이언트 자산의 재배포 조건을 별도로 확인한다. AGPL을 금지로 단순화하지 않고 제품 배포 형태에 따른 검토 필요성을 표시한다.

완료 기준: adapter PR에 라이선스와 API 계약 체크 항목, 코드 복사와 API 호출의 구분, 미확인 라이선스의 자동 설치 방지. 의존: KEC-001.

## KEC-005: aside + myproxy + Windows VM 조사

할 일:
- aside.com과 morluto/rea의 공식 문서·README·릴리스·라이선스를 실제 조회한다. 현재 제공 기능이나 지원 OS를 추측하지 않는다.
- myproxy 모델 API의 base URL·인증·지원 모델·요금·data retention을 사용자가 제공한 환경 또는 공식 문서로 확인한다. 비밀값은 출력하지 않는다.
- Linux의 `/dev/kvm`, CPU 가상화, 디스크·메모리, QEMU/libvirt, 네트워크·GUI 접근을 점검한다.
- 공식 Windows 평가 이미지와 사용권을 선택하고 VM 네트워크·snapshot·공유 폴더·자격 증명 분리를 설계한다. Linux에서 가능한 경로와 VM이 실제 필요한 경로를 문서화한다.
- 설치가 가능한 환경에서 Windows guest → aside/REA → myproxy 요청을 최소 한 번 재현하고 비용·스크린샷·로그에서 비밀을 제거한다.

완료 기준: 공식 근거와 재현 기록, 또는 DNS/권한/하드웨어/이미지 부재 등 정확한 blocker 목록. 다운로드·설치·연결을 하지 않았다면 완료로 표시하지 않는다. VM은 문서만으로 설치된 것이 아니다. 의존: 네트워크와 사용 가능한 VM 자원.

## P1 — 에이전트가 설치할 수 있는 제품

## KEC-006: 설명 가능한 추천 정책

입력: 보호 작업, framework/runtime, self-host 의무, 지역·privacy, 월 트래픽, 예산, assurance 범주, 접근성 경로, 상업 사용 조건. 현재 SDK enum은 automation-cost / bot-mitigation / liveness / identity / uniqueness이며 확장 taxonomy는 별도 버전 변경으로 다룬다.

할 일: 필수 제약으로 먼저 필터하고 남은 후보를 근거와 tradeoff로 정렬한다. “PoW만으로 현재 인간 존재” 같은 불가능한 요구 조합을 거절한다.

완료 기준: 문의폼·회원가입·보상 지급·고위험 복구의 fixture 네 개와 추천 사유, 탈락 사유, 미확인 정보 표시. 의존: KEC-001/004.

## KEC-007: 공식 상용 검증 adapter

할 일: Turnstile/hCaptcha 등 공식 siteverify 계약을 각각 구현한다. timeout, malformed response, hostname/action 검증, 테스트 키 분리, 비밀 환경변수 예제를 제공한다. 한 공급자 결과를 다른 공급자의 필드로 추정하지 않는다.

완료 기준: mock 계약 테스트와 선택 가능한 공식 sandbox smoke test, 서버에서만 읽는 비밀키, 오류 시 실패. live 자격증명이 없으면 sandbox 미실행을 명시한다. 의존: KEC-004/006.

## KEC-008: self-host adapter 통합

할 일: ALTCHA/Cap/mCaptcha 등의 최신 공식 서버 계약을 검토하고 우선 하나를 end-to-end로 연결한다. 커뮤니티가 제공한 라이브러리를 upstream 공식 구현으로 잘못 표시하지 않는다. challenge 생성·검증·재사용 저장소·운영 구성 예제를 작성한다.

완료 기준: 깨끗한 환경에서 설치부터 보호된 POST까지 재현, 라이선스와 운영 자원 명시, PoW의 보장 한계 표시. 의존: KEC-004/006.

## KEC-009: framework 설치 예제

할 일: 먼저 한 framework에서 client widget + server route + env.example + 실패 UX를 제공한다. 이후 Next.js/Express/FastAPI 등을 별도 기여로 추가한다. 에이전트는 repository 구조를 파악하고 기존 auth를 보존해 변경안을 생성한다.

완료 기준: 첫 사용자 최소 두 명이 문서만으로 통합, secret bundle 검사, 보호 작업이 서버 검증을 우회할 수 없는 테스트. 의존: KEC-007 또는 008.

## KEC-010: MCP 도구 계약

할 일: 카탈로그 조회·후보 추천·설정 초안 도구에 JSON schema와 에러 계약을 정의하고 stdio 프로토콜을 검증한다. stdout에 진단 문자열을 섞지 않는다. 원격 서버 추가 시 인증·권한·전송 보안을 별도 설계한다.

완료 기준: JSON-RPC initialize → tools/list → tools/call 재현, 잘못된 입력 거부, 비밀 값 수집/반환 금지, 추천과 배포 구분. 의존: KEC-006.

## KEC-011: 에이전트 Skill과 원클릭 경험

할 일: 사용자가 레포 또는 Skill을 지정하면 제품 조건을 파악하고 추천 → 설명 → 통합 코드 → 테스트 → 운영 체크 순서로 진행하게 한다. 필수 요구가 불명확할 때만 질문한다. 외부 서비스 계정·키가 없으면 실행 가능한 설정 초안과 남은 단계 제공.

완료 기준: 새 프로젝트 fixture에서 Skill 따라 통합 변경 생성, 일관된 추천과 서버 검증, 인간 존재를 과장하는 문구 없음. 의존: KEC-009/010.

## P2 — 운영에서 안전한 로테이션

## KEC-012: 세션 고정 정책과 downgrade 방지

할 일: policy version, action, provider, nonce, TTL을 서버 상태에 결속한다. 가중치·순차·sticky 선택의 필요성을 평가하되 한 개를 우선 구현한다. 클라이언트가 provider를 선택하지 못하게 한다. 발급 세션은 로테이션 설정 변경 후에도 같은 verifier를 사용한다.

완료 기준: 공급자 A 세션에 B 응답 제출 거부, 요구 보장 미충족 fallback 거부, 장애 시 새 challenge 또는 명시적 대체 경로. 의존: KEC-007/008.

## KEC-013: 분산 일회용 저장소

할 일: 메모리 예제와 production 저장소를 구분한다. Redis 또는 SQL로 원자적인 consume 계약을 구현하고 protected action과의 트랜잭션 경계를 설명한다. timeout과 worker crash 후 재시도 정책 정의.

완료 기준: 동일 세션 100개 병렬 검증에서 최대 한 번 소비, TTL 경계·다중 프로세스 테스트, cleanup 및 용량 제한. 의존: KEC-012.

## KEC-014: 관측성과 장애 운영

할 일: 공급자별 발급·통과·실패·오류·지연·fallback 수치를 수집한다. 토큰과 비밀은 로그에서 제외한다. health check와 fraud signal을 구분하고 circuit breaker의 보장 하한을 고정한다.

완료 기준: 대시보드 예제, 장애 runbook, 공급자 timeout 시 성공률이 부풀려지지 않는 테스트. 의존: KEC-012/013.

## KEC-015: 접근성·privacy 기본 정책

할 일: 키보드, 스크린리더, reduced motion, 모바일 저성능·저대역폭 테스트 항목을 만든다. 지원 메일 안내만으로 즉시 대체 가능하다고 주장하지 않는다. 이메일·passkey·지원 승인 등 대체 경로가 어느 보장을 제공하는지 명시한다.

완료 기준: 사용자 테스트 계획과 실제 결과 분리, 비퍼즐 대체 경로 실동작, 데이터 흐름·보관·삭제·subprocessor 문서. 생체정보는 기본 비활성화. 의존: KEC-009/012.

## P3 — 인간 검증 벤치마크

## KEC-016: 벤치 프로토콜과 인간 연구 동의

할 일: 자체 toy environment 세 개(정적 선택, drag/rotate, 동적 순서/물리)를 같은 nonce·TTL·재시도 정책으로 구성한다. 성공 조건과 비용 정의를 사전 등록한다. 참여 동의·중단·보관 기한·익명 ID와 접근성 모집 계획을 준비한다.

완료 기준: 실행 가능 프로토콜, threat model, sample size 산정 근거, 개인별 반복측정·학습효과 통제. 측정 전 점수나 우월성 주장을 게시하지 않는다. 의존: KEC-015.

## KEC-017: 서버 replay 실험 엔진

할 일: seed 기반 결정적 상태 전이, bounded event stream, 단조 시간, 서버 시간과 클라이언트 시간 구분, nonce 결속, replay hash를 구현한다. 점수만 제출한 요청을 거절한다.

완료 기준: 동일 입력 재현, tamper·불가능한 시간·초과 이벤트·다른 seed 거부. 통과 결과는 interaction evidence이며 인간 판정으로 판매하지 않는다. 의존: KEC-013/016.

## KEC-018: 통제된 자동화 baseline

할 일: 자체 환경에서 direct API, 고정 macro, headless browser, screenshot-loop VLM, 실시간 GUI agent를 분리 비교한다. 모델·버전·prompt·도구·시도 한도·추론 비용·환경 seed를 기록한다. myproxy는 자격증명과 정책 확인 후 선택 가능한 backend로 추가한다.

완료 기준: 결과 raw aggregate와 실행 설정, 실패도 포함한 비용, 95% 신뢰구간, 같은 challenge budget 비교. 타사 운영 CAPTCHA 해제나 무단 부하 실험 금지. 의존: KEC-005/017.

## KEC-019: 인간 파일럿과 비교 보고서

측정: 완료율, 중도 이탈, median/p95 시간, false reject 정의, 기기·접근성 그룹별 결과, fallback 성공률, 서버 CPU·전력·비용, 공격자 성공률·시도당 비용.

완료 기준: 분모·제외 기준·반복 수·신뢰구간 공개, 개인정보 없는 재현 artifact, 독립 검토자 재현. 목표 예시인 완료율 95% 또는 5~8초는 초기 가설이며 검증된 수치가 아니다. 의존: KEC-016/018.

## KEC-020: 벤치 리더보드와 출시 판단

할 일: benchmark version, dataset split, seed rotation, 제출 코드·환경, 재현 검토, 오래된 결과 표시, 공격자 적응 이후 재평가를 정의한다. 단일 종합 점수보다 인간 UX·공격 비용·운영 비용을 함께 보여준다.

완료 기준: 최소 한 독립 재현, public result card, 결과 철회·수정 절차. VLM과 인간 비용 차이가 없거나 접근성 손실이 크면 게임 엔진 확대를 중단하고 orchestration 가치에 집중한다. 의존: KEC-019.

## P4 — 기여 생태계와 확장

## KEC-021: 공급자 기여와 보안 검토 체계

할 일: provider proposal → metadata 검토 → adapter 계약 테스트 → 제한적 실운영 근거 순서를 정의한다. CODEOWNERS, 보안 신고, 버전·deprecated 정책, 의존성 갱신 담당을 정한다.

완료 기준: 외부 기여자가 하나의 후보를 제출하고 검토 통과, 검증 전 공급자에 명확한 배지, 악성 endpoint·라이선스 누락 거부. 의존: KEC-001/007.

## KEC-022: liveness·identity·personhood 선택 확장

할 일: AWS/FaceTec/iProov/World ID 등 공식 계약을 별도 assurance adapter로 검토한다. biometric 동의·대체 경로·지역·보관·삭제·벤더 실패 정책을 제품별로 정의한다. 동일 인간과 계정 소유자, 유일한 인간의 차이를 UI에 표시한다.

완료 기준: 최소 하나의 공식 sandbox 통합과 data-flow review, 기본 비활성화, 원본 영상·음성 저장 없이 가능한 경로 우선. 의존: KEC-004/015/021.

## KEC-023: 실운영 파일럿과 유지 가능성

할 일: 서로 다른 제품 유형의 운영자 다섯 곳을 모집하고 현재 방어와 비교한다. 자동화 감소만 아니라 전환율, 지원 문의, 비용, 설치 시간, 유지보수 시간을 측정한다.

완료 기준: 동의받은 사례 보고서, 실패·해지 이유 포함, 사용자 지불 의사와 운영비 추정. 게임 콘텐츠를 계속 추가해야만 유지된다면 콘텐츠 확장보다 검증·정책 레이어에 투자한다. 의존: KEC-014/015.

## 첫 배포의 우선순위

먼저 KEC-001/004/006을 정리하고 KEC-007 또는 008 한 경로를 완성한다. 이어 KEC-009/010/011로 에이전트 설치 경험을 제공한다. 운영 가능한 로테이션을 원하면 KEC-012/013/015를 출시 차단 조건으로 삼는다. 폭넓은 카탈로그와 실제 검증된 adapter 수를 같은 수치로 발표하지 않는다.
