import { labelPayload } from './labels.js';
/**
 * Persistência e regras do domínio. O MVP guarda o registro completo no IndexedDB:
 * registro → produtos → tentativas, incluindo imagens binárias e posições individuais.
 * Não há API remota. Esta camada é o ponto de partida para a futura integração
 * com banco de dados; a interface não deve substituir suas validações.
 */
export const MAX_ATTEMPTS = 3;
export const ALERT_DISTANCE_M = 100;
/**
 * Alguns navegadores WebKit falham ao persistir Blob no IndexedDB. Guardamos os
 * bytes originais e o tipo MIME, sem base64 ou recompressão. A conversão ocorre
 * antes da transação para não deixá-la expirar enquanto aguardamos arrayBuffer().
 */
async function encodeAttempt(attempt) {
  if (!(attempt.photo instanceof Blob)) return attempt;
  const { photo, ...metadata } = attempt;
  return { ...metadata, photoData: { format: 'array-buffer-v1', bytes: await photo.arrayBuffer(), type: photo.type } };
}
/** Reconstrói a imagem para a interface e continua aceitando registros antigos com Blob. */
function decodeAttempt(attempt) {
  if (attempt.photoData?.format !== 'array-buffer-v1') return attempt;
  const { photoData, ...metadata } = attempt;
  return { ...metadata, photo: new Blob([photoData.bytes], { type: photoData.type }) };
}
function decodeRecord(record) {
  return { ...record, products: record.products.map(product => ({ ...product,
    before: product.before.map(decodeAttempt), after: product.after.map(decodeAttempt),
  })) };
}
async function encodeRecord(record) {
  return { ...record, products: await Promise.all(record.products.map(async product => ({ ...product,
    before: await Promise.all(product.before.map(encodeAttempt)),
    after: await Promise.all(product.after.map(encodeAttempt)),
  }))) };
}
/** Traduz a causa real do armazenamento; não presume falta de espaço para todo erro. */
export function storageErrorMessage(error) {
  const code = error?.name || 'Erro desconhecido';
  const messages = {
    QuotaExceededError: 'O navegador ficou sem espaço para este registro. Libere espaço sem apagar os dados deste site.',
    SecurityError: 'O navegador bloqueou o armazenamento deste site. Abra no Safari e confira as permissões de armazenamento.',
    InvalidStateError: 'A conexão com o armazenamento não está disponível. Mantenha esta página aberta para preservar o rascunho.',
    DataCloneError: 'O navegador não conseguiu armazenar um dos dados ou fotos deste registro.',
    UnknownError: 'O navegador não conseguiu concluir a gravação local.',
    AbortError: 'A gravação local foi interrompida antes de concluir.',
  };
  const detail = error?.message ? ` ${error.message}` : '';
  return `${messages[code] || 'Não foi possível salvar no armazenamento local.'} (${code})${detail} Seu rascunho continua nesta tela; não atualize a página.`;
}
/** Gera UUID v4 estável. A dependência injetável permite testar acesso HTTP sem randomUUID. */
export function uid(cryptoApi = globalThis.crypto) {
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
  // randomUUID exige contexto seguro; getRandomValues também funciona via HTTP na LAN.
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
// Compartilha a promessa de abertura para evitar conexões duplicadas durante a inicialização.
let connection;
/** Abre o banco da origem atual; cria o armazenamento na versão 1 e permite nova tentativa após erro. */
export function openDB() {
  if (!connection) connection = new Promise((resolve, reject) => {
    const request = indexedDB.open('rastro-florestal', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('records', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { connection = null; reject(request.error); };
  });
  return connection;
}
/** Consulta registros do mais recente ao mais antigo, sem modificar os dados persistidos. */
export async function listRecords() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readonly');
    const req = tx.objectStore('records').getAll();
    tx.oncomplete = () => resolve(req.result.sort((a,b) => b.createdAt.localeCompare(a.createdAt)).map(decodeRecord));
    tx.onerror = () => reject(tx.error);
  });
}
/**
 * Insere um registro novo com código amigável independente do UUID.
 * Leitura dos códigos e inserção pertencem à mesma transação de escrita,
 * evitando colisão entre abas. Só resolve após o commit, não no sucesso da requisição.
 */
