# Contexto para o back-end — Rastro Florestal

Atualizado em **06/11/2026**, a partir da implementação local. Este documento é um handoff técnico; separa o que existe dos contratos propostos. Leia o código antes de alterar regras.

## Decisão vigente do produto

**Não existe mais validação manual.** O usuário removeu o formulário de responsável e a aprovação. O fluxo atual é:

1. Cadastrar produtor, registro e produtos com tipo e espécie.
2. Capturar fotos antes/depois com coordenadas por tentativa.
3. Salvar e tocar em **Solicitar token · prazo de 5 dias**.
4. A solicitação inicia **120 horas corridas**, sem etapa de aprovação.
5. Ao cumprir o prazo, liberar uma etiqueta **somente com QR code**, por produto, para baixar em PNG e imprimir/colar na mercadoria.
6. No modo demonstração, **Antecipar 5 dias para o pitch** permite apresentar a liberação. A antecipação é registrada no QR e não muda o prazo original.

O usuário escolheu **QR com os dados**, sem hash impresso. O identificador `DEMO-...` ainda existe internamente para idempotência da emissão; não representa hash criptográfico, NFT, blockchain, autenticação ou certificação. Não reintroduzir aprovação manual nem integrar IA por inferência deste contexto.

## Projeto e execução

Aplicação web **React 19 + Vite 6**, não o projeto Expo de outro diretório.

Pasta que contém `package.json` neste notebook:

```text
C:\Users\ROBOTICA\Desktop\Nova pasta\rastro-florestal-main\rastro-florestal-main
```

```powershell
npm.cmd install
npm.cmd test
npm.cmd run build
npm.cmd run mobile:https
```

Instalação é necessária só quando faltam dependências. O último conjunto de testes executado tem **19 testes passando**, incluindo decodificação da imagem QR. Câmera, GPS e impressão física ainda exigem teste no aparelho.

`scripts/https-local.mjs` serve `dist` por HTTPS e uma página HTTP para instalar o certificado público. **Não recebe registros nem fotos.** Não há API, servidor de negócio, login, banco remoto, sincronização, serviço de IA ou página pública de consulta implementados. O celular precisa estar na mesma rede do notebook. Use o IP exibido na execução atual.

Preserve `.local-https`, os dados do navegador, o histórico de tentativas e o código existente. Não faça limpeza de IndexedDB nem substitua este app por outro framework. `.local-https`, `node_modules` e `dist` estão no `.gitignore`; nunca publicar chaves `.key`.

## Persistência e modelo atuais

Banco IndexedDB `rastro-florestal`, versão **1**, object store `records`, chave `id`. Não houve migração destrutiva para adicionar o token.

| Entidade | Campos atuais |
| --- | --- |
| Registro | `id` UUID, `code` sequencial local, `name`, `producer`, `createdAt`, `updatedAt`, `products`, `demoFinalization?`, `demoFinalizationHistory?` |
| Produto | `id` UUID, `productType`, `species`, `before[]`, `after[]` |
| Tentativa | `id` UUID, `number`, `photo` (Blob na UI), `imageSource`, `capturedAt`, `includedAt`, `location` ou `null` |
| Localização | `source`: `device` ou `demo`, `latitude`, `longitude`, `accuracy` em metros, `timestamp` |
| Ciclo ativo | `id`, `startedAt`, `availableAt`, `expeditedAt?`, `token?`, `issuedAt?`, `labels?` |
| Etiqueta | `productId`, `payload` (snapshot JSON dos dados da emissão) |
| Ciclo invalidado | Campos do ciclo anterior + `invalidatedAt`, `reason`, `attemptId?` |

`productType` pode faltar em registros antigos. A tela permite preenchê-lo sem apagar evidências. `validatedAt`/`validatedBy` podem existir em ciclos de uma versão intermediária; são dados legados preservados, não requisitos do fluxo vigente. Ciclos existentes mantêm seu prazo original; etiquetas já emitidas mantêm seu snapshot.

A UI recebe `photo` como Blob. O armazenamento novo usa `photoData: {format: 'array-buffer-v1', bytes: ArrayBuffer, type: MIME}` e reconstrói o Blob na leitura, sem base64/recompressão. Blob legado continua legível. Não envie URLs temporárias `blob:` à API como se fossem arquivos acessíveis; envie os bytes binários com MIME.

No cadastro, o rascunho fica em memória até **Salvar registro**. No registro salvo, a nova tentativa é persistida imediatamente. Dados pertencem ao navegador/perfil/origem: protocolo, IP e porta. O notebook não recebe automaticamente os dados do iPhone.

## Regras atuais que a integração deve preservar

