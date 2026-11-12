# Kechap 조사 노트와 근거 수집 계획

> 최신 범위 변경: 사용자 지시에 따라 Aside와 Windows VM은 실행하지 않습니다. 아래 관련 기록은 과거 시도·계획이며 현재 필수 작업이 아닙니다. 현재 보고와 실행 순서는 [진행 상태와 수정 계획](status-and-plan.md)을 따릅니다.

기준일: 2026-11-12. 이 문서는 **오프라인 후보 조사**다. 현재 실행 환경에서 `api.github.com`과 `aside.com`의 DNS 조회가 실패했다(`curl` exit 6). 따라서 GitHub 현재 별 수, 최신 커밋, 실제 배포 수, 라이선스 원문, 벤더 최신 가격·기능, Awesome list 및 MCP의 존재 여부를 실시간 검증하지 못했다. 아래 링크는 후속 조사 출발점이며 이번 세션에서 읽었다는 증거가 아니다. 사용자 제공 설명 역시 독립 검증 결과로 바꾸어 표기하지 않는다.

## 제품의 기준

Kechap은 CAPTCHA 콘텐츠를 한데 복사한 제품보다 **인증 수단의 레지스트리 + 정책 엔진 + 공식 검증 어댑터 + 에이전트 설치 도구 + 재현 가능한 벤치마크**로 만드는 편이 낫다. 제품 개발자는 “한국 이용자 중심, 가입 폼, 자체 호스팅 필수, 생체정보 금지, 월 검증량, 모바일 비중, 접근성 요구”를 입력하고, 에이전트는 해당 조건에 맞는 후보와 선택 이유를 제시한다. 서버 키와 배포 승인이 필요한 지점만 사람이 결정한다.

클라이언트에서 CAPTCHA UI를 교체하는 것만으로는 안전한 로테이션이 되지 않는다. 서버가 발급 시점의 provider, purpose, origin, 정책 버전, 만료 시각을 고정하고 해당 provider의 서버 검증으로만 결과를 받는 방식이어야 한다. 유효한 토큰을 다른 액션이나 다른 공급자로 옮기지 못하게 해야 한다. 공급자 장애 때 더 약한 수단으로 조용히 통과시키는 정책은 금지하고 명시적 대체 경로를 제공한다.

MCP와 Skill은 **제품에 붙여 주는 개발 도구**이고, 브라우저 사용자 CAPTCHA를 대신 풀어 주는 솔버가 아니다. SDK와 서버 검증 API가 런타임이며 MCP/Skill이 없어도 제품이 동작해야 한다.

## 서로 다른 보증 수준

| 분류 | 확인하려는 것 | 후보 예 | 증명하지 못하는 것 |
| --- | --- | --- | --- |
| 봇 비용·위험 신호 | 요청 자동화 비용 또는 수상한 환경 | ALTCHA, Cap, mCaptcha, Anubis, Turnstile | 실제 사람 존재, 실명, 유일성 |
| 인터랙션 | 과제와 일치하는 입력이 발생 | 기존 이미지·드래그, Kechap replay 실험 | 그 입력의 작성자가 사람인지 |
| 라이브니스 | 지금 살아 있는 사람이 센서 앞에 있음 | AWS, FaceTec, iProov, Pindrop | 등록 본인 또는 한 사람 한 계정 |
| 계정 연속성 | 등록된 인증 수단 소유 | WebAuthn/passkey | 최초 등록자가 사람인지 |
| 그룹 소속 | 등록 그룹의 구성원임 | Semaphore | 그룹 등록 절차가 확인하지 않은 인간성 |
| Personhood | 특정 발급자의 인간/유일성 자격 | World ID 등 | 발급자·자격 종류 밖의 보편적 보장 |

“사람만 할 수 있는 게임”이라는 표현은 검증 가능한 보안 주장이 아니다. 서버 replay는 위조된 성공 선언을 막는 수단이고, 유효한 입력을 생성하는 에이전트까지 구분해 준다는 뜻은 아니다. Kechap은 이 차이를 선택 UI, 결과 스키마, 문서와 벤치마크에서 유지해야 한다.

## 오픈소스 후보군

기계 판독 원본은 [`catalog/providers.json`](../catalog/providers.json)에 있다. 34개 항목은 역할이 서로 다르며 모두 CAPTCHA 엔진인 것은 아니다. 초기 라이선스 표기는 알려진 후보값이고, 현재 원문을 확인한 법적 감사 결과가 아니다. 각 항목의 `stars`, `starsCheckedAt`, `over10k`는 모두 `null`이다.

