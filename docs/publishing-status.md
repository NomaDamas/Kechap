# 전달과 원격 게시 상태

> 최신 범위 변경: 사용자 지시에 따라 Aside와 Windows VM은 실행하지 않습니다. 아래 관련 기록은 과거 시도·계획이며 현재 필수 작업이 아닙니다. 현재 보고와 실행 순서는 [진행 상태와 수정 계획](status-and-plan.md)을 따릅니다.

2026-11-12 기준입니다. GitHub 푸시와 이슈 생성은 완료하지 못했습니다.

- GitHub·API·Aside DNS 조회가 실패했습니다. `git ls-remote`도 실패하여 기존 이력을 확인하지 못했습니다.
- `gh auth status`가 실패했지만 네트워크 실패 상태였으므로 인증 만료로 단정하지 않습니다. 후속 점검에서 저장된 인증을 CLI가 읽을 수 있음을 확인했습니다. 비밀값은 출력하지 않았으며 인증을 교체하지 않았습니다.
- `python3 scripts/publish-issues.py --publish`는 기존 이슈 조회 단계에서 연결 실패로 중단했습니다. 생성 단계에 도달하지 않았습니다.
- 작업 공간 `.git`은 읽기 전용 빈 디렉터리입니다. 기존 폴더는 변경하지 않고 `/tmp/kechap-publication.git`에 별도 메타데이터로 로컬 커밋을 만듭니다.
- Windows VM은 생성하지 않았습니다. `qemu-system-x86_64`와 `/dev/kvm`이 없고 게스트 이미지·도구 호환성도 미확인입니다. 여유 디스크는 약 35GB였습니다.
- Aside/MyProxy 연결·REA 실행은 수행하지 않았습니다.

로컬 산출물은 SDK·브라우저 렌더러·웹 통합 예제·CLI·읽기 전용 MCP·Skill·카탈로그 후보 34개·문서·이슈 본문 23개입니다. 테스트 25개 중 24개 통과, 실제 loopback HTTP 테스트 1개는 포트 바인딩 `EPERM`으로 건너뜁니다. 요청 핸들러 테스트는 포트를 열지 않고 세션·CSRF·공급자 회전·PoW 검증·소비·재사용 거절을 확인합니다. 실제 벤더 script 실행·브라우저 렌더링은 확인하지 못했습니다. 모의 계약 검증이며 상용 벤더 인증·보안 감사·인간 벤치마크 결과는 아닙니다.

## 연결 복구 후

아래는 원격 이력을 유지하기 위한 예시이며 실행된 결과가 아닙니다. 로컬 커밋은 `/tmp/kechap-delivery.bundle`에도 보존합니다. `/tmp`는 임시 위치이고 소스는 작업 폴더에 남아 있습니다.

최신 전달 번들과 SHA-256은 작업 폴더의 `.local/delivery/`에도 보존합니다. `.local`은 Git 추적에서 제외되므로 소스 커밋에 번들이 재귀 포함되지 않습니다. 최신 완료 범위와 남은 요구 사항은 [완료 감사](completion-audit.md)에 있습니다. 세 차례 연속 동일한 외부 접근 제한을 확인하여 전체 목표를 차단 상태로 기록합니다.

```bash
git clone https://github.com/NomaDamas/Kechap.git /tmp/kechap-publish
cd /tmp/kechap-publish
git fetch /tmp/kechap-delivery.bundle main
git cherry-pick $(git rev-list --reverse FETCH_HEAD)
# 기존 코드와 충돌하면 원격 이력을 보존하며 해결
npm test
npm run catalog:check
git push origin HEAD:main
python3 scripts/publish-issues.py --publish
```

실제 원격 기본 브랜치가 다르면 그에 맞춰 진행합니다. 원격이 비어 있으면 정상적인 최초 push를 사용합니다. 강제 push는 필요하지 않습니다. 사용 가능한 인증 방식으로 복구하며 토큰을 저장소나 이슈에 넣지 않습니다.