- Até **três tentativas por produto e por etapa**, com contadores independentes de `before`/`after`. Cancelar captura não consome tentativa; salvar sem localização consome e fica incompleto.
- Evidências são acrescentadas, nunca substituídas. Repetir o mesmo ID é idempotente. Limite e escrita são validados numa transação atômica inclusive entre abas concorrentes.
- `isComplete` é o critério visual antigo: espécie e ao menos uma posição em cada etapa de todos os produtos. **Não basta para solicitar token.**
- `canFinalizeDemo` exige também `productType`, foto não vazia e coordenadas numéricas finitas nos limites de latitude/longitude em ao menos uma tentativa de cada etapa. Fotos sem localização permanecem no histórico.
- Coordenadas `demo` contam para a demonstração, identificadas como simuladas. Não apresentá-las como GPS real em produção.
- `startDemoFinalization` inicia o ciclo uma única vez: repetir a solicitação não reinicia a contagem.
- `availableAt = startedAt + 5 * 24 * 60 * 60 * 1000`; não são cinco dias úteis, nem liberação à meia-noite do quinto dia.
- `demoStatus` retorna `incomplete`, `ready`, `waiting`, `eligible` ou `issued`. Esses estados são calculados, não gravados como um campo `status`.
- No prazo, a UI chama `issueDemoToken` automaticamente. Com o app fechado, só emite ao reabrir; não há worker, push ou notificação.
- A emissão é idempotente e salva todos os snapshots de etiquetas junto com o token no ciclo ativo. Uma etiqueta por produto, dentro de um ciclo por registro.
- Nova tentativa efetivamente adicionada invalida o ciclo ativo e o arquiva com `reason: 'new-evidence'` e `attemptId`. Falha de gravação, tentativa repetida ou quarta tentativa rejeitada não invalidam.
- Alteração real de `productType` invalida e arquiva o ciclo com `reason: 'product-type-changed'`. Salvar o mesmo tipo não invalida.
- Renomear o registro preserva o ciclo e os snapshots de etiquetas emitidas. Nova emissão após invalidação recebe outro ID de ciclo e outro token.
- `producer` e `species` não são editáveis em registros salvos. Não inventar outros fluxos de edição na API sem alinhamento.

## Conteúdo e limites da etiqueta

`src/labels.js` define o payload. O QR armazena **JSON diretamente**, não uma URL. Exemplo ilustrativo reduzido (a implementação inclui todos os históricos de tentativas):

```json
{
  "app": "Rastro Florestal",
  "versao": 1,
  "modo": "DEMO",
  "aviso": "Demonstracao local; sem certificacao externa. Fotos no app de origem.",
  "registro": "uuid-do-registro",
  "codigo": 1,
  "nome": "Área do Rio",
  "produtor": "Produtor de exemplo",
  "produto": "uuid-do-produto",
  "tipo": "Madeira em tora",
  "especie": "Ipê",
  "criado": "2026-11-06T12:00:00.000Z",
  "solicitado": "2026-11-06T12:00:00.000Z",
  "liberacaoPrevista": "2026-11-11T12:00:00.000Z",
  "antecipacaoPitch": null,
  "emitido": "2026-11-11T12:00:00.000Z",
  "antes": [{
    "tentativa": 1,
    "captura": "2026-11-06T11:00:00.000Z",
    "inclusao": "2026-11-06T11:00:00.000Z",
    "imagem": "camera",
    "local": {"lat": -3.119, "lon": -60.0217, "origem": "demo", "precisao": 0, "data": "2026-11-06T11:00:00.000Z"}
  }],
  "depois": []
}
```

O `depois` vazio no exemplo é abreviação, não um registro elegível. Cada tentativa é serializada com número, captura, inclusão, origem da imagem e localização completa (ou `null` para tentativas incompletas). IDs individuais de tentativas e bytes das fotos **não** são incluídos neste QR v1; ficam no registro de origem. O backend deve conservar os IDs para auditoria.

PNG de 1200 px, preto/branco, correção M e margem de quatro módulos, pela biblioteca `qrcode`. A UI oferece download e impressão sugerida de 10 × 10 cm. Há limite de capacidade do QR; geração pode falhar com textos muito extensos e o app informa o erro. Não truncar dados silenciosamente. O JSON exige leitor que aceite QR com texto; não há página para o destinatário abrir as fotos.

A etiqueta DEMO contém produtor e coordenadas. Uma futura publicação desses dados precisa de definição de acesso/consentimento, sem presumir que todos os campos serão públicos. Um QR impresso com dados estáticos não consulta invalidações posteriores: arquivo do ciclo local não revoga fisicamente uma etiqueta já colada. Link público verificável, assinatura, hash, consulta de revogação e autenticação são decisões futuras, não capacidades atuais.

## Onde conectar o back-end

