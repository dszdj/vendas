# Aura Studio — gestão de produtos

Aplicação web com frontend Next.js, API NestJS e banco SQLite local acessado por `better-sqlite3`. Não requer Docker nem servidor separado de banco de dados. O arquivo do banco é criado automaticamente em `data/aura-vendas.db` na primeira inicialização da API.

Inclui autenticação com senhas armazenadas por bcrypt, sessão em cookie HTTP-only, painel de vendas, cadastro/edição/exclusão de produtos, busca por nome/categoria/cor/tamanho, imagens de produtos com definição de imagem principal e resumos de estoque. Vendas são gravadas no SQLite e descontam o estoque na mesma transação.

## Requisitos

- Node.js 22 ou superior e npm.
- Linux (Debian/Ubuntu), Windows 10/11 ou macOS.
- No Linux, ferramentas de compilação para o módulo nativo `better-sqlite3`: `build-essential`, `python3`, `make` e `g++`.

## Executar no Linux

No Debian ou Ubuntu, instale as ferramentas de compilação e Node.js 22. Por exemplo, se o Node.js estiver instalado pelo `nvm`:

```bash
sudo apt-get update
sudo apt-get install -y build-essential python3 make g++
nvm install 22
nvm use 22
```

Na pasta do projeto, crie e configure o arquivo de ambiente:

```bash
cp .env.example .env
nano .env
```

Configure `JWT_SECRET` com pelo menos 32 bytes, `ADMIN_EMAIL` com o e-mail da conta superadmin inicial e `ADMIN_PASSWORD` com uma senha de 12–72 bytes. `FRONTEND_PORT` e `BACKEND_PORT` definem as portas da aplicação (padrões 3000 e 4000). `DATABASE_PATH=../data/aura-vendas.db` grava o banco em `data/` na raiz do projeto; caminhos relativos de banco são resolvidos a partir da pasta `backend`, independentemente do diretório de onde o processo é iniciado.

Instale as dependências e inicie em desenvolvimento:

```bash
npm ci
npm run dev
```

Abra `http://localhost:<FRONTEND_PORT>`. Para executar a versão de produção, compile uma vez com `npm run build` e inicie o backend e o frontend em terminais separados com `npm run start --workspace backend` e `npm run start --workspace frontend`. O backend cria automaticamente as tabelas, o arquivo SQLite e a conta superadmin configurada por `ADMIN_EMAIL` e `ADMIN_PASSWORD`. Não é necessário aplicar migrações separadamente ou instalar PostgreSQL. Pressione `Ctrl+C` nos terminais para parar os processos.

## Executar no Windows

