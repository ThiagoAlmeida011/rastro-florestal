import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { X509Certificate } from 'node:crypto';
import { prepareCertificate } from './local-certificate.mjs';

test('HTTPS local gera cadeia válida e preserva CA quando muda o IP', () => {
  const prefix = path.resolve(os.tmpdir(), 'rastro-cert-test-');
  const directory = fs.mkdtempSync(prefix);
  try {
    const first = prepareCertificate(directory, '192.168.1.3');
    const ca = new X509Certificate(first.ca), leaf = new X509Certificate(first.cert);
    assert.equal(ca.ca, true);
    assert.equal(leaf.ca, false);
    assert.equal(leaf.checkIP('192.168.1.3'), '192.168.1.3');
    assert.equal(leaf.checkHost('localhost'), 'localhost');
    assert.equal(leaf.verify(ca.publicKey), true);
    assert.equal(ca.verify(ca.publicKey), true);
    assert.equal(first.fingerprint, ca.fingerprint256);
    const same = prepareCertificate(directory, '192.168.1.3');
    assert.equal(same.cert.toString(), first.cert.toString());
    const changed = prepareCertificate(directory, '192.168.1.4');
    assert.equal(changed.fingerprint, first.fingerprint);
    assert.equal(new X509Certificate(changed.cert).checkIP('192.168.1.4'), '192.168.1.4');
    assert.equal(new X509Certificate(changed.cert).verify(ca.publicKey), true);
    assert.equal(fs.existsSync(path.join(directory, 'ca.key')), true);
  } finally { if (!path.resolve(directory).startsWith(prefix)) throw new Error('Diretório temporário fora do local esperado.'); fs.rmSync(directory, {recursive:true,force:true}); }
});
