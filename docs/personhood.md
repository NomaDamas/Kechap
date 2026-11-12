# 선택적 World ID 연동과 실제 sandbox 차단 요인

조회일: 2026-11-12 UTC. `src/personhood.js`는 **기본 비활성화**된 World ID 4.0 어댑터다. 공식 `@worldcoin/idkit-server@1.2.0`의 서명·nullifier parsing을 사용하며 Kechap은 카메라·마이크·원본 영상·얼굴 template를 수집하지 않는다. 동작 범위는 `proofOfHuman`의 issuer schema 1, 한 action의 uniqueness proof뿐이다. Selfie Check, passport/document, 등록 본인 매칭, session/legacy proof를 구현했다고 표시하지 않는다.

## 현재 완료 상태

- 실제 공식 문서, OpenAPI와 npm package manifest·API를 조회했다.
- 공식 RP signer를 실제 실행한 nonce/서명 테스트와 mock verify 응답의 범위·환경·동의·atomic nullifier 테스트 7개를 통과했다.
- smoke 명령은 실제 실행했으나 app/RP 설정이 없음을 확인하고 `NOT RUN`, exit 2로 종료했다. 실제 성공 proof 또는 official sandbox roundtrip을 얻은 것은 아니다.
- 따라서 **이슈 #22의 “최소 하나 공식 sandbox 통합” 수용 기준은 아직 충족하지 않는다.** 준비된 어댑터와 mock 성공을 실제 sandbox 성공으로 바꾸어 보고하지 않는다.

공식 문서는 앱을 Developer Portal에 등록해 `app_id`, `rp_id`, 비밀 `signing_key`를 받아야 한다고 명시한다. Sandbox 앱은 공개 app store가 아니라 team별 tester enrollment 후 TestFlight/private Play testing track으로 제공한다. Simulator는 별도 staging 환경이며 이 경우에도 등록한 앱과 유효한 요청·proof가 필요하다. 공개 예시의 `app_xxxxx`나 무작위 signing key로 성공 증명을 만들 수 없다. 현재 WORLD/RP 환경설정 이름은 하나도 제공되지 않았다. 다른 앱의 proof·자격증명·수령자 정보를 대신 사용하지 않는다.

## 제품에서 명시적으로 켜기

```js
import {Kechap} from '../src/index.js';
import {worldIdAdapter} from '../src/personhood.js';

const kechap = new Kechap({adapters: {worldid: worldIdAdapter({
  enabled: true,
  appId: process.env.WORLD_ID_APP_ID,
  rpId: process.env.WORLD_ID_RP_ID,
  action: 'monthly-reward-2026-11',
  signingKey: process.env.WORLD_ID_SIGNING_KEY,
  environment: 'sandbox', // production은 allowProduction:true 별도 필요
  privacyPolicy: {
    consentVersion: 'v1', noticeUrl: 'https://product.example/privacy',
    permittedRegions: ['KR'], nullifierRetentionDays: 30,
    fallback: '제품에서 제공하는 동등 보상 자격의 지원 심사 경로',
  },
  checkConsent: async ({context, policyVersion}) =>
    consentDatabase.lookupCurrentConsent(context.subject, policyVersion),
  claimNullifier: async ({namespace, nullifier, expiresAt}) =>
    nullifierDatabase.atomicInsertIfAbsent(namespace, nullifier, expiresAt),
})}});
```

위 함수는 등록된 issuer가 제공한 proof의 존재를 확인하는 선택적 모듈이며 추천 allowlist에 자동 등록하지 않는다. 특히 sandbox/staging proof는 `testOnly:true`이고 실제 세계의 유일성을 증명하지 않는다. `assurance:uniqueness`는 요구 유형이며 issuer/RP/action/환경 밖의 보편적 보장이 아니다.

`checkConsent`는 브라우저가 보낸 boolean을 그대로 반환해서는 안 된다. 제품 서버의 실제 동의 기록을 읽어 `{granted:true,version:'v1',region:'KR'}`를 반환한다. issue와 verify에서 모두 같은 동의 버전·승인 지역을 확인하며 철회·지역 변화는 거절한다. 문서에 적은 notice/fallback 이름만으로 실제 대체 경로가 동작하는 것은 아니므로 제품 UI와 지원 담당·지급 자격 검토가 필요하다.

### 요청·응답 계약

`issue`는 공식 signer로 action이 결속된 RP 서명과 nonce·시각을 만든다. 공개 설정의 `app_id/action/environment/rp_context`를 공식 IDKit 4.x에 전달하고 `.preset(proofOfHuman())`를 사용한다. Kechap에 별도 World ID browser renderer는 아직 없으며 IDKit 설치가 필요하다. IDKit이 반환한 **전체 payload를 remap하지 않은 JSON 문자열**로 서버에 전달한다.

어댑터는 다음을 검증한다.

1. 서버에서 발급한 nonce·제품 context·원래 action, 프로토콜 4.0 및 기대 환경 일치.
2. 요청 응답이 issuer schema 1 / `proof_of_human` 단일 proof이고 허용된 shape·크기인지 확인. 다른 credential을 섞거나 생체정보 field를 추가하면 거절한다.
3. 고정 endpoint `https://developer.world.org/api/v4/verify/{configured_rp_id}`로 원래 JSON을 그대로 POST한다. 클라이언트가 rp ID나 endpoint를 정하지 않는다.
4. HTTP 성공에 더해 response의 success·환경·action과 issuer proof 결과의 success·동일 nullifier를 확인한다. 현재는 결과에 확인 가능한 action과 per-proof nullifier가 없으면 보수적으로 거절한다. provider 문서의 모든 optional 응답 조합을 수용한 범용 verifier라고 주장하지 않는다.
5. 공식 `Nullifier` parser로 숫자 동등성을 정규화한 뒤 제품의 durable atomic nullifier claim이 처음 삽입에만 true를 반환해야 통과한다.

