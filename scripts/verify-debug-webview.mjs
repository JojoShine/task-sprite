import {writeFileSync} from 'node:fs';

const endpoint = 'http://127.0.0.1:9222';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function evaluate(target) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  try {
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, {once: true});
      socket.addEventListener('error', reject, {once: true});
      setTimeout(() => reject(new Error('WebView debugger connection timed out')), 5000).unref();
    });
    const result = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('WebView DOM check timed out')), 5000);
      socket.addEventListener('message', event => {
        const message = JSON.parse(event.data);
        if (message.id !== 1) return;
        clearTimeout(timer);
        if (message.error || message.result?.exceptionDetails) reject(new Error('WebView DOM evaluation failed'));
        else resolve(message.result?.result?.value);
      });
    });
    socket.send(JSON.stringify({id: 1, method: 'Runtime.evaluate', params: {
      expression: `({url: location.href, ready: !!document.querySelector('.pet-view .sprite'), rootChildren: document.querySelector('#root')?.childElementCount ?? 0, viteClient: !!document.querySelector('script[src="/@vite/client"]')})`,
      returnByValue: true,
    }}));
    return await result;
  } finally { socket.close(); }
}
let lastFailure = 'No live pet WebView found';
for (let attempt = 0; attempt < 30; attempt++) {
  try {
    const response = await fetch(`${endpoint}/json/list`, {signal: AbortSignal.timeout(2000)});
    if (!response.ok) throw new Error('WebView debugger unavailable');
    const targets = await response.json();
    const target = targets.find(value => value.type === 'page' && /^http:\/\/(localhost|127\.0\.0\.1):1420\//.test(value.url) && value.url.includes('view=pet'));
    if (target) {
      const result = await evaluate(target);
      if (result?.ready && result.rootChildren > 0 && result.viteClient) {
        writeFileSync('ci-logs/debug-webview.json', JSON.stringify({mode: 'debug-test', source: 'Vite', ...result}, null, 2));
        console.log('Native debug WebView rendered the actual Vite pet UI.');
        process.exit(0);
      }
      lastFailure = 'Pet DOM or Vite client is missing';
    }
  } catch (error) { lastFailure = error.message; }
  await sleep(1000);
}
throw new Error(lastFailure);
