# Vora Cookies — Vendas

App de controle de vendas e pagamentos da Vora Cookies. É um **app instalável (PWA)**: abre pelo navegador, instala no celular como se fosse um aplicativo (Android e iPhone), funciona sem sinal e sincroniza os dados entre os aparelhos pela nuvem (Firebase).

**O que ele faz:** cookies prontos/vendidos por dia, vendas e pagamentos (Pix, dinheiro, cartão), QR Code do Pix com o valor, cobrança e agradecimento por WhatsApp, fechamento de caixa, histórico por dia, clientes, relatórios por período e sabor, conferência de Pix recebido (texto ou extrato) e login para você e quem você autorizar.

Não há nada para instalar ou compilar: são arquivos simples (HTML, CSS e JavaScript).

---

## Passo a passo (cerca de 30 minutos)

### 1. Criar o banco de dados e o login (Firebase, grátis)
1. Acesse https://console.firebase.google.com e entre com sua conta Google. Clique em **Criar um projeto** (nome: `vora-cookies`; pode desativar o Google Analytics).
2. Na página inicial do projeto, clique no ícone **Web** (`</>`) para adicionar um app. Dê o apelido `vora`, **não** marque o Hosting e clique em registrar. Vai aparecer um bloco `firebaseConfig = { ... }`.
3. Abra o arquivo `js/firebase-config.js` e cole ali os valores (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`). Esses dados **não são secretos**: quem protege seus dados é o login e as regras do passo 5.
4. Menu **Authentication** > **Começar** > aba **Sign-in method** > ative **E-mail/senha**. Depois, aba **Users** > **Adicionar usuário**: crie a sua conta e a da Sabrina (e-mail e uma senha para cada). É com elas que vocês vão entrar no app.
5. Menu **Firestore Database** > **Criar banco de dados** > modo **produção** > região **southamerica-east1 (São Paulo)**. Depois, aba **Regras**: apague o conteúdo, cole o do arquivo `firestore.rules`, troque `SEU_EMAIL@exemplo.com` e `EMAIL_DA_SABRINA@exemplo.com` pelos e-mails das duas contas (em minúsculas) e clique em **Publicar**.
6. (Opcional, recomendado) Em **Authentication** > **Settings** > **User actions**, desmarque **Enable create (sign-up)** para ninguém além de você criar contas.

### 2. Subir no GitHub
1. Em https://github.com/new crie um repositório (por exemplo `vora-cookies`).
2. Clique em **uploading an existing file**, arraste **o conteúdo** desta pasta (não a pasta em si) e clique em **Commit changes**.
   - **Não envie** o arquivo `backup-vora-....json`: ele tem os dados dos seus clientes (o `.gitignore` já ajuda a evitar isso se você usar o Git no computador).

### 3. Publicar na internet
**Opção A: GitHub Pages (grátis, repositório público).** No repositório: **Settings** > **Pages** > Source: **Deploy from a branch** > Branch **main** / **(root)** > Save. Em 1 a 2 minutos o endereço aparece (algo como `https://SEU_USUARIO.github.io/vora-cookies/`). Seu código não tem nenhum dado pessoal, então pode ser público.

**Opção B: repositório privado + Netlify (grátis).** Em https://app.netlify.com: **Add new site** > **Import an existing project** > escolha o repositório > deixe o **Build command vazio** e o **Publish directory** como `/` (raiz) > Deploy.

Depois de publicar, no Firebase: **Authentication** > **Settings** > **Authorized domains** > **Add domain** e inclua o endereço do site (por exemplo `SEU_USUARIO.github.io`).

### 4. Instalar no celular
- **Android (Chrome):** abra o endereço do app > menu ⋮ > **Instalar app** (ou **Adicionar à tela inicial**).
- **iPhone (Safari):** abra o endereço **no Safari** > botão **Compartilhar** > **Adicionar à Tela de Início**.

O ícone da Vora aparece na tela, e o app abre em tela cheia, como um aplicativo.

### 5. Trazer os dados que já existem
Junto com este projeto vai o arquivo `backup-vora-AAAA-MM-DD.json` (seus clientes, vendas, sabores e ajustes atuais).
1. Entre no app com a sua conta.
2. **Ajustes** (ícone de controles no topo da tela Hoje) > role até **Dados** > cole o conteúdo do arquivo na caixa **Cole aqui um backup para importar** > **Importar backup**.
3. Pronto: tudo aparece, inclusive a chave Pix, o QR e o link de avaliação. A importação **substitui** os dados da nuvem, então faça uma vez só.

Dica: se houver vendas novas no app antigo depois da data do backup, exporte de novo por lá (**Ajustes** > **Exportar backup**) antes de trocar.

---

## Atualizar o app
Edite os arquivos pelo próprio GitHub (lápis ao lado de cada arquivo) e confirme (**Commit**). Em alguns minutos o site é atualizado. Nos celulares, a nova versão chega na próxima vez que o app abrir com internet. Se um celular insistir na versão antiga, troque `VERSAO = 'v1'` por `'v2'` no arquivo `sw.js`.

## Testes automáticos
Com o Node 18 ou mais novo: `npm test`. No GitHub eles rodam sozinhos a cada alteração (aba **Actions**).

## Limites desta versão
- **Leitura de prints de Pix por IA** (tela Conferir Pix) não está disponível aqui, porque usava um recurso interno do Claude. Colar o texto das mensagens e importar o extrato (OFX, CSV ou texto) funcionam normalmente. Dá para adicionar a leitura de prints depois com um pequeno serviço próprio (com custo por uso).
- **Aplicativo de loja:** esta versão instala pelo navegador. APK para Android é possível preparar depois. No iPhone, um app da App Store exige conta Apple Developer paga (US$ 99/ano) e um Mac ou servidor de build.
- Cada venda ocupa um registro do banco. O plano gratuito do Firebase comporta com folga o uso de uma confeitaria.

## Estrutura
```
index.html              página do app
manifest.webmanifest    nome, cores e ícones (instalação)
sw.js                   funcionamento sem internet
css/style.css           visual (claro e escuro)
js/app.js               o app (telas, vendas, Pix, relatórios)
js/firebase-adapter.js  ligação com login e banco do Firebase
js/firebase-config.js   dados do seu projeto Firebase (você preenche)
js/platform.js, main.js carregamento
firestore.rules         regras do banco (só as contas autorizadas)
icons/                  logo e ícones
tests/                  testes automáticos
```
