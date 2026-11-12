# 운영 지표와 공급자 장애 대응

Kechap의 지표는 **서버 검증 결과와 운영 상태**를 보여준다. 사람인지, 사기 위험이 얼마나 높은지 또는 유일한 사람인지 판단하는 점수가 아니다. 같은 assurance에 속한 공급자라도 실제 방어력·접근성·개인정보 정책이 동일한 것은 아니다.

## 연결

```js
import {Kechap} from '../src/index.js';
import {createMetrics, createCircuitBreaker} from '../src/observability.js';

const providers = ['altcha', 'cap'];
const metrics = createMetrics({providers, maxLatencySamples: 512});
const breaker = createCircuitBreaker({providers, failureThreshold: 3, cooldownMs: 30000});
const kechap = new Kechap({adapters, store: sharedAtomicStore, onEvent(event) {
  metrics.observe(event);
  breaker.observe(event);
}});

const issued = await kechap.issueWithPolicy({
  context, sessionId: trustedSessionId, policy,
  risk: trustedRiskTier, health: breaker.health(),
  requiredAssurance: 'automation-cost'
});
```

`onEvent`는 `operation: issue|verify|consume`, `outcome: success|rejected|error`, 설정된 `provider`, 유한한 `durationMs`를 받는다. SDK는 관측기 오류를 인증 판단에서 분리해야 한다. collector의 동기 예외·비동기 rejection 때문에 인증을 통과시키거나 정상 검증을 바꾸면 안 된다. 토큰, challenge, nonce, 사용자 세션, IP, 키, 전체 에러 메시지·stack을 이벤트로 넘기지 않는다. 정책 버전은 correlation에 쓸 수 있지만 이 기본 collector는 label로 저장하지 않아 version 변경에 따른 cardinality 증가를 막는다.

`createMetrics`는 공급자 최대 64개와 `unknown`, 작업 4개에 고정된 행만 만든다. 설정되지 않은 provider label은 `unknown`으로 합치고 추가 event 필드는 저장하지 않는다. 각 행은 누적 success/rejected/error와 **최근 최대 512개** latency에서 p50/p95를 산출한다. 이는 전체 기간 percentile이 아니다. 유효하지 않은 이벤트 수를 `droppedEvents`로 표시한다. snapshot은 복사본이고 `reset()`은 해당 프로세스의 누적 기간을 새로 시작한다.

`issue success`는 과제가 만들어졌다는 뜻이며 인증 통과가 아니다. `consume success`는 이미 검증된 토큰을 업무 처리 앞에서 소비했다는 뜻이다. 서로 더해서 사람 검증 성공률로 제시하지 않는다. timeout·잘못된 공급자 응답·네트워크 오류는 운영 error이며 verify success 분자에 넣지 않는다. 실패한 과제와 운영 장애를 혼동하지 않도록 adapter의 검증 거절과 transport failure도 분류해야 한다.

## Fallback 계측

공급자 선택은 신뢰된 서버가 기록한다. `metrics.recordFallback({provider:'cap', reason:'outage'})`의 허용 이유는 `outage|policy|retry`다. 이 호출은 fallback 선택 횟수만 늘리며 verify success를 늘리지 않는다. 브라우저가 보낸 임의 문자열을 label로 쓰지 않는다. 기본 SDK에서 선택 전 이전 공급자 상태를 알 수 없는 경우에는 제품의 orchestration 지점에서 기록한다. 정책에서 허용하지 않은 낮은 보장으로 전환하는 기능은 없다.

## 대시보드

서버 관리 경로에서 `metrics.snapshot()` 결과를 JSON으로 저장하고 [`examples/metrics-dashboard.html`](../examples/metrics-dashboard.html)을 브라우저에서 열어 파일을 선택한다. 이 페이지는 **실제 snapshot 파일만** 표시하고 임의 성공 수치를 생성하지 않는다. 데이터는 로컬에서 처리하며 외부 업로드·추적·라이브러리 CDN 호출이 없다. 사용자 요청이 접근하는 공개 API에 운영 지표를 무조건 노출하지 말고 기존 관리자 인증 경계에서 export한다.

지표 집계는 프로세스별 메모리다. 여러 worker·재시작·장기 기록은 외부 metrics 저장소에 적절히 집계해야 한다. 이 collector가 분산 저장소나 SLA를 제공하는 것은 아니다. 집계 정책·보존 기한·접근 권한은 제품 운영자가 정한다. 개발 dashboard가 접근성 사용자 테스트나 보안 감사 결과를 뜻하지 않는다.