No PowerShell, abra a pasta do projeto e crie o arquivo de ambiente:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
```

Configure as mesmas variáveis indicadas acima, depois instale e inicie:

```powershell
npm ci
npm run dev
```

## Configuração de produção

O frontend deriva a URL da API de `BACKEND_PORT`. Em hospedagens com domínios diferentes, configure `FRONTEND_URL` e `NEXT_PUBLIC_API_URL` com as URLs públicas correspondentes; publique a aplicação por HTTPS. Os processos devem ser executados pelo usuário do serviço, com permissão de escrita na pasta `data/` e no destino dos backups. Não exponha diretamente a porta do backend se um proxy reverso estiver encaminhando as requisições.

## Loja pública

A página inicial (`/`) é a loja. O painel administrativo fica em `/painel-administrativo`; `/painel-vendas` redireciona para o novo endereço. O painel e as rotas de gerenciamento exigem uma sessão de vendedor ou superadmin. A loja consulta `/api/store/products`, uma rota pública que lê o mesmo catálogo SQLite e retorna somente nome, categoria, tamanho, cor, preço, estoque e fotos (não retorna o custo de compra). Produtos e imagens cadastrados no painel aparecem no site sem duplicação de dados. Itens sem estoque permanecem visíveis como esgotados.

O catálogo inclui busca, filtros de categoria, página de detalhes por peça/tamanho e carrinho persistido no navegador. O fechamento segue a referência enviada e inicia um pedido no WhatsApp; não registra uma venda nem baixa estoque até que o atendimento confirme, evitando registrar pedidos não pagos como vendas. Nome, WhatsApp e Instagram são editados em **Configurações da loja** no painel e usados no site público.

Clientes podem criar uma conta em `/acesso` informando nome, e-mail, senha, telefone e endereço completo. Contas novas recebem o tipo **Normal** e não acessam o painel. Vendedores podem gerenciar o catálogo e consultar usuários; somente superadmins podem alterar os tipos de usuário para **Normal**, **Vendedor** ou **Superadmin**. O e-mail definido em `ADMIN_EMAIL` é reservado à conta superadmin inicial.

## Dados e backups

- Banco de dados: `data/aura-vendas.db` dentro da pasta do projeto. O SQLite também pode criar os arquivos `data/aura-vendas.db-wal` e `data/aura-vendas.db-shm` enquanto o backend está em execução.
- As imagens são salvas no próprio SQLite e incluídas nos backups. Cada produto aceita até 6 imagens JPEG, PNG ou WebP; arquivos originais de até 50 MB são convertidos no navegador para WebP com no máximo 4 MB antes do envio. A imagem marcada como principal aparece na miniatura do catálogo.
- `npm run backup` cria uma cópia consistente do banco com a API de backup do SQLite, inclusive quando o banco principal está aberto. Por padrão, os backups ficam em `%LOCALAPPDATA%\AuraStudio\backups` no Windows, em `$XDG_DATA_HOME/AuraStudio/backups` no Linux (ou `~/.local/share/AuraStudio/backups` se `XDG_DATA_HOME` não estiver definido) e em `~/Library/Application Support/AuraStudio/backups` no macOS. `BACKUP_DIR` pode definir outro destino; caminhos relativos são resolvidos a partir da raiz do projeto.
- `npm run backup:schedule` agenda uma cópia diária às 03:00 para o usuário atual: usa o Agendador de Tarefas no Windows e o crontab do usuário no Linux. No Linux, o serviço cron precisa estar instalado e ativo, e o processo precisa ter acesso ao crontab. O computador precisa estar ligado para executar a tarefa.
- No Debian/Ubuntu, instale e ative o serviço cron se ainda não estiver disponível: `sudo apt-get install -y cron && sudo systemctl enable --now cron`.
- Para remover o agendamento, execute `npm run backup:schedule -- --uninstall`.
- Para definir a retenção dos backups, configure `BACKUP_RETENTION_DAYS` em `.env` (padrão de 14 dias).
- Restauração manual: pare o backend, preserve uma cópia do banco atual e substitua `data/aura-vendas.db` por um arquivo `.db` de backup. Inicie novamente com `npm run dev`.

O backup protege contra exclusão ou corrupção lógica, mas cópias importantes também devem ser guardadas fora deste computador. A pasta `data/`, os bancos e os backups não devem ser adicionados ao controle de versão.

## Imagens com IA

A área **Imagens com IA** cria fotos de moda a partir de uma foto do produto e uma foto de referência. O backend executa o workflow `backend/workflows/api_google_nano_banana2_image_edit.json` na API local do ComfyUI (`http://127.0.0.1:8188`). O ComfyUI e o nó personalizado `GeminiNanoBanana2V2` devem estar instalados e em execução no mesmo computador do backend.

O workflow usa os nós `product` (`LoadImage`), `ref` (`LoadImage`), `prompt` (`PrimitiveStringMultiline`) e `save` (`SaveImage`). O texto digitado é enviado sem qualquer prompt ou instrução adicional do sistema. A imagem do produto é conectada ao primeiro slot de imagem do Nano Banana; a referência, ao segundo. Cada arquivo deve ser JPEG, PNG ou WebP de até 10 MB. A geração consulta a saída `save` e disponibiliza a imagem para baixar.

