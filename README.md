# Kechap

> 최신 범위 변경: 사용자 지시에 따라 Aside와 Windows VM은 실행하지 않습니다. 아래 관련 기록은 과거 시도·계획이며 현재 필수 작업이 아닙니다. 현재 보고와 실행 순서는 [진행 상태와 수정 계획](docs/status-and-plan.md)을 따릅니다.

제품에 맞는 사람 인증 수단을 고르고 연결하는 오픈소스 정책 레이어. **SDK + 후보 카탈로그 + MCP + 에이전트 Skill**을 함께 제공합니다. 운영 중에는 서버가 허용한 동일 보증 범주의 공급자 사이에서 회전할 수 있습니다.

현재는 검증되지 않은 초기 프로토타입입니다. 34개 후보를 기록했고, 자체 실험 PoW와 Turnstile·hCaptcha·reCAPTCHA의 공식 서버 검증 어댑터를 구현했습니다. 상용 어댑터 테스트는 모의 응답 기반이며 실제 벤더 검증은 남아 있습니다. 후보의 현재 별 수·라이선스 원문·도입 사례는 네트워크 제한으로 확인하지 못했습니다. **10K 이상 검증 완료 목록이나 AI가 풀 수 없는 CAPTCHA라는 주장을 하지 않습니다.**

## 실행

Node.js 20 이상, 외부 패키지 설치 없이 실행합니다.

```bash
npm test
npm run catalog:check
npm run demo
npm run recommend -- '{"selfHosted":true,"assurance":"automation-cost"}'
```

PoW 예제는 스크립트로 작업을 풀고 토큰 재사용이 거절되는 것을 보여 줍니다. 이는 사람의 존재를 확인하는 예제가 아닙니다. 저장소는 아직 npm에 배포하지 않았습니다.

브라우저 폼 연동은 `npm run demo:web` 후 `http://localhost:3000`에서 확인할 수 있습니다. 기본값은 외부 서비스가 필요 없는 PoW이며, 서버 세션·CSRF 검사·서버 검증·토큰 소비를 연결합니다. 취소·재발급 UI도 포함합니다. 이 실행 환경에서는 포트 바인딩이 금지되어 실제 HTTP/브라우저 검증은 미완료이고, 요청 핸들러와 공급자 SDK 모의 테스트만 통과했습니다.

공식 공급자를 쓰려면 `KECHAP_PROVIDERS=turnstile,hcaptcha`와 각 `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET`, `HCAPTCHA_SITE_KEY`, `HCAPTCHA_SECRET`을 서버 환경에 설정합니다. `KECHAP_HOSTNAME`은 키에 등록한 호스트명이어야 합니다. reCAPTCHA는 `RECAPTCHA_MODE=v2` 또는 `v3`, v3는 `RECAPTCHA_MIN_SCORE`도 설정합니다. 브라우저 모듈 [`src/browser.js`](src/browser.js)의 `mountChallenge(container, issued, {onResponse, onError, signal})`이 공식 widget과 PoW를 같은 인터페이스로 연결하고 공급자 교체 시 이전 콜백을 정리합니다. 외부 공급자 스크립트는 해당 방식이 선택된 경우에만 로드합니다.

## SDK 사용

```js
import { Kechap, siteverifyAdapter } from './src/index.js';

const kechap = new Kechap({
  adapters: {
    turnstile: siteverifyAdapter({
      provider: 'turnstile',
      siteKey: process.env.TURNSTILE_SITE_KEY,
      secret: process.env.TURNSTILE_SECRET,
      hostname: 'example.com',
      action: 'signup',
    }),
  },
  // 실제 서비스에서는 store: sharedAtomicTtlStore 필수
});

// 로그인/서버 세션에서 파생. 브라우저 입력을 그대로 신뢰하지 않습니다.
const context = { tenant: 'product-a', action: 'signup', subject: 'opaque-session' };
const challenge = await kechap.issue({
  context, sessionId: 'server-generated-session',
  providers: ['turnstile'], assurance: 'bot-mitigation',
});
// challenge 공개 설정으로 공식 widget을 렌더링합니다.
// 아래 providerToken은 widget callback으로 받은 뒤 서버 endpoint에 전달합니다.
const result = await kechap.verify({ id: challenge.id, context, response: providerToken });
if (!result.ok) throw new Error('Verification failed');
const accepted = await kechap.consume({ token: result.token, context });
if (!accepted.ok) throw new Error('Expired, mismatched, or already used');
// 이후 보호된 작업 실행. DB idempotency/transaction은 제품에서 구현합니다.
```

샘플의 기본 `MemoryStore`는 단일 프로세스 개발용입니다. 운영 저장소는 `put(key, value, expiresAt)`와 **원자적 삭제·반환 및 만료 처리**를 하는 `take(key)`를 구현해야 합니다. 보호된 작업과 토큰 소비 사이의 장애는 별도 트랜잭션/멱등성 설계가 필요합니다. 서버 인증·CSRF·속도 제한·요청 크기 제한·공급자 widget UI는 이 코어가 제공하지 않습니다.

