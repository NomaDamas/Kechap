# 실제 OSS 엔진 연동

확인일: 2026-11-12 UTC. 이 문서는 공개 upstream과 npm 패키지를 실제 조회하고, 설치한 공식 라이브러리로 실행한 통합 결과를 기록한다. 보안 감사나 “사람임”의 증명을 의미하지 않는다.

| Kechap adapter | 직접 사용하는 공식 라이브러리 | 라이선스 | 현재 적용한 기능 |
| --- | --- | --- | --- |
| `altchaAdapter` | `altcha-lib@2.8.0` | MIT | ALTCHA v2, 서명된 SHA-256 연산 challenge 생성·공식 solution 검증 |
| `capAdapter` | `capjs-core@0.1.15` | Apache-2.0 | 공식 코어가 지원하는 format 1 SHA-256 baseline 생성·JWT/solution/scope 검증 |

두 adapter 모두 `assurance: automation-cost`다. CAPTCHA UI나 PoW 성공을 현재 사람의 존재, 등록 신원, 유일한 한 사람 또는 선의로 바꾸어 표시하지 않는다. 공식 엔진을 dependency로 사용하며 코드를 복제하지 않는다. 배포 시 해당 upstream 라이선스와 package lockfile을 유지해야 한다.

## 사용

```js
import {Kechap} from '../src/index.js';
import {altchaAdapter, capAdapter} from '../src/oss.js';

const kechap = new Kechap({
  adapters: {
    altcha: altchaAdapter({secret: process.env.ALTCHA_SECRET}),
    cap: capAdapter({secret: process.env.CAP_SECRET}),
  },
  // 운영에서는 shared atomic TTL store를 연결한다.
});

const issued = await kechap.issue({
  context: {tenant: 'product', action: 'signup', subject: 'server-derived-session'},
  providers: ['altcha', 'cap'], assurance: 'automation-cost',
  sessionId: 'server-generated-session', mode: 'rotate', previous: 'altcha',
});
```

각 비밀키는 서버에만 두는 최소 32바이트 이상의 난수 문자열이다. `issue`는 공개 challenge와 서버 전용 state를 분리한다. `Kechap.verify`가 원자적으로 challenge를 소모한 후 공식 verifier를 호출하고 최종 Kechap attestation을 발급한다. 보호 작업 직전에 `consume`을 한 번 호출한다. adapter의 `verify`를 Kechap 바깥에서 직접 사용하면 자체 replay 방지가 생기는 것은 아니다.

### ALTCHA 데이터 계약

공개값은 `{type:'altcha', protocol:'v2-sha256', challenge:<공식 challenge>}`다. challenge에는 공개 nonce·salt·cost·keyPrefix·만료와 HMAC 서명이 있고 서버 비밀키는 없다. 브라우저의 응답은 `base64(JSON.stringify({challenge, solution}))`다. Kechap은 클라이언트가 보낸 challenge가 발급 원본과 같은지 확인하고, 원본 state에 대해 upstream `verifySolution`을 호출한다.

기본은 SHA-256 cost 1, keyPrefix `000`, TTL 120초다. 이는 테스트 가능한 baseline이며 모든 기기에서 일정 시간 또는 특정 공격 비용을 보장하는 운영 권장값이 아니다. 상용 ALTCHA Sentinel, risk scoring, 추적, passkey, 생체인증 또는 다른 v2 알고리즘 기능을 활성화한 것으로 표시하지 않는다. 브라우저·모바일 비용 측정 후 정책을 정해야 한다.

### Cap 데이터 계약

공개값은 `{type:'cap', protocol:'sha256-v1', challenge:<공식 generateChallenge 결과>}`다. 응답은 `JSON.stringify({token, solutions})`이며 `solutions`는 발급 개수와 같은 길이의 0 이상 uint32 배열이다. adapter는 정확히 발급한 token과 랜덤 scope를 검사하고 공식 `validateChallenge`로 서명·만료·work를 검증한다. upstream redemption token은 외부로 반환하지 않고 Kechap attestation으로 대체한다.