## Circuit breaker

`createCircuitBreaker`는 issue/verify의 연속 운영 error만 센다. 잘못된 응답의 `rejected`와 consume replay는 공급자 outage가 아니다. 기본 3회 오류 후 health=false로 열린다. 기존에 성공한 in-flight 검증은 이미 열린 breaker를 자동 복구하지 않는다. cooldown이 지났다는 이유만으로 정상이라고 선언하지 않는다.

복구 시 운영자가 소유한 공급자 테스트 경로·허용된 sandbox로 server validation을 확인한 뒤 `breaker.recordProbe(provider,{ok:true})`를 호출한다. HTTP 200만 확인해서는 안 되고, 설정한 site/action과 공식 응답 계약이 유효한지 확인한다. 이 probe는 사람 인증을 우회하는 토큰을 발급하는 기능이 아니다. 미동의인 실제 사용자에게 시험 과제를 보내거나 타사 사이트를 부하 테스트하지 않는다. 실패한 probe는 cooldown을 다시 시작한다.

열린 health map은 `issueWithPolicy`의 허용 공급자 필터에만 쓴다. 발급된 challenge는 원래 provider와 policyVersion으로 검증한다. 모두 비정상이면 새 발급을 실패시키고 retry 또는 제품 소유 동등 복구 절차로 간다. 기존 검증을 자동 성공으로 바꾸거나 assurance 하향을 허용하지 않는다.

## 장애 runbook

1. **상태 구분:** verify rejected 증가와 error 증가를 분리한다. 지표가 없거나 collector가 실패했으면 인증 성공으로 대체하지 않는다.
2. **키·hostname/action 점검:** secret 값을 출력하지 않고 설정 존재, 만료·회전 여부, 등록 hostname과 action을 확인한다. configuration 오류를 봇 공격으로 해석하지 않는다.
3. **Timeout·잘못된 JSON·5xx:** 공급자 요청은 bounded timeout 후 실패한다. fresh challenge로 재시도하고 오래된 proof나 모호한 store consume 결과를 재사용하지 않는다. 성공률 분모에서 오류를 삭제하지 않는다.
4. **건강 필터:** 서버 breaker가 해당 provider를 새 발급에서 제외하도록 한다. 이미 발급된 challenge를 다른 provider에게 검증시키지 않는다.
5. **동등한 허용 경로:** policy가 승인한 다른 provider에만 전환하고 선택 사유를 집계한다. 모두 실패하면 동등 recovery 또는 명시적 재시도 상태다. 약한 PoW나 지원 메일을 강한 liveness/identity와 동등하게 표시하지 않는다.
6. **저장소 장애·worker crash:** token 소비 성공 여부가 모호하면 실패로 처리하고 제품 업무의 멱등성 키/트랜잭션을 확인한다. consumed proof를 다시 유효하다고 간주하지 않는다.
7. **복구:** cooldown 이후 소유한 공식 테스트 설정으로 server verification을 확인하고 explicit probe를 기록한다. rollout 후 error·latency·전환율과 지원 문의를 함께 본다.
8. **사후 기록:** 공급자·범주·시간대·영향·완화·재발 방지를 집계하고 비밀키·개별 토큰·개인정보는 첨부하지 않는다.

검증은 `node test/observability.test.js`가 담당한다. 오류가 성공률에 포함되지 않는지, bounded cardinality·latency, 비밀 필드 제외, 관측기 예외 격리, rejection과 outage 구분, cooldown 뒤 explicit recovery, assurance 하향 거절을 확인한다. 실제 공급자 SLA·부하 용량·사용자 영향은 별도 staging/운영 측정이 필요하다.

2026-11-12에는 실제 `Kechap.issue → verify → consume`를 실행한 snapshot과 서버의 retry 선택 지표를 저장하고 Chromium에서 dashboard 파일로 열었다. 4개 작업 행이 렌더링됐고 JavaScript 오류는 없었다. 로컬 실행 근거는 `.local/observability/metrics.json`, `browser-report.json`, `dashboard.png`에 있다. 이는 소유한 fixture와 로컬 파일 보기의 결과이며 외부 공급자의 운영 SLA, 실제 이용자 성공률 또는 접근성 적합성 인증이 아니다. 실제 SDK observer·timeout·비밀 비수집까지 포함한 관측성 테스트는 9개 통과했다.
