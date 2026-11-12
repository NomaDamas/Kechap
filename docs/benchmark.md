# Owned replay 실험과 첫 자동화 baseline

Kechap의 첫 replay 모듈은 **실험용 규칙 검증기**다. 정적 선택, drag/rotate, 시간에 따라 바뀌는 순서 과제 세 가지를 같은 서버 검증 계약으로 비교한다. 외부 CAPTCHA를 해제하거나 상용 서비스의 보안 효과를 측정하는 도구가 아니다.

`src/replay.js`는 seed와 nonce로 결정되는 toy world를 생성한다. 클라이언트는 이벤트와 content hash를 제출하고 서버는 자신이 보유한 world로 상태 전환·좌표·각도·이벤트 순서·시간 창을 검증한다. 이벤트는 최대 64개, 응답은 최대 16KB, world 내 시간은 7초, 서버가 관찰한 발급 후 시간은 최대 15초로 제한한다. 제출된 이벤트가 서버 관찰 시간보다 미래이면 거절한다. 이 제한은 실제 반응의 증명이 아니다. 느린 참가자에게 맞춘 운영 정책이나 접근성 평가도 아니다.

성공 결과는 `assurance: interaction`이다. **유효한 이벤트를 사람이 만들었다는 주장은 하지 않는다.** 공개된 seed·규칙으로 스크립트가 유효한 이벤트를 만들어 제출할 수 있다. 해시도 전송 내용의 일관성과 재현성을 위한 무키 content hash이며 변조자 인증·전자서명이 아니다. 실제 세션 결속·만료·재사용 방지는 `Kechap.issue/verify/consume`과 원자 저장소가 담당한다. 서버 관찰 시간은 현재 모듈에서 응답 수신 시각뿐이며 이벤트 개별 수신 시각을 증명하지 않는다.

## 실행

```bash
node test/replay.test.js
node scripts/benchmark.js 100
```

벤치 출력은 `.local/benchmark.json`에 저장된다. seed·규칙·baseline이 같으면 성공 수와 입력 digest는 재현되며, CPU 시간은 실제 실행 환경과 부하에 따라 달라진다. 파일에는 Node 버전·CPU·플랫폼·revision·source hash·표본 수·성공 수와 rate·Wilson 95% 구간·검증 CPU median/p95·입력 digest를 기록한다. Wilson 구간은 정해진 seed 표본의 설명 값이며 실제 공격자나 인간 모집단에 대한 통계 보증이 아니다.

- `rule-aware-script`: 공개 규칙을 읽고 정답 이벤트를 생성한다. 모든 과제에 통과할 것으로 예상한다. 이것은 인간 판별력이 없다는 중요한 baseline이다.
- `fixed-macro`: 정적 선택은 항상 0번, 동적 과제는 매 시간 창마다 0번, drag는 한 고정 world에서 얻은 경로를 반복한다. seed 변화에 대한 고정 매크로의 실패 정도만 측정한다.
- 이벤트 시간과 서버 관찰 시간은 실험에서 **시뮬레이션**된다. 완료 시간은 실제 사람이 느낀 지연이 아니다. 서버 검증 실행 시간만 `performance.now()`로 실제 측정한다.

현재 결과에는 인간 완료율·false reject·headless browser·VLM·computer-use·장애 사용자·모바일·보상 사기 측정이 없다. 해당 필드는 `null`이며 “0% 성공”이나 “100% 차단”으로 해석하지 않는다. 정적 선택은 이미지 인식 baseline이 아니라 단순한 네 칸 선택 규칙이므로 이미지 CAPTCHA에 대한 일반화도 금지한다. drag는 물리 엔진 없이 경로·속도 상한·최종 각도만 재생한다. 동적 과제의 일정은 공개돼 있고 서버에서 실시간으로 감춘 정보나 fresh streaming cue가 없다.

## 어댑터로 연결

```js
import {Kechap} from '../src/index.js';
import {replayAdapter} from '../src/replay.js';

const kechap = new Kechap({adapters: {
  replay: replayAdapter({surface: 'dynamic-sequence'})
}});
// issue 시 assurance: 'interaction'을 명시한다.
// 공개 설정은 브라우저 world에 전달하고 검증에는 JSON response 문자열을 받는다.
```

현재 `src/replay-browser.js`가 세 가지 world의 실제 pointer·키보드 renderer를 제공한다. `npm run test:replay-browser`는 실제 Chromium에서 서버 replay까지 실행한다. `npm run study:serve`는 동의·중단·철회·수집 화면을 실행하며 기본 source는 fixture다. [사람 연구 프로토콜](study-protocol.md), [실제 agent benchmark](agent-benchmark.md)를 따르고 이를 사람 참가 결과로 바꾸어 표시하지 않는다. 이 모듈은 안정적인 가입폼의 기본 공급자가 아니라 명시적으로 선택하는 연구용 어댑터다.

## 다음 실험의 완료 조건

실제 UI와 보조공학 대체 경로를 먼저 만들고, 인간 참가 동의·개인정보 최소 수집·철회·보존 기한을 설계한다. 정적 이미지·동적 물리 world는 별도 revision으로 추가하고 seed 누출과 rule-aware oracle 성능을 그대로 공개한다. 이후 직접 API·고정 script·headless browser·VLM·computer-use를 소유 테스트 사이트에서 같은 공격 예산·재시도 수·시간 한도로 측정한다. 인간 실험의 완료율·이탈·median/p95·표본 수·신뢰구간·기기·접근성 경로를 함께 공개해야 실제 benchmark로 비교할 수 있다. 게임 성공을 identity·uniqueness 또는 fraud-free 결과로 변환하지 않는다.
