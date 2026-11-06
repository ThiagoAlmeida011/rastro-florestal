# Contexto da frente de IA e análise geográfica

## Objetivo discutido

Cruzar as posições das fotos com a área declarada pelo produtor e, quando houver dados adequados, imagens de satélite. O resultado deve apoiar revisão humana sobre compatibilidade e divergências. Não é uma comprovação automática de legalidade ou uma acusação de fraude.

## O que existe hoje

Aplicação React local, com lista de registros, cadastro de produtos e consulta de fotos antes/depois. Cada produto tem até três tentativas de cada etapa. Foto e localização pertencem à **tentativa**, não ao registro inteiro. O novo visual de campo não altera esse modelo.

Os dados ficam no IndexedDB de cada navegador. Não há API de consulta externa, exportador, pipeline de IA ou conexão com satélite implementados. Combinar a obtenção dos dados com as frentes de banco e frontend antes de integrar serviços.

## Evidência disponível

- IDs do registro, produto e tentativa; código amigável local.
- Espécie informada pelo produtor.
- Etapa: `before` ou `after`, representada pelos dois históricos do produto.
- Imagem capturada na câmera do aplicativo, em JPEG. A captura atual usa um quadro de vídeo; não depende de GPS EXIF.
- `capturedAt`, `includedAt`, posição com `timestamp`, latitude/longitude e precisão em metros.
- `location.source`: `device` para posição obtida pelo navegador; `demo` para exemplo simulado. Também pode não haver posição.
- Origem da imagem: atualmente `camera`. Históricos de versões anteriores podem conter imagens importadas, de seletor nativo ou ilustrações. A origem permanece identificada.

O armazenamento local usa bytes ArrayBuffer + MIME e reconstrói Blob para a interface. A integração não deve receber um endereço temporário `blob:` como se fosse uma imagem acessível por servidor.

## Limites que precisam acompanhar a análise

1. A posição do dispositivo e sua precisão são evidências, não garantia independente de onde a imagem foi capturada. Os horários vêm do dispositivo.
2. Dados simulados precisam ser separados de evidências reais em toda análise e apresentação de resultados.
3. **Não existe um polígono da área declarada no aplicativo.** O formato de envio e a interface para informar essa área ainda não foram definidos. Uma coordenada isolada não substitui seus limites.
4. Verificar se um ponto está dentro de um polígono pode ser uma regra geográfica, sem IA. A precisão do GPS deve ser considerada em posições próximas da borda.
5. Não assumir que uma árvore individual será detectável por satélite. Avaliar resolução espacial, datas, cobertura de nuvens, disponibilidade/licença das imagens e escala do evento antes de prometer esse resultado.
6. Ausência de sinal visível nas imagens não implica ausência de extração. Evidência insuficiente precisa ser uma saída possível.

## Comparação já implementada no frontend

`distance` em `src/store.js` usa Haversine, retornando metros. `discrepancies` compara a última foto exibida com as demais do produto que tenham a mesma origem de posição. O aviso dispara se distância > 100 m + soma das precisões. Não mistura posição real com simulada.

Essa comparação é apenas um alerta entre fotos. **Ela não consulta satélite nem verifica pertencimento a uma propriedade.**

## Contrato proposto para discussão — não implementado

A entrada futura pode reunir o ID do produto, tentativas identificadas, arquivos de imagem acessíveis de forma autorizada e o polígono declarado com referência de coordenadas definida. Se adotarmos GeoJSON, alinhar explicitamente a ordem longitude/latitude: os campos separados atuais são latitude e longitude.

A saída deve referenciar as tentativas e a versão da área analisadas, registrar a versão do método/modelo, as fontes e datas utilizadas, distâncias e limitações. Estados sugeridos: **compatível**, **divergência para conferir**, **evidência insuficiente** ou **não analisado**. Os nomes finais e a eventual confiança estatística dependem de validação; não inventar percentuais de confiança.

Resultados devem ficar separados das evidências originais, para permitir reanálise sem reescrever fotos, posições ou histórico. A futura exibição no aplicativo deve usar linguagem simples e permitir conferir as evidências que originaram o resultado.

## Arquivos de referência

- `src/main.jsx`: captura, distinção real/simulado e apresentação do histórico.
- `src/store.js`: entidades e comparação entre posições.
- `integracoes/banco-de-dados/CONTEXTO.md`: responsabilidades de persistência e API ainda propostas.
- `README.md`: execução e limitações do MVP local.

## Texto para iniciar um chat desta frente

> Trabalhe na frente de IA e análise geográfica do Rastro Florestal. Leia este contexto e src/store.js. Proponha um experimento de validação com dados reais e simulados separados, sem alterar evidências originais. Distinga conferência ponto/polígono de análise de satélite. Liste dados faltantes, fontes possíveis, resolução necessária e critérios para evidência insuficiente. Não assuma que o polígono, a API ou a identificação de árvores individuais por satélite já existem.
