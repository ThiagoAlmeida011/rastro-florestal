import QRCode from 'qrcode';
/** Snapshot dos dados do produto. Fotos binárias permanecem no histórico local. */
export function labelPayload(record, product, flow, issuedAt) {
  return {
    app: 'Verdefica', versao: 1, modo: 'DEMO',
    aviso: 'Demonstracao local; sem certificacao externa. Fotos no app de origem.',
    registro: record.id, codigo: record.code, nome: record.name, produtor: record.producer,
    produto: product.id, tipo: product.productType, especie: product.species,
    criado: record.createdAt, solicitado: flow.startedAt,
    liberacaoPrevista: flow.availableAt, antecipacaoPitch: flow.expeditedAt || null, emitido: issuedAt,
    antes: product.before.map(evidenceData), depois: product.after.map(evidenceData),
  };
}
function evidenceData(a, index) {
  const l = a.location;
  return { tentativa: a.number || index + 1, captura: a.capturedAt, inclusao: a.includedAt || a.capturedAt,
    imagem: a.imageSource || 'nao-informada',
    local: l ? { lat: l.latitude, lon: l.longitude, origem: l.source, precisao: l.accuracy ?? null, data: l.timestamp || a.capturedAt } : null };
}
export const qrOptions = { errorCorrectionLevel: 'M', margin: 4, width: 1200 };
export function labelText(payload) { return JSON.stringify(payload); }
export async function labelImage(payload) {
  try { return await QRCode.toDataURL(labelText(payload), qrOptions); }
  catch (error) { throw new Error(/too big|too large|cannot contain/i.test(error.message) ? 'Os dados excedem a capacidade desta etiqueta QR. Reduza os textos de identificação antes de solicitar novamente.' : 'Não foi possível gerar a imagem QR neste navegador. Reabra o registro e tente novamente.'); }
}
