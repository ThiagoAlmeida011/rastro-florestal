import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Leaf, Plus, ArrowLeft, ArrowUpRight, ChevronRight, Camera, MapPin, LockKeyhole, FileText, Package, Check, X, Info, AlertTriangle, History, Monitor, Sprout, LoaderCircle } from 'lucide-react';
import { uid, listRecords, createRecord, renameRecord, addAttempt, appendAttempt, isComplete, discrepancies, storageErrorMessage } from './store';
import './style.css';
import './campo.css';

/**
 * Interface React do produtor. App coordena três telas sem roteador:
 * list (consulta), new (rascunho em memória) e edit (registro persistido).
 * Captura e histórico abrem em modais; gravações passam pelas regras de store.js.
 */
const PHASE = { before: 'Antes da extração', after: 'Depois da extração' };
/** Cria um produto de rascunho com identidade própria e históricos independentes. */
const newProduct = () => ({ id: uid(), species: '', before: [], after: [] });
/** Formata o código para exibição; nunca usar esse texto como chave de identidade. */
const formatCode = n => `#${String(n).padStart(4, '0')}`;
/** Exibe um instante ISO no idioma e fuso do navegador do produtor. */
const time = d => new Date(d).toLocaleString('pt-BR');
/** Exibe o Blob sem upload; revoga a URL temporária ao trocar a imagem ou desmontar o componente. */
function Photo({ attempt, className = '' }) {
  const [url, setUrl] = useState('');
  useEffect(() => { const u = URL.createObjectURL(attempt.photo); setUrl(u); return () => URL.revokeObjectURL(u); }, [attempt.photo]);
  return <img className={className} src={url} alt={`Foto da tentativa ${attempt.number || 1}`} />;
}
/** Apresenta origem, coordenadas e precisão da tentativa, incluindo ausência de posição. */
function Location({ attempt }) {
  const l = attempt.location;
  return <div className="location"><MapPin size={16}/><span>{l ? <><strong>{l.source === 'demo' ? 'Localização de demonstração' : 'Posição do dispositivo na inclusão'}</strong><span>{l.latitude.toFixed(5)}, {l.longitude.toFixed(5)}{l.accuracy != null && ` · precisão ±${Math.round(l.accuracy)} m`}</span></> : <strong>Sem localização · evidência incompleta</strong>}</span></div>;
}
/** Usa dialog nativo para modalidade/foco e devolve o foco ao controle anterior ao fechar. */
function Modal({ title, children, onClose, wide = false }) {
  const ref = useRef();
  useEffect(() => { const previous = document.activeElement; const d = ref.current; d.showModal(); return () => { d.close(); previous?.focus(); }; }, []);
  return <dialog ref={ref} className={wide ? 'modal wide' : 'modal'} onCancel={e => {e.preventDefault(); onClose();}}><header><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Fechar"><X/></button></header>{children}</dialog>;
}
/**
 * Mantém uma captura provisória até onSave concluir. Só aceita imagem da câmera
 * integrada; não há importação de arquivos. demoEnabled habilita coordenadas
 * simuladas identificadas, sem alterar evidências já persistidas.
 */
