# Kechap 인간 파일럿 사전 계획과 결과 카드

**상태: 실행 가능한 연구 준비물이며 참가자 모집·인간 측정은 아직 하지 않았다.** 이 계획 자체를 임상·학술 윤리 승인이나 개인정보 법률 검토로 표시하지 않는다. 실제 운영자는 관할·기관·참가자 맥락에 맞는 검토와 동의·연락 경로를 준비해야 한다. 인간 데이터가 없으므로 이 문서에 사람 완료율·VLM 성공률을 채우지 않는다.

프로토콜 식별자는 `kechap-human-pilot-v1`, 동의 문구는 `kechap-study-consent-v1`, 대상 replay revision은 `kechap-toy-replay-v1`다. 참가 전 연구 목표·분모·제외 기준·seed split·비용 산정·분석 명령과 코드 commit을 공개 사전 등록한다. 변경이 필요하면 revision을 올리고 변경 전후 코호트를 섞지 않는다. 본 문서는 실제 사전등록 서비스에 등록됐다는 증거가 아니다.

## 질문과 경계

세 가지 소유한 toy world의 입력·서버 검증 비용과 사용자 경험을 비교한다: 정적 네 칸 선택, drag/rotate, 동적 순서. 정적 과제는 이미지 인식 CAPTCHA가 아니고 drag는 전체 물리 엔진이 아니다. 성공은 규칙을 만족한 인터랙션이며 사람·등록 신원·유일성·선의를 증명하지 않는다. 공개 규칙을 아는 스크립트가 성공하는 사실도 결과에 포함한다.

주요 지표는 **각 surface에서 첫 scored presentation을 시작한 사람 중 최대 두 시도 안에 완료한 비율**이다. 부차 지표는 중도 이탈, 완료자의 실제 wall time median/p95, 기술 오류, 명시적으로 독립 판정된 유효 입력의 false reject, 기기·접근성 그룹의 기술통계, 동등 복구 성공, 서버 CPU·추론·운영 비용이다. baseline·공격 예산과 인간 결과를 하나의 human score로 합치지 않는다.

## 동일 실험 예산과 중단

모든 surface에서 새 서버 nonce, 15초 challenge TTL, 최대 두 시도, 한 번 성공한 proof와 attestation의 일회성 소비, 최대 64개 event/16KiB 응답을 사용한다. retry 때 새 nonce를 발급하고 첫 시도 시간을 포함한 task wall time을 측정한다. 실패·timeout은 새 시도로 세며 토큰을 재사용하지 않는다. 전체 task wall time 관찰 한도는 60초이고 이를 넘으면 명시적 dropout/technical event로 처리한다.

world timing은 현재 revision의 최대 7초이며 서버 관찰 한도는 15초다. 접근성 때문에 더 긴 시간이 필요한 사람을 제외해서 완료율을 높이지 않는다. 현 revision이 수행 불가능하면 중단·복구 선택을 기록하고 사용자에게 불이익을 주지 않는다. 시간·조작 변경이 필요한 실험은 접근성별 별도 revision/조건으로 등록하고 동일 조건 비교와 구분한다.

비퍼즐 대체 경로의 assurance는 별도 기록한다. 예를 들어 계정 소유를 확인하는 이메일/passkey 성공을 인간 존재나 전역 유일성 성공으로 바꾸지 않는다. 연구 참가에는 카메라·마이크·실명·정부 ID·연락처·기기 fingerprint를 요구하지 않는다.

## 표본·할당·학습효과

첫 탐색 파일럿 목표는 **실제 참가자 96명**, desktop/mobile/tablet 구성과 접근성 모집 범위를 모집 전에 고정하는 것이다. 최악의 이항 비율 0.5에서 단순 독립 표본의 95% 정밀도 ±10%p 근사는 `1.96²×0.25/0.10²≈96.04`다. 이는 탐색적 정밀도 설명이며 공격 우월성 검정, subgroup 차이 검정, 95% completion 보증을 위해 산정한 power가 아니다. 96명을 확보하지 못하면 실제 n과 모집 실패를 공개하며 목표 n을 결과로 쓰지 않는다.

각 참가자는 모든 세 과제를 한 번 수행하는 within-subject 설계다. 여섯 가능한 순서를 block6마다 한 번씩 배정한다. `studyAssignment(index,allocationSeed)`는 공개 사전등록 seed와 순번으로 block 내 순서를 섞는다. `allocationSeed`는 연구 배정용이며 보안 nonce가 아니다. 모집/할당 순번을 결과를 보고 바꾸지 않는다. 최소 16개 완전 block을 목표로 하며 마지막 불완전 block은 숨기지 않는다.

