# GitHub 게시 상태

2026-11-12 권한 변경 후 GitHub 연결과 기존 인증을 실제 확인했다. 계정은 minsing-jin이며 NomaDamas/Kechap에 push/admin권한이 있다. 원격은 비어 있었으므로 기존 이력을 덮지 않는 최초push경로를 사용한다. 이 문서는 push직전 상태로 작성하고, 실제 원격SHA와 CI결과는 GitHub history/Actions에서 확인한다.

## 이미 확인한 항목

- 공개 repo: https://github.com/NomaDamas/Kechap
- 상세 이슈23개 실제 생성: https://github.com/NomaDamas/Kechap/issues/1 부터 /23
- 실시간 조사와 공식OSS라이브러리·실제HTTP·Chromium검증 완료. 구체적 범위는 [감사](completion-audit.md).
- Sponsors설정 대상 NomaDamas. GraphQL hasSponsorsListing=false이므로 계정개설은 별도.
- 작업폴더 `.git`은 관리형 읽기전용이어서 `/tmp/kechap-publication.git`를 Git메타데이터로 사용한다. 소스와 전달bundle은 작업폴더에도 보존한다.

## 원격 검증 명령

```bash
gh api repos/NomaDamas/Kechap/commits/main --jq .sha
gh run list --repo NomaDamas/Kechap
gh issue list --repo NomaDamas/Kechap --state all --limit 100
```

Aside·Windows VM은 실행하지 않았다. 기존 DNS/인증차단 기록은 해소됐으며 더 이상 재인증을 요구할 이유가 없다. 비밀키·토큰을 저장소/이슈/로그에 기록하지 않는다.
