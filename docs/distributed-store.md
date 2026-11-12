# Redis 공유 일회용 저장소

`src/redis-store.js`는 `put(key, value, expiresAt)` / `take(key)` 계약을 Redis 원자 Lua 명령으로 구현한다. 현재 공식 `redis@6.3.1` Node 클라이언트와 Redis 8.10.0에서 실제 시험했으며 Redis 기능 최소 요구는 6.2다. Node.js 20 이상이 필요하다.

```js
import {Kechap} from '../src/index.js';
import {connectRedisStore} from '../src/redis-store.js';

const connection = await connectRedisStore({
  url: process.env.REDIS_URL,
  namespace: 'product_signup_v1',
  maxEntries: 10000,
  timeoutMs: 3000,
  maxTtlMs: 300000,
});
const kechap = new Kechap({adapters, store: connection.store});
// 정상 shutdown 때 await connection.close(). 요청별 connect/close는 피한다.
```

모든 worker는 같은 검증 정책·adapter 키·namespace·용량·TTL 제한을 사용해야 한다. `REDIS_URL`은 서버 secret으로 주입하고 로그에 출력하지 않는다. 운영에서는 Redis ACL, TLS `rediss://`, 사설 네트워크와 장애 감시를 적용한다. 모든 Redis script key는 같은 namespace hash tag에 들어가므로 Redis Cluster에서 한 슬롯에 배치된다. 이는 원자성을 위한 의도적인 제한이며 namespace가 무한히 수평 확장된다는 뜻은 아니다.

## 원자성과 TTL·용량

- put은 Redis 서버 `TIME`을 기준으로 지난/최대 TTL 초과 만료를 거절한다. client clock이 Redis와 크게 다르면 안전하게 실패하므로 NTP 상태를 감시한다.
- 발급 상태는 JSON으로 직렬화하고 기본 64KiB로 제한한다. cycle·최상위 undefined·초과 크기는 Redis 요청 전에 거절한다. 저장 값은 일반 JSON 데이터여야 하며 클래스 인스턴스·함수·비유한 수치의 의미 보존을 기대하지 않는다.
- overwrite를 허용하지 않는다. 예약된 데이터 key가 존재하면 put이 거절된다.
- namespace별 sorted set이 아직 만료되지 않은 상태 개수를 관리한다. put/count마다 만료 index를 정리하고, 값 key는 native TTL로 삭제한다. index 자체도 마지막 상태 만료 때 자동 삭제된다.
- take는 GET→DEL→index 제거를 하나의 Lua에서 수행한다. 동시에 여러 worker가 제출해도 최대 한 worker만 값을 얻는다. TTL이 지난 값은 Redis가 반환하지 않는다.
- key 원문은 SHA-256으로 해시되어 Redis key 이름에 원본 session/token 문자열을 남기지 않는다. 값에는 필요한 검증 상태가 있으므로 ACL·보존 정책은 여전히 필요하다.

같은 namespace의 Redis key를 다른 코드가 임의 수정하지 않아야 한다. 모든 put을 이 adapter로만 실행하고 적절한 maxEntries를 공유한다. 기본 namespace가 다른 제품과 겹치지 않도록 제품별 명시적 namespace를 권장한다. 여러 namespace나 별도 Redis 사용자 전체의 메모리 한도는 Redis 운영 설정이 담당한다. `maxmemory-policy noeviction`을 사용하고 메모리 여유를 감시한다. 강제 eviction은 인증 상태 손실과 안전한 실패를 유발할 수 있다.

## timeout·worker crash·업무 트랜잭션

명령 연결 실패·응답 timeout·잘못된 backend 응답은 `StoreUnavailableError` (`code: KECHAP_STORE_UNAVAILABLE`)로 실패한다. 원래 backend 오류·URL·인증 값은 이 오류에 포함하지 않는다. Redis가 이미 소비한 뒤 응답만 유실됐을 수 있으므로 `outcomeMayHaveCommitted=true`다. 이때 **동일 consume을 재시도해서 성공을 추정하거나 검증을 통과시키지 않는다.** 새 challenge 또는 제품의 통제된 복구 흐름이 필요하다.

공식 연결 factory는 offline command queue와 자동 reconnect를 끈다. 사용자가 직접 주입한 Redis client도 queue/reconnect 후 command replay가 없도록 같은 조건으로 설정해야 한다. 연결을 새로 만들 때 이전 작업을 재전송하지 않는다.

worker가 challenge take 후 죽으면 증명은 소비된 상태다. 성공 검증 후 attestation put 이전에 죽어도 새 인증이 필요하다. 보호 작업 직전 attestation take 후 worker가 죽으면 attestation은 소비됐지만 업무가 실행됐는지 Kechap만으로 알 수 없다. **Redis consume과 제품 DB 지급·게시를 하나의 트랜잭션으로 묶어 주지는 않는다.** 제품 업무에 idempotency key·업무 원장·트랜잭션/outbox를 적용하고 결과 확인 경로를 제공한다.

Redis primary의 Lua 원자성은 실제 시험했지만 asynchronous replication·failover·snapshot 복구의 선형 일관성까지 보장하지 않는다. Redis 자체가 과거 snapshot으로 복원되거나 이미 소비한 delete를 잃으면 replay 상태가 되살아날 수 있다. 높은 가치의 작업은 강한 DB 제약과 업무 멱등성에 의존해야 하며 Redis failover 후 기존 인증 세대 폐기/namespace rotation 정책이 필요하다. persistence·복제·운영 장애를 검토하지 않은 채 “글로벌 exactly once”라고 주장하지 않는다.

## 실제 검증

```bash
# 소유한 테스트 Redis를 지정한다. 미설정·연결 실패는 skip이 아니라 실패다.
REDIS_URL=redis://127.0.0.1:6379 node scripts/test-redis.js
```

2026-11-12 로컬 Docker `redis:8` (실제 Redis **8.10.0**)에서 실행했다. 인스턴스는 테스트 전용으로 persistence를 끄고 loopback에만 공개했다. 실제 보고서는 `.local/redis/report.json`으로 생성되며 URL·자격증명·검증 토큰은 기록하지 않는다.

| 검증 | 실제 결과 |
| --- | --- |
| 독립 Node 프로세스 5개 × 각20요청, 동일 challenge verify100개 | 성공 **1개** |
| 독립 Node 프로세스 5개 × 각20요청, 동일 attestation consume100개 | 성공 **1개** |
| TTL 이전 용량 제한·overwrite·최대 TTL | 부적절한 put 거절 |
| TTL 이후 take·count·index cleanup·용량 재사용 | 모두 통과 |
| Redis에 take가 commit된 뒤 응답이 timeout | 실패 처리, 재조회해도 상태 없음 |
| 자식 process가 take 직후 exit17 | 남은 worker에서 재소비 불가 |

`test/redis-store.test.js`의 단위 계약 테스트 3개는 namespace·key 해시, 직렬화/입력 거절, timeout·backend 오류의 비밀정보 비노출·무재시도·불명확한 결과 처리도 확인한다. 이 시험이 네트워크 분할·Redis failover·영구 저장소 복구·실제 제품 지급 원자성을 모두 검증하는 것은 아니다.
