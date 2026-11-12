# Kechap 실시간 조사와 근거

조회일: **2026-11-12 UTC**. 이전 DNS 제한은 해소되어 GitHub API, upstream README·LICENSE, 공급자 공식 문서, npm 다운로드 API를 실제 읽었다. Aside 연결과 Windows VM은 사용자 지시에 따라 제외했다. 현재 카탈로그는 **50개 역할별 후보, GitHub 출처를 검토한 후보 37개**다. 이 수치는 검증된 CAPTCHA 엔진 50개 또는 운영 승인 37개라는 의미가 아니다.

근거는 [`catalog/evidence/`](../catalog/evidence/)에 조회일·URL·upstream revision·내용 hash·인용 구간으로 보존했다. 원본 응답 전체는 로컬 `.local/research/`, `.local/research-extra/`에 있고, 공개 근거는 필요한 메타데이터와 짧은 인용만 담는다. `source-reviewed`는 문서·코드 출처를 읽었다는 뜻이며 보안 감사, 실제 CAPTCHA 방어력 측정, 배포 고객 수 검증이 아니다. **현재 모든 외부 후보의 `productionReady`는 false**다. 실행 어댑터와 실제 테스트 상태는 코드·README를 따르며 이 조사만으로 자동 승인하지 않는다.

## 핵심 조사 결과

