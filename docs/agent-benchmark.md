# 소유 환경의 실제 브라우저·모델 baseline

이 실험은 Kechap이 소유한 세 가지 toy world에서만 실행한다. 외부 서비스의 CAPTCHA를 해제하거나 타사 사이트를 자동화하지 않는다. 유효한 이벤트와 사람의 존재는 다르다. 모델이 통과해도 그대로 기록한다.

## 실제 UI와 이벤트

`src/replay-browser.js`는 browser-only module이다. API는 `mountReplayWorld(container, publicChallenge, {onResponse, onError, signal}) → cleanup`이다. `onResponse`는 `{nonce, events, eventStreamHash}`의 JSON 문자열을 받는다. hash는 `crypto.subtle`로 계산하며 서버의 canonical hash와 일치하는지 단위 테스트한다.

- 정적 선택: 4개 명시적 button, 최소 반응 시간 이후 활성화.
- drag/rotate: pointer로 물체 이동, 회전과 배치 button. 키보드는 Space로 들기, 화살표로50단위 이동, Shift+화살표로10단위 이동, R로90도 회전, Enter로 배치한다. 전체 이동·회전·배치 상태를 서버가 재생한다. 이 단위는 좌표 범위 전체를 event64개 예산 안에 이동할 수 있도록 제한했다.
- 동적 순서: 서버가 발급한 일정에 맞춰 4개 cue를 표시하고 각 창에서 한 번만 입력한다. 각 choice는 실제 button이며 cue는 live status로 표시한다.
- bounded events64개, 7초 세계 시간, cleanup·AbortSignal 취소·만료 안내를 제공한다. client 시간은 실제 `performance.now()`다. 개별 이벤트 수신 시각이나 인간 생성 여부를 증명하지는 않는다.

키보드 구현과 live status는 접근성 감사 완료라는 뜻이 아니다. 일정이 짧아 다양한 장애 사용자를 배제할 수 있으므로 이 세계는 production 인증 기본값이 아니며 동등한 제품 복구 경로가 필요하다. reduced-motion CSS 애니메이션에 의존하지 않는다. 참가자 연구와 보조공학 실제 평가 결과는 별도로 수집한다.

## 실행

```bash
# Playwright Chromium 설치 후 소유 loopback 서버를 자동으로 생성·정리한다.
npm exec playwright install chromium
node scripts/replay-browser-smoke.js
node scripts/agent-benchmark.js --samples=1

# 유료 모델 호출을 명시적으로 opt-in: 샘플은 surface당1~3개만 허용
node scripts/agent-benchmark.js --samples=1 --with-model
```

브라우저 binary가 별도 위치라면 `PLAYWRIGHT_BROWSERS_PATH`를 설정한다. 실제 smoke는 정적/drag/동적 세 세계 모두 실제 Chromium DOM·pointer로 입력하고 서버 verify+consume을 통과시켰다. 별도로 키보드 drag/rotate와 취소 cleanup을 확인한다. 보고서는 `.local/replay-browser/report.json`이다.

## 서로 다른 baseline

| 모드 | 관측·행동 | 실제 시간 / 제한 |
| --- | --- | --- |
| direct-api | 공개 world 규칙을 읽어 정답 이벤트 생성 후 owned API 제출 | 마지막 이벤트 시각만큼 실제 wait. 이벤트 일정은 명시적 script값이며 인간 데이터가 아님 |
| fixed-macro | 고정 reference 경로 또는 항상0번을 같은 seed challenge에 제출 | direct-api와 같은 서버 TTL·비교예산. 규칙 비적응 baseline |
| headless-dom | Playwright가 공개 world를 읽어 DOM click·pointer drag·회전 수행 | 실제 browser event timestamp와 서버 관찰 시간 |
| screenshot-loop | 스크린샷만 VLM에 전달하고 click/wait 실행 후 다시 관찰 | 최대3번 model call, 회당 최대1024 output tokens,7초 challenge 예산 |
| gui-agent | 스크린샷만 VLM에 전달하고 click/drag/key/wait 실행 후 다시 관찰 | screenshot-loop와 같은 call/token/time 제한. 허용 primitive만 다름 |

