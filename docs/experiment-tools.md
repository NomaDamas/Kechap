# 실험 도구 실행 안내

사용자는 실제 사람/제품 모집 전에 도구 완성을 우선하기로 했다. 아래 도구가 있다고 참가자·고객·독립 검증자가 존재하는 것은 아니다.

## 로컬 도구

```bash
npm ci --omit=optional
npx playwright install chromium
npm run test:generated
npm run test:passkeys
npm run test:replay-browser
npm run test:study-browser
REDIS_URL=redis://127.0.0.1:6379 npm run test:redis
npm run study:serve
```

수집 화면 기본 주소는 `http://localhost:3001`이다. 기본값은 `source=fixture`라 분석기의 인간 분모에서 제외된다. 사람 실험으로 바꾸기 전에 [동의 문구](consent.ko.md)와 [프로토콜](study-protocol.md)의 운영자·연락처·보상·삭제일·사전등록 seed·접근성/표본 설계를 채운다. 도구는 이름·IP·생체정보 대신 무작위ID와 최소 과제 결과를 수집하며 철회 코드를 통한 삭제와 종료·dropout을 지원한다. 원본 JSONL은 공개하지 않는다.

```bash
npm run study:analyze -- /private/trials.jsonl .local/study/aggregate.json
npm run pilots:analyze -- /private/operator-aggregates.json .local/pilots/report.json
npm run leaderboard -- benchmarks/leaderboard/cards.json benchmarks/leaderboard/board.json
python3 -m http.server 8091 --bind 127.0.0.1
```

보드는 `http://localhost:8091/benchmarks/leaderboard/`에서 볼 수 있다. 공개 결과 카드의 상태·표본·한계를 표시하고 stale/retracted/superseded는 비교에서 제외한다. 카드에 reviewer 이름을 썼다는 이유만으로 verified 배지를 만들지 않는다. [실운영 파일럿](pilot-operations.md)의 빈 결과는 aggregate:null이며 수익·보안 효과를 만들어 내지 않는다.

## 실제 모델 비교

```bash
npm run benchmark:agents -- --samples=1
# 명시적 유료/외부모델 호출 opt-in
npm run benchmark:agents -- --samples=1 --with-model
```

후자는 기존 `MYPROXY_API_KEY` 설정과 허가된 MyProxy Responses endpoint를 사용한다. 비밀을 채팅/로그에 넣지 않는다. 소유한 localhost toy 화면만 전송하고 모델이 임의 URL·shell을 실행하도록 허용하지 않는다. 실제 공개한15trials는 [결과 JSON](../benchmarks/results/2026-11-12-myproxy-agents.json)에 있으며 표본은 surface당1개다. 모델 latency·token usage·실패를 포함하고 가격 미확인은null로 유지한다. [한계](agent-benchmark.md)와 함께 읽어야 한다.

## 계정이 필요한 추가 경로

World ID는 현재 등록 앱이 없다는 사용자 확인에 따라 실제 sandbox 성공을 대기한다. `npm run test:personhood`는 누락 설정이면 NOT RUN·exit2이며 fake proof를 넣지 않는다. [필수 설정](personhood.md)을 실제 계정에서 준비한 뒤 nonproduction proof로 검증한다. Sponsors는 [#24](https://github.com/NomaDamas/Kechap/issues/24)의 소유자 등록 이후 재확인한다.
