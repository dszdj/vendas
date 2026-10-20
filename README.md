# Aura Studio — gestão de produtos

Aplicação web com frontend Next.js, API NestJS e banco SQLite local acessado por `better-sqlite3`. Não requer Docker nem servidor separado de banco de dados. O arquivo do banco é criado automaticamente em `data/aura-vendas.db` na primeira inicialização da API.

Inclui autenticação com senhas armazenadas por bcrypt, sessão em cookie HTTP-only, cadastro/edição/exclusão de produtos, busca por nome/categoria/cor/tamanho, imagens de produtos com definição de imagem principal e resumos de estoque.

## Requisitos

- Windows 10/11.
- Node.js 22 ou superior (este projeto usa o módulo nativo `better-sqlite3`).
- npm.

## Executar localmente

Abra o PowerShell na pasta do projeto:

```powershell
cd C:\Users\tiago\vendas
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
```

Configure `JWT_SECRET` com pelo menos 32 bytes, `ADMIN_EMAIL` com o e-mail de login e `ADMIN_PASSWORD` com uma senha de 12–72 bytes. `DATABASE_PATH=../data/aura-vendas.db` já grava o banco na pasta `data` do projeto; em desenvolvimento, o backend é executado a partir da pasta `backend`.

Depois, instale as dependências e inicie:

```powershell
npm install
npm run dev
```

Abra <http://localhost:3000>. O backend cria automaticamente as tabelas, o arquivo SQLite e o usuário administrativo inicial. Não é necessário aplicar migrações separadamente ou instalar PostgreSQL. Deixe o PowerShell aberto enquanto utiliza o sistema; pressione `Ctrl+C` para parar.

## Dados e backups

- Banco de dados: `data/aura-vendas.db` dentro da pasta do projeto. O SQLite também pode criar os arquivos `data/aura-vendas.db-wal` e `data/aura-vendas.db-shm` enquanto o backend está em execução.
- As imagens são salvas no próprio SQLite e incluídas nos backups. Cada produto aceita até 6 imagens JPEG, PNG ou WebP; arquivos originais de até 50 MB são convertidos no navegador para WebP com no máximo 4 MB antes do envio. A imagem marcada como principal aparece na miniatura do catálogo.
- `npm run backup` cria uma cópia consistente do banco em `%LOCALAPPDATA%\AuraStudio\backups`. `better-sqlite3` usa a API de backup do SQLite, inclusive quando o banco principal está aberto.
- `npm run backup:schedule` agenda uma cópia diária às 03:00 no Agendador de Tarefas do Windows, para o usuário atual. O computador precisa estar ligado para executar a tarefa.
- Para definir a retenção dos backups, configure `BACKUP_RETENTION_DAYS` em `.env` (padrão de 14 dias).
- Para remover o agendamento: `powershell -NoProfile -ExecutionPolicy Bypass -File .\backups\install-backup-task.ps1 -Uninstall`.
- Restauração manual: pare o backend, preserve uma cópia do banco atual e substitua `data\aura-vendas.db` por um arquivo `.db` de backup. Inicie novamente com `npm run dev`.

O backup protege contra exclusão ou corrupção lógica, mas cópias importantes também devem ser guardadas fora deste computador. A pasta `data/`, os bancos e os backups não devem ser adicionados ao controle de versão.

## Imagens com IA

A área **Imagens com IA** cria fotos de moda a partir de 1 a 4 fotos do produto e uma foto de referência. A geração usa um workflow Nano Banana executado por uma instância ComfyUI configurada no servidor. O ComfyUI e os nós personalizados que oferecem o Nano Banana devem estar instalados e acessíveis pela API HTTP antes de usar a página.

### Configurar ComfyUI e Nano Banana