모델에 world JSON·숨은 target·DOM text를 전달하지 않는다. viewport는1100×900이며 모델 좌표를 범위 검증한다. URL 이동·shell·외부 브라우저 도구는 허용하지 않는다. 모델의 request는 최대30초 후 중단되지만 과제의7초가 지나 돌아온 명령은 실행하지 않는다. 즉 timeout을 길게 기다려도 challenge가 연장되지는 않는다. 늦은 실패 호출의 시간·토큰도 결과에 포함한다.

Start는 발급 후 disabled로 바뀌어 모델이 시계를 다시 시작하지 못한다. 모델 prompt에도 이미 시작됐음을 명시한다. 초기 개발 실행에서 restart 가능한 UI와 단일관찰 confound를 발견해 수정했으며, 아래 공개할 결과는 수정한 실행만 사용한다.

## 실제 MyProxy 실행 결과

2026-11-12T12:50:04Z 시작, Chromium **158.0.8127.18**, MyProxy Responses wire format의 **gpt-6.1-sol**로 실제 실행했다. surface당1개, mode당3개, 총15개 trial인 아주 작은 동작 검증이다. seed는 모든 mode에 동일한 `kechap-agent-v1:<surface>:0`이다.

| 모드 | 정적 선택 | drag/rotate | 동적 순서 |
| --- | --- | --- | --- |
| direct-api | 1/1 | 1/1 | 1/1 |
| fixed-macro | 0/1 | 0/1 | 0/1 |
| headless-dom | 1/1 | 1/1 | 1/1 |
| screenshot-loop | 1/1 | 0/1 | 0/1 |
| gui-agent | 1/1 | 1/1 | 0/1 |

모델 입력 **13,074 tokens**, 출력 **238 tokens**가 실제 응답 usage에 기록됐다. 단가는 확인하지 않았으므로 달러 비용은 `null`이다. 실패 비용도 포함하며 토큰·elapsed·모델·prompt hash·screenshot hash·제한된 action과 실패 이유를 `.local/agent-benchmark/report.json`에 저장한다. 인증키·HTTP Authorization·개인정보·실제 참가자 스크린샷은 기록하지 않는다. report의 좁은 Wilson95% 구간 역시 표본1의 매우 넓은 구간일 뿐 실제 공격자 모집단 통계나 security score가 아니다.

정적 선택은 screenshot-loop와 GUI가 통과했고 drag/rotate도 GUI가 통과했다. 동적 순서는 이 호출의 실제 latency가7초 예산을 넘겨 실패했다. **이 결과는 “AI는 동적 게임을 못 푼다”를 증명하지 않는다.** 더 빠른 모델·도구·다른 화면 분할이나 적응형 agent가 통과할 수 있다. 정적 선택은 실제 사진 CAPTCHA가 아니며 그 방어력으로 일반화하지 않는다. 서버 replay는 정답 이벤트 생성자를 인간으로 바꾸는 장치가 아니다.

## API·키와 재현 범위

모델 wire format은 공식 [OpenAI Images and vision 문서](https://developers.openai.com/api/docs/guides/images-vision)의 Responses `input_text`+`input_image` 형식을 실제 읽고 사용했다. 호출 endpoint는 사용자에게 허가된 MyProxy `https://proxy.nomadamas.org/v1/responses`이며 OpenAI 공식 호스팅 endpoint라고 표시하지 않는다.

키는 `MYPROXY_API_KEY` 환경변수 또는 이미 설정된 `~/.config/myproxy/codex.env`의 동일 이름 하나만 읽는다. 파일을 shell로 source하거나 다른 secret을 탐색하지 않는다. 별도 모델은 `MYPROXY_MODEL`로 명시할 수 있다. 이 스크립트는 자동으로 유료 호출하지 않으며 `--with-model`이 있어야 한다. `--model-only`는 model 두 mode만 실행한다. 모델 미설정/호출 실패를0%차단 또는 실제 시험 완료로 꾸미지 않고 missingModes 또는 failure로 기록한다.

현재는 동일 작성자가 수행한 내부 재현이며 `independentReplication=false`, `humanResults=null`이다. 독립 외부 재현, 인간 완료율/p95/false reject·기기·장애 사용자 비교, 실제 제품/대규모 비용 평가, holdout·학습효과 통제는 별도 단계다. 실험 도구 완성과 그 실험들이 끝났다는 주장을 구분한다.
