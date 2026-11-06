import fs from 'node:fs';
import path from 'node:path';
import { createHash, generateKeyPairSync, randomBytes, X509Certificate } from 'node:crypto';
import forge from 'node-forge';

/** Gera chaves RSA locais e adapta a representação do Node para a biblioteca de certificados. */
function keyPair() {
  const keys = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKey: forge.pki.publicKeyFromPem(keys.publicKey), privateKey: forge.pki.privateKeyFromPem(keys.privateKey), pem: keys.privateKey };
}
/** Define serial positivo e validade; a margem inicial de cinco minutos tolera pequenas diferenças de relógio. */
function baseCertificate(keys, days) {
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = `01${randomBytes(15).toString('hex')}`;
  cert.validity.notBefore = new Date(Date.now() - 5 * 60_000);
  cert.validity.notAfter = new Date(Date.now() + days * 86_400_000);
  return cert;
}
/**
 * Prepara a autoridade certificadora e o certificado HTTPS do IP escolhido.
 * Preserva a CA para não exigir reinstalação nos celulares a cada execução.
 * Retorna chave privada apenas ao servidor local; endpoints públicos recebem
 * somente o certificado CA. Não instala confiança no Windows ou nos aparelhos.
 * @param {string} directory Pasta privada, excluída do Git e das entregas.
 * @param {string} ip IPv4 usado pelo navegador na rede local.
 */
export function prepareCertificate(directory, ip) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const caCertPath = path.join(directory, 'ca.crt'), caKeyPath = path.join(directory, 'ca.key');
  // Não substitui silenciosamente metade de um par existente: isso quebraria a confiança já instalada.
  const existing = [caCertPath, caKeyPath].map(file => fs.existsSync(file));
  if (existing.some(Boolean) && !existing.every(Boolean)) throw new Error('Certificado local incompleto. Restaure ca.crt e ca.key juntos antes de continuar.');
  let ca, caKey;
  if (existing.every(Boolean)) {
    ca = forge.pki.certificateFromPem(fs.readFileSync(caCertPath, 'utf8'));
    caKey = forge.pki.privateKeyFromPem(fs.readFileSync(caKeyPath, 'utf8'));
    if (ca.validity.notAfter.getTime() < Date.now() + 91 * 86_400_000) throw new Error('A autoridade local está perto de vencer. Gere uma nova configuração e reinstale o certificado nos aparelhos.');
  } else {
    const keys = keyPair();
    ca = baseCertificate(keys, 365);
    const subject = [{ name: 'commonName', value: 'Rastro Florestal Local CA' }, { name: 'organizationName', value: 'Rastro Florestal - desenvolvimento local' }];
    ca.setSubject(subject); ca.setIssuer(subject);
    ca.setExtensions([
      { name: 'basicConstraints', critical: true, cA: true, pathLenConstraint: 0 },
      { name: 'keyUsage', critical: true, keyCertSign: true, cRLSign: true },
      { name: 'subjectKeyIdentifier' },
    ]);
    ca.sign(keys.privateKey, forge.md.sha256.create());
    caKey = keys.privateKey;
    fs.writeFileSync(caKeyPath, keys.pem, { mode: 0o600 });
    fs.writeFileSync(caCertPath, forge.pki.certificateToPem(ca));
  }
  const certPath = path.join(directory, 'server.crt'), keyPath = path.join(directory, 'server.key');
  let reuse = false;
  // Reutiliza o certificado do servidor apenas se endereço, validade e assinatura ainda corresponderem.
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    const current = new X509Certificate(fs.readFileSync(certPath));
    const caX509 = new X509Certificate(forge.pki.certificateToPem(ca));
    reuse = current.checkIP(ip) === ip && Date.parse(current.validTo) > Date.now() + 86_400_000 && current.verify(caX509.publicKey);
  }
  // Troca/renova o certificado do servidor sem mudar a autoridade instalada nos aparelhos.
  if (!reuse) {
    const keys = keyPair(), cert = baseCertificate(keys, 90);
    cert.setSubject([{ name: 'commonName', value: ip }]);
    cert.setIssuer(ca.subject.attributes);
    cert.setExtensions([
      { name: 'basicConstraints', critical: true, cA: false },
      { name: 'keyUsage', critical: true, digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true },
      { name: 'subjectAltName', altNames: [{ type: 7, ip }, { type: 7, ip: '127.0.0.1' }, { type: 2, value: 'localhost' }] },
      { name: 'subjectKeyIdentifier' },
      { name: 'authorityKeyIdentifier', keyIdentifier: ca.generateSubjectKeyIdentifier().getBytes() },
    ]);
    cert.sign(caKey, forge.md.sha256.create());
    fs.writeFileSync(keyPath, keys.pem, { mode: 0o600 });
    fs.writeFileSync(certPath, forge.pki.certificateToPem(cert));
  }
  // A impressão digital permite comparar no celular o certificado público com o exibido no notebook.
  const caPem = fs.readFileSync(caCertPath);
  const der = new X509Certificate(caPem).raw;
  return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath), ca: caPem, der, fingerprint: createHash('sha256').update(der).digest('hex').match(/.{2}/g).join(':').toUpperCase() };
}