Para usar o nó Partner do Nano Banana no modo API, coloque a chave de conta ComfyUI no campo `api_key_comfy_org` do objeto `extra_data` do nó Nano Banana no workflow. O backend retira esse objeto do nó e o envia no campo `extra_data` da requisição para `/prompt`, conforme o formato exigido pelo ComfyUI. A chave não é enviada nos uploads de imagem nem incluída no grafo do workflow enviado à fila. Não é necessário configurar variáveis ComfyUI no `.env`; a API local padrão não requer chave de acesso. Se alterar a porta do ComfyUI, atualize a constante `COMFYUI_BASE_URL` em `backend/src/images/images.service.ts`.

## Endpoints da API

Todas as rotas usam o prefixo `/api`.

| Método | Rota | Acesso | Descrição |
| --- | --- | --- | --- |
| `POST` | `/auth/login` | Público; limite de 5 tentativas/minuto | Inicia sessão |
| `POST` | `/auth/register` | Público; limite de 5 tentativas/minuto | Cria conta normal com endereço e inicia sessão |
| `POST` | `/auth/logout` | Público | Encerra a sessão |
| `GET` | `/auth/me` | Sessão | Consulta o usuário atual |
| `GET` | `/users` | Vendedor ou superadmin | Lista os usuários e dados de cadastro |
| `PATCH` | `/users/:id/role` | Superadmin | Altera o tipo de usuário |
| `GET` | `/settings/store` | Vendedor ou superadmin | Lê as configurações da loja |
| `PUT` | `/settings/store` | Vendedor ou superadmin | Salva nome, WhatsApp e Instagram |
| `GET` | `/products?search=...` | Vendedor ou superadmin | Lista e busca produtos |
| `GET` | `/products/summary` | Vendedor ou superadmin | Resumo do catálogo e estoque |
| `POST` | `/products` | Vendedor ou superadmin | Cadastra produto |
| `PUT` | `/products/:id` | Vendedor ou superadmin | Atualiza produto |
| `PUT` | `/products/:id/images` | Vendedor ou superadmin | Substitui e organiza as imagens do produto |
| `GET` | `/products/:id/images/:imageId` | Vendedor ou superadmin | Exibe uma imagem do produto |
| `DELETE` | `/products/:id` | Vendedor ou superadmin | Exclui produto |
| `POST` | `/images/generate` | Vendedor ou superadmin; limite de 3 gerações/minuto | Gera imagem de moda com fotos do produto e referência |
| `GET` | `/sales/dashboard` | Vendedor ou superadmin | Métricas e vendas recentes para o painel |
| `GET` | `/sales?limit=50` | Vendedor ou superadmin | Histórico de vendas (limite de 1 a 100) |
| `POST` | `/sales` | Vendedor ou superadmin | Registra uma venda e atualiza o estoque atomicamente |
| `GET` | `/store/products` | Público | Lista pública do catálogo sem dados de custo |
| `GET` | `/store/products/:id/images/:imageId` | Público | Exibe as fotos dos produtos publicados no catálogo |
| `GET` | `/store/settings` | Público | Lê nome e contatos públicos da loja |

## Segurança

- Nunca compartilhe ou envie o arquivo `.env` ao controle de versão.
- O workflow contém a chave do Partner Node em texto simples; mantenha esse arquivo privado e não o envie ao controle de versão nem o compartilhe.
- O ComfyUI é acessado pelo backend através de `127.0.0.1`; mantenha sua interface local e não a exponha diretamente à internet.
- No início da API, a conta superadmin local é reconciliada com `ADMIN_EMAIL` e `ADMIN_PASSWORD` do `.env`. Essa conta é criada caso ainda não exista; a inicialização não renomeia nem substitui contas de clientes.
- Permissões são verificadas no backend a cada requisição usando o papel atualizado no SQLite; alterar o papel de uma conta invalida imediatamente os privilégios anteriores daquela sessão.
- A sessão expira em até 8 horas; desmarcar “Manter sessão neste navegador” usa um cookie de sessão.
- O cookie `Secure` é habilitado automaticamente quando `NODE_ENV=production`; em produção, publique a aplicação por HTTPS.
