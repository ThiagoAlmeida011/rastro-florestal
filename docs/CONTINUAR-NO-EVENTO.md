# Continuidade do Rastro Florestal em outro computador

Este documento resume o trabalho anterior. Não é a transcrição completa do chat. Leia junto com README.md, o código atual e os contextos de integração.

## Instrução para o novo chat

> Estamos continuando o desenvolvimento do Rastro Florestal feito em outro computador. Leia docs/CONTINUAR-NO-EVENTO.md, README.md e as funções comentadas em src/main.jsx e src/store.js. Inspecione a pasta antes de editar. Preserve os dados e as funcionalidades atuais. Não reconstrua o projeto do zero. A prioridade imediata é preparar e testar a apresentação no notebook do evento, incluindo câmera, localização, salvamento e histórico. Depois, siga as novas instruções do usuário. Os contratos de backend e IA são propostas futuras, não integrações existentes.

## Objetivo e equipe

Aplicação simples de rastreabilidade florestal para pequenos produtores. Prioridade: uso no celular e leitura no campo, inclusive sob luz forte. O produtor nomeia um registro/área, inclui produtos/árvores e captura fotos antes e depois da extração.

Há uma frente de frontend, um colega na frente de banco de dados e outro na de IA/análise geográfica. No futuro o aplicativo será hospedado e terá persistência remota. Por enquanto, a decisão é manter o MVP local para a apresentação, sem backend, autenticação ou serviços pagos.

## Estado implementado

- React 19 + Vite 6; aplicação web, não aplicativo nativo de celular.
- Lista de registros → cadastro → consulta/edição do registro.
- Vários produtos por registro, nome do produtor e espécie.
- Fotos somente pela câmera integrada, usando getUserMedia. Foram removidos seleção da galeria, importação de arquivos, seletor nativo e inclusão de imagens de exemplo.
- Localização por tentativa de foto, com precisão e horário; não há um GPS único compartilhado por produto ou registro.
- Até três tentativas por produto e por etapa, com contadores independentes. Histórico preservado.
- Registros incompletos podem ser salvos. Depois de salvo, somente o nome pode ser alterado; novas fotos acrescentam evidências.
- Persistência em IndexedDB de cada navegador/origem. Dados não são salvos no notebook servidor.
- Modo demonstração oferece coordenadas de exemplo identificadas; ainda exige capturar foto pela câmera.
- Aviso de distância calculado, sem declarar fraude ou legalidade.

## Visual aprovado e aplicado

O usuário aprovou o modelo de uso no campo: fundo claro, verde profundo de mata, pequeno detalhe areia, bordas fortes, botões largos e contraste alto. As frases do aplicativo foram preservadas, incluindo Produto, Adicionar outro produto e Ver tentativas e locais.

O tema está em src/campo.css, importado depois de src/style.css. A fonte foi reduzida um pouco a pedido do usuário, mantendo as áreas de toque grandes. O cadastro e as fotos ficam em uma coluna; o aplicativo navega entre telas, não exibe as três ao mesmo tempo.

Existiram HTMLs de estudo separados do app. Eles não são dependências do projeto. O código atual é a referência definitiva.

## Correções importantes já feitas

1. UUID: crypto.randomUUID não estava disponível pelo IP em HTTP. uid usa getRandomValues como alternativa, mantendo UUID v4.
2. Câmera/GPS no celular: exigem contexto seguro. Foi criado HTTPS somente na rede local, com CA própria e certificado por notebook. Não há túnel público. Certificados precisam ser confiados manualmente em cada aparelho de teste.
3. iPhone: o usuário confirmou funcionamento depois de configurar confiança e abrir diretamente no navegador. Houve problemas em navegadores internos e avisos de certificado; não assumir falha do React quando o HTTPS nem foi carregado.
4. Salvamento: o WebKit retornou UnknownError: Error preparing Blob/File data to be stored in object store. A solução implementada grava bytes ArrayBuffer + MIME no IndexedDB e reconstrói Blob na leitura. Preserva bytes, posições, horários e histórico. Registros antigos com Blob continuam legíveis.
5. Erros de escrita agora mostram a causa real, sem atribuir toda falha a espaço insuficiente. Escritas aguardam commit. Salvar novamente o mesmo ID de registro não duplica nem sobrescreve o anterior.
6. Confirmação de criação não depende de uma consulta posterior, evitando falsa mensagem de falha após uma escrita concluída.

## Código e testes

