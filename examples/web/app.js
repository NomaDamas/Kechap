import {mountChallenge} from '/browser.js';

const status = document.querySelector('#status');
const submit = document.querySelector('#submit');
const retry = document.querySelector('#retry');
let session, token, lifecycle;
async function post(path, body) {
  const response = await fetch(path, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Kechap-CSRF': session.csrf}, body: JSON.stringify(body)});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? '검증에 실패했습니다. 새 인증을 요청하세요.');
  return result;
}
async function refresh() {
  lifecycle?.abort();
  const current = new AbortController(); lifecycle = current;
  submit.disabled = true; token = undefined; retry.disabled = true;
  status.textContent = '인증 준비 중…';
  try {
    const issued = await post('/api/challenge', {});
    if (current.signal.aborted) return;
    document.querySelector('#description').textContent = issued.assurance === 'automation-cost' ? '이 기기에서 짧은 연산 작업을 수행합니다. 사람의 존재를 확인하는 수단은 아닙니다.' : '인증을 완료하면 요청을 보낼 수 있습니다.';
    status.textContent = '';
    await mountChallenge(document.querySelector('#widget'), issued, {
      signal: current.signal,
      onError: error => { if (!current.signal.aborted) { token = undefined; submit.disabled = true; status.textContent = error.message; } },
      onResponse: async response => {
        try {
          const verified = await post('/api/verify', {id: issued.id, response});
          if (current.signal.aborted) return;
          token = verified.token; submit.disabled = false;
          status.textContent = '검증되었습니다. 요청을 보내 주세요.';
        } catch (error) { if (!current.signal.aborted) { token = undefined; submit.disabled = true; status.textContent = error.message; } }
      }
    });
  } catch (error) { if (!current.signal.aborted) status.textContent = error.message; }
  finally { if (!current.signal.aborted) retry.disabled = false; }
}
retry.addEventListener('click', refresh);
document.querySelector('#cancel').addEventListener('click', () => {
  lifecycle?.abort(); token = undefined; submit.disabled = true; retry.disabled = false;
  status.textContent = '취소했습니다. 요청을 보내지 않았습니다.';
});
submit.addEventListener('click', async () => {
  submit.disabled = true;
  const currentToken = token; token = undefined;
  try { const result = await post('/api/signup', {token: currentToken}); status.textContent = result.message; lifecycle?.abort(); }
  catch (error) { status.textContent = error.message; }
});
try {
  const response = await fetch('/api/session');
  if (!response.ok) throw new Error('세션을 시작할 수 없습니다.');
  session = await response.json();
  await refresh();
} catch (error) { status.textContent = error.message; retry.disabled = true; }
