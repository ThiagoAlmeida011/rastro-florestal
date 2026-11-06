# Contexto da frente de banco de dados

## Situação atual

O Rastro Florestal é uma aplicação web React executada no notebook. O celular acessa o servidor HTTPS da mesma rede. O servidor entrega arquivos estáticos e certificados públicos; **não recebe nem armazena registros**. Cada navegador e origem guarda seus próprios dados em IndexedDB. Não há autenticação, API, sincronização ou banco remoto neste recorte.

O tema visual de uso no campo foi aplicado em `src/campo.css`. Não é necessário reconstruir as telas para desenvolver a camada de dados.

## O que o produtor faz

1. Na lista, toca em Novo registro.
2. Preenche nome do registro e produtor; inclui um ou mais produtos com espécie.
3. Tira fotos antes/depois pela câmera integrada. Cada tentativa guarda sua posição, precisão e horários. Não há importação de imagens novas.
4. Salva o registro, mesmo incompleto, e retorna à lista.
5. Ao abrir um registro salvo, pode alterar somente o nome. Produtor e espécies permanecem em consulta. Novas fotos acrescentam evidências, sem substituir as anteriores.

No cadastro, as evidências ficam em memória até Salvar registro. Na edição, uma nova tentativa é gravada imediatamente. Cancelar a captura não consome tentativa; uma tentativa salva sem localização conta para o limite e mantém a evidência incompleta.

## Modelo implementado

| Entidade | Campos relevantes |
| --- | --- |
| Registro | `id` UUID, `code` código local amigável, `name`, `producer`, `createdAt`, `updatedAt`, `products` |
| Produto | `id` UUID, `species`, `before`, `after` |
| Tentativa | `id` UUID, `number`, `photo`, `imageSource`, `capturedAt`, `includedAt`, `location` |
| Posição | `source` (`device` ou `demo`), `latitude`, `longitude`, `accuracy` em metros, `timestamp` |

`location` pode ser `null`. Novas fotos usam `imageSource: camera`; históricos antigos podem conter `imported`, `native-camera` ou `example`. Não apagar nem reclassificar esses dados antigos.

A interface usa `photo` como Blob. Para contornar uma falha WebKit ao gravar Blob, a camada local persiste `photoData: { format: "array-buffer-v1", bytes: ArrayBuffer, type: MIME }` e reconstrói o Blob na leitura. Não é base64 e não há recompressão nessa conversão. Registros legados com Blob continuam legíveis.

## Regras que a futura API precisa preservar

- IDs estáveis independentemente de conectividade; nomes não são identidades.
- Até três tentativas por produto **e por etapa**. Primeira foto = tentativa 1.
- Validação atômica no servidor e idempotência por ID da tentativa, inclusive em concorrência.
- Imagem e metadados preservados juntos; nada de sobrescrever uma evidência existente.
- Atualização de nome separada da inclusão de evidências.
- Estados de rascunho/completo separados de estados futuros de envio/sincronização.
- O critério atual de completo exige espécie e uma evidência com posição em cada etapa de todos os produtos. Posições de demonstração também contam nesse critério local; isso não deve ser confundido com validação real.
- Código amigável atualmente é sequencial somente dentro do navegador. Sua atribuição global precisará ser decidida antes da sincronização entre dispositivos.

## Pontos de integração propostos — ainda não implementados

O ponto de partida é `src/store.js`. Seus métodos públicos são `listRecords`, `createRecord`, `renameRecord` e `addAttempt`. A UI não deve conhecer tabelas SQL ou credenciais de armazenamento remoto.

Discutir com o frontend uma camada de repositório que mantenha os dados locais e acrescente uma fila de sincronização. Uma API poderá ter operações para consultar/criar registros, alterar nome e acrescentar tentativas a um produto/etapa. Nomes de rotas, payloads, autenticação e estratégia de upload **ainda precisam ser acordados**.

As fotos devem ser enviadas como arquivos binários para armazenamento apropriado; guardar referência e metadados no banco é uma possibilidade de arquitetura, não uma infraestrutura já escolhida. O servidor precisa confirmar a persistência antes de marcar um envio como concluído.

## Arquivos e validação

- `src/main.jsx`: fluxo das telas e captura.
- `src/store.js`: formato local, transações, limite e cálculo de distância.
- `src/store.test.js`: concorrência, idempotência, fidelidade dos bytes e compatibilidade com Blob legado.
- `scripts/https-local.mjs`: apenas servidor estático de desenvolvimento.
- Execute `npm.cmd test` e `npm.cmd run build` na raiz do projeto.

## Questões para decidir em equipe

Quem é o produtor autenticado? Como atribuir códigos globais? Como exportar/migrar dados locais? Como tratar conflitos e retomada de uploads? Onde guardar arquivos e quem terá acesso? Como separar dados de demonstração dos reais na futura plataforma?

## Texto para iniciar um chat desta frente

> Trabalhe na frente de banco de dados do Rastro Florestal. Leia este contexto, o README e src/store.js. O aplicativo local deve continuar funcionando. Proponha primeiro o modelo persistente e o contrato de integração, identificando decisões pendentes. Preserve IDs, histórico imutável, localização por foto e limite atômico de três tentativas por etapa. Não considere a API ou a sincronização como existentes e não inclua credenciais no frontend.
