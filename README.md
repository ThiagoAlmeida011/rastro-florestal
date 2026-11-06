# Rastro Florestal

Aplicação para registrar árvores, fotos e localizações, apoiando a rastreabilidade florestal de pequenos produtores.

Cada produtor organiza produtos em registros nomeados e documenta as etapas anteriores e posteriores à extração. Cada tentativa preserva sua própria imagem, posição e horário para consulta e comparação.

**Estado atual:** protótipo web funcional com execução e armazenamento locais. Hospedagem, banco de dados remoto e análise por IA são etapas futuras; ainda não estão integrados.

## Funcionalidades

- Registros com nome, produtor e vários produtos/árvores.
- Fotos tiradas somente pela câmera integrada ao aplicativo, sem seleção da galeria.
- Evidências de antes e depois da extração.
- Até **3 tentativas por etapa de cada produto**, com histórico preservado.
- Localização individual por foto, com precisão e horário quando disponíveis.
- Salvamento de registros incompletos como rascunhos.
- Edição somente do nome de registros já salvos.
- Avisos de diferença de localização para conferência.
- Persistência de fotos e registros no navegador.
- Modo de demonstração com posições simuladas identificadas; a foto continua sendo capturada pela câmera.

O visual de uso no campo utiliza fundo claro, verde profundo, bordas fortes e botões largos. A leitura sob sol deve ser validada no aparelho em condições reais.

## Tecnologias

| Camada | Tecnologia |
| --- | --- |
| Interface | React 19, CSS e Lucide React |
| Compilação e preview | Vite 6 |
| Persistência | IndexedDB |
| Captura | APIs de câmera e geolocalização do navegador |
| HTTPS local | Node.js e node-forge |
| Testes | Node Test Runner e fake-indexeddb |

## Executar no computador

Requisitos: Node.js 20.19+ ou 22.12+ — recomendado Node.js 22/24 —, npm e navegador atualizado. A primeira instalação precisa de internet.

No terminal, dentro da pasta que contém `package.json`:

```bash
npm install
npm run dev
```

No **PowerShell do Windows**, se houver bloqueio de `npm.ps1`, utilize:

```powershell
npm.cmd install
npm.cmd run dev
```

Abra **http://127.0.0.1:5173/** e mantenha o terminal aberto. Não é necessário alterar a política de execução de scripts do Windows.

Neste projeto, `dev` compila e inicia o preview. Depois de editar o código, encerre com `Ctrl+C` e execute novamente. Não abra o `index.html` da aplicação diretamente pelo explorador.

## Usar no celular com câmera e GPS

1. Conecte notebook e celular ao mesmo Wi-Fi.
2. Execute na pasta do projeto:

   ```powershell
   npm.cmd run mobile:https
   ```

3. Abra no celular o endereço de preparação exibido no terminal e instale o certificado público.
4. Habilite a confiança nesse certificado no aparelho.
5. Abra o endereço HTTPS diretamente no Safari do iPhone ou no navegador do Android. Permita câmera e localização quando solicitado.

Exemplo, se o IP do notebook for `192.168.1.3`:

| Endereço | Finalidade |
| --- | --- |
| `http://192.168.1.3:5175/` | Instruções e certificado público |
| `https://192.168.1.3:8443/` | Aplicativo com HTTPS |
| `https://192.168.1.3:8443/diagnostico.html` | Diagnóstico da conexão e dos arquivos |

**Use o IP mostrado no seu terminal**, que pode ser diferente. Para escolher uma interface:

```powershell
npm.cmd run mobile:https -- 192.168.1.3
```

O notebook e o servidor precisam continuar ligados. O comando `mobile`, sem `:https`, serve a interface por HTTP; câmera e GPS reais no celular exigem HTTPS confiável e permissões.

Consulte o [guia de HTTPS para iPhone e Android](docs/HTTPS-LOCAL.md) para configurar a confiança, conferir a impressão digital e entender a renovação dos certificados. Se houver alerta de certificado, confira a configuração antes de continuar.

## Fluxo do produtor

1. **Meus registros:** consulte a lista ou toque em **Novo registro**.
2. **Novo registro:** informe nome e produtor, adicione produtos e tire as fotos disponíveis. **Salvar registro** persiste o conjunto e retorna à lista.
3. **Editar registro:** consulte produtos e fotos, altere o nome e acrescente novas tentativas. **Ver tentativas e locais** abre o histórico.

No cadastro, campos e fotos ficam em memória até salvar o registro. Fechar ou atualizar a página antes disso pode perder o rascunho. Em um registro já salvo, uma nova tentativa é gravada ao confirmar a evidência.

## Modelo e regras

```text
Registro
└── Produtos / árvores
    ├── Antes da extração: até 3 tentativas
    └── Depois da extração: até 3 tentativas
        └── Foto + posição individual + horários + origem
```