| Arquivo/função | Papel |
| --- | --- |
| `src/store.js` | Fronteira pública de persistência e regras; preservar assinaturas da UI ou criar adaptador |
| `listRecords`, `createRecord` | Consulta/cadastro e código amigável local |
| `renameRecord`, `setProductType` | Alterações separadas e invalidação do tipo |
| `appendAttempt`, `addAttempt` | Inclusão imutável, limite e idempotência |
| `startDemoFinalization` | Solicitar token sem aprovação |
| `expediteDemoFinalization` | Antecipação somente para demonstração; hoje a restrição de visibilidade está na UI |
| `issueDemoToken`, `demoStatus` | Liberação/estado calculado; hoje o tempo é do dispositivo |
| `src/labels.js` | Snapshot, serialização JSON e geração da imagem QR |
| `src/main.jsx` | Telas, captura, temporizador, emissão automática, download e impressão |
| `src/store.test.js`, `src/labels.test.js` | Regressões e teste de decodificação do PNG |

## Contrato sugerido para discutir — NÃO implementado

Nenhum framework, provedor, ORM ou banco foi escolhido nesta entrega. Uma proposta de operações para um adaptador:

| Operação sugerida | Responsabilidade no servidor |
| --- | --- |
| Criar/consultar registro | Identidade estável, autoria e escopo de acesso |
| Atualizar nome | Preservar histórico e ciclo ativo |
| Alterar tipo do produto | Invalidar ciclo de forma transacional quando o valor mudar |
| Enviar evidência | Upload binário confirmado, metadados e limite atômico/idempotência |
| Solicitar token | Conferir requisitos, fixar versão dos dados e prazo pelo relógio do servidor |
| Consultar solicitação/etiquetas | Estado autoritativo, datas e snapshots imutáveis por produto |
| Antecipar demonstração | Operação isolada e autorizada no ambiente demo; nunca confiar só no checkbox do frontend |

O servidor deve manter `requestedAt`/`availableAt`/`issuedAt` autoritativos, retornando ISO UTC. `requestedAt` é nome proposto para a API, equivalente a `startedAt` atual, não um campo que já exista na persistência local. Repetir requests com a mesma chave de idempotência deve retornar a mesma solicitação/emissão. Limites, disponibilidade e autorização precisam ser conferidos no servidor, não apenas pela interface.

Para emitir mesmo com o app fechado, decidir entre job agendado/worker e emissão idempotente sob consulta. Não criar tarefas só no cliente para prometer processamento em segundo plano. Tratar reprocessamento, falhas, retries e concorrência entre novas evidências e emissão: conferir a versão do conjunto de evidências no mesmo commit que grava a emissão, impedindo etiqueta de um ciclo invalidado.

Fotos podem ficar em armazenamento de objetos com referências no banco, conforme arquitetura a definir. Só confirmar upload quando bytes e metadados estiverem duráveis; upload interrompido não deve criar tentativa fantasma. Planejar migração/sincronização sem apagar o IndexedDB, retomada offline, deduplicação por IDs, conflitos e isolamento por produtor.

## Pendências para alinhar com a equipe

- Identidade/autorização do produtor e acesso do destinatário da etiqueta.
- Persistência remota, upload e política de retenção de fotos.
- Sincronização dos registros locais entre aparelhos, códigos globais e resolução de conflitos.
- Emissão com app fechado e política de retries.
- Versão de evidências e consistência atômica entre invalidar/emitir.
- QR estático atual versus futura consulta pública e revogação verificável.
- Como manter o modo DEMO separado de produção, inclusive dados e antecipação.
- Eventual análise externa/IA: não está integrada e não deve bloquear o fluxo atual sem novo requisito do usuário.

## Pedido pronto para o GPT do colega

> Você vai trabalhar no back-end do Rastro Florestal existente. Leia `integracoes/banco-de-dados/CONTEXTO.md`, `README.md`, `src/store.js`, `src/labels.js` e seus testes. A decisão vigente é solicitar token sem aprovação manual, esperar 120 horas e liberar uma etiqueta por produto, com somente QR contendo os dados do processo. No pitch há antecipação explícita DEMO. Preserve fotos, coordenadas por tentativa, datas, IDs, dados legados, limite atômico de três tentativas por etapa, idempotência e invalidação de ciclos por nova evidência ou alteração de tipo. Renomear preserva a emissão. Não há API, login, banco remoto, serviço de IA, blockchain ou página pública implementados. Proponha o contrato e um adaptador para a camada atual sem reconstruir a UI, distinguindo o que você implementar do que ficar proposto. Não reintroduza validação manual; não publique chaves nem dados locais. Antes de finalizar, teste prazo pelo relógio do servidor, concorrência, retries, invalidação, isolamento DEMO e manutenção do funcionamento offline. Registre arquivos alterados, comandos de teste e decisões pendentes.
