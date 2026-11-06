import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { uid, openDB, createRecord, listRecords, renameRecord, addAttempt, distance, discrepancies, isComplete, storageErrorMessage, DEMO_WAIT_MS, canFinalizeDemo, demoStatus, startDemoFinalization, expediteDemoFinalization, issueDemoToken, setProductType } from './store.js';
const location = {source:'demo', latitude:-3.119, longitude:-60.0217, accuracy:0};
const attempt = (id = uid()) => ({id, photo:new Blob(['image'],{type:'image/jpeg'}), location, capturedAt:new Date().toISOString()});
test('cria identificadores sem randomUUID em HTTP de rede local', () => {
  const cryptoApi = { getRandomValues: buffer => crypto.getRandomValues(buffer) };
  const ids = Array.from({ length: 1000 }, () => uid(cryptoApi));
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
test('persistência, histórico imutável, limite atômico e idempotência', async () => {
  const productId = uid();
  const record = await createRecord({id:uid(), name:'Área do Rio', producer:'João', createdAt:new Date().toISOString(), products:[{id:productId,species:'Ipê',before:[],after:[]}]});
  const first = attempt();
  await addAttempt(record.id,productId,'before',first);
  await addAttempt(record.id,productId,'before',first);
  let saved = (await listRecords()).find(r => r.id === record.id);
  assert.equal(saved.products[0].before.length,1);
  assert.equal(await saved.products[0].before[0].photo.text(),'image');
  const results = await Promise.allSettled(Array.from({length:4},() => addAttempt(record.id,productId,'before',attempt())));
  assert.equal(results.filter(r => r.status === 'fulfilled').length,2);
  assert.equal(results.filter(r => r.status === 'rejected').length,2);
  saved = await renameRecord(record.id,'Área nova');
  assert.equal(saved.products[0].species,'Ipê');
  assert.equal(saved.producer,'João');
  assert.equal(saved.products[0].before[0].id,first.id);
  assert.deepEqual(saved.products[0].before.map(a => a.number),[1,2,3]);
  assert.equal(isComplete(saved),false);
  saved = await addAttempt(record.id,productId,'after',attempt());
  assert.equal(saved.products[0].after.length,1);
  assert.equal(isComplete(saved),true);
  assert.equal(saved.name,'Área nova');
});
test('códigos não colidem em salvamentos concorrentes',async () => {
  const rows = await Promise.all(Array.from({length:3},() => createRecord({id:uid(),name:'Mesmo nome',products:[],createdAt:new Date().toISOString()})));
  assert.equal(new Set(rows.map(r => r.code)).size,3);
});
test('falha de serialização aborta a escrita e preserva sua causa', async () => {
  const id = uid();
  await assert.rejects(createRecord({id, name:'Inválido', products:[], createdAt:new Date().toISOString(), invalid:()=>{}}), {name:'DataCloneError'});
  assert.equal((await listRecords()).some(r => r.id === id),false);
  const record = {id,name:'Rascunho',products:[],createdAt:new Date().toISOString()};
  const saved = await createRecord(record);
  const repeated = await createRecord({...record,name:'Não deve sobrescrever'});
  assert.equal(saved.code,repeated.code);
  assert.equal(repeated.name,'Rascunho');
  assert.equal((await listRecords()).filter(r => r.id === id).length,1);
});
test('mensagens distinguem espaço insuficiente de outras falhas', () => {
  assert.match(storageErrorMessage(new DOMException('Falha de gravação','UnknownError')),/UnknownError/);
  assert.doesNotMatch(storageErrorMessage(new DOMException('Falha de gravação','UnknownError')),/sem espaço/);
  assert.match(storageErrorMessage(new DOMException('Quota','QuotaExceededError')),/sem espaço/);
});
test('salva fotos sem Blob na transação e recupera bytes, MIME e metadados intactos', async () => {
  // Reproduz um navegador que rejeita Blob, independentemente de quanto espaço tem.
  const originalAdd = IDBObjectStore.prototype.add, originalPut = IDBObjectStore.prototype.put;
  function rejectBlob(value) {
    if (value instanceof Blob) throw new DOMException('Error preparing Blob/File data to be stored in object store', 'UnknownError');
    if (value && typeof value === 'object') Object.values(value).forEach(rejectBlob);
  }
  IDBObjectStore.prototype.add = function(value, ...args) { rejectBlob(value); return originalAdd.call(this,value,...args); };
  IDBObjectStore.prototype.put = function(value, ...args) { rejectBlob(value); return originalPut.call(this,value,...args); };
  try {
    const bytes = new Uint8Array([0,255,1,128,42]);
    const photo = new Blob([bytes],{type:'image/jpeg'});
    const evidence = {...attempt(),photo};
    const product = {id:uid(),species:'Ipê',before:[evidence],after:[]};
    const saved = await createRecord({id:uid(),name:'Foto binária',producer:'Teste',createdAt:new Date().toISOString(),products:[product]});
    await addAttempt(saved.id,product.id,'after',{...attempt(),photo});
    await renameRecord(saved.id,'Foto preservada');
    const db = await openDB();
    const raw = await new Promise((resolve,reject)=> {
      const tx = db.transaction('records','readonly'), req = tx.objectStore('records').get(saved.id);
      tx.oncomplete = ()=>resolve(req.result); tx.onerror = ()=>reject(tx.error);
    });
    assert.equal(raw.products[0].before[0].photo,undefined);
    assert.ok(raw.products[0].before[0].photoData.bytes instanceof ArrayBuffer);
    assert.equal(raw.products[0].after[0].photoData.format,'array-buffer-v1');
    const loaded = (await listRecords()).find(r=>r.id===saved.id);
    for(const phase of ['before','after']) {
      const restored = loaded.products[0][phase][0];
      assert.equal(restored.photo.type,'image/jpeg');
      assert.deepEqual(new Uint8Array(await restored.photo.arrayBuffer()),bytes);
      assert.deepEqual(restored.location,location);
    }
    assert.equal(loaded.products[0].before[0].id,evidence.id);
  } finally { IDBObjectStore.prototype.add=originalAdd; IDBObjectStore.prototype.put=originalPut; }
});
test('registros legados com Blob continuam legíveis', async () => {
  const legacy = {id:uid(),name:'Legado',code:100,createdAt:new Date().toISOString(),products:[{id:uid(),species:'Ipê',before:[attempt()],after:[]}]};
  const db = await openDB();
  await new Promise((resolve,reject)=>{const tx=db.transaction('records','readwrite');tx.objectStore('records').add(legacy);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
  const loaded=(await listRecords()).find(r=>r.id===legacy.id);
  assert.equal(await loaded.products[0].before[0].photo.text(),'image');
});
test('alertas calculados respeitam precisão e separam GPS real de simulação', () => {
  const a = attempt(), b = {...attempt(),location:{...location,latitude:-3.124}};
  const product = {before:[a],after:[b]};
  assert.ok(Math.abs(distance(a.location,b.location)-556)<2);
  assert.equal(discrepancies(product,'after').length,1);
  b.location.accuracy=600;
  assert.equal(discrepancies(product,'after').length,0);
  b.location={...b.location,source:'device',accuracy:0};
  assert.equal(discrepancies(product,'after').length,0);
  b.location=null;
  assert.equal(discrepancies(product,'after').length,0);
  assert.equal(isComplete({products:[{...product,species:'Ipê'}]}),false);
});

const demoRecord = () => ({id:uid(),name:'Pitch',producer:'Produtor',createdAt:new Date().toISOString(),products:[{id:uid(),species:'Ipê',productType:'Madeira em tora',before:[attempt()],after:[attempt()]}]});
test('finalização exige fotos e coordenadas válidas em todos os produtos', async () => {
  const row = demoRecord();
  assert.equal(canFinalizeDemo(row),true);
  row.products[0].after[0].photo = new Blob([]);
  assert.equal(canFinalizeDemo(row),false);
  const saved = await createRecord(row);
  await assert.rejects(startDemoFinalization(saved.id), /Cada produto/);
  row.products[0].after[0] = {...attempt(), location:{...location,latitude:NaN}};
  assert.equal(canFinalizeDemo(row),false);
  row.products[0].after[0] = {...attempt(), location:null};
  assert.equal(canFinalizeDemo(row),false);
});
test('espera exata de cinco dias, emissão idempotente e evidências preservadas', async t => {
  const row = await createRecord(demoRecord());
  assert.equal(demoStatus(row),'ready');
  const saved = await startDemoFinalization(row.id);
  const flow = saved.demoFinalization;
  assert.equal(Date.parse(flow.availableAt)-Date.parse(flow.startedAt),DEMO_WAIT_MS);
  assert.equal(demoStatus(saved,Date.parse(flow.availableAt)-1),'waiting');
  assert.equal(demoStatus(saved,Date.parse(flow.availableAt)),'eligible');
  await assert.rejects(issueDemoToken(row.id), /Aguarde/);
  assert.deepEqual((await startDemoFinalization(row.id)).demoFinalization,flow);
  t.mock.method(Date,'now',()=>Date.parse(flow.availableAt));
  const issued = await issueDemoToken(row.id);
  assert.match(issued.demoFinalization.token,/^DEMO-/);
  assert.equal(demoStatus(issued),'issued');
  assert.deepEqual((await issueDemoToken(row.id)).demoFinalization,issued.demoFinalization);
  assert.equal(issued.products[0].before[0].id,row.products[0].before[0].id);
  assert.equal(await issued.products[0].after[0].photo.text(),'image');
});
test('antecipação persistida para pitch mantém prazo e token após recarregar', async () => {
  const row = await createRecord(demoRecord());
  await assert.rejects(expediteDemoFinalization(row.id), /Inicie/);
  const started = await startDemoFinalization(row.id);
  const accelerated = await expediteDemoFinalization(row.id);
  assert.equal(accelerated.demoFinalization.availableAt,started.demoFinalization.availableAt);
  assert.equal(demoStatus(accelerated),'eligible');
  assert.deepEqual((await expediteDemoFinalization(row.id)).demoFinalization,accelerated.demoFinalization);
  const results = await Promise.all([issueDemoToken(row.id),issueDemoToken(row.id)]);
  assert.equal(results[0].demoFinalization.token,results[1].demoFinalization.token);
  const loaded = (await listRecords()).find(r=>r.id===row.id);
  assert.equal(loaded.demoFinalization.token,results[0].demoFinalization.token);
  assert.ok(loaded.demoFinalization.expeditedAt);
  assert.deepEqual(loaded.products[0].before[0].location,row.products[0].before[0].location);
});

test('nova evidência invalida o ciclo, preserva histórico e renomear mantém token', async () => {
  const row = await createRecord(demoRecord());
  await startDemoFinalization(row.id);
  await expediteDemoFinalization(row.id);
  const issued = await issueDemoToken(row.id);
  const renamed = await renameRecord(row.id,'Nome novo');
  assert.deepEqual(renamed.demoFinalization,issued.demoFinalization);
  const retry = await addAttempt(row.id,row.products[0].id,'after',row.products[0].after[0]);
  assert.deepEqual(retry.demoFinalization,issued.demoFinalization);
  await assert.rejects(addAttempt(row.id,'inexistente','after',attempt()),/Produto/);
  const newEvidence = attempt();
  const updated = await addAttempt(row.id,row.products[0].id,'after',newEvidence);
  assert.equal(updated.demoFinalization,undefined);
  assert.equal(updated.demoFinalizationHistory.length,1);
  assert.equal(updated.demoFinalizationHistory[0].token,issued.demoFinalization.token);
  assert.equal(updated.demoFinalizationHistory[0].attemptId,newEvidence.id);
  assert.ok(updated.demoFinalizationHistory[0].invalidatedAt);
  assert.equal(updated.products[0].after.length,2);
  assert.equal(updated.products[0].after[0].id,row.products[0].after[0].id);
  await assert.rejects(issueDemoToken(row.id), /Aguarde/);
  await startDemoFinalization(row.id);
  await expediteDemoFinalization(row.id);
  const reissued = await issueDemoToken(row.id);
  assert.notEqual(reissued.demoFinalization.token,issued.demoFinalization.token);
  assert.equal(reissued.demoFinalizationHistory.length,1);
  const loaded = (await listRecords()).find(r=>r.id===row.id);
  assert.deepEqual(loaded.demoFinalization,reissued.demoFinalization);
  assert.deepEqual(loaded.demoFinalizationHistory,reissued.demoFinalizationHistory);
});
test('tentativa acima do limite não invalida a finalização', async () => {
  const data = demoRecord();
  data.products[0].after = [attempt(),attempt(),attempt()];
  const row = await createRecord(data);
  const started = await startDemoFinalization(row.id);
  await assert.rejects(addAttempt(row.id,row.products[0].id,'after',attempt()),/Limite/);
  const loaded = (await listRecords()).find(r=>r.id===row.id);
  assert.deepEqual(loaded.demoFinalization,started.demoFinalization);
  assert.equal(loaded.demoFinalizationHistory,undefined);
});

test('solicitação dispensa aprovação manual e exige tipo de produto', async () => {
  const row = await createRecord(demoRecord());
  const requested = await startDemoFinalization(row.id);
  assert.equal(requested.demoFinalization.validatedBy,undefined);
  assert.equal(requested.demoFinalization.validatedAt,undefined);
  assert.equal(demoStatus(requested),'waiting');
  const data = demoRecord(); delete data.products[0].productType;
  const legacy = await createRecord(data);
  assert.equal(demoStatus(legacy),'incomplete');
  await assert.rejects(startDemoFinalization(legacy.id), /Cada produto/);
  await setProductType(legacy.id,data.products[0].id,'Tábua');
  const started = await startDemoFinalization(legacy.id);
  assert.equal(demoStatus(started),'waiting');
});
test('tipo alterado invalida solicitação e nova emissão guarda snapshot imutável', async () => {
  const row = await createRecord(demoRecord());
  const started = await startDemoFinalization(row.id);
  const unchanged = await setProductType(row.id,row.products[0].id,'Madeira em tora');
  assert.deepEqual(unchanged.demoFinalization,started.demoFinalization);
  const changed = await setProductType(row.id,row.products[0].id,'Tábua');
  assert.equal(changed.demoFinalization,undefined);
  assert.equal(changed.demoFinalizationHistory[0].reason,'product-type-changed');
  await startDemoFinalization(row.id);
  await expediteDemoFinalization(row.id);
  const issued = await issueDemoToken(row.id);
  assert.equal(issued.demoFinalization.labels[0].payload.tipo,'Tábua');
  assert.equal(issued.demoFinalization.labels[0].payload.solicitado,issued.demoFinalization.startedAt);
  assert.equal(issued.demoFinalization.labels[0].payload.validacao,undefined);
  assert.ok(issued.demoFinalization.labels[0].payload.antecipacaoPitch);
  const renamed = await renameRecord(row.id,'Outro nome');
  assert.deepEqual(renamed.demoFinalization.labels,issued.demoFinalization.labels);
});

test('ciclos existentes preservam o prazo e os dados após remover aprovação manual', async () => {
 const data = demoRecord();
 const stamp = new Date().toISOString();
 data.demoFinalization = {id:uid(),startedAt:stamp,validatedAt:stamp,validatedBy:'Pessoa anterior',availableAt:new Date(Date.now()+DEMO_WAIT_MS).toISOString()};
 const row = await createRecord(data);
 const retained = await startDemoFinalization(row.id);
 assert.deepEqual(retained.demoFinalization,row.demoFinalization);
 assert.equal(demoStatus(retained),'waiting');
 await assert.rejects(issueDemoToken(row.id),/Aguarde/);
 await expediteDemoFinalization(row.id);
 const issued = await issueDemoToken(row.id);
 assert.equal(issued.demoFinalization.labels[0].payload.solicitado,stamp);
 assert.equal(issued.demoFinalization.labels[0].payload.validacao,undefined);
});