1. No ComfyUI, monte e teste um workflow Nano Banana com entradas de imagem para a referência e para as fotos do produto, uma entrada de texto para o prompt e um nó `SaveImage` conectado à imagem final.
2. Exporte o workflow no formato **API** e salve o JSON no servidor, por exemplo em `backend/workflows/nano-banana-api.json`. Não use o JSON de workflow de interface comum; a API do ComfyUI espera o formato de nós executáveis.
3. Configure no `.env`:
   - `COMFYUI_BASE_URL`: endereço HTTP(S) da instância, por exemplo `http://127.0.0.1:8188`.
   - `COMFYUI_WORKFLOW_PATH`: caminho do JSON do workflow, relativo à pasta `backend`.
   - `COMFYUI_WORKFLOW_INPUTS_JSON`: mapeamento dos IDs de nó e nomes de entrada no JSON exportado. `prompt` aponta para a entrada de texto; `reference` para o `LoadImage` da foto de referência; `products` lista, na ordem, os nós `LoadImage` das fotos do produto.
   - `COMFYUI_API_KEY`: opcional; token Bearer para instalações atrás de um proxy que exija autenticação.

Exemplo de mapeamento (troque os IDs e nomes de entrada pelos que aparecem no seu workflow API):

```dotenv
COMFYUI_WORKFLOW_INPUTS_JSON={"prompt":{"nodeId":"12","input":"prompt"},"reference":{"nodeId":"20","input":"image"},"products":[{"nodeId":"21","input":"image"},{"nodeId":"22","input":"image"}]}
```

Configure de um a quatro nós em `products`, conforme os slots de imagem conectados ao workflow Nano Banana. A página aceita até quatro fotos: se o workflow tiver menos slots do que as fotos enviadas, a API informa quantas fotos ele aceita; se tiver mais slots do que fotos enviadas, o último arquivo enviado é reutilizado nos slots restantes. As imagens de entrada devem ser JPEG, PNG ou WebP de até 4 MB cada. A saída é baixada na própria página.

O backend envia as imagens para `/upload/image`, enfileira o workflow em `/prompt` e consulta `/history` até encontrar a imagem criada. Os arquivos e o histórico são gerenciados pela instância ComfyUI e podem permanecer armazenados nas pastas configuradas nela.

## Endpoints da API

Todas as rotas usam o prefixo `/api`.

| Método | Rota | Acesso | Descrição |
| --- | --- | --- | --- |
| `POST` | `/auth/login` | Público; limite de 5 tentativas/minuto | Inicia sessão |
| `POST` | `/auth/logout` | Público | Encerra a sessão |
| `GET` | `/auth/me` | Sessão | Consulta o usuário atual |
| `GET` | `/products?search=...` | Sessão | Lista e busca produtos |
| `GET` | `/products/summary` | Sessão | Resumo do catálogo e estoque |
| `POST` | `/products` | Sessão | Cadastra produto |
| `PUT` | `/products/:id` | Sessão | Atualiza produto |
| `PUT` | `/products/:id/images` | Sessão | Substitui e organiza as imagens do produto |
| `GET` | `/products/:id/images/:imageId` | Sessão | Exibe uma imagem do produto |
| `DELETE` | `/products/:id` | Sessão | Exclui produto |
| `POST` | `/images/generate` | Sessão; limite de 3 gerações/minuto | Gera imagem de moda com fotos do produto e referência |

## Segurança

- Nunca compartilhe ou envie o arquivo `.env` ao controle de versão.
- Mantenha a autenticação e o acesso à instância ComfyUI no servidor; não exponha tokens do ComfyUI no frontend.
- No início da API, o administrador local é reconciliado com `ADMIN_EMAIL` e `ADMIN_PASSWORD` do `.env`. Atualize esses valores para trocar ou recuperar a senha administrativa; a alteração substitui as credenciais da única conta existente.
- A sessão expira em até 8 horas; desmarcar “Manter sessão neste navegador” usa um cookie de sessão.
- O cookie `Secure` é habilitado automaticamente quando `NODE_ENV=production`; em produção, publique a aplicação por HTTPS.
