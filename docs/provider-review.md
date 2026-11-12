# 공급자 승인·라이선스·변경 관리

Kechap은 목록 등록, 출처 검토, 실제 어댑터 통합과 운영 승인을 분리한다. GitHub 별 수와 다운로드는 관심·배포 활동 신호이며 보안 검증이나 고유 고객 수가 아니다. 다른 프로젝트의 공개 코드가 보인다는 사실만으로 사용·재배포 권한을 추론하지 않는다.

## 제출에서 승인까지

1. **후보 제안:** 공식 source/docs URL, 역할, assurance, 라이선스 후보값, 개인정보·접근성 제약과 maintainer를 제출한다. 모르는 수치·시각·별 수는 `null`이다. 코드 복사 없이 링크를 제안하는 단계와 실행 코드를 넣는 단계는 다르다.
2. **메타데이터 검토:** upstream revision에 고정한 README·LICENSE와 패키지 소유자, release, archive/maintenance 상태를 읽고 evidence URL·조회일·내용 hash를 기록한다. `source-reviewed`는 이를 읽었다는 뜻이며 `productionReady`와 다르다. 문서만 확인한 상용 서비스는 `official-document-fetched`로 유지한다.
3. **어댑터 계약:** 공식 패키지/API에서 실제 issue/verify를 실행하고 서버 secret 경계, nonce·purpose·hostname/action, 만료·일회성, 오류·timeout, 비용 한도와 공급자 교체를 검증한다. 전송 endpoint는 서버에서 고정한다. 이 단계는 `implemented-upstream-and-browser-tested` 같은 테스트 범위를 기록할 수 있지만 운영 보증은 아니다.
4. **제한적 운영 승인:** 실제 제품 범위, 소유자, 공격 모델, 접근성 동등 경로, 개인정보 흐름·보존·삭제, 비용과 유지보수 책임, rollback을 검토한다. `productionReady=true`에는 maintainer와 security/accessibility/license review URL, 승인 시각·동일 revision을 요구한다. 근거가 없으면 false를 유지한다.

정식 JSON Schema는 [`catalog/provider.schema.json`](../catalog/provider.schema.json)이다. `npm run catalog:check`는 schema 검증에 이어 중복 ID, 미확인 stars, threshold 불일치, 비밀정보 포함 URL, 로컬/사설 endpoint, evidence revision·시각·별 수 일치를 검사한다. URL 검사는 네트워크 접근을 수행하지 않는다. 공개 hostname이 나중에 사설 IP로 해석될 수 있으므로 실제 adapter가 임의 URL을 호출하게 만들어서는 안 된다. 스키마 통과는 공개 source의 진실성 검증 자체가 아니다.

## 라이선스와 API 경계

| 범위 | 확인할 것 | 현재 처리 |
| --- | --- | --- |
| Kechap 코드·생성 템플릿 | Apache-2.0 고지와 수정사항 | 프로젝트 LICENSE와 THIRD_PARTY_NOTICES 유지 |
| ALTCHA library 2.8.0 | MIT LICENSE, npm integrity, 공식 패키지 소유 | SHA-256 baseline runtime 통합; 상업 사용 허용 라이선스 근거 |
| Cap core 0.1.15 | Apache-2.0, SHA baseline과 instrumentation/HashWX 차이 | baseline만 구현; 복사한 PRNG derivation은 별도 attribution |
| AGPL 공급자 | 실행 서버·수정·네트워크 제공·배포 형태별 의무 | 단순 금지로 표시하지 않고 제품별 검토 후 연동. 현재 기본 자동설치 대상 아님 |
| source-available/Noncommercial | 실제 commercial-use 범위와 별도 허가 | permissive OSS처럼 자동 설치하지 않음 |
| 상용 API | widget/SDK/서비스 조건, 계정·요금·지역·처리자 약정 | 공식 endpoint adapter 경계만 검토. 개별 제품의 상업 약관 승인은 미확인 |
| 미확인 라이선스 | LICENSE 부재, NOASSERTION, 자산·모델·서비스 조건 차이 | source review로 복사 권한을 만들어내지 않음. 자동 설치 불가 |

