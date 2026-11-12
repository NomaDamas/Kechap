# 기존 Express 제품에 연결

`createKechapRouter`는 기존 인증 미들웨어 뒤에 mount한다. 기존 로그인이나 세션을 새로 만들지 않으며 브라우저 body의 context/provider/risk를 신뢰하지 않는다.

```js
import {createKechapRouter} from './src/express.js';
app.use('/security', existingProductAuthenticationMiddleware);
app.use('/security', createKechapRouter({
  kechap, policy, allowedOrigins: ['https://product.example'],
  resolveSession: req => ({
    sessionId: req.auth.sessionId,
    context: {tenant: req.auth.tenantId, action: 'submit-contact', subject: req.auth.userId},
    requiredAssurance: 'automation-cost'
  }),
  checkCSRF: (req, session) => productCSRFCheck(req, session),
  rateLimit: (req, session) => productRateLimit(req, session),
  riskFor: (req, session) => trustedRiskService(req, session),
  healthFor: () => providerCircuitBreaker.health(),
  execute: async ({request, session, proof}) => {
    // product DB transaction/idempotency key required. Do not trust proof as authorization.
    return submitContactForAuthorizedUser(session.context, request.body.payload);
  }
}));
```

프런트는 POST `/security/challenge`로 공개 설정을 받고 기존 browser mountChallenge로 UI를 만든다. 응답을 POST `/security/verify`에 보내고, 받은 token을 원래 payload와 함께 POST `/security/execute`에 전달한다. Origin/JSON/세션/CSRF/속도 제한은 세 경로 모두 검사한다. 제품의 실제 자원 권한과 payload 검증은 execute에서 별도로 적용한다.

소비 뒤 업무 실행 실패 시 토큰은 되살리지 않는다. 업무가 이미 commit됐는지 알 수 없는 경우 제품의 idempotency key/업무 조회로 복구한다. Redis와 제품DB 사이를 하나의 원자 트랜잭션처럼 표시하지 않는다.

`test/express.test.js`는 실제 Express HTTP에서 기존 인증 보존, body context 무시, 직접 execute·재사용·CSRF·oversized 요청 거절을 확인한다. 이것은 첫 사용자2명의 설치 평가가 아니며 #9의 해당 외부 검증은 별도다. 에이전트는 이 파일을 복사해 기존 코드를 덮어쓰기보다 실제 auth/CSRF/rate-limit/업무 callback을 연결한 검토 가능한 patch를 만들어야 한다.
