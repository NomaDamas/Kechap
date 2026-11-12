# 현재 상태와 남은 외부 조건

사용자 지시에 따라 모든 열린 이슈를 처리했다. **구현·실험준비 단계에서17개완료, 실제외부검증7개대기**이며 [실제이슈](issues.md)를따른다. 원래의Sponsors외미완료항목이없었다는주장은정정했다.

## 이번에 실제로 추가한 것

Redis분산원자TTL저장소(100동시/5worker시험), SDK관측성·장애breaker·대시보드, passkey비퍼즐대체와삭제, Express기존auth통합, clean generated install, 공식hCaptcha sandbox, 카탈로그Schema/라이선스·요구사항게이트와기여정책, 실제replay3종UI, MyProxy스크린샷/GUI실험, 동의·철회·수집·분석·근거보드·운영파일럿도구를구현했다.

[실험도구안내](experiment-tools.md), [전달감사](completion-audit.md), [실제agent결과](agent-benchmark.md), [검증artifact](verification/)를참고한다. 현재 JS102개·Python3개, Redis와실제Chromium검증이통과했고게시CI도확인했다. 공급자모두productionReady=false를유지한다.

## 사용자 답변을 반영한 외부 대기

- 사람실험은“실험도구먼저완성”선택에따라현재0명. #9/#19/#23에첫사용자2명·실제인간·운영자5곳이필요하다.
- #20/#21은외부독립재현·실제외부기여승인이필요하다. 같은팀에이전트평가를독립사람/기여라고집계하지않는다.
- #22는“현재WorldID앱없음”확인. 기본비활성어댑터와공식smoke준비, 실제등록앱/테스터proof가생겨야성공검증할수있다.
- #24는조직Sponsors가입/지급심사가필요하다. FUNDING설정만으로버튼활성화됐다고표시하지않는다.

Aside와WindowsVM은제외했다. 유료모델호출은명시opt-in이며CI에넣지않았다. 외부메시지나참가자모집연락은보내지않았다.