개인별 첫 과제 전에 동일 길이의 사용법 안내와 별도 seed의 비채점 practice를 제공한다. 첫 scored presentation만 주요 분석에 쓴다. 추가 연습·재시험은 `repeatIndex` 1 또는2로 기록하고 별도 결과로 제시한다. 한 사람의 반복을 여러 독립 사람으로 세지 않는다. 순서·기기·accessibility 조건을 사전에 기록하고 모집 중 변경은 protocol deviation으로 남긴다. 최초 완료 결과를 보고 유리한 순서나 seed를 골라 넣지 않는다.

접근성 모집은 키보드, 스크린리더, 저시력, 운동 제약, reduced motion, 저사양·저대역폭 사용자와 실제 보조공학을 사용하는 사람을 포함하도록 계획한다. 장애 진단명·의료자료를 요구하지 않는다. 선택 가능한 coarse 태그와 `unspecified`를 제공하고 태그를 주지 않아도 참가할 수 있다. subgroup당 n이 작으면 탐색적 설명에 한정하고 공개 cell<5는 억제한다. 이 모집 계획이나 자동화 검사를 사용자 접근성 적합성 결과라고 부르지 않는다.

## 동의·철회·데이터

[`consent.ko.md`](consent.ko.md)를 참가 전에 보여 준다. 연구자·운영자의 연락 경로와 보존 만료일이 실제로 채워져야 시작할 수 있다. 언제든 중단하고 대체 경로를 선택할 수 있으며 서비스 권한·보상·계정 상태에 불이익을 주지 않는다. 미성년자·동의 권한이 없는 사람은 별도 검토 전 모집하지 않는다.

실행 시 cryptographic random participant ID와 철회용 secret을 발급한다. 참가자에게 철회 secret을 보관하도록 하고 서버에는 SHA-256만 둔다. 분석 JSONL에 실명·이메일·전화·IP·영상·음성·정확한 user-agent·고해상도 생체 궤적을 넣지 않는다. 원본 event stream은 서버 검증 직후 폐기하며 필요한 경우 판정용 최소한의 비식별 feature만 별도 동의로 짧게 보존한다. 기본 trial record는 outcome·관찰 시간·coarse 그룹·CPU/비용·동의 version이며 raw event가 없다.

비공개 JSONL과 철회 hash는 최대 **30일**, 내부 재현·검토 완료 후 삭제한다. 참가자 secret으로 철회가 확인되면 해당 ID의 모든 record를 삭제하고 공개 전·공개 후 집계를 다시 생성한다. 비개인 aggregate만 남기고 작은 subgroup cell을 억제한다. 이미 타인이 내려받은 집계를 완전히 회수할 수 없음을 동의 문구에 설명한다. 백업·에러 로그도 같은 보존·접근 정책을 적용한다. hosted vendor를 사용하면 위치·subprocessor·비용·별도 동의를 먼저 공개한다. 현재 계획은 자체 toy만 사용하며 생체정보 subprocessor는 없다.

## 기록과 재현

JSONL 스키마는 [`benchmarks/study.schema.json`](../benchmarks/study.schema.json)이고 runtime 검증은 `scripts/analyze-study.js`다. privacy strict field allowlist를 사용하며 임의 extra field를 거절한다. record의 source는 `human|automation|fixture`이고 **fixture/automation은 인간 분모에서 항상 제외**한다. 라벨을 사람이 붙였다는 사실은 실제 참가자·동의가 존재한다는 독립 증거가 아니므로 모집·동의·데이터 provenance는 운영자가 별도로 검토해야 한다.

trial은 participant×surface×repeat 단위로 최대2개 attempt를 담는다. `outcome`은 success/rejected/error/dropout, `groundTruth`는 valid-interaction/invalid-interaction/unreviewed다. groundTruth는 verifier 결과를 복사하지 않고 프로토콜을 모르는 독립 검토자가 허용된 최소 자료로 판단한 값이어야 한다. 미검토는 unreviewed다. verifier가 거절했다는 이유만으로 valid 또는 invalid를 추정하지 않는다. 운영 error와 dropout은 완료율 분모에 남지만 false reject numerator에는 넣지 않는다.

```bash
node scripts/analyze-study.js /private/study-records.jsonl .local/study/aggregate.json
node --test test/study.test.js
```

primary completion denominator는 각 surface의 repeat0이고 철회·사전 정의 exclusion 외에는 실패·느린 참가자도 남긴다. exclusion 허용 이유는 technical-logging-failure/duplicate-session/protocol-violation뿐이며 이유별 수를 공개한다. outcome이 불리하다는 이유로 제외하지 않는다. 중복 participant×surface×repeat는 조용히 dedupe하지 않고 오류로 중단한다. 세 과제를 모두 완료하지 않은 참가자 수를 공개하고 관찰된 trial 분모와 모든 enrolled participant를 혼동하지 않는다. 모집된 전체 n·동의 후 시작하지 않은 n은 모집 flow 보고서에 별도로 제시한다.

