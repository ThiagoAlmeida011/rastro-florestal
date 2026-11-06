import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
import { prepareCertificate } from './local-certificate.mjs';

/**
 * Servidor estático de desenvolvimento para dispositivos na mesma rede.
 * 8443: aplicativo compilado com TLS. 5175: instruções e certificado público.
 * Não é uma API de banco de dados: os registros permanecem no navegador.
 */
const project = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(project, 'dist');
/** Reconhece IPv4 privado para selecionar a interface de rede local, excluindo loopback e IPs públicos. */
const privateIPv4 = ip => /^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
const ips = Object.values(os.networkInterfaces()).flat().filter(n => n?.family === 'IPv4' && !n.internal && privateIPv4(n.address)).map(n => n.address);
// Um IP passado no comando tem prioridade; ele ainda precisa existir nas interfaces privadas do notebook.
const ip = process.argv[2] || ips[0];
if (!ip || !ips.includes(ip)) {
  console.error('Conecte o notebook ao Wi-Fi. Para escolher um IP local, use: npm.cmd run mobile:https -- 192.168.1.3');
  console.error('IPs privados encontrados:', ips.join(', ') || 'nenhum');
  process.exit(1);
}
if (!fs.existsSync(path.join(dist, 'index.html'))) { console.error('Execute npm.cmd run build antes de iniciar.'); process.exit(1); }
const credentials = prepareCertificate(path.join(project, '.local-https'), ip);
const appURL = `https://${ip}:8443`;
const setupURL = `http://${ip}:5175`;
// Página de preparação independente do React; nunca inclui o conteúdo das chaves privadas.
const page = `<!doctype html><html lang="pt-BR"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HTTPS local · Rastro Florestal</title><style>body{font:16px/1.6 system-ui;background:#f5f8f2;color:#193d29;max-width:700px;margin:30px auto;padding:24px}a{color:#075331}h1{line-height:1.2}section{background:white;padding:20px;border:1px solid #d6e3cf;border-radius:12px;margin:20px 0}code{overflow-wrap:anywhere;font-size:12px}li{margin:12px 0}.button{display:block;padding:14px;border-radius:8px;background:#075331;color:white;text-align:center;text-decoration:none;margin:15px 0}small{color:#536b55}</style><h1>Rastro Florestal<br>HTTPS na rede local</h1><p>Esta página entrega apenas o certificado público. Instale-o somente nos aparelhos de teste que você controla. A chave privada permanece no notebook.</p><section><h2>1. Baixe o certificado</h2><a class="button" href="/rastro-florestal-ca.cer">Baixar certificado · iPhone</a><a class="button" href="/rastro-florestal-ca.crt">Baixar certificado · Android</a><small>Certificado: Rastro Florestal Local CA</small><p>Compare a impressão SHA-256 com a mostrada no terminal do notebook:</p><code>${credentials.fingerprint}</code></section><section><h2>2. Confie no certificado</h2><h3>iPhone / iPad</h3><ol><li>No Safari, baixe o certificado acima. Quando o iOS solicitar, permita baixar o perfil.</li><li>Abra Ajustes → Geral → VPN e Gerenciamento de Dispositivo → perfil Rastro Florestal Local CA → Instalar. O código do aparelho pode ser solicitado.</li><li>Abra Ajustes → Geral → Sobre → Ajustes de Confiança de Certificados. Ative a confiança para Rastro Florestal Local CA.</li></ol><p><a href="https://support.apple.com/pt-br/102390">Instruções oficiais da Apple</a></p><h3>Android</h3><ol><li>Baixe o certificado Android acima.</li><li>Abra Configurações → Segurança e privacidade → Mais configurações de segurança → Criptografia e credenciais → Instalar um certificado → Certificado CA.</li><li>Escolha rastro-florestal-ca.crt e confirme a instalação no seu aparelho. Os nomes variam por fabricante; pesquise por “certificado CA” nas configurações.</li></ol><p><a href="https://support.google.com/pixelphone/answer/2844832?hl=pt-BR">Instruções oficiais do Google</a></p></section><section><h2>3. Abra o aplicativo</h2><p>Depois de confiar no certificado, abra:</p><a class="button" href="${appURL}">${appURL}</a><p>O aplicativo deve abrir sem aviso de certificado. Se houver aviso, volte à instalação e confira a confiança, o IP e a data do aparelho.</p><p>Permita câmera e localização quando o site solicitar. No iPhone, confira também os Serviços de Localização e o acesso do Safari nas configurações de privacidade.</p><p>Cada navegador e endereço possui seus próprios registros. O HTTPS não transfere os dados anteriores do HTTP.</p></section><p>Concluído o teste, você pode remover apenas o certificado Rastro Florestal Local CA nas configurações do aparelho. Não compartilhe os arquivos .key do notebook.</p></html>`;
/** Handler HTTP com lista explícita de rotas; não expõe uma pasta de arquivos ao navegador. */
const setupServer = http.createServer((req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
  const route = req.url?.split('?')[0];
  let body, type;
  if (route === '/rastro-florestal-ca.cer') {body = credentials.der; type = 'application/x-x509-ca-cert';}
  else if (route === '/rastro-florestal-ca.crt') {body = credentials.ca; type = 'application/x-x509-ca-cert';}
  else if (route === '/') {body = page; type = 'text/html; charset=utf-8';}
  else {res.writeHead(404); res.end('Não encontrado'); return;}
  res.writeHead(200, {'Content-Type':type, 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'});
  res.end(req.method === 'HEAD' ? undefined : body);
});
// Tipos de resposta necessários para o navegador carregar módulos JavaScript, estilos e imagens.
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.ico':'image/x-icon' };
/** Handler HTTPS de arquivos estáticos. Serve somente dist, sem acesso aos arquivos-fonte ou certificados privados. */
const secureServer = https.createServer({key:credentials.key, cert:credentials.cert, minVersion:'TLSv1.2'}, (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) {res.writeHead(405); res.end(); return;}
  let route;
  try {route = decodeURIComponent(new URL(req.url, appURL).pathname);} catch {res.writeHead(400); res.end(); return;}
  // Rejeita segmentos ocultos e separadores alternativos antes de resolver o caminho no Windows.
  if (route.split('/').some(part => part.startsWith('.') || part.includes('\\'))) {res.writeHead(404); res.end(); return;}
  let target = path.resolve(dist, `.${route}`);
  // Confirma que o caminho resolvido permanece dentro da pasta pública compilada.
  if (!target.startsWith(dist + path.sep) && target !== dist) {res.writeHead(403); res.end(); return;}
  // Rotas sem extensão recebem a página inicial; arquivos inexistentes com extensão retornam 404.
  if (route === '/' || !path.extname(target)) target = path.join(dist, 'index.html');
  fs.readFile(target, (err, body) => {
    if (err) {res.writeHead(404); res.end('Não encontrado'); return;}
    res.writeHead(200, {'Content-Type':mime[path.extname(target)] || 'application/octet-stream', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'});
    res.end(req.method === 'HEAD' ? undefined : body);
  });
});
/** Fecha os dois listeners em caso de falha, evitando deixar apenas metade do serviço disponível. */
const fail = error => { console.error(error.code === 'EADDRINUSE' ? 'Uma das portas 8443/5175 está em uso. Encerre a outra instância do HTTPS local e tente novamente.' : error.message); secureServer.close(); setupServer.close(); process.exitCode = 1; };
secureServer.on('error', fail); setupServer.on('error', fail);
// A página de instalação começa a escutar somente depois que o listener HTTPS está pronto.
secureServer.listen(8443, ip, () => setupServer.listen(5175, ip, () => {
  console.log(`\nRastro Florestal · HTTPS somente na rede local\n\nNo celular, prepare o certificado: ${setupURL}\nDepois, abra o aplicativo:       ${appURL}\n\nSHA-256 do certificado CA:\n${credentials.fingerprint}\n\nChaves privadas em .local-https (não enviar ao GitHub).\nNenhum certificado foi instalado automaticamente.\nMantenha o terminal aberto. Ctrl+C encerra os servidores.\n`);
}));
// Ctrl+C encerra os dois servidores; não remove certificados nem dados salvos no navegador.
process.on('SIGINT', () => {secureServer.close(); setupServer.close(); process.exit(0);});
