import { execFileSync } from 'node:child_process';

test('real Brevo helpers report success, failure and missing configuration without network', () => {
  const moduleUrl = new URL('../utils/brevo.js', import.meta.url).href;
  const script = `
    import assert from 'node:assert/strict';
    let ok = true;
    globalThis.fetch = async (_url, options) => {
      assert.ok(options.signal);
      return { ok, status: ok ? 201 : 503, json: async () => ({messageId:'fake'}) };
    };
    const {sendBrevoEmail, sendBrevoSms} = await import(${JSON.stringify(moduleUrl)});
    assert.equal(await sendBrevoEmail('test@example.com','test','<p>test</p>'), true);
    assert.equal(await sendBrevoSms('+33600000000','test'), true);
    ok = false;
    await assert.rejects(sendBrevoEmail('test@example.com','test','<p>test</p>'));
    await assert.rejects(sendBrevoSms('+33600000000','test'));
  `;
  execFileSync(process.execPath, ['--input-type=module','-e',script], {
    env: {...process.env, DOTENV_CONFIG_PATH:'__no_test_env__', BREVO_API_KEY:'test-only-key'}, timeout:10000
  });
  execFileSync(process.execPath, ['--input-type=module','-e',`
    import assert from 'node:assert/strict';
    globalThis.fetch = () => { throw new Error('unexpected network'); };
    const {sendBrevoEmail} = await import(${JSON.stringify(moduleUrl)});
    assert.equal(await sendBrevoEmail('test@example.com','test','<p>test</p>'), false);
  `], { env:{...process.env,DOTENV_CONFIG_PATH:'__no_test_env__',BREVO_API_KEY:''},timeout:10000,stdio:'pipe' });
});