완료 시간은 실제 서버가 관찰한 task wall time이며 시뮬레이션 timestamp를 사용하지 않는다. median/p95는 성공자 조건부이며 실패·이탈을 제외한 통계라는 점을 표기한다. false reject 분모는 독립 adjudication을 받은 유효 attempt 중 실제 success/rejected 판단이 나온 것만 포함한다. 인프라 error·dropout은 완료율 분모에는 남지만 verifier 판단이 아니므로 false reject 분모에서 제외하고 별도 집계한다. 이를 전체 실제 인간 수로 일반화하지 않는다. per-surface 첫 사람 결과의 Wilson95%를 설명용으로 사용하되 within-subject 표면간 비교·반복시도는 participant-cluster bootstrap 또는 paired model이 필요한 후속 분석이다. 현재 analyzer는 승자 판정이나 유의성 주장을 하지 않는다.

## 실제 수집 서버

실제 수집 도구는 `npm run study:serve`다. 기본 `STUDY_SOURCE=fixture`이며 사람 결과에 포함하지 않는다. `STUDY_SOURCE=human`에는 `STUDY_CONFIG_FILE`의 `{operator,contact,compensation,deleteAt}`와 기본값이 아닌 사전등록 `STUDY_ALLOCATION_SEED`가 필요하다. 삭제일은 미래 최대30일이며 설정이 없으면 서버가 시작되지 않는다. 사람 모집은 사용자가 나중에 진행하기로 했으므로 현재 실제 human n=0이다.

서버는 localhost에만 bind하고 이름·IP·원본 event stream을 JSONL에 저장하지 않는다. 각 participant에게 무작위 철회 코드를 발급하고 hash만 저장한다. 과제 중단/15초 timeout을 dropout으로 남기며 각 surface 최대2회로 제한한다. 동일 session 요청은 직렬화하고 철회 시 과거 기록을 원자적으로 다시 쓰며 이미 진행 중인 기록도 추가하지 않는다. 구동 중 삭제일 timer가 원본을 지우지만 중단된 서버·복제본·backup의 실제 삭제는 운영자가 별도 보장해야 한다. 이 서버는 단일 연구 프로세스용이며 외부 공개 전에 호스팅·로그·접근제어·동의 책임을 검토한다.

`npm run test:study-browser`는 실제 Chromium에서 동의 없는 시작 거절, 세 surface 노출·dropout 기록, 철회·삭제를 검증한다. 이것도 source=fixture이며 사람이 참여했다는 근거가 아니다.

## Leaderboard와 결과 변경

`scripts/leaderboard.js`는 사전 검증된 result-card JSON 배열을 읽어 정적 evidence board를 만든다. 임의 종합 순위를 매기지 않는다. card에는 benchmark revision, dataset split·seed digest, commit·코드 URL, 실행 환경, artifact hash·URL, submitter, 표본 수와 한계가 필요하다. automation-only card는 human/VLM/accessibility 결과가 null이어야 한다. 공개 seed의 결과를 sealed-holdout으로 바꾸지 않는다.

```bash
node scripts/leaderboard.js /private/reviewed-result-cards.json .local/leaderboard.json
```

현재 repo의 실제100seed 자동화 결과는 `automationCard` helper로 **owned-automation / public-development / 독립재현 없음** 카드로 만들 수 있다. 이 도구는 실행되지 않은 인간 데이터를 생성하지 않는다. 다른 submitter 이름만 적는 것 역시 독립 재현의 증거가 아니다.

독립 재현 주장은 다른 reviewer의 공개 실행 artifact URL·hash·검토일·동일 비교 digest가 있어야 `independent-evidence-attached`로 표시된다. 그래도 identity·실행 실제 여부는 자동 인증할 수 없으므로 **도구는 verified=false를 유지**한다. maintainer가 실제 독립 reviewer·실행 결과를 확인한 기록이 별도로 있어야 verified 배지를 부여할 수 있다. #20은 독립 재현이 없는 상태에서 완료 처리하지 않는다.

revision/split/budget/category가 다른 결과를 한 순위로 섞지 않는다. reviewAfter가 지나면 stale, 대체 revision이 있으면 superseded, 잘못된 데이터나 철회가 있으면 retracted로 기록하고 이유를 남긴다. 이전 카드를 삭제해 유리한 결과만 남기지 않으며 현재 비교에서 제외한다. 오류 수정은 새 card ID·새 artifact hash를 만들고 이전 이유·대체 경로를 연결한다. 계정/비밀 raw participant data는 공개하지 않는다.

실제 인간 완료율이 낮거나 접근성 이탈이 크고, GUI/VLM의 비용이 일반 challenge와 차이가 없으면 게임 콘텐츠 확대를 중단하고 기존 방어 orchestration 가치에 집중한다. 이 판단은 실제 비교 데이터가 생긴 뒤 운영자·독립 검토자가 한다.
