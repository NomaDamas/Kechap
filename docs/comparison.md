# 기존 Awesome list·MCP·인접 제품 비교

실제 조회: 2026-11-12 UTC. GitHub 검색 API의 이름·설명 중심 쿼리와 각 프로젝트의 pinned README·LICENSE를 읽었다. 검색은 표본이며 GitHub 전체·npm·비공개 제품을 포괄하지 않는다. broad `in:readme` 쿼리는 일반 Awesome·스크래핑 저장소가 섞여 precision이 낮았으므로 근거는 보존하되 비교 판단은 좁힌 쿼리와 직접 읽은 문서에 의존한다.

## 이미 있는가

**있다.** CAPTCHA Awesome list, personhood 목록, 공급자별 설치 SDK, CAPTCHA solver MCP, 사람 판단 의뢰 MCP, 적응형 CAPTCHA 선택 연구가 각각 존재한다. 아래 기능을 하나로 묶은 검증된 Kechap 동등 제품이 이번 검색에서 확인되지 않았다는 것과 시장에 없다는 주장은 다르다.

| 프로젝트 | 읽은 목적과 현재 기능 | Kechap과의 관계 / 한계 |
| --- | --- | --- |
| [ZYSzys/awesome-captcha](https://github.com/ZYSzys/awesome-captcha) — 1,442 stars, MIT | 라이브러리·생성기·크랙·도구를 큐레이션 | 직접 관련 선행 목록. 방어용과 공격용이 혼재하고 정책·설치·runtime rotation·동등 벤치는 제공하지 않는 README 구조 |
| [andorsk/awesome-proof-of-personhood](https://github.com/andorsk/awesome-proof-of-personhood) — 19 stars, LICENSE 미확인 | biometric/social graph/identity/personhood 논문·프로젝트 목록 | CAPTCHA보다 넓은 인간·유일성 자격을 다룸. 목록의 설명·분류도 upstream 최신 상태로 재검증 필요 |
| [FriendlyCaptcha/friendly-captcha-sdk](https://github.com/FriendlyCaptcha/friendly-captcha-sdk) — 37 stars, MPL-2.0 | Friendly Captcha v2 공식 browser widget SDK | 설치 SDK는 이미 보편적. 단일 벤더 통합이며 엔진 공개·여러 공급자 선택 권한을 뜻하지 않음 |
| [google/recaptcha](https://github.com/google/recaptcha) — 3,581 stars, BSD-3-Clause | Google 공식 PHP client | 공식 연동의 참고 계약. 여러 벤더 정책 선택·공통 벤치마크와는 다른 범위 |
| [ambethia/recaptcha](https://github.com/ambethia/recaptcha), [anhskohbo/no-captcha](https://github.com/anhskohbo/no-captcha) — 2,006/1,847 stars, MIT | Ruby/Laravel reCAPTCHA 통합 | 프레임워크 도입 경험의 선행 사례. CAPTCHA provider wrapper 자체만으로 새 제품이라고 주장할 수 없음 |
| [aezizhu/mcp-captcha-solver](https://github.com/aezizhu/mcp-captcha-solver) — 21 stars, LICENSE 미확인 | 여러 CAPTCHA 해제 서비스 연결을 설명하는 MCP | 방어를 제품에 설치하는 Kechap과 방향이 반대. README 성공률 주장은 Kechap 검증 결과 아님. 코드·solver를 복사하지 않음 |
| [Agent360dk/browser-mcp](https://github.com/Agent360dk/browser-mcp) — 63 stars, MIT | 브라우저가 CAPTCHA/2FA에 도달하면 사용자에게 직접 질문하는 도구 | human-in-the-loop browser 도구. 세션이 고유 인간이라는 attestation이나 제품 CAPTCHA orchestrator는 아님 |
| [AskAHumanOnline/askahuman-mcp-server](https://github.com/AskAHumanOnline/askahuman-mcp-server) — 0 stars, MIT | Lightning 결제 후 사람에게 판단을 요청하고 결과를 polling하는 MCP | human-verification이라는 명칭이 있으나 인간 작업 marketplace. README는 플랫폼 출시 예정이라고 명시. CAPTCHA 방어 설치 SDK가 아님 |
| [SriramS-77/rl-captcha-orchestration](https://github.com/SriramS-77/rl-captcha-orchestration) — 0 stars, LICENSE 미확인 | mouse trajectory 기반 scorer와 11개 intervention level을 선택하는 RL 연구, simulator 실험 | 적응형 CAPTCHA orchestration 선행 연구가 존재함. README 논문·license는 추가 예정이고 표는 simulator 평가라 실운영 효능으로 인용하지 않음 |
| [Anubis](https://github.com/TecharoHQ/anubis), [CrowdSec](https://github.com/crowdsecurity/crowdsec), [SafeLine](https://github.com/chaitin/SafeLine) | edge challenge·risk·WAF·remediation | 위험 판단·PoW·정책 운영 자체는 기존 기술. Kechap은 기존 인프라를 연동 대상으로 다루고 동일 기능을 재발명하지 않음 |

각 README와 LICENSE의 SHA·공식 경로는 [`catalog/evidence/`](../catalog/evidence/)의 프로젝트별 JSON에 기록했다. LICENSE를 찾지 못한 경우 소스가 공개되어 있어도 복사 허가를 추론하지 않는다. 별 수는 인기도이며 기능·채택·안전성을 보장하지 않는다.

## 실제 사용한 검색 범위

| 쿼리 | 총 hit 수 | 읽은 범위 / 주의 |
| --- | ---: | --- |
| `awesome captcha in:name,description` | 13 | 최대 30개 응답, 직접 목록 README 확인 |
| `captcha mcp in:name,description` | 120 | stars 정렬 최대 30개, 솔버·browser 자동화 다수 |
| `"human verification" mcp in:name,description` | 13 | human-task marketplace와 unrelated human-verified 콘텐츠 분리 |
| `captcha orchestration in:name,description` | 10 | RL 연구와 solver orchestrator를 분리 |
| `captcha sdk in:name,description` | 208 | 단일 공급자 SDK·solver SDK·노이즈 혼재 |
| `captcha self-hosted in:description` | 143 | PoW, form filters, solver sidecars를 구분 |
| `topic:captcha` | 2,629 | stars 상위 30개 표본. topic 누락은 검색 누락 가능 |
| `captcha stars:>=10000` | 4 | SafeLine 외 3개는 OCR/undetected browser/solver로, 방어 엔진 목록에 넣지 않음 |
| `awesome proof personhood in:name,description` | 1 | 해당 personhood 목록 직접 확인 |

공개 JSON에는 조회 URL, 시각, 전체 응답 hash, total_count, incomplete_results, 반환 수와 `exhaustive:false`를 보존한다. `total_count`가 소수라고 모든 관련 제품을 찾았다는 뜻은 아니다. 저장소 설명·topic에 용어가 없거나 검색 인덱스에 반영되지 않은 프로젝트는 빠질 수 있다.

## Kechap이 검증해야 할 차별화

1. **조건과 근거가 함께 있는 선택:** 단순 provider 배열이 아니라 보장 범주, 개인정보, self-host, 접근성, 비용·지연과 근거 수준을 구분한다. 근거 미확인은 추천의 설명과 제외 사유로 드러내야 한다.
2. **설치에서 운영까지:** framework 패치, secret 설정, server verification, action/tenant 결속, 원자적 일회성 소비, 동등 보장 rotation을 같은 계약으로 제공한다. 후보 목록만으로 사용 가능 배지를 주지 않는다.
3. **비교 가능한 측정:** 동일 조건·예산의 인간과 agent 성능을 공개하고, 통과한 인간 사기나 paid human relay 같은 별도 위협을 남겨 둔다. 한 번의 solver 성공률로 보안을 결론내지 않는다.
4. **기여 가능한 provider 계약:** 출처·라이선스·실패 처리·보조공학 테스트·bench revision과 책임 maintainer가 있어야 새 방식을 운영 후보로 승격한다.

이 조합은 제품 가설이다. 현재 Kechap의 제한된 MVP가 모든 항목을 production 수준으로 만족한다는 뜻은 아니다. 실제 제품 설치 파일럿과 공개 측정으로 가치가 있는지 입증해야 한다.