export async function createRecord(record) {
  const encoded = await encodeRecord(record);
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readwrite');
    const store = tx.objectStore('records');
    let saved, failure;
    const req = store.getAll();
    req.onsuccess = () => {
      try {
        // Repetir o salvamento do mesmo rascunho não cria outro registro.
        saved = req.result.find(r => r.id === record.id);
        if (saved) return;
        saved = { ...encoded, code: Math.max(0, ...req.result.map(r => r.code)) + 1 };
        const write = store.add(saved);
        write.onerror = () => { failure = write.error; };
      } catch (error) { failure = error; tx.abort(); }
    };
    req.onerror = () => { failure = req.error; };
    tx.oncomplete = () => resolve(decodeRecord(saved));
    // O erro de uma requisição aparece antes de tx.error ser preenchido em alguns navegadores.
    tx.onerror = event => { failure ||= event.target.error; };
    tx.onabort = () => reject(failure || tx.error || new Error('Não foi possível salvar.'));
  });
}
/**
 * Executa leitura, transformação e gravação como uma única operação atômica.
 * `change` deve ser síncrona: aguardar rede ou outra promessa aqui pode encerrar
 * a transação do IndexedDB antes da escrita. Erros abortam a alteração inteira.
 */
async function mutateRecord(id, change) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readwrite');
    const store = tx.objectStore('records');
    let saved, failure;
    const request = store.get(id);
    request.onsuccess = () => {
      try {
        if (!request.result) throw new Error('Registro não encontrado.');
        saved = change(request.result);
        saved.updatedAt = new Date().toISOString();
        store.put(saved);
      } catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => resolve(decodeRecord(saved));
    tx.onabort = tx.onerror = () => reject(failure || tx.error || new Error('Não foi possível salvar.'));
  });
}
/** Altera somente o nome; produtor, produtos e evidências são preservados. */
export const renameRecord = (id, name) => mutateRecord(id, record => {
  if (!name.trim()) throw new Error('Informe o nome do registro.');
  return { ...record, name: name.trim() };
});
/**
 * Função pura compartilhada pelo rascunho e pela gravação: devolve um produto novo.
 * Preserva o histórico, mantém contadores independentes de before/after e limita
 * cada etapa a três envios. Repetir o mesmo ID não acrescenta outra tentativa.
 */
export function appendAttempt(product, phase, attempt) {
  if (!['before', 'after'].includes(phase)) throw new Error('Tipo de foto inválido.');
  const attempts = product[phase];
  if (attempts.some(a => a.id === attempt.id)) return product;
  if (attempts.length >= MAX_ATTEMPTS) throw new Error('Limite de três tentativas atingido.');
  return { ...product, [phase]: [...attempts, { ...attempt, number: attempts.length + 1 }] };
}
/** Acrescenta uma evidência a um produto salvo dentro da transação que valida o limite. */
export async function addAttempt(recordId, productId, phase, attempt) {
  const encoded = await encodeAttempt(attempt);
  return mutateRecord(recordId, record => {
    if (!record.products.some(p => p.id === productId)) throw new Error('Produto não encontrado.');
    const previous = record.products.find(p => p.id === productId);
    const next = appendAttempt(previous, phase, encoded);
    // Repetir uma tentativa já salva não invalida o resultado. Falhas também não gravam.
    if (next === previous) return record;
    const { demoFinalization, ...preserved } = record;
    return { ...preserved,
      ...(demoFinalization ? { demoFinalizationHistory: [...(record.demoFinalizationHistory || []), {
        ...demoFinalization, invalidatedAt: new Date().toISOString(), reason: 'new-evidence', attemptId: attempt.id,
      }] } : {}),
      products: record.products.map(p => p.id === productId ? next : p),
    };
  });
}
/**
 * Critério do MVP: todos os produtos têm espécie e ao menos uma posição em cada etapa.
 * Uma posição de demonstração também satisfaz este critério; completo não significa
 * autenticidade, validação por satélite ou comprovação de legalidade.
 */
export const isComplete = record => record.products.length > 0 && record.products.every(p => p.species.trim() && p.before.some(a => a.location) && p.after.some(a => a.location));
/** Distância aproximada em metros pela fórmula de Haversine; recebe latitude/longitude em graus. */
export function distance(a, b) {
  const rad = n => n * Math.PI / 180;
  const dLat = rad(b.latitude-a.latitude), dLon = rad(b.longitude-a.longitude);
  const h = Math.sin(dLat/2)**2 + Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(dLon/2)**2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1-h));
}
/**
 * Compara a última tentativa da etapa com as demais evidências do mesmo produto.
 * Não mistura GPS real com simulação. O alerta exige distância acima do limiar
 * mais a soma das precisões, reduzindo avisos por oscilação do GPS.
 * O resultado orienta conferência humana; não é uma classificação de fraude.
 */
