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
| 기여와 상세이슈 | CONTRIBUTING/forms, GitHub issues1~23 | 문서/양식과 실제23개이슈 게시 |
| Sponsors | .github/FUNDING.yml, sponsorship.md | 조직으로 설정, listing미활성이므로 실제 수령은 소유자 개설 필요 |
| 커밋/푸시 | publishing-status.md와 원격refs/CI | 원격SHA·CI확인 후 게시상태로 기록 |

## 검증 한계

카탈로그의 source-reviewed/다운로드/별수, 테스트 통과와 인간 구별·보안 감사·운영 SLA는 다르다. 모든 후보 productionReady=false다. 상용 비밀엔진을 획득한 사실은 없고 공식API어댑터만 제공한다. 실제 위험 점수 모델, 분산 저장소, 접근성 동등복구, 생체인증, 사람/VLM실험·리더보드는 구체적 후속이슈이며 이 초기 전달에서 완료됐다고 주장하지 않는다.