현재 Cap 기본 코어는 HashWX를 사용하고 instrumentation·behavior 정책도 지원한다. **이 연동은 format 1을 명시적으로 사용하므로 HashWX·instrumentation·behavior scoring·agent blocking을 제공한다고 주장하지 않는다.** 이를 추가할 때는 별도의 프로토콜/데이터 처리/브라우저 호환성 평가가 필요하다. `@cap.js/server`는 공식 문서에서 legacy로 표시하므로 새 연동에는 사용하지 않았다. 현재 `@cap.js/solver`도 공식 문서상 중단되어 사용하지 않는다.

## 실제 실행한 검증

`node test/oss.test.js`에서 8개 테스트가 통과했다. 공식 설치 패키지를 사용했으며 네트워크 응답만 모의로 만든 시험이 아니다.

- ALTCHA는 upstream `createChallenge` → upstream `solveChallenge` → upstream `verifySolution` 경로를 실행한다.
- Cap은 upstream `generateChallenge`, 같은 pinned upstream의 공개 client 프로토콜에 맞는 소규모 자체 fixture work, upstream `validateChallenge`를 실행한다.
- 각 엔진에서 유효 증명·다른 challenge 대입 거절·일회성 challenge·일회성 attestation을 검사한다.
- 잘못된 설정, malformed/oversized 입력, ALTCHA 난이도 변경, Cap token·scope·배열 길이·숫자 범위를 검사한다.
- 실제 패키지 verifier에 대해 서명된 만료 시각이 지난 증명이 거절되는지 확인한다.

시험은 소유한 로컬 challenge에서만 수행한다. 외부 사이트 인증을 대행하거나 우회하는 엔진을 제공하지 않는다. 테스트가 저난이도 work를 자동으로 성공시키는 사실 자체가 PoW ≠ human이라는 구분을 보여 준다. production 보증에는 분산 저장소, rate limit, 접근성 대체, 모바일·저사양 비용, 운영 지표, 보안 검토가 추가로 필요하다. 브라우저 E2E 검증 상태는 루트 README와 publishing 상태를 따르며 이 문서의 라이브러리 테스트만으로 완료를 주장하지 않는다.

## 확인한 공식 근거

- ALTCHA library README·API·v2 포맷: [altcha-lib at 80289d2](https://github.com/altcha-org/altcha-lib/tree/80289d26fc7b927ba04256fa1fee7025bdf29f0d), [MIT LICENSE](https://github.com/altcha-org/altcha-lib/blob/80289d26fc7b927ba04256fa1fee7025bdf29f0d/LICENSE.txt).
- Cap current library·replay·protocol·legacy 설명: [capjs-core docs at 5777eef](https://github.com/tiagozip/cap/blob/5777eef515ab66de587df432512a92046e669d31/docs/guide/capjs-core.md), [core source](https://github.com/tiagozip/cap/blob/5777eef515ab66de587df432512a92046e669d31/core/src/index.js), [legacy server docs](https://github.com/tiagozip/cap/blob/5777eef515ab66de587df432512a92046e669d31/docs/guide/server.md), [Apache LICENSE](https://github.com/tiagozip/cap/blob/5777eef515ab66de587df432512a92046e669d31/LICENSE).
- [npm altcha-lib 2.8.0 metadata](https://registry.npmjs.org/altcha-lib/2.8.0), integrity `sha512-at1DAqS8u6Z+XbPV2xQd/oATDTxYN83gITqIfsCSz7a2ENqUNIvn9h9xPuAbjeQ3JFqrW8KCjinphhm+bUrRzQ==`.
- [npm capjs-core 0.1.15 metadata](https://registry.npmjs.org/capjs-core/0.1.15), integrity `sha512-4JqDe8K/Wyd0MrFWVblt09KR2DxemrnQVl2PVZqUMHS9oSGH8uSHA8ciuz5pPvMiM856kD69LLkaTUMVQrA9Ig==`.

위 commit은 조회 시점의 upstream 근거다. npm tarball이 해당 commit과 동일하다는 점을 독립된 provenance attestation으로 확인한 것은 아니다. 실제 실행 버전은 lockfile과 npm integrity로 고정한다.