function Capture({ phase, onClose, onSave, demoEnabled }) {
  const [photo, setPhoto] = useState(null), [origin, setOrigin] = useState('camera'), [capturedAt, setCapturedAt] = useState(null);
  const [position, setPosition] = useState(null), [locMode, setLocMode] = useState(demoEnabled ? 'demo' : 'device');
  const [sample, setSample] = useState('same'), [error, setError] = useState(''), [busy, setBusy] = useState(false), [locBusy, setLocBusy] = useState(false), [camera, setCamera] = useState(false);
  const stream = useRef(), video = useRef(), positionRequest = useRef(0);
  const secure = window.isSecureContext;
  /** Libera as trilhas de vídeo para desligar a câmera após captura e ao sair do modal. */
  const stop = () => { stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; };
  // Invalida callbacks de geolocalização pendentes quando o modal é desmontado.
  useEffect(() => () => { stop(); positionRequest.current++; }, []);
  useEffect(() => { if (camera && video.current) video.current.srcObject = stream.current; }, [camera]);
  /**
   * Solicita uma posição nova, com horário e precisão. O número da requisição
   * impede que uma resposta antiga substitua a posição após mudar o modo ou fechar.
   * Não reutiliza silenciosamente a posição de uma foto anterior.
   */
  function locate() {
    const requestId = ++positionRequest.current;
    setPosition(null); setError(''); setLocBusy(true);
    if (!secure) { setError('O GPS real precisa do endereço HTTPS local e do certificado confiável neste celular. Pelo endereço HTTP, salve sem localização ou use a demonstração.'); setLocBusy(false); return; }
    if (!navigator.geolocation) { setError('Este navegador não oferece localização. Você pode salvar sem ela e completar com outra tentativa.'); setLocBusy(false); return; }
    navigator.geolocation.getCurrentPosition(p => { if (requestId !== positionRequest.current) return; setPosition({ source: 'device', latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy, timestamp: new Date(p.timestamp).toISOString() }); setLocBusy(false); }, e => { if (requestId !== positionRequest.current) return; setError(e.code === 1 ? 'Localização não autorizada. Permita a localização para este site no navegador e nas configurações do celular.' : e.code === 3 ? 'A localização demorou para responder. Tente novamente em um local com melhor sinal.' : 'Não foi possível obter a posição. Confira se os serviços de localização do celular estão ligados e tente novamente.'); setLocBusy(false); }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
  }
  /** Recebe o Blob recém-capturado, registra seu horário e solicita GPS se o modo real estiver ativo. */
  function selectPhoto(blob, source) { setPhoto(blob); setOrigin(source); setCapturedAt(new Date().toISOString()); if (locMode === 'device') locate(); }
  /** Abre vídeo, sem áudio, preferindo a câmera traseira; explica bloqueios de HTTPS e permissão. */
  async function startCamera() {
    setError('');
    if (!secure) { setError('Para tirar a foto, abra o aplicativo pelo endereço HTTPS e permita o acesso à câmera.'); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setError('Este navegador não disponibiliza a câmera. Abra o aplicativo no Safari ou Chrome atualizado em um aparelho com câmera.'); return; }
    try { stop(); stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); setCamera(true); }
    catch (e) { setError(e.name === 'NotAllowedError' ? 'Câmera não autorizada. Permita o acesso a este site nas configurações do navegador.' : e.name === 'NotFoundError' ? 'Nenhuma câmera disponível. Use um aparelho com câmera para tirar a foto.' : 'Não foi possível abrir a câmera. Feche outros aplicativos que usam a câmera e tente novamente.'); }
  }
  /** Converte o quadro atual do vídeo em JPEG. Capturar/repetir aqui ainda não consome tentativa salva. */
  function takePhoto() {
    const v = video.current;
    if (!v?.videoWidth) { setError('A câmera ainda está iniciando. Aguarde e tente novamente.'); return; }
    const canvas = document.createElement('canvas'); canvas.width = v.videoWidth; canvas.height = v.videoHeight; canvas.getContext('2d').drawImage(v, 0, 0);
    canvas.toBlob(blob => { if (blob) { selectPhoto(blob, 'camera'); stop(); setCamera(false); } else setError('Não foi possível capturar a foto. Tente novamente.'); }, 'image/jpeg', .9);
  }
  /**
   * Monta foto + posição como uma única evidência e delega a gravação ao chamador.
   * O modo sem localização preserva uma tentativa incompleta; demonstração nunca
   * se apresenta como GPS real. Em falha, mantém a foto no modal para nova tentativa.
   */
  async function save() {
    if (!photo || busy || locBusy) return;
    setBusy(true); setError('');
    const location = locMode === 'demo' ? { source: 'demo', latitude: sample === 'same' ? -3.119 : -3.124, longitude: -60.0217, accuracy: 0, timestamp: capturedAt } : locMode === 'device' ? position : null;
    try { await onSave({ id: uid(), photo, imageSource: origin, capturedAt, includedAt: new Date().toISOString(), location }); }
    catch (e) { setError(e.message || 'Não foi possível salvar a foto. Tente novamente.'); setBusy(false); }
  }
  return <Modal title={PHASE[phase]} onClose={() => { if (!busy) onClose(); }}>
    <p className="muted">Uma foto, uma localização. Cada envio preserva o histórico anterior.</p>
    {camera ? <div className="camera"><video autoPlay playsInline muted ref={video}/><button className="primary" onClick={takePhoto}><Camera size={20}/> Capturar foto</button></div> : photo ? <Photo attempt={{photo}} className="capture-preview"/> : <div className="capture-placeholder"><Camera size={42}/><strong>Registre este momento</strong><span>Tire a foto com a câmera do aplicativo</span></div>}
    <div className="button-row"><button className="secondary" onClick={startCamera}><Camera size={19}/> {photo ? 'Tirar outra foto' : 'Abrir câmera'}</button></div>
    <label className="field">Localização desta tentativa<select value={locMode} onChange={e => {positionRequest.current++; setLocBusy(false); setLocMode(e.target.value); setPosition(null); setError(''); if (e.target.value === 'device' && photo) locate();}}><option value="device">Localização atual do dispositivo</option>{demoEnabled && <option value="demo">Localização de demonstração</option>}<option value="none">Salvar sem localização (incompleto)</option></select></label>
    {locMode === 'demo' && <div className="demo-options"><label className="field">Cenário simulado<select value={sample} onChange={e => setSample(e.target.value)}><option value="same">Local A · Área do Rio</option><option value="different">Local B · cerca de 556 m de distância</option></select></label><p><Info size={16}/> Coordenadas de exemplo. Não são GPS real da foto.</p></div>}
    {locMode === 'device' && <div className="small muted">{locBusy ? 'Buscando localização…' : position ? `Posição obtida · precisão ±${Math.round(position.accuracy)} m` : 'A posição será solicitada ao tirar a foto.'}{photo && !locBusy && <button className="text-button" onClick={locate}>Tentar localização novamente</button>}</div>}
    {photo && <p className="small muted">{origin === 'camera' ? 'Foto capturada no aplicativo.' : origin === 'native-camera' ? 'Imagem recebida pelo seletor de câmera do celular. A posição é obtida no momento da inclusão; o aplicativo não verifica a captura original.' : origin === 'example' ? 'Ilustração de exemplo, sem valor de evidência real.' : 'Imagem importada: a posição do dispositivo não comprova o local de captura da imagem.'}</p>}
    {error && <p role="alert" className="error">{error}</p>}
    <button className="primary full" disabled={!photo || busy || locBusy} onClick={save}>{busy ? <LoaderCircle className="spin" size={20}/> : <Check size={20}/>} {busy ? 'Salvando…' : 'Salvar tentativa'}</button>
    <p className="small muted">Só uma tentativa salva conta para o limite de 3.</p>
  </Modal>;
}
/** Mostra a última foto, contador, alertas e ações; o histórico completo permanece preservado no produto. */
function Evidence({ product, phase, onCapture, onHistory, editing }) {
  const attempts = product[phase], last = attempts.at(-1), warnings = discrepancies(product, phase);
  return <section className="evidence"><div className="evidence-heading"><h3>{PHASE[phase]}</h3><span className="count">{attempts.length} / 3</span></div>
    {last ? <><Photo attempt={last} className="evidence-photo"/><div className="evidence-body"><strong className="small">Tentativas: {attempts.length} de 3</strong><Location attempt={last}/>{warnings.length > 0 && <div className="warning"><AlertTriangle size={20}/><span><strong>Local diferente de outra foto.</strong><span>Confira o histórico. Diferença de até {Math.round(Math.max(...warnings.map(w => w.meters)))} m{last.location.source === 'demo' ? ' (simulada)' : ''}.</span></span></div>}<button className="text-button history-link" onClick={() => onHistory(product, phase)}><History size={16}/> Ver tentativas e locais</button><button className="secondary full" disabled={attempts.length >= 3} onClick={() => onCapture(product.id, phase)}><Camera size={19}/>{attempts.length >= 3 ? 'Limite atingido' : 'Nova tentativa'}</button></div></> : <button className="empty-photo" onClick={() => onCapture(product.id, phase)}><Camera size={28}/><strong>Tirar foto {phase === 'before' ? 'antes' : 'depois'}</strong><span>Captura pela câmera do aplicativo</span></button>}
  </section>;
}
/** Coordena navegação, rascunho, registro selecionado e mensagens; não grava dados diretamente no IndexedDB. */
function App() {
  const [records, setRecords] = useState([]), [loading, setLoading] = useState(true), [view, setView] = useState('list'), [record, setRecord] = useState(null), [draft, setDraft] = useState(null), [name, setName] = useState(''), [demo, setDemo] = useState(false), [capture, setCapture] = useState(null), [history, setHistory] = useState(null), [toast, setToast] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  /** Recarrega a lista após gravações confirmadas para refletir o estado persistido. */
  async function refresh() { const all = await listRecords(); setRecords(all); return all; }
  // Inicializa a consulta e sinaliza erro de armazenamento sem afirmar que os dados foram carregados.
  useEffect(() => { refresh().catch(() => setError('Não foi possível abrir os dados locais. Verifique se o navegador permite armazenamento.')).finally(() => setLoading(false)); }, []);
  // O temporizador é cancelado quando a mensagem muda ou o componente é desmontado.
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 4500); return () => clearTimeout(t); }, [toast]);
  const current = view === 'new' ? draft : record;
  /** Protege o rascunho ainda não salvo com confirmação antes de voltar à lista. */
  function back() { if (view === 'new' && (draft.name || draft.producer || draft.products.some(p => p.species || p.before.length || p.after.length)) && !confirm('Sair sem salvar este rascunho? As informações ainda não salvas serão perdidas.')) return; setView('list'); setError(''); }
  /** Inicia um registro só em memória. O IndexedDB só recebe o conjunto em Salvar registro. */
  function start() { setDraft({ id: uid(), name: '', producer: '', products: [newProduct()], createdAt: new Date().toISOString() }); setView('new'); setError(''); }
  /** Abre um registro da lista e separa o campo de edição do nome dos dados já salvos. */
  function open(r) { setRecord(r); setName(r.name); setView('edit'); setError(''); }
  /** Normaliza os campos, persiste o rascunho completo e retorna à lista após a gravação. */
  async function saveRecord(e) {
    e.preventDefault(); if (busy) return; setBusy(true); setError('');
    try {
      const saved = await createRecord({...draft, name: draft.name.trim(), producer: draft.producer.trim(), products: draft.products.map(p => ({...p, species: p.species.trim()})), updatedAt: new Date().toISOString()});
      // A gravação já terminou. Atualiza a lista em memória sem tratar uma nova
      // consulta como parte da escrita, o que poderia reportar falsa falha e induzir repetição.
      setRecords(rows => [saved, ...rows.filter(r => r.id !== saved.id)]);
      setView('list'); setToast('Salvo neste dispositivo');
    }
    catch (error) { setError(storageErrorMessage(error)); } finally {setBusy(false);}
  }
  /** Salva exclusivamente o nome via regra de domínio, mantendo os demais dados em consulta. */
  async function saveName(e) { e.preventDefault(); setBusy(true); setError(''); try { const saved = await renameRecord(record.id, name); setRecord(saved); await refresh(); setToast('Nome salvo neste dispositivo'); } catch (e) {setError(e.message);} finally {setBusy(false);} }
  /**
   * No cadastro, inclui a foto no rascunho em memória; na edição, grava imediatamente
   * pelo store. Essa diferença explica por que o novo registro ainda exige Salvar registro.
   */
  async function saveAttempt(attempt) {
    if (view === 'new') setDraft(d => ({...d, products: d.products.map(p => p.id === capture.productId ? appendAttempt(p, capture.phase, attempt) : p)}));
    else { const saved = await addAttempt(record.id, capture.productId, capture.phase, attempt); setRecord(saved); await refresh(); setToast('Foto salva neste dispositivo'); }
    setCapture(null);
  }
  /** Atualiza a espécie somente no rascunho e preserva a identidade dos demais produtos. */
  function updateProduct(id, species) {setDraft(d => ({...d, products: d.products.map(p => p.id === id ? {...p, species} : p)}));}
  return <><header className="topbar"><a className="brand" href="#" onClick={e => {e.preventDefault(); if (view !== 'list') back();}}><span className="brand-mark"><Leaf size={27}/></span><span>Rastro Florestal<small>DA ORIGEM AO REGISTRO</small></span></a><span className="local-indicator"><span/> Salvo no seu navegador</span></header>
    <div className="app-layout"><aside className="sidebar"><div><span className="eyebrow">ESPAÇO DO PRODUTOR</span><button className={`nav-item ${view === 'list' ? 'active' : ''}`} onClick={() => view !== 'list' && back()}><FileText size={20}/> Meus registros <ChevronRight size={16}/></button></div><div className="sidebar-bottom"><Sprout size={30}/><h3>O cuidado começa<br/>na origem.</h3><p>Um registro de cada vez, uma floresta com mais história.</p><span className="small">Protótipo local · v1.0</span></div></aside>
    <main><div className="main-inner"><div className="context-row"><span className="breadcrumb">Produtor <ChevronRight size={13}/> {view === 'list' ? 'Meus registros' : view === 'new' ? 'Novo registro' : formatCode(record.code)}</span><label className="demo-toggle"><input type="checkbox" checked={demo} onChange={e => setDemo(e.target.checked)}/><Monitor size={15}/> Modo demonstração</label></div>
    {demo && <div className="demo-banner"><Info size={18}/><span>Demonstração ativa: locais simulados estão disponíveis ao adicionar fotos.</span></div>}
    {view !== 'list' && <button className="back text-button" onClick={back}><ArrowLeft size={19}/> Voltar aos registros</button>}
    {view === 'list' ? <><div className="page-heading"><div><span className="eyebrow">SUAS EVIDÊNCIAS, ORGANIZADAS</span><h1>Meus registros<span className="title-dot">.</span></h1><p>Toque em um registro para ver os produtos.</p></div><span className="heading-icon"><Leaf size={34}/></span></div>
      <div className="list-toolbar"><span>{records.length} {records.length === 1 ? 'registro' : 'registros'}</span><span><LockKeyhole size={14}/> Dados neste dispositivo</span></div>
      {loading ? <div className="empty-state"><LoaderCircle className="spin"/>Abrindo seus registros…</div> : records.length ? <div className="records">{records.map(r => <button className="record-card" key={r.id} onClick={() => open(r)}><span className="record-icon"><FileText size={30}/></span><span className="record-text"><strong>{r.name}</strong><span>{formatCode(r.code)} <i/> {r.products.length} {r.products.length === 1 ? 'produto' : 'produtos'}</span></span><span className={`status ${isComplete(r) ? 'complete' : ''}`}>{isComplete(r) ? 'Completo' : 'Rascunho'}</span><ChevronRight className="record-chevron" size={24}/></button>)}</div> : <div className="empty-state"><span className="empty-icon"><Sprout size={43}/></span><h2>Seu primeiro registro começa aqui</h2><p>Reúna as árvores, as fotos e os locais<br/>de uma mesma área em um só lugar.</p><span className="empty-hint">Toque no + abaixo para começar</span></div>}
      <div className="create-area"><button className="new-button" aria-label="Novo registro" onClick={start}><Plus size={34}/><span>Novo registro</span></button></div><div className="list-note"><MapPin size={20}/><p><strong>Cada foto conta uma parte da história.</strong><br/>A localização fica junto de cada tentativa, dentro do registro.</p><ArrowUpRight size={22}/></div>
    </> : <><div className="page-heading compact"><div><span className="eyebrow">{view === 'new' ? 'UM NOVO COMEÇO' : `REGISTRO ${formatCode(record.code)}`}</span><h1>{view === 'new' ? 'Novo registro' : 'Editar registro'}<span className="title-dot">.</span></h1><p>{view === 'new' ? 'Adicione os produtos e registre suas evidências.' : 'Consulte as evidências e acompanhe cada tentativa.'}</p></div><span className="status">{isComplete(current) ? 'Completo' : 'Rascunho'}</span></div>
      {view === 'new' ? <form id="create-form" onSubmit={saveRecord}><div className="form-card"><h2><FileText size={20}/> Dados do registro</h2><div className="fields-grid"><label className="field">Nome do registro<input autoFocus required maxLength={100} placeholder="Ex.: Área do Rio" value={draft.name} onChange={e => setDraft({...draft, name: e.target.value})}/></label><label className="field">Nome do produtor<input required maxLength={100} placeholder="Digite seu nome" value={draft.producer} onChange={e => setDraft({...draft, producer: e.target.value})}/></label></div></div></form> : <div className="form-card"><form onSubmit={saveName}><label className="field">Nome do registro<div className="rename-row"><input required maxLength={100} value={name} onChange={e => setName(e.target.value)}/><button className="primary" disabled={busy}><Check size={18}/> Salvar nome</button></div></label></form><div className="saved-data"><LockKeyhole size={17}/><span>Dados salvos</span><strong>Produtor: {record.producer}</strong></div></div>}
      <div className="section-title"><h2>Produtos do registro</h2><span>{current.products.length} {current.products.length === 1 ? 'produto' : 'produtos'}</span></div>
      {current.products.map((p,i) => <article className="product-card" key={p.id}><div className="product-heading"><span className="product-number"><Package size={22}/></span><div><h2>Produto {i+1}</h2><p>{view === 'new' ? 'Identificação e fotos da árvore' : p.species || 'Espécie não informada'}</p></div>{view === 'edit' && <LockKeyhole size={17}/>}</div>{view === 'new' && <label className="field species">Espécie da árvore<input form="create-form" maxLength={100} placeholder="Ex.: Ipê" value={p.species} onChange={e => updateProduct(p.id, e.target.value)}/></label>}<div className="evidence-grid">{['before','after'].map(phase => <Evidence key={phase} product={p} phase={phase} editing={view === 'edit'} onCapture={(productId, phase) => setCapture({productId, phase})} onHistory={(product, phase) => setHistory({product, phase})}/>)}</div><div className="product-note"><MapPin size={18}/><span>{view === 'new' ? 'Cada foto guarda sua própria localização. Você pode completar as evidências depois.' : 'Foto e localização são preservadas em cada tentativa. Até 3 envios por etapa.'}</span></div></article>)}
      {view === 'new' ? <><button className="secondary full add-product" onClick={() => setDraft({...draft, products: [...draft.products, newProduct()]})}><Plus size={22}/> Adicionar outro produto</button><div className="save-footer"><p><LockKeyhole size={17}/> Sem internet? Seus dados ficam neste navegador.</p><button className="primary save-record" form="create-form" disabled={busy}>{busy ? 'Salvando…' : 'Salvar registro'}<Check size={21}/></button></div></> : <p className="end-note"><LockKeyhole size={16}/> Somente o nome pode ser alterado. Novas fotos são adicionadas ao histórico.</p>}
    </>}
    {error && <p className="error" role="alert">{error}</p>}<footer className="footer"><Leaf size={16}/><span>Rastro Florestal</span><span>Feito para quem cuida da origem.</span></footer></div></main></div>
    {toast && <div role="status" className="toast"><Check size={19}/>{toast}</div>}
    {capture && <Capture phase={capture.phase} demoEnabled={demo} onClose={() => setCapture(null)} onSave={saveAttempt}/>}
    {history && <Modal title={`Tentativas · ${PHASE[history.phase].toLowerCase()}`} wide onClose={() => setHistory(null)}><p className="muted">As fotos anteriores continuam preservadas. Nenhuma tentativa pode ser editada.</p><div className="history-list">{history.product[history.phase].map(a => <article className="history-item" key={a.id}><Photo attempt={a}/><div><h3>Tentativa {a.number}</h3><p className="small">{time(a.capturedAt)}</p><span className="tag">{a.imageSource === 'camera' ? 'Câmera do aplicativo' : a.imageSource === 'native-camera' ? 'Câmera/seletor do celular' : a.imageSource === 'example' ? 'Ilustração de demonstração' : 'Imagem importada'}</span><Location attempt={a}/>{a.location && <p className="small muted">Horário da posição: {time(a.location.timestamp)}</p>}<p className="small muted">{a.imageSource === 'camera' ? 'Horário da captura no dispositivo' : 'Horário de inclusão, não da captura original'}: {time(a.capturedAt)}</p></div></article>)}</div></Modal>}
  </>;
}
// Montagem única da aplicação; recursos de câmera e URLs Blob são liberados pelos componentes.
createRoot(document.getElementById('root')).render(<App/>);