`src/policy.js`의 런타임 후보는 검토된 실제 구현만 명시 등록한다. 라이선스 검토 상태가 없거나 `unknown`/`not-found`/`candidate-not-audited`이면 선택에서 제외한다. 공개 카탈로그 기여가 이 실행 allowlist를 자동으로 수정하지 않는다. `commercialUse:true`는 MIT/Apache 등 확인된 적용 코드 경계만 허용하며 상용 API의 계정별 서비스 약관을 승인한 것으로 해석하지 않는다.

## 제품별 추천 계약

추천 입력에는 `framework`, `runtime`, `nodeMajor`, `privacy`, `dataRegion`, `monthlyTraffic`, `maxMonthlyCostUsd`, `commercialUse`, `requiredAccessibility`를 포함할 수 있다. 기존 self-host/noThirdParty·assurance·modality·star/evidence 필터와 함께 평가하며 공급자별 탈락 이유를 반환한다.

- 현재 설치 구현은 Node HTTP·Node 20+다. Next.js/Express/FastAPI 전용 패치가 있는 것처럼 표시하지 않는다.
- self-host는 상용 서비스 전송이 없다는 조건을 만족할 수 있지만 비용 0, 특정 데이터 지역, 무제한 트래픽, 보조공학 적합성을 증명하지 않는다.
- `dataRegion`은 검증된 residency evidence가 없으면 `data-region-not-verified`, traffic/cost 한도도 측정이 없으면 해당 사유로 탈락한다. 공급자 API 무료 티어와 고객 인프라 총비용을 섞지 않는다.
- 브라우저 버튼의 keyboard 동작 테스트와 실제 장애 사용자·스크린리더 검증은 다르다. `requiredAccessibility`는 독립된 평가 근거가 없는 동안 충족했다고 표시하지 않는다.
- 문의폼·가입·보상·계정복구 fixture는 `test/policy-metadata.test.js`에 있다. 보상 uniqueness나 복구 identity 요구에 PoW를 대신 제시하지 않는다.
- 10K threshold를 만족하는 실제 adapter가 없으면 빈 결과와 조정 가능한 조건 설명을 반환한다. 조건을 자동으로 완화하지 않는다.

## 보안·버전·폐기 운영

CODEOWNERS는 현재 repository admin인 `@minsing-jin`으로 검토 요청을 라우팅한다. 외부 기여의 독립 검증자를 대신하지는 않는다. Dependabot은 npm 주간·GitHub Actions 월간 변경안을 생성하지만 자동 승인·자동 merge는 하지 않는다. 런타임 의존성은 lockfile로 고정하고 변경 시 package ownership·LICENSE·protocol·계약·browser test를 재검토한다.

- breaking protocol, assurance, 보존·전송 또는 라이선스 변경은 문서와 명시적인 버전 변경으로 알린다. 자동 fallback으로 흡수하지 않는다.
- 취약점·서비스 중단·유지보수 종료 시 신규 추천에서 제외하고 사유·대체 후보·철회 일자를 기록한다. 발급 중 challenge 무효화 여부는 제품과 저장소 정책으로 명시한다.
- 공개된 token·개인정보·production exploit을 일반 이슈에 요구하지 않는다. SECURITY.md의 비공개 신고 경로를 사용한다.
- 삭제·수정한 benchmark 결과는 숨기지 않고 superseded/retracted 상태와 사유·revision을 남긴다.

## 아직 완료되지 않은 외부 승인

이 문서·schema·PR 양식·테스트는 운영 가능한 검토 절차의 구현이다. **실제 독립 외부 기여자가 후보를 제출해 승인받았다는 사실은 아직 없다.** 부모 이슈 #21의 해당 수용 기준을 구현이나 가상의 기여 사례로 대체해서 닫지 않는다. 실제 제출자가 소유권·라이선스 근거를 제공하고 독립 검토자가 계약·접근성·범위 근거를 확인한 뒤 그 PR·review URL을 기록해야 한다.