1. **관련 Awesome list는 이미 있다.** [ZYSzys/awesome-captcha](https://github.com/ZYSzys/awesome-captcha)는 라이브러리·생성기·크랙 도구를 함께 모은 목록이다. [andorsk/awesome-proof-of-personhood](https://github.com/andorsk/awesome-proof-of-personhood)는 personhood 접근과 논문을 모은다. 따라서 Kechap의 가치는 목록 존재 자체가 아니라 도입·운영·측정 품질이어야 한다.
2. **CAPTCHA MCP도 이미 있지만 상당수가 솔버다.** 조사한 `captcha mcp in:name,description` 표본에는 솔버와 브라우저 우회 도구가 다수였다. 사람에게 판단을 의뢰하는 AskAHuman MCP도 있으나 제품에 방어를 설치하는 SDK와는 다르다. 조사 범위에서 Kechap의 전체 조합과 같은 검증된 통합 제품은 확인하지 못했지만, 검색으로 부재나 최초를 증명하지 않는다. [비교표](comparison.md)를 참고한다.
3. **10K stars가 필수이면 직접 CAPTCHA 후보 상당수가 제외된다.** ALTCHA 2,897, Cap 8,352, mCaptcha 2,501이었다. 10K를 넘은 후보는 Anubis·FingerprintJS·SafeLine·CrowdSec처럼 프록시·기기 신호·위험 방어 역할이 많다. 이들을 폼 CAPTCHA 엔진과 같은 기능으로 취급하면 잘못된 추천이 된다.
4. **라이선스와 유지보수에 실질적 수정이 있었다.** base64Captcha는 Apache-2.0이며 이전 MIT 후보 표기를 수정했다. Securimage는 BSD-2-Clause이고 README가 유지보수 종료를 명시한다. anji-plus/captcha의 현재 README는 유지보수 중단을 표시한다. Private Captcha는 PolyForm Noncommercial이어서 상업적 무제한 OSS로 추천하면 안 된다.
5. **REA는 Linux에서도 일부 분석이 가능하다.** README가 Linux의 procps `ps` 전제와 static JavaScript/Electron 분석 경로를 설명한다. macOS 또는 Windows만 있어야 하는 도구라는 전제는 틀렸다. 현재 Node 요구는 22.23.4+/24.22.1+/26.12.1+이며 로컬 Node 20에서는 바로 실행할 수 없다. 실제 실행·상용 엔진 추출은 하지 않았다.

## 인기도와 사용 근거는 분리한다

10K는 우선 **GitHub stars ≥ 10,000**으로 해석했다. 별 수는 조회 시점 값이며 보안·유지보수·활성 사용자 수를 증명하지 않는다. 다음 값은 공개 evidence 파일과 카탈로그의 `starsCheckedAt`에 연결된다.

| 후보 | GitHub stars | 읽은 라이선스 | 실제 역할과 도입 판단 |
| --- | ---: | --- | --- |
| Anubis | 24,115 | MIT | AI scraper 방어용 프록시/PoW. 폼 위젯이나 human-presence 증명과 다름 |
| FingerprintJS | 28,731 | MIT, 확인한 revision 기준 | 브라우저 기기 식별 신호. OSS와 상용 Fingerprint Identification은 다른 구현 |
| SafeLine | 23,258 | 저장소 루트 GPL-3.0 | WAF·프록시의 anti-bot 기능. 배포되는 모든 바이너리의 소스 공개 여부는 별도 확인 필요 |
| CrowdSec | 15,561 | MIT | 로그·HTTP 행동·평판·remediation. CAPTCHA와 결합 가능한 위험 레이어 |
| Cap | 8,352 | Apache-2.0 | self-hosted PoW/instrumentation, 공식 repo는 tiagozip/cap |
| ALTCHA | 2,897 | MIT | self-hosted PoW. 실제 버전별 접근성·Sentinel/서비스 경계 확인 필요 |
| mCaptcha | 2,501 | AGPL-3.0 | PoW 백엔드. 배포·수정·서비스 제공 의무 검토 |
| GoCaptcha | 2,472 | Apache-2.0 | Go click/slide/drag/rotate 라이브러리, 행동 입력 자체가 인간 보장은 아님 |
| Laravel Captcha | 2,592 | MIT | Laravel 이미지 CAPTCHA 통합, 현대 OCR/VLM 기준선 측정 필요 |
| mosparo | 314 | MIT | 입력 내용 규칙 기반 스팸 필터. 퍼즐 없는 폼 방어, human proof는 아님 |

npm의 최근 1개월 다운로드도 별도로 조회했다. 기간은 **2026-10-13~2026-11-11**이다. `altcha` 1,045,779회, `@cap.js/widget` 166,070회, `@fingerprintjs/fingerprintjs` 8,703,708회, `@fingerprintjs/botd` 1,514,604회, `svg-captcha` 324,929회, `@simplewebauthn/server` 34,442,061회였다. [npm 근거](../catalog/evidence/npm-altcha.json)처럼 응답을 보존했다. **다운로드는 CI·재설치·캐시 영향을 받는 배포 활동 지표이며 고유 제품·월 사용자·보안 효과가 아니다.** Python `lepture/captcha`와 npm의 동명 `captcha`를 동일 프로젝트로 연결하지 않는다.

Cap README는 bunny.net·AdGuard의 운영 사용을 주장한다. 이는 **maintainer 주장**으로 분류하며 두 고객의 독립 문서나 실사용 계측을 확인한 것으로 표시하지 않는다. Anubis README의 후원사 목록 역시 배포 고객 목록과 같지 않다. 실제 고객·외부 감사 근거는 후속 provider 승인 단계의 별도 필드다.

## 후보 분류와 우선순위

| 분류 | 후보 | Kechap에서의 위치 |
| --- | --- | --- |
| 폼/API 연산 작업 | ALTCHA, Cap, mCaptcha, Wicketkeeper | 실제 엔진 연동 우선. PoW는 automation cost, 사람 증명 아님 |
| 이미지·오디오 생성 | dchest/captcha, base64Captcha, lepture/captcha, Django Simple Captcha, Gregwar, Laravel Captcha, svg-captcha | 생성·저장·만료·replay 계약을 검토하고 OCR/VLM 기준선으로 측정 |
| 상호작용 | Tianai, GoCaptcha, SliderCaptcha, AJ-Captcha 역사적 fork | 키보드·비시각 대안과 서버 검증 유무 검토. 입력 궤적만으로 human=true 발급 금지 |
| 위험·프록시 | Anubis, Cerberus, SafeLine, CrowdSec, BotD, FingerprintJS | 독립된 risk/edge layer. 기기나 요청 위험은 identity와 별도 |
| 퍼즐 없는 스팸 방어 | mosparo, Rails Invisible Captcha | 내용 규칙·honeypot·timing. 차단 비용과 오탐 측정 필요 |
| 상용 공식 API | Turnstile, hCaptcha, reCAPTCHA, Arkose, GeeTest | 공식 서버 검증·키 발급·이용조건으로 연동. proprietary engine을 소유한 것으로 주장하지 않음 |
| 선택적 liveness | AWS, FaceTec, iProov, Pindrop | 명시적 동의와 equivalent recovery가 있는 고위험 승격 후보. 원본 영상/음성 기본 비수집 |
| 계정/유일성 | SimpleWebAuthn, World ID, Semaphore | account continuity, issuer-backed personhood, group membership을 각각 구분 |

### 승인 전에 제외·검토할 사례

- **dchest/captcha:** README 자체가 advanced OCR에 깨질 수 있다고 경고한다. 자동 추천의 강한 방어로 올리지 않는다.
- **Securimage:** 유지보수 종료. 역사적 기준선으로만 남긴다.
- **anji-plus/captcha:** 현재 canonical repo의 별 수는 27이며 README는 중단 안내다. `raodv/captcha`의 1,704 stars를 합치거나 과거 인기를 현재 canonical 값으로 대체하지 않는다.
- **Private Captcha:** PolyForm Noncommercial 1.0.0. 상업 배포는 별도 라이선스 조건 확인 필요. permissive OSS와 같은 자동 설치 후보가 아니다.
- **Wicketkeeper:** client/example MIT, server AGPL v3인 복합 라이선스다.
- **Friendly Captcha:** 과거 `friendly-challenge` 클라이언트 MIT와 v2 SDK MPL-2.0, 호스팅 엔진·서비스 조건을 구분한다.
- **SwipeCaptcha:** API·README는 읽었으나 LICENSE 원문을 찾지 못했다. 소스가 보인다는 이유만으로 복사·배포 승인을 주지 않는다.
- **FCaptcha:** AI-agent 차단·WCAG·오탐 예산 등 주장은 maintainer 주장이다. Kechap이 독립 재현한 결과로 쓰지 않는다.

## 공식 문서에서 확인한 서버 계약

- [Turnstile 공식 server validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/): 서버 Siteverify 필수, 300초 유효 토큰, 일회성 의도, hostname/action/cdata 검사. 최신 문서는 토큰 재사용과 네트워크 convergence도 별도로 설명한다. 공급자 일회성에만 의존하지 않고 Kechap의 원자적 소비도 필요하다. [근거](../catalog/evidence/turnstile-server.json)
- [hCaptcha 문서](https://docs.hcaptcha.com/): siteverify, secret/response, 테스트 키, 토큰 만료·single-use. 개발 호스트 설정과 CSP도 검토해야 한다. [근거](../catalog/evidence/hcaptcha.json)
- [Google classic v3 문서](https://developers.google.com/recaptcha/docs/v3): 서버가 action과 risk score를 검증해야 한다. 조회 페이지는 deprecated 안내와 Google Cloud Fraud Defense 경로를 표시하므로 classic siteverify와 Enterprise assessment를 혼동하지 않는다. [근거](../catalog/evidence/recaptcha-v3.json)
- [Cap 공식 설명](https://capjs.js.org/about.html): Apache-2.0 self-host, widget/capd/capjs-core, PoW와 instrumentation, reCAPTCHA/hCaptcha 호환 siteverify를 설명한다. [근거](../catalog/evidence/cap-about.json)
- [AWS Face Liveness](https://docs.aws.amazon.com/rekognition/latest/dg/face-liveness.html): 0~100 probabilistic confidence이며 완전 보장을 하지 않고 다른 요인과 risk-based decision을 권한다. CAPTCHA 단독 대체라는 주장은 하지 않는다. [근거](../catalog/evidence/aws-liveness.json)
- [World ID](https://docs.world.org/world-id/overview): Proof of Human / Attributes / Presence는 보증이 서로 다르다. issuer credential·scope·nullifier에 따른 중복 범위를 확인해야 한다. [근거](../catalog/evidence/world-id.json)
- [WCAG 2.2 1.1.1](https://www.w3.org/TR/WCAG22/#non-text-content): CAPTCHA의 목적을 설명하는 text alternative와 서로 다른 감각 출력의 대체 형태를 요구한다. 실제 통합이 이를 만족하는지는 별도의 보조공학 평가가 필요하다. [근거](../catalog/evidence/wcag-captcha.json)

## REA 조사 결과와 범위

[morluto/rea](https://github.com/morluto/rea)의 README·MIT LICENSE를 revision `d74549e495…`에서 읽었다. [증거](../catalog/evidence/morluto--rea.json)의 전체 SHA를 기준으로 한다. REA는 분석 도구이며 CAPTCHA 서버 엔진 자체가 아니다.

README는 static JavaScript/Electron 분석에 native analysis engine이 필요 없고 Linux에서 procps 호환 `ps`가 필요하다고 명시한다. native 분석은 Hopper·Ghidra·IDA·Kuna 등 선택한 provider와 호스트 지원에 의존한다. Node.js는 22.x ≥22.23.4, 24.x ≥24.22.1 또는 26.12.1+를 요구한다. 현재 작업 Node 20과는 차이가 있으므로 `npx ...@latest`를 곧바로 실행한 것으로 보고하지 않는다.

이번에는 지원 OS·라이선스·분석 계약을 확인했다. **설치, 에이전트 전역 설정 변경, 상용 서비스 분석, 비공개 CAPTCHA 엔진 추출·재배포는 수행하지 않았다.** Windows VM이나 Aside는 필요 조건도 실행 계획도 아니다. 이후 Linux에서 소유하거나 명시적으로 허가된 fixture를 분석하는 별도 실험으로 사용할 수 있다. 도구의 MIT 라이선스가 분석 대상 엔진의 복사·배포 권한까지 부여하지는 않는다.

## 공개 벤치마크 방향

[USENIX Security 2025 Halligan](https://www.usenix.org/conference/usenixsecurity25/presentation/teoh)의 실제 페이지는 visual CAPTCHA 26종 2,600개에서 60.7%, CAPTCHA farm 미지 challenge에서 평균 70.6%를 보고한다. [인용 근거](../catalog/evidence/usenix-agent.json)를 보존했다. 이는 해당 연구의 실험 결과이고 Kechap 성능 결과가 아니다.

따라서 seed·nonce·서버 replay는 조작된 성공 선언과 replay를 막는 수단으로 평가하고 “인간만 가능”이라고 주장하지 않는다. 실제 유효 입력을 VLM/computer-use agent도 만들 수 있는지 측정해야 한다. 자체 toy 환경의 정적 선택·drag/rotate·동적 순서/물리 과제를 비교하고 아래를 보고한다.

- 인간 완료율·이탈·median/p95 시간·false reject, 모바일·저사양·보조공학별 결과.
- script·직접 API·headless·VLM·computer-use 성공률, 재시도·모델 버전·토큰·시간·금전 예산.
- 서버 replay/토큰 재사용 거절, 공급자 outage와 회전 중 일관성, 검증 CPU·지연·운영 비용.
- 표본 수, 모집 조건, 동의·철회, 신뢰구간, 학습 오염·holdout, 원본 biometric 비수집.

현 단계는 수집된 출처와 구현 계약의 기반이다. 독립 보안 감사, 모든 후보의 live sandbox, 인간 파일럿, 최종 접근성 적합성, 광범위 실사용 사례 검증은 남아 있다.