Nullifier namespace는 tenant·rpId·environment·action·issuer1로 한정한다. 서로 다른 rp/action/issuer 사이를 연결하는 영구 “사람 ID”로 사용하지 않는다. 원본 proof는 verify 동안 메모리에서만 처리하고 로그에 남기지 않는다. replay·짧은 TTL·최종 attestation은 Kechap의 저장소가 추가 처리한다. nullifier를 정상 검증한 뒤 업무 처리가 실패할 수도 있으므로 claim과 업무 처리를 원자 DB 트랜잭션으로 묶거나 멱등성·지원 복구를 제품에서 구현해야 한다.

### 데이터 흐름·보존·삭제

브라우저 IDKit → World ID 앱/issuer가 원본 검증을 수행 → proof만 제품 서버 → official verify API → 제품 DB에는 scoped canonical nullifier와 최소 시각만 저장한다. World ID 앱/issuer의 별도 biometric 처리·보관·국가 지원은 해당 서비스 약관과 제품의 데이터 처리 검토 대상이다. Kechap이 원본을 저장하지 않는다는 이유로 그 외부 처리까지 없다고 주장하지 않는다.

기본 정책을 임의 생성하지 않고 제품이 1~365일의 nullifier 보존기간을 명시한다. **보존기간이 끝나면 중복 청구 방지 범위도 끝날 수 있다.** 보상 action의 lifetime·회계 규칙·법적 보존과 일치하도록 정하고, 삭제 요청이 있는 경우 접근 철회·향후 재등록/중복 청구 정책을 사용자에게 설명한다. 원본 proof나 raw biometric을 DB에 저장해 이를 우회하지 않는다. 소유자의 실제 동의·삭제·data residency 검토가 완료되기 전 production 활성화하지 않는다.

## 실제 nonproduction smoke 절차

소유자가 등록·tester access를 완료한 뒤 서버 환경에 다음 이름을 제공한다. 값은 채팅·이슈·Git에 보내지 않는다.

```text
WORLD_ID_SMOKE_ENABLED=true
WORLD_ID_TEST_CONSENT=I_CONSENT_TO_OWNED_NONPRODUCTION_TEST
WORLD_ID_APP_ID=등록한 app_id
WORLD_ID_RP_ID=등록한 rp_id
WORLD_ID_ACTION=등록한 action
WORLD_ID_SIGNING_KEY=서버 전용 signing_key
WORLD_ID_ENVIRONMENT=sandbox
WORLD_ID_TEST_REGION=KR
WORLD_ID_PRIVACY_NOTICE_URL=https://제품의-실제-고지주소
```

```bash
node scripts/personhood-smoke.js issue
# .local/personhood/request.json을 공식 IDKit proofOfHuman 요청에 전달
# Sandbox 앱에서 test proof 완료 후 전체 IDKit 결과를 소유한 로컬 파일로 저장
WORLD_ID_PROOF_FILE=/private/path/idkit-result.json node scripts/personhood-smoke.js verify
```

issue 요청은 300초 내 완료해야 한다. `.local/personhood/state.json`은 verify 시도 전에 소모하며 실패·timeout은 새 요청으로 시작한다. script의 nullifier set은 single-run fixture이고 production store가 아니다. 실제 성공한 경우에만 sanitized `report.json`에 ok=true가 기록된다. script는 raw proof를 복사·출력하지 않지만 사용자가 만든 proof file과 로컬 요청 파일은 실험 종료 후 소유자가 정책에 맞게 삭제해야 한다. `production`은 이 smoke script에서 거절한다.

## 읽은 공식 근거

| 공식 문서 | 조회한 내용 SHA-256 |
| --- | --- |
| [Integration guide](https://docs.world.org/world-id/idkit/integrate.md) | `9fbd2716f2caed47b44557f65a40a789b0d74c87064dfd3048b19a32e39814cb` |
| [Verify API](https://docs.world.org/api-reference/developer-portal/verify.md) | `6319f93c0a5d482ff0adcad4083749e24343f8283874c5aab878b7ec38b7a993` |
| [RP signatures](https://docs.world.org/world-id/idkit/signatures.md) | `a5ddd6ed48c63079260e1fdf5adecb150ed982ccea922e622f902c27be36368d` |
| [Sandbox access](https://docs.world.org/world-id/sandbox/sandbox-access.md) | `d2f19c2cf3a3e735728b3113190aa2ee53a75a931c315b55d4bfa3a9bd5163a6` |
| [Sandbox scope](https://docs.world.org/world-id/sandbox/what-is-sandbox.md) | `6cb5ae637d30db0194f3bb4e39b0ff54c1e7bba305ad2ce0e301c8c0d804d925` |

원문은 실행 환경 `.local/world-id/`에 저장했다. npm 공식 metadata의 `@worldcoin/idkit-server@1.2.0`은 MIT, upstream `worldcoin/idkit`, integrity `sha512-CvaiX5idPbPsETBkbbD1cwueM2WJn2CNQ3vMZbFf7LKbJP+IKmvbxW3pubG5OThRKuciqEAHocxnuGLRYI9WuQ==`다. package provenance가 source commit과 동일하다는 독립 attestation까지 확인한 것은 아니며 설치 버전은 lockfile로 고정한다.