- src/main.jsx: componentes, navegação, rascunho, câmera e modais.
- src/store.js: regras, transações, codificação binária das fotos, mensagens e distâncias.
- src/campo.css: tema de campo atual.
- scripts/https-local.mjs: servidor estático HTTPS 8443 e preparação HTTP 5175. Não é API de dados.
- scripts/local-certificate.mjs: CA e certificados locais. Chaves em .local-https, ignoradas no Git.
- public/diagnostico.html: diagnóstico independente da aplicação.
- docs/HTTPS-LOCAL.md: instruções de certificado para iPhone/Android.

Última validação: compilação concluída e nove testes passando. Houve teste no navegador com largura de celular, criação de registro com dois produtos, salvamento, edição do nome e abertura do modal de captura. A validação real de câmera/GPS e legibilidade deve ser repetida no ambiente do evento.

```powershell
npm.cmd install
npm.cmd test
npm.cmd run mobile:https
```

No PowerShell, usar npm.cmd evita o bloqueio de npm.ps1 sem alterar a política de execução. O script dev compila e serve preview, sem atualização automática do código. Se o servidor está rodando, o build atualizado pode ser servido após recarregar a página; preserve rascunhos antes de recarregar.

## Transferência para o notebook do evento

Extraia o projeto e abra no Codex a pasta que contém package.json. Confirme Node.js 22/24 e disponibilidade de internet para a instalação inicial. Após instalar, a interface é servida localmente sem recursos externos; localização depende do dispositivo e dos serviços disponíveis.

O IP muda conforme a rede: utilize o endereço mostrado pelo notebook do evento. O endereço do computador anterior não deve ser reutilizado sem conferência. Ao iniciar HTTPS nesta máquina, serão geradas novas chaves e uma nova CA; o certificado do computador anterior não valida o novo notebook.

Não copie chaves privadas .key nem a pasta .local-https para repositórios. Registros/fotos do navegador anterior não estão no ZIP: não há exportador nem sincronização implementados. Prepare dados de demonstração no navegador e endereço que serão usados na apresentação, em aba normal. Modo privado pode perder dados ao encerrar a sessão.

Se o Wi-Fi do evento isolar dispositivos, o celular pode não alcançar o notebook. Verifique rede e firewall; não desative proteções indiscriminadamente. Alternativa: apresentar em http://127.0.0.1:5173/ no próprio notebook, com webcam e posições de demonstração identificadas.

## Integrações e decisões pendentes

Os contextos acordados já existem:

- integracoes/banco-de-dados/CONTEXTO.md
- integracoes/ia-geoespacial/CONTEXTO.md

A ideia de IA é confrontar posições e área declarada com informações geográficas e eventualmente satélite. Ainda não existe polígono de área, API ou pipeline implementado. A forma de o produtor informar os limites está pendente. Separar conferência ponto/polígono de IA e avaliar resolução, datas e nuvens antes de prometer identificação de árvores por satélite. Manter evidência insuficiente como resultado possível.

Não implementar infraestrutura remota sem nova orientação do usuário. Preservar posições reais e simuladas separadas, histórico imutável e limite atômico de tentativas.

## GitHub

Destino informado pelo usuário: https://github.com/ThiagoAlmeida011/rastro-florestal

O envio pela integração retornou 403 Resource not accessible by integration. Foi criado o commit 6d3d8d2 via Git e o usuário confirmou o push para main pelo seu terminal após autenticação. README, ZIP antigo e arquivo teste já existiam no remoto e foram preservados nesse envio. Confira o repositório atual antes de substituir arquivos remotos.

Depois do envio, a pasta foi organizada: o histórico .git foi incorporado à pasta principal rastro-florestal, mantendo dependências e certificados locais no mesmo caminho. A cópia rastro-florestal-repositorio foi arquivada fora da pasta de trabalho. Estudos visuais estão em docs/design e o roteiro de apresentação em docs/EVENTO.txt. Alterações desta organização podem aparecer como pendentes no Git; não confundir esses ajustes locais com um novo push confirmado.

## Forma de trabalhar com o usuário

Comunicação em português brasileiro, direta. Antes de alterações de design amplas, o usuário preferiu avaliar HTMLs estáticos separados; só depois autorizou aplicar ao aplicativo. A mudança do visual de campo já está autorizada e concluída. Não alterar novamente o design sem novo pedido.

O usuário valoriza comentários em português explicando as funções e decisões. Preserve essa documentação ao evoluir o código. Mantenha uma distinção clara entre o que funciona hoje e as integrações que a equipe ainda pretende construir.
