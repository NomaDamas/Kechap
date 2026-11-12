# 서버 운영 정책

```js
const policy = {version: 'signup-2026-11', actions: {
  signup: {
    normal: {assurance: 'automation-cost', mode: 'weighted', providers: [
      {id: 'altcha', weight: 3}, {id: 'cap', weight: 1}
    ]},
    elevated: {assurance: 'bot-mitigation', mode: 'rotate', providers: [
      {id: 'turnstile'}, {id: 'hcaptcha'}
    ]}
  }
}};
const issued = await kechap.issueWithPolicy({
  context, sessionId: trustedServerSessionId, policy,
  risk: trustedRiskTier,
  health: {altcha: true, cap: true, turnstile: true, hcaptcha: true}
});
```

실제로 사용하는 모든 adapter는 Kechap 인스턴스에 서버 설정으로 등록해야 한다. 브라우저가 policy/risk/health/previous를 정하도록 만들지 않는다. 위험도 계산기와 health 관측기는 제품이 제공한다. 현재 구현은 점수 모델이나 IP·fingerprint 수집을 제공하지 않는다.

`requiredAssurance`를 제공하면 정책 선택이 그 범주와 다를 때 거절한다. 범주끼리 전순서의 강도를 가정하지 않으며, 같은 범주도 동일 방어력이라는 뜻은 아니다. 예를 들어 일반 PoW와 등록 본인 확인은 서로 대체되지 않는다. 동일 범주의 공급자도 접근성·데이터 지역·비용 정책을 운영자가 검토한 허용목록에만 넣어야 한다.

정책 version은 발급·verify·consume 결과에 유지된다. 이미 발급된 challenge는 이후 정책이 바뀌어도 원래 provider로 검증한다. 구성된 공급자 중 assurance가 다른 것이 있으면 health=false여도 해당 정책을 거절한다. 전체 health=false이면 새 발급을 거절하고 retry/제품 복구 경로로 전환한다.

weighted는 server session·action·risk·version의 안정적 hash를 비율에 매핑한다. 이는 load allocation 편의이며 예측 불가능한 보안 난수나 위험 점수는 아니다. nonce와 challenge entropy는 별도 암호학적 난수다. urgent 정책 철회·기존 세션 강제 무효화는 현재 미지원이며 분산 저장소와 함께 후속 설계한다.