검증 시도는 성공 여부와 관계없이 challenge를 소모합니다. 다시 시도하려면 새 challenge를 발급합니다. hostname을 고정하고, 공급자가 지원하면 action·reCAPTCHA score를 검사합니다. 보증 범주가 다른 공급자로 회전하면 오류가 납니다. 공급자 장애가 자동 통과로 바뀌지 않습니다.

Turnstile widget에는 발급된 `cData`를 그대로 전달해야 하며 서버가 일치 여부를 검사합니다. hCaptcha와 classic reCAPTCHA의 토큰은 해당 site/action에서 얻은 bearer proof입니다. 이 어댑터는 그 토큰을 처음 얻은 브라우저 세션까지 증명하지 못합니다. 최종 Kechap 토큰의 문맥 결속과 구분해야 합니다. reCAPTCHA 설정에는 `recaptchaMode: 'v2'` 또는 `'v3'`가 필수이며 v3는 `action`과 `minScore`도 필요합니다. Enterprise API는 별도 미구현입니다.

## MCP와 Skill

MCP는 stdio JSON-RPC로 동작하는 읽기 전용 개발 도구입니다. 후보를 읽고 현재 구현 범위에서 추천·통합 계획을 반환합니다. 토큰 발급이나 제품 파일 자동 변경은 하지 않습니다. SDK 없이 CAPTCHA를 대신 풀어 주는 서비스도 아닙니다.

```json
{
  "mcpServers": {
    "kechap": {
      "command": "node",
      "args": ["/absolute/path/to/Kechap/src/mcp.js"]
    }
  }
}
```

도구: `kechap_catalog`, `kechap_recommend`, `kechap_plan`. 설치 Skill은 [`skills/kechap/SKILL.md`](skills/kechap/SKILL.md)이며 참조 파일을 사용할 수 있도록 저장소 전체를 유지한 상태로 사용하세요. 코딩 에이전트가 제품 코드를 읽고 구체적인 통합 패치를 만드는 절차를 제공합니다. 자동 추천은 현재 self-host/제3자 금지/보증 범주/제외 목록만 처리하며, 지역·가격·프레임워크별 자동 패치 생성은 로드맵입니다.

## 수단을 구분합니다

| 요구 | 현재 상태 |
| --- | --- |
| 자동화 비용 증가 (`automation-cost`) | 실험 PoW |
| 봇 완화 (`bot-mitigation`) | 공식 siteverify 어댑터 3개, 실제 환경 검증 필요 |
| 라이브니스 (`liveness`) | 후보만 기록 |
| 등록 신원 (`identity`) | 후보만 기록 |
| 중복 사람 방지 (`uniqueness`) | 후보만 기록 |

passkey는 계정 연속성 수단입니다. 게임 replay는 규칙에 맞는 입력을 확인하는 수단입니다. 이들을 하나의 `human=true`로 합치지 않습니다. 지원되지 않는 요구는 빈 추천을 반환합니다. 접근 가능한 대체 경로와 생체정보 동의는 제품 정책의 일부로 설계해야 합니다.

## 조사·확장 계획

- [조사와 기존 프로젝트 비교 경로](docs/research.md): 34개 후보, Awesome/MCP 검색 경로, 근거 승인 기준
- [아키텍처](docs/architecture.md), [위협 모델](docs/threat-model.md)
- [상세 로드맵 23개](docs/roadmap.md), [개별 이슈 본문](.github/planned-issues/)
- [기여 방법](CONTRIBUTING.md), [보안 상태](SECURITY.md)

기존 Awesome list/MCP의 존재 여부는 아직 실시간 확인하지 못했습니다. 차별화 가설은 **버전이 있는 근거 + 제품별 선택 + 서버 결속 회전 + 접근성 + 인간/에이전트 비교 벤치마크**입니다. 벤치마크 실험·통계·동적 게임·영상 라이브니스 구현은 후속 작업이며 결과를 만들어 내지 않았습니다.

이번 환경에서는 GitHub/Aside DNS 실패, 사용할 수 없는 GitHub 인증, 읽기 전용 `.git` 때문에 원격 게시가 막혔습니다. Aside/MyProxy 연결과 REA 호환성·라이선스를 확인하지 못했고 Windows VM도 설치하지 않았습니다. 상용 제품은 공식 API로 연결하며 비공개 엔진을 추출해 배포한 것으로 표시하지 않습니다.

네트워크 복구 후 `npm run research:refresh`는 GitHub 원본 응답·시각·hash를 `.local/evidence/`에 저장합니다. 이 과정은 후보를 자동 승인하지 않습니다. `python3 scripts/publish-issues.py`로 이슈 미리보기를 하고 `--publish`로 게시할 수 있습니다. 원격 저장소에 기존 이력이 있다면 먼저 fetch·통합한 후 커밋을 푸시하세요.

프로젝트 코드는 Apache-2.0. 외부 후보 코드는 포함하지 않았으며 각 upstream 라이선스는 별도로 적용됩니다.
