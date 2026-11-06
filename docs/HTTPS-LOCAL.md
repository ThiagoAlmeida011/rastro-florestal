# HTTPS local no celular

## HTTPS local: câmera e localização no iPhone e Android

Não exige hospedagem, túnel, conta nem internet depois da instalação. O certificado é criado neste notebook e precisa ser instalado **uma vez por aparelho de teste**. Nenhuma configuração de confiança é alterada automaticamente.

No PowerShell, na pasta do projeto:

```powershell
npm.cmd install
npm.cmd run mobile:https
```

O terminal mostra dois endereços. Exemplo com o IP `192.168.1.3`:

- **Preparar o certificado:** `http://192.168.1.3:5175`.
- **Aplicativo seguro:** `https://192.168.1.3:8443`.

A porta 5175 serve apenas instruções e o certificado público. Não disponibiliza o código, as chaves ou os dados do aplicativo. A porta 8443 serve somente a pasta compilada `dist`. O servidor se vincula ao IP privado selecionado. Caso haja várias interfaces, escolha o IP da rede Wi-Fi:

```powershell
npm.cmd run mobile:https -- 192.168.1.3
```

Mantenha notebook e celular na mesma rede. Se necessário, autorize no Windows as portas 8443 e 5175 somente para sua rede privada, pelo aviso de acesso do Node. O servidor HTTP anterior na porta 5173 pode continuar rodando.

### iPhone / iPad

1. No Safari, abra a página **Preparar o certificado** e toque em **Baixar certificado · iPhone**. Compare a impressão SHA-256 com a que aparece no terminal do notebook. Autorize o download do perfil quando o sistema solicitar.
2. Em **Ajustes → Geral → VPN e Gerenciamento de Dispositivo**, abra o perfil **Rastro Florestal Local CA** e instale. O aparelho pode solicitar seu código de desbloqueio.
3. Em **Ajustes → Geral → Sobre → Ajustes de Confiança de Certificados**, habilite confiança para **Rastro Florestal Local CA**. Instalar o perfil por si só não habilita confiança SSL.
4. Abra o endereço **Aplicativo seguro** no Safari. Ele deve abrir sem alerta de certificado. Se houver alerta, confira a instalação, a confiança, o IP e a data do aparelho antes de continuar.
5. Toque em **Abrir câmera** e permita acesso. Para GPS, selecione **Localização atual do dispositivo**, tire a foto e permita acesso. Confira também **Ajustes → Privacidade e Segurança → Serviços de Localização** e a permissão do Safari; habilite localização precisa para o teste se desejar. Permissões do site podem ser ajustadas no menu do Safari.

Referência: [Apple — confiar em perfis de certificado instalados manualmente](https://support.apple.com/pt-br/102390).

### Android

1. Abra **Preparar o certificado** e baixe a opção Android.
2. Em **Configurações → Segurança e privacidade → Mais configurações de segurança → Criptografia e credenciais → Instalar um certificado → Certificado CA**, escolha `rastro-florestal-ca.crt`. O caminho varia conforme o fabricante; pesquise por **certificado CA** nas configurações.
3. Abra o endereço HTTPS no Chrome e permita câmera e localização. O GPS do sistema e as permissões de câmera/localização do navegador também precisam estar habilitados.

Referência: [Google — adicionar e remover certificados](https://support.google.com/pixelphone/answer/2844832?hl=pt-BR).

### Persistência, certificados e outros aparelhos

- O HTTPS é uma origem diferente do HTTP. Registros antigos continuam no endereço HTTP anterior; não são migrados automaticamente. Cada aparelho/navegador tem seus próprios registros.
- Repita a instalação do mesmo certificado público nos demais aparelhos de teste que você controla. Dispositivos gerenciados por empresa/escola podem impedir a instalação. A aplicação não contorna essas políticas.
- Chaves ficam em `.local-https/`, excluído do Git e do ZIP de entrega. Nunca envie os arquivos `.key` ao GitHub nem aos celulares. O certificado raiz fica válido por um ano e o certificado do servidor por 90 dias; o servidor renova seu certificado quando necessário, preservando a autoridade local. Se o IP mudar, reinicie o comando: o certificado do servidor é atualizado e você usa o novo endereço.
- A confiança em uma autoridade certificadora permite validar certificados assinados por ela, não apenas uma página. Guarde as chaves e instale somente nos aparelhos de teste. Ao concluir, remova **Rastro Florestal Local CA** do aparelho se não for continuar usando. O script não instala uma autoridade no Windows nem muda políticas do navegador.
- Câmera e GPS reais exigem permissão do usuário e um contexto seguro. A captura é feita pelo vídeo da câmera dentro do aplicativo, sem seleção de fotos existentes.