| 후보 | 형태 / 유용한 용도 | 도입 전에 확인할 점 |
| --- | --- | --- |
| [ALTCHA](https://github.com/altcha-org/altcha) | self-host PoW, 폼·API 자동화 비용 부과 | 코어/유료 위험 분석 기능 경계, 저사양 기기 비용, 재사용 방지 |
| [Cap](https://capjs.js.org/) | self-host CAPTCHA 대체 후보 | 공식 저장소, instrumentation 범위, siteverify 호환 버전 |
| [mCaptcha](https://github.com/mCaptcha/mCaptcha) | self-host PoW | AGPL 적용 범위와 수정·서비스 제공 의무 검토 |
| [Anubis](https://github.com/TecharoHQ/anubis) | scraper 방어 reverse proxy | 폼 위젯과 다른 통합, 정상 봇 allowlist, JS 불가 사용자 |
| [Cerberus](https://github.com/SJTUG/cerberus) | PoW 기반 edge 보호 후보 | 현재 프로젝트 상태, 라이선스, 프록시 배포 계약 |
| [dchest/captcha](https://github.com/dchest/captcha), [base64Captcha](https://github.com/mojocn/base64Captcha) | Go 이미지·오디오 생성기 | 현대 OCR/VLM 방어력 별도 측정, 세션·TTL 직접 결합 |
| [Tianai](https://github.com/dromara/tianai-captcha), [AJ-Captcha](https://github.com/anji-plus/captcha) | Java 드래그·이미지 인터랙션 | 키보드/비시각 대체, upstream 유지보수, 공격 비용 |
| [lepture/captcha](https://github.com/lepture/captcha), [django-simple-captcha](https://github.com/mbi/django-simple-captcha) | Python / Django 통합 | 라이브러리를 완성된 위험 엔진으로 간주하지 않을 것 |
| [svg-captcha](https://github.com/produck/svg-captcha), [Gregwar](https://github.com/Gregwar/Captcha), [Securimage](https://github.com/dapphp/securimage) | JS/PHP 기존 텍스트 CAPTCHA | 주로 비교 기준선; 효과·접근성 측정 없이 추천 금지 |
| [BotD](https://github.com/fingerprintjs/BotD) | 브라우저 자동화 신호 | 클라이언트 신호 조작 가능성, 오탐, 단독 인증 금지 |
| [FingerprintJS](https://github.com/fingerprintjs/fingerprintjs), [CreepJS](https://github.com/abrahamjuliot/creepjs) | 기기 신호·연구 도구 | 개인정보, 라이선스 버전, signal ≠ human 구분 |
| [LibreCaptcha 후보](https://github.com/librecaptcha/lc-core) | 커뮤니티 CAPTCHA 후보 | 저장소 정체성부터 재확인해야 하는 discovery 항목 |
| [Friendly Captcha](https://github.com/FriendlyCaptcha/friendly-challenge) | 공개 client + 상용 서비스 경계 조사 | 버전별 라이선스와 self-host 범위 |
| [SimpleWebAuthn](https://github.com/MasterKale/SimpleWebAuthn) | 인증된 계정의 대체 경로 | 최초 인간성 증명이 아님; 복구·등록 UX |
| [Semaphore](https://github.com/semaphore-protocol/semaphore) | 익명 그룹 소속·nullifier | 등록자 검증과 범위 제한은 별도 문제 |

### “10K 이상”을 다루는 규칙

요청의 10K는 우선 **GitHub stars ≥ 10,000** 후보 필터로 해석한다. 다운로드·배포·월 사용자 수 10K를 뜻한다면 별도 지표로 분리해야 한다. 별은 인기도 신호이며 보안 검증, 유지보수 품질, 실제 사용량의 대체 지표가 아니다. 현재 별 수를 조회하지 못했으므로 이 문서는 어떤 후보도 “10K 검증 완료”로 표시하지 않는다.

연결 가능한 환경에서는 후보별 GitHub API `/repos/{owner}/{repo}` 응답에서 `stargazers_count`, `archived`, `pushed_at`, `license.spdx_id`, 기본 브랜치를 수집하고 응답 시각·원문 hash를 기록한다. README, LICENSE, 릴리스, 보안 정책, 최근 이슈 응답, 외부 도입 사례를 pin한 커밋과 연결한다. 출시 시 승인하는 어댑터는 별 수와 별개로 다음 evidence gate를 통과해야 한다.

1. upstream 정체성과 배포 패키지 소유자가 일치하고 버전·라이선스를 확인했다.
2. 실제 공식 API로 sandbox/contract test를 통과했다.
3. 서버 검증, TTL, replay, purpose·hostname 결속이 확인됐다.
4. 최소 한 가지 접근 가능한 동등 경로와 장애 정책이 검증됐다.
5. 개인정보·운영 비용 및 유지보수 책임이 문서화됐다.
6. 보안 효과는 재현 가능한 공격/인간 실험 또는 외부 감사의 범위와 버전을 함께 제시한다.

의존성은 자동으로 “최신”으로 바꾸지 않는다. 후보 발견, 승인된 버전, 추천 가능 상태를 서로 분리한다.

## 클로즈드소스 연동

[Turnstile](https://developers.cloudflare.com/turnstile/), [reCAPTCHA](https://docs.cloud.google.com/recaptcha/docs/overview), [hCaptcha](https://docs.hcaptcha.com/), [Arkose](https://developer.arkoselabs.com/docs/standard-setup), [GeeTest](https://docs.geetest.com/)는 공식 API 어댑터 대상으로 조사한다. Kechap에 벤더의 CAPTCHA 엔진 소유권이 생기는 것은 아니다. API·SDK 라이선스, 데이터 처리, 키 발급, 요금과 장애 정책을 각 항목에 표시한다.

AWS Face Liveness, FaceTec, iProov, Pindrop은 일반 가입폼의 기본값이 아니라 명시적으로 생체정보와 높은 비용을 허용한 고위험 정책의 승격 후보로만 둔다. 원본 영상·음성을 Kechap이 수집하는 공통 API부터 만들지 않는다. vendor session/reference와 필요한 최소 검증 결과를 받는 방향을 우선 검토한다. World ID 역시 자격 종류별 보증 수준과 사용자 등록 가능 지역을 확인해야 한다.

### REA와 Windows VM

사용자가 지정한 [morluto/rea](https://github.com/morluto/rea.git)는 네트워크 제약으로 README·라이선스·설치 요구 사항을 읽지 못했다. 따라서 해당 도구가 Windows를 지원한다거나 macOS 전용이라고 단정하지 않는다. 상용 엔진을 추출·재배포할 권한이 있다고도 간주하지 않는다.

후속 작업은 저장소를 pin한 뒤 요구 OS, 도구 의존성, 라이선스, 자격증명 처리, 외부 전송을 확인하는 것부터 시작한다. 분석은 자체 제작 또는 명시적으로 허용된 로컬 challenge·바이너리에서 수행한다. 발견된 공개 API 계약은 어댑터에 반영할 수 있지만, 공급자의 비공개 challenge 엔진·키·검증 회피 코드를 복사해 기본 패키지로 배포하지 않는다. 상용 서비스는 공식 연동으로 충분한지 먼저 확인한다.

Linux에서 Windows VM 실행이 필요하다고 확인되면 KVM 지원, `/dev/kvm`, 메모리·디스크 용량, 승인된 Windows 이미지와 라이선스, 격리 네트워크를 점검한다. 이번 세션에서는 이미지 다운로드, VM 생성, Windows 부팅 또는 REA 실행을 완료하지 않았다. `macOS를 못 띄우므로 Windows`라는 전제만으로 실제 도구 호환성이 해결되지는 않는다. 이를 완료한 연구처럼 보고하지 않는다.

## Aside와 MyProxy 연결

`https://aside.com/`은 이 실행 환경에서 DNS 해석되지 않았고, 사용 가능한 Aside 전용 커넥터도 확인되지 않았다. 사이트의 실제 서비스 기능·API·인증 방식을 확인하지 않은 상태에서 특정 endpoint를 구현하면 안 된다. 같은 이유로 이번 조사에서 “Aside deep research 완료”라고 말할 수 없다.

연결 가능한 환경에서 해야 할 일:

1. Aside의 공식 API/브라우저 지원 범위와 이용 약관을 확인하고, 사용자 계정으로 허용된 조사 경로를 정한다.
2. MyProxy의 문서로 base URL, 인증 헤더, 실제 모델 목록, API 호환 형식, 보존 정책을 확인한다. 비밀키는 환경 변수/secret store로 주입하고 저장소·로그에 넣지 않는다.
3. 검색 질문을 오픈소스 CAPTCHA, 접근성, PoW, interaction, PAD/liveness, proof-of-personhood, awesome lists, MCP로 나눠 검색한다.
4. Aside 출력은 발견 자료로 취급하고 별 수·라이선스·보안 주장을 upstream과 공식 문서에서 재확인한다.
5. 조사 결과에는 요청 시각, 모델·설정, URL, 인용 구간, upstream revision, 상충하는 근거를 기록한다. 비밀키나 개인 연구 대화는 첨부하지 않는다.

## 이미 유사한 Awesome list 또는 MCP가 있는가

**현재 환경에서는 존재·부재를 확인하지 못했다.** “없다”, “최초다”, “유일하다”는 표현을 쓰지 않는다. 상용 CAPTCHA 선택 플랫폼, 라이브러리 컬렉션, bot-detection 목록, agent solver MCP는 서로 다른 시장이므로 검색 결과를 한 덩어리로 세지 않는다.

재실행할 공개 검색 경로:

- [GitHub awesome captcha](https://github.com/search?q=awesome+captcha&type=repositories)
- [GitHub human verification](https://github.com/search?q=human+verification&type=repositories)
- [GitHub captcha MCP](https://github.com/search?q=captcha+mcp&type=repositories)
- [GitHub proof of personhood](https://github.com/search?q=proof+of+personhood&type=repositories)
- [GitHub captcha provider SDK](https://github.com/search?q=captcha+provider+sdk&type=repositories)
- [MCP Registry](https://registry.modelcontextprotocol.io/)
- [Awesome Selfhosted](https://github.com/awesome-selfhosted/awesome-selfhosted)에서 CAPTCHA/identity 관련 항목과 해당 항목의 현재 경로를 검색

각 발견 결과는 목적(통합/선택/벤치마크/솔버), maintainer, 최근 release, 허가, 공식 연동, 서버 검증, rotation, 접근성, 정책 설명, agent install 기능으로 비교한다. 솔버만 제공하는 MCP는 Kechap의 경쟁 제품과 다른 분류로 기록한다. 일반적인 provider wrapper가 존재하더라도 **근거 버전이 있는 추천 + 접근성 정책 + 서버 결속 rotation + 인간/에이전트 비용 벤치마크**가 함께 있는지 확인해야 차별화를 주장할 수 있다.

## 벤치마크가 제공해야 하는 근거

실험은 소유·허가된 환경에서만 수행하고 외부 서비스의 CAPTCHA 우회 실험과 혼동하지 않는다. 최초 baseline은 정적 이미지/드래그/서버 replay 동적 challenge와 PoW다. 자동화가 통과하면 그대로 결과를 공개한다. 공개 데이터셋과 비공개 holdout을 구분하고 seed 누출·학습 오염을 측정한다.

- 인간: 완료율, 중도 이탈, 중간값/p95 시간, false reject, 모바일/데스크톱, 저사양·저대역폭, 보조공학과 대체 경로 완료율.
- 자동화: 직접 API, 고정 매크로, Playwright, screenshot-loop VLM, 실시간 computer-use, relay에 대한 성공률·비용·모델/도구 버전.
- 서버: 검증 p95, 공급자 호출 실패, 토큰 replay 차단, 정책 교체 중 검증 일관성, 장애시 동작, 메모리·CPU·요금.
- 통계: 표본 수, 모집 조건, 신뢰구간, 결측과 제외 기준, 재시도 한도, 공격 예산, challenge revision과 실험 hash.
- 개인정보: 원본 생체정보 기본 비수집, 동의·최소 보존, 참가자별 철회 경로, 익명화된 집계 공개.

파일럿의 5~8초 완료 시간 같은 목표는 성능 결과가 아니라 가설이다. 성능 증명 없이 `human_verified=true`라는 보편적 claim을 발급하지 않는다. 결과에는 `assurance`, `provider`, `policyVersion`, `purpose`, `issuedAt`, `expiresAt`와 실제 확인 범위가 남아야 한다.

## 우선순위

1. MVP: 제한된 안전한 어댑터, 후보 레지스트리, 결정 이유가 보이는 추천, 서버에서 고정한 rotation, replay/expiry 테스트, 문서와 예제.
2. 근거 갱신: 네트워크 복구 후 현재 별 수·라이선스·공식 API·기존 프로젝트 조사와 후보 승인.
3. 실제 통합: Turnstile/ALTCHA/Cap의 공식 버전별 sandbox, 프레임워크 설치 PR 생성, secret 배포 가이드.
4. 벤치마크: 인간 참가 파일럿, 접근성 평가, 소유한 테스트 사이트에서만 에이전트 평가.
5. 기여 생태계: adapter manifest, provenance 검토, DCO/라이선스 정책, maintainer 책임, 취약점 신고·폐기 절차.
6. 실험: 동적 replay surface, 선택적 liveness/personhood, 신호 결합·비용 기반 정책. 검증 전에는 안정 어댑터와 별도 배포한다.
