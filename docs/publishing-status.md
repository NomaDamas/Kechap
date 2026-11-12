# GitHub 게시 상태

2026-11-12 권한 변경 후 GitHub 연결과 기존 인증을 실제 확인했다. 계정은 minsing-jin이며 NomaDamas/Kechap에 push/admin권한이 있다. 원격은 비어 있었으므로 기존 이력을 덮지 않는 최초push를 완료했다.

핵심 구현 게시 커밋은 `3cdedf508bac2766638399713f0f79185654d297`이다. GitHub API의 main SHA와 일치했고 [CI run 43201282111](https://github.com/NomaDamas/Kechap/actions/runs/43201282111)은 Node20/22/24 세 job 모두 success였다. 각 job은 clean npm ci, JS46개, Python3개, 카탈로그 검사와 toy benchmark를 통과했다. 이후 문서 갱신 커밋은 GitHub history에서 확인한다.

## 이미 확인한 항목

- 공개 repo: https://github.com/NomaDamas/Kechap
- 상세 이슈24개 실제 생성: https://github.com/NomaDamas/Kechap/issues/1 부터 /24
- 실시간 조사와 공식OSS라이브러리·실제HTTP·Chromium검증 완료. 구체적 범위는 [감사](completion-audit.md).
- Sponsors설정 대상 NomaDamas. GraphQL hasSponsorsListing=false이므로 계정개설은 별도.
- `.github/FUNDING.yml`의 원격 존재를 확인했으나 GraphQL repository fundingLinks는 빈 배열이었다. 현재 Sponsor 버튼이 활성화됐다고 주장하지 않는다. 조직 listing 활성화 후 다시 확인해야 한다.
- 작업폴더 `.git`은 관리형 읽기전용이어서 `/tmp/kechap-publication.git`를 Git메타데이터로 사용한다. 소스와 전달bundle은 작업폴더에도 보존한다.

## 원격 검증 명령

```bash
gh api repos/NomaDamas/Kechap/commits/main --jq .sha
gh run list --repo NomaDamas/Kechap
gh issue list --repo NomaDamas/Kechap --state all --limit 100
```

Aside·Windows VM은 실행하지 않았다. 기존 DNS/인증차단 기록은 해소됐으며 더 이상 재인증을 요구할 이유가 없다. 비밀키·토큰을 저장소/이슈/로그에 기록하지 않는다.

## 설치 흐름 보강 검증

요구사항 기반 setup 게시 커밋은 `0edac435f6a8e6f946887b340741106a08495c66`이며 [CI43203277224](https://github.com/NomaDamas/Kechap/actions/runs/43203277224)는 Node20/22/24와 Chromium job이 모두 success다. JS50개·Python3개·카탈로그·toy baseline을 검증했다. 이슈 #2/#5/#8/#10/#12는 각각 근거 댓글을 첨부해 닫았고 나머지는 완료로 간주하지 않는다. 이후 문서 상태 갱신은 history를 확인한다.