export function discrepancies(product, phase) {
  const current = product[phase].at(-1);
  if (!current?.location) return [];
  return [...product.before, ...product.after].filter(a => a.id !== current.id && a.location && a.location.source === current.location.source).map(a => ({ attempt: a, meters: distance(a.location, current.location), uncertainty: (a.location.accuracy || 0) + (current.location.accuracy || 0) })).filter(d => d.meters > ALERT_DISTANCE_M + d.uncertainty);
}

/** Finalização local demonstrativa, sem certificação ou emissão em blockchain. */
export const DEMO_WAIT_MS = 5 * 24 * 60 * 60 * 1000;
export const canFinalizeDemo = record => isComplete(record) && record.products.every(p => p.productType?.trim() &&
  ['before', 'after'].every(phase => p[phase].some(a =>
    (a.photo instanceof Blob && a.photo.size > 0 || a.photoData?.bytes?.byteLength > 0) &&
    a.location && Number.isFinite(a.location.latitude) && Math.abs(a.location.latitude) <= 90 &&
    Number.isFinite(a.location.longitude) && Math.abs(a.location.longitude) <= 180)));
export function demoStatus(record, now = Date.now()) {
  const flow = record.demoFinalization;
  if (!flow?.startedAt) return canFinalizeDemo(record) ? 'ready' : 'incomplete';
  if (flow.token && flow.labels?.length) return 'issued';
  return flow.expeditedAt || now >= Date.parse(flow.availableAt) ? 'eligible' : 'waiting';
}
/** A solicitação inicia o prazo local de cinco dias, sem aprovação manual. */
export const startDemoFinalization = id => mutateRecord(id, record => {
  if (record.demoFinalization?.startedAt) return record;
  if (!canFinalizeDemo(record)) throw new Error('Cada produto precisa de tipo, espécie e fotos antes/depois com coordenadas válidas.');
  const now = Date.now(), startedAt = new Date(now).toISOString();
  return { ...record, demoFinalization: { id: uid(), startedAt, availableAt: new Date(now + DEMO_WAIT_MS).toISOString() } };
});
/** O tipo pode ser informado em registros antigos; mudá-lo exige novo envio. */
export const setProductType = (id, productId, value) => mutateRecord(id, record => {
  const productType = value.trim();
  if (!productType || productType.length > 100) throw new Error('Informe o tipo de produto (até 100 caracteres).');
  const product = record.products.find(p => p.id === productId);
  if (!product) throw new Error('Produto não encontrado.');
  if (product.productType === productType) return record;
  const { demoFinalization, ...rest } = record;
  return { ...rest,
    ...(demoFinalization ? { demoFinalizationHistory: [...(record.demoFinalizationHistory || []), { ...demoFinalization, invalidatedAt: new Date().toISOString(), reason: 'product-type-changed' }] } : {}),
    products: record.products.map(p => p.id === productId ? { ...p, productType } : p),
  };
});
/** A antecipação é explícita e auditável; não altera datas nem evidências originais. */
export const expediteDemoFinalization = id => mutateRecord(id, record => {
  if (!record.demoFinalization?.startedAt) throw new Error('Inicie o prazo para envio do token primeiro.');
  if (record.demoFinalization.token || record.demoFinalization.expeditedAt) return record;
  return { ...record, demoFinalization: { ...record.demoFinalization, expeditedAt: new Date().toISOString() } };
});
export const issueDemoToken = id => mutateRecord(id, record => {
  if (record.demoFinalization?.token && record.demoFinalization.labels?.length) return record;
  if (!canFinalizeDemo(record) || demoStatus(record) !== 'eligible') throw new Error('Aguarde cinco dias ou antecipe a espera para o pitch.');
  const issuedAt = new Date(Date.now()).toISOString();
  return { ...record, demoFinalization: { ...record.demoFinalization, token: record.demoFinalization.token || `DEMO-${record.demoFinalization.id || record.id}`, issuedAt, labels: record.products.map(p => ({ productId: p.id, payload: labelPayload(record, p, record.demoFinalization, issuedAt) })) } };
});