- A primeira foto conta como tentativa **1 de 3**. Cancelar a câmera não consome tentativa.
- Uma evidência salva sem localização conta como tentativa e permanece incompleta.
- Para considerar o registro completo, todos os produtos precisam de espécie e uma evidência com posição em cada etapa. Posições de demonstração também contam nesse critério local; **completo não significa validado ou certificado**.
- IDs são UUIDs estáveis. Códigos amigáveis são sequenciais somente no navegador.
- Inclusões usam transações atômicas e validam o limite inclusive entre abas concorrentes. Repetir o mesmo ID não acrescenta outra tentativa.
- Imagens ficam como bytes `ArrayBuffer` e tipo MIME no IndexedDB. A interface reconstrói o `Blob` na leitura, preservando a imagem. Essa abordagem contorna uma falha de gravação Blob/File observada no WebKit. Fotos legadas com Blob continuam legíveis.
- Não são armazenadas fotos em `localStorage`.

O aviso de localização usa a distância de Haversine e dispara acima de **100 metros mais a soma das precisões** das duas posições. Só compara posições da mesma origem: real com real, ou simulada com simulada. O limiar fica em `ALERT_DISTANCE_M`, em `src/store.js`.

## Persistência e limitações

Os dados pertencem ao **navegador, perfil e origem** em que foram salvos. HTTP e HTTPS, IPs ou portas diferentes usam armazenamentos separados. O celular não recebe automaticamente registros do navegador do notebook.

Prefira navegação normal. Encerrar uma sessão privada, limpar dados do site ou remover o perfil pode apagar os registros. Não há backup, exportador, autenticação ou sincronização implementados.

Após a instalação, a interface e o servidor local não dependem de recursos externos para carregar. A obtenção da posição depende do dispositivo, das permissões e dos serviços de localização disponíveis, podendo ser aproximada ou falhar.

GPS e horários são evidências obtidas do dispositivo, não prova independente da origem da imagem. O aplicativo não comprova legalidade e não classifica automaticamente fraude. Não há polígono da área declarada nem consulta a satélite implementados.

Chaves e certificados gerados ficam em `.local-https/`, excluído do Git. Somente o certificado público deve ser instalado nos aparelhos de teste que você controla. **Não publique arquivos `.key`.** O servidor local não é uma configuração de hospedagem para produção.

## Organização do projeto

```text
src/
├── main.jsx                      # Telas, modais, câmera e navegação
├── store.js                      # Persistência e regras de domínio
├── store.test.js                 # Testes dos dados e regras
├── style.css                     # Estrutura e estados da interface
└── campo.css                     # Tema atual de uso no campo
scripts/
├── https-local.mjs               # Servidor HTTPS e preparação do certificado
├── local-certificate.mjs         # Geração e reutilização dos certificados
└── local-certificate.test.js     # Testes dos certificados
public/
├── diagnostico.html              # Diagnóstico independente da aplicação
└── examples/                     # Ilustrações legadas; fora do fluxo de captura
integracoes/
├── banco-de-dados/CONTEXTO.md
└── ia-geoespacial/CONTEXTO.md
docs/
└── HTTPS-LOCAL.md
```

As funções principais possuem comentários em português sobre suas responsabilidades e decisões de implementação.

Os estudos visuais anteriores estão organizados em [docs/design](docs/design/README.md). O roteiro de transferência para outro notebook está em [docs/EVENTO.txt](docs/EVENTO.txt), e o resumo para iniciar outro chat está em [docs/CONTINUAR-NO-EVENTO.md](docs/CONTINUAR-NO-EVENTO.md).

## Testes e compilação

```powershell
npm.cmd test
npm.cmd run build
```

Os nove testes atuais verificam identificadores em HTTP, persistência, histórico, concorrência, idempotência, limites, falhas de gravação, fotos binárias, leitura legada, distâncias e certificados. Câmera, GPS e leitura sob sol precisam de validação no dispositivo real.

Para servir uma compilação já gerada:

```powershell
npm.cmd run preview
```

## Trabalho em equipe

| Frente | Responsabilidade prevista | Contexto |
| --- | --- | --- |
| Frontend | Fluxo do produtor, captura e consulta das evidências | `src/main.jsx` e este README |
| Banco de dados | Persistência remota, arquivos, API e futura sincronização | [Contexto de banco de dados](integracoes/banco-de-dados/CONTEXTO.md) |
| IA geoespacial | Conferência de posições, área declarada e viabilidade de cruzamento com satélite | [Contexto de IA](integracoes/ia-geoespacial/CONTEXTO.md) |

Os contratos de integração ainda são propostas. As próximas decisões incluem o envio dos limites da área pelo produtor, o contrato da API e a separação entre dados reais e simulados. A análise por satélite depende da resolução, das datas e das condições das imagens disponíveis; não se assume identificação de árvores individuais.

## Problemas comuns

| Sintoma | O que conferir |
| --- | --- |
| PowerShell bloqueia `npm.ps1` | Use `npm.cmd` no lugar de `npm`. |
| Porta em uso | Encerre a instância anterior com `Ctrl+C` no terminal que a iniciou. |
| Celular não abre o link | Confira servidor ativo, IP correto, mesmo Wi-Fi e acesso pela rede privada no firewall. |
| Alerta de certificado | Confira instalação, confiança, endereço e data do aparelho. |
| Tela vazia | Abra `/diagnostico.html` no mesmo endereço HTTPS. |
| Câmera ou GPS bloqueados | Abra no navegador, use HTTPS confiável e confira permissões. |
| Registros não aparecem | Confira navegador, perfil, protocolo, IP e porta do salvamento. |
| Falha ao salvar | Leia o erro informado. Preserve a aba com o rascunho; não limpe os dados do site para tentar corrigir. |
