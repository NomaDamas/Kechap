# 전달 범위 감사

2026-11-12 실제 출처·코드·실행 결과 기준이다. 이전 DNS 차단 기록은 현재 상황이 아니다. Aside·Windows VM은 사용자 최신 지시에 따라 제외했다.

| 요구 | 근거 | 판정 |
| --- | --- | --- |
| 기존 방법론·오픈소스 조사 | catalog/providers.json, evidence79개, research.md | 50개 후보. GitHub37개와 공식문서10개 검토, 3개는 미확인 유지 |
| 10K/실사용 확인 | 조회시각·별수·npm 지표·유지보수/라이선스 원문 | 직접 CAPTCHA 후보 다수는10K미만. adjacent10K프로젝트와 구분, 고객 수·보안 인증 미주장 |
| 기존 awesome/MCP 존재 확인 | comparison.md와 고정 출처 | 기존 목록·솔버/사람판단 MCP·연구 orchestration 발견. 부재·최초 미주장 |
| REA 조사 | MIT·LinuxJS지원·Node버전 근거 | 호환성·라이선스 확인. 실제 실행/비공개 엔진 추출·재배포 미실행 |
| SDK/CLI/MCP/Skill | src와 standalone scaffold·MCP테스트 | 초기 제품 통합 구현, 상용 키 발급/임의 기존제품 자동수정은 별도 |
| 기존 OSS 사용 | 공식 altcha-lib2.8.0/capjs-core0.1.15, lockfile | 실제 라이브러리 및 Chromium 폼 통과, SHA256 baseline 한정 |
| 서버/회전 | core/policy/web 테스트 | 세션문맥·TTL·일회성·assurance·health·policyVersion검증. Production 분산 저장소 미지원 |
| 브라우저 실검증 | scripts/browser-smoke.js, .local/browser/report.json | Chromium에서 ALTCHA/Cap/PoW모두 교체·submit통과. 접근성 감사·상용 widget미검증 |
| benchmark계획 | benchmark.md/roadmap, scripts/benchmark.js | 실제 소유toy3종 스크립트baseline. 인간/VLM결과는null, 연구확장 계획 |
| 기여와 상세이슈 | CONTRIBUTING/forms, GitHub issues1~24 | 실제24개이슈 게시. #2/#5/#8/#10/#12는 수용 근거를 첨부해 완료, 나머지는 후속 범위로 유지 |
| Sponsors | .github/FUNDING.yml, sponsorship.md | 조직으로 설정, listing미활성이므로 실제 수령은 소유자 개설 필요 |
| 커밋/푸시 | main 0edac435f6a8e6f946887b340741106a08495c66, CI43203277224 | 로컬·원격 SHA 일치. Node20/22/24와 Chromium success |

## 검증 한계

카탈로그의 source-reviewed/다운로드/별수, 테스트 통과와 인간 구별·보안 감사·운영 SLA는 다르다. 모든 후보 productionReady=false다. 상용 비밀엔진을 획득한 사실은 없고 공식API어댑터만 제공한다. 실제 위험 점수 모델, 분산 저장소, 접근성 동등복구, 생체인증, 사람/VLM실험·리더보드는 구체적 후속이슈이며 이 초기 전달에서 완료됐다고 주장하지 않는다.

## 최신 검증과 남은 필수 외부 작업

MCP setup의 요구사항 기반 선택·파일생성·미충족시 무생성까지 연결했다. JS50개와 Python3개가 통과했고 공개 CI에 동일 커밋을 확인했다. Source-reviewed candidate50개 중37개 GitHub검토/10개 공식문서/3개미확인은 근거 수준 그대로 유지한다.

후원 요청은 설정 게시까지만 완료됐다. 조직의 hasSponsorsListing=false이고 repository fundingLinks=[]이므로 Sponsor 버튼·결제는 아직 활성화되지 않았다. 이 조건은 세 차례 연속 goal 진행에서 재확인됐으며 소유자의 지급·세금·계정 심사가 필요하다. #24에 구체적 조치를 남겼다. 에이전트가 계정 소유자의 등록 정보를 대신 제출하지 않는다.

따라서 초기 SDK·연구·설치·게시 산출물은 전달했지만 후원 활성화까지 포함한 전체 작업을 완료했다고 표시하지 않는다. 분산운영/생체인증/인간VLM실험은 원 요청대로 상세 확장 계획으로 남겼으며 별도 요청 없이 운영 완료라고 바꾸지 않는다.

## 열린 전체 이슈 처리 후 감사 (추가 구현)

사용자는 실제 참가자 모집보다 실험도구를 먼저 완성하도록 지시했고 World ID 앱은 없다고 확인했다. 이 범위에서 24개 모두를 재검토했다.17개닫힘/7개열림이며 실제 상태는 [이슈목록](issues.md)을 따른다.

추가 구현 근거:

- Redis8.10.0 실제5프로세스100요청 검증/소비각1성공, TTL·용량·응답timeout·workercrash시험. Node20/22/24 CI도 실제Redis실행.
- onEvent bounded지표/오류분모/collector격리/circuitbreaker·dashboard, 실제SDK·브라우저기록.
- 공식WebAuthn 패스키등록·UV검증·재인증·삭제·keyboard/reducedmotion과 비퍼즐account-continuity대체경로. 독립보조공학인증과구분.
- 기존Express auth/CSRF/rate-limit/callback유지router·실제HTTP시험, clean generated install·실제문제품구현forwardtest.
- 정식카탈로그Schema·추가제품요구·라이선스게이트·CODEOWNERS/Dependabot/PR검토·비공개취약점신고활성화.
- 실제hCaptcha공식dummy-key roundtrip, dummy testMode명시·운영키와구분.
- 실제화면3종·pointer/keyboard replay와15trials MyProxy GPT모델실행.1sample/surface라보안일반화없음. 실패비용포함13074입력/238출력tokens, 단가미확인null.
- 동의·철회·dropout·균형순서·최대2회·최소수집·인간fixture분리·통계분모·기기/접근성집계·결과수명관리보드와운영파일럿분석도구.
- WorldID기본비활성RP서명/issuer/동의/환경/nullifier검증준비. 실제앱부재로sandbox성공NOT RUN.

구현 게시 커밋49624baf80c2f985bc39e10223af16e33d855f84, CI43227160100은Node20/22/24와Chromium모두success. JS102개와Python3개통과. npm audit취약점0건(조회시점). 이는production보안감사나실제인간완료율이아니다.

외부조건7개: #9사람2명설치, #19인간연구, #20독립외부재현, #21외부기여승인, #22등록WorldID앱sandbox, #23운영자5곳, #24Sponsors조직가입. 각이슈에실행법·필요조건·왜현재닫지않는지근거를추가했다. 전체완료가아닌 **개발가능범위와실험준비완료**로보고한다.
