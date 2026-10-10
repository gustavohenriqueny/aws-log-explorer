# Plano de Implementação — AWS Log Explorer

## Visão geral

Implementar a POC em incrementos verticais testáveis. Cada tarefa deve começar pelos testes ou contratos do comportamento, terminar integrada ao incremento anterior e ser marcada como concluída somente após executar as validações e demonstrar o fluxo indicado.

**Regras de execução:**

- Não usar AWS real nos testes automatizados.
- Não executar smoke tests AWS sem autorização explícita do usuário.
- Fixtures são fictícias e não contêm logs, pessoas, contas ou credenciais reais.
- Dependências diretas usam versões exatas e lockfiles.
- Não criar commit sem solicitação do usuário.
- Após cada checkpoint, corrigir falhas antes de avançar.

## Tasks

- [ ] 1. Criar o esqueleto reproduzível do projeto
  - [ ] 1.1 Criar estrutura raiz, `.gitignore`, `backend/`, `frontend/`, `e2e/`, `Makefile` e `scripts/dev.py`
    - Definir comandos `dev`, `setup`, `build`, `start`, `test`, `lint`, `typecheck` e o agregador `check`
    - `make dev` deve instalar ambientes ausentes exclusivamente pelos lockfiles e iniciar Backend/Vite; `scripts/dev.py` gera o token efêmero e coordena sinais
    - Ignorar `.venv`, `node_modules`, `dist`, caches, arquivos `.env`, outputs de teste e qualquer arquivo local da AWS
    - Não ignorar lockfiles nem componentes shadcn versionados
    - _Requirements: 1.1, 12.1, 12.2, 15.6, 15.8_

  - [ ] 1.2 Inicializar Backend FastAPI com Python suportado, Pydantic, configuração tipada e endpoint `GET /api/health`
    - Fixar dependências diretas e gerar lockfile
    - Ligar por default em `127.0.0.1`
    - Expor somente diagnóstico sanitizado
    - _Requirements: 1.1, 1.2, 1.3_

  - [ ] 1.3 Inicializar frontend React + TypeScript strict + Vite + Tailwind + shadcn/ui + Lucide
    - Criar `components.json`, aliases e tema claro/escuro com tokens semânticos
    - Adicionar somente componentes shadcn necessários ao primeiro fluxo: Button, Card, Badge, Alert, Skeleton e Sonner
    - Configurar Vitest, Testing Library e jsdom
    - _Requirements: 13.1, 13.2, 13.4, 15.3, 15.8_

  - [ ] 1.4 Criar `FakeAwsProvider` mínimo e uma página inicial que renderize health e profiles fictícios
    - Entregar primeiro corte ponta a ponta sem AWS CLI
    - Incluir banner explícito “Dados simulados” quando provider fake estiver ativo
    - _Requirements: 15.1, 15.2_

  - [ ] 1.5 Escrever testes do health, provider fake, renderização inicial e tema
    - **Demo:** iniciar localmente e visualizar health + profiles fictícios com shadcn/ui
    - _Requirements: 1.2, 13.4, 15.1, 15.3_

- [ ] 2. Implementar modelos, erros e executor AWS CLI seguro
  - [ ] 2.1 Criar modelos de domínio e `AwsProvider` conforme `design.md`
    - Profiles, session, cluster, service, log source, group page, normalized event, search e erros
    - Manter domínio independente de FastAPI e subprocessos
    - _Requirements: 5.5, 7.1, 7.3, 10.1, 15.1_

  - [ ] 2.2 Implementar `CommandPolicy` com operações tipadas e allowlist fechada
    - Builders separados por operação; nenhuma função aceita argv livre vindo de API
    - Proibir endpoint override, debug, no-verify-ssl e unmask
    - _Requirements: 11.1, 11.2, 11.4_

  - [ ] 2.3 Implementar `AllowedAwsCliRunner` com `asyncio.create_subprocess_exec`
    - Timeout, cancelamento, buffers limitados, drain de stdout/stderr e cleanup no shutdown
    - Aplicar defaults do design (5 s versão, 15 s STS, 20 s descoberta, 30 s logs e 300 s login), validar overrides nas faixas definidas e limitar retries ao deadline
    - Ambiente sanitizado e pager/auto-prompt desabilitados
    - _Requirements: 11.3, 11.4, 11.6, 14.3_

  - [ ] 2.4 Implementar classificação de erros e sanitização de stderr
    - Remover account IDs, ARNs, URLs SSO, caminhos home e tokens longos
    - Nunca retornar stderr bruto
    - _Requirements: 10.1, 10.2, 10.6_

  - [ ] 2.5 Escrever testes positivos de todos os comandos permitidos e negativos de operações de escrita
    - Incluir `ecs update-service`, `logs delete-log-group`, `--unmask`, `--endpoint-url` e comando arbitrário como casos rejeitados
    - Testar defaults, override válido, override fora da faixa, deadline de retry, timeout e cancelamento sem processo órfão
    - **Demo:** executar runner falso e exibir argv seguro gerado para uma operação fictícia
    - _Requirements: 11.1, 11.2, 11.3, 11.6, 11.7, 14.3_

- [ ] 3. Implementar profiles, sessão local e login SSO
  - [ ] 3.1 Implementar `AwsConfigReader`
    - Precedência `AWS_CONFIG_FILE` → `~/.aws/config`
    - Ler `[default]` e `[profile ...]`; região default `us-east-1`
    - Não ler credentials/cache e não retornar account ID, role ou URL
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ] 3.2 Implementar Local_Session_Token, validação de Host/Origin e middleware REST
    - Token aleatório no boot, comparação constante e rotação a cada processo
    - Cobrir modo integrado e contrato para script de desenvolvimento
    - _Requirements: 1.4, 1.5_

  - [ ] 3.3 Implementar session check via STS descartando payload de identidade
    - Mapear connected, expired, denied e error
    - _Requirements: 3.1, 3.2, 3.3_

  - [ ] 3.4 Implementar jobs de `aws sso login`
    - Um job por sso-session, status consultável, cancelamento e timeout
    - Não executar logout no shutdown
    - _Requirements: 3.4, 3.5, 3.6, 3.7, 3.8_

  - [ ] 3.5 Expor endpoints profiles/check/login/jobs com responses sanitizados
    - _Requirements: 2.2, 3.1, 3.4_

  - [ ] 3.6 Criar UI de profiles e login com Combobox/Command, Badge, Dialog, Alert e toasts
    - Estado conectado/expirado/negado, loading e retry
    - Classificar PROD pela regex definida no design; permitir apenas elevação manual em memória, nunca rebaixar match automático
    - Pesquisa por profile e badge PROD
    - _Requirements: 2.6, 2.7, 2.8, 3.2, 3.3, 3.6, 10.3, 12.4, 13.3, 13.8_

  - [ ] 3.7 Testar config moderna SSO, arquivo ausente, sessão expirada, login concorrente, cancelamento e segurança local
    - Provar que Local_Session_Token só chega pelo HTML integrado ou variável efêmera de processo e não aparece em API, URL, erro, log ou arquivo
    - Testar `prd`, `team-prod`, `production.us`, falso positivo `product-dev`, elevação manual e impossibilidade de rebaixar match automático
    - **Demo:** profile fictício expirado → Fazer login → conectado
    - _Requirements: 1.4, 1.5, 2.1–2.8, 3.1–3.8, 12.2, 12.4_

- [ ] 4. Implementar descoberta ECS e fontes `awslogs`
  - [ ] 4.1 Implementar listagem de clusters e services com paginação e cache em memória
    - `list-services` retorna `ServiceSummary` sem task definition/status; enriquecimento ocorre somente em `describe-services`
    - Cache por profile/região/cluster, TTL 60 s e invalidação adequada
    - _Requirements: 4.1, 4.2, 4.6, 4.7, 14.5_

  - [ ] 4.2 Implementar describe-services em lotes e deduplicação de task definitions
    - Preservar erros parciais
    - _Requirements: 4.4, 4.5_

  - [ ] 4.3 Implementar parser de containers `awslogs`
    - Extrair grupo, região e prefix; ignorar outros drivers
    - Criar `query_key` por `(region, log_group)`, mantendo descriptors separados de container/prefixo
    - Combinar candidatos de Shared_Log_Group e preencher `serviceCandidates`/`containerCandidates`
    - Registrar source IDs e query keys válidos na sessão local
    - _Requirements: 5.1–5.8_

  - [ ] 4.4 Criar endpoints clusters/services/resolve e validação contra recursos descobertos
    - _Requirements: 4.1–4.7, 11.5_

  - [ ] 4.5 Criar UI de cluster, múltiplos services e fontes
    - Combobox pesquisável, Checkbox, ScrollArea, Skeleton, estado vazio e aviso de grupo compartilhado
    - Em viewport estreito, usar Sheet
    - _Requirements: 4.1, 4.3, 4.7, 5.3–5.7, 13.3, 13.7, 13.8_

  - [ ] 4.6 Testar paginação, lotes, cache, vários containers, sem awslogs, grupo compartilhado e AccessDenied parcial
    - Incluir mesmo nome de grupo em regiões diferentes, múltiplos containers no mesmo `(region, group)`, prefixo ausente e contratos ServiceSummary/DescribedService
    - **Demo:** selecionar dois services fictícios e revisar fontes deduplicadas
    - _Requirements: 4.1–4.7, 5.1–5.8_

- [ ] 5. Implementar consulta histórica de uma fonte
  - [ ] 5.1 Implementar `filter_log_events` no `AwsCliProvider`
    - Query única por `(region, log_group)`, janela, filtro e `--max-items 500`; descritores de fonte não duplicam chamada
    - Interpretar eventos e token de continuação de forma compatível com a versão suportada do CLI
    - _Requirements: 5.5–5.8, 6.1, 6.4, 6.6, 6.7, 6.8_

  - [ ] 5.2 Implementar validação de SearchRequest e normalização de eventos
    - Janela máxima 24 h, source ID validado e preservação de texto/multilinha
    - Parse JSON opcional em memória
    - _Requirements: 6.2, 6.3, 7.1, 7.5, 7.6_

  - [ ] 5.3 Implementar `CursorStore` opaco com TTL e fingerprint
    - Continuação não pode trocar profile, janela, fontes ou filtro
    - _Requirements: 6.4, 6.5, 6.6, 14.5_

  - [ ] 5.4 Expor `POST /api/logs/search`
    - Retornar events, cursor, hasMore, truncated, partialErrors e ordering
    - _Requirements: 6.1–6.8, 7.7_

  - [ ] 5.5 Criar UI de histórico
    - Tabs, presets, intervalo customizado, filter pattern, botão Buscar e Carregar mais
    - Exigir confirmação para janela de 24 h ou seleção com 10 query keys; cancelar não pode chamar o Backend
    - Exibir quantidade de query keys e eventos carregados sem telemetria externa
    - Timeline inicial com timestamp, origem, grupo e mensagem
    - _Requirements: 6.2, 6.3, 9.1, 9.6, 13.3, 14.6, 14.7_

  - [ ] 5.6 Testar página vazia com token, cursor válido/expirado, mensagens JSON/texto/multilinha e validações
    - Testar confirmação/cancelamento para 24 h e 10 query keys, ausência de chamada no cancelamento e contadores sem telemetria
    - **Demo:** consultar uma fonte fictícia na última hora e carregar a segunda página
    - _Requirements: 6.1–6.8, 7.1, 7.5, 7.6, 14.6, 14.7_

- [ ] 6. Implementar agregação histórica de múltiplas fontes
  - [ ] 6.1 Implementar fan-out com semáforo de concorrência 4 e cap de 10 query keys `(region, log_group)`
    - _Requirements: 5.8, 14.1, 14.2_

  - [ ] 6.2 Implementar merge determinístico e deduplicação por event ID
    - Ordenar timestamp → ingestionTime → eventId
    - _Requirements: 7.1, 7.2_

  - [ ] 6.3 Implementar atribuição segura da origem e erros parciais
    - Fazer match somente por descriptor único `<stream_prefix>/<container>/`; Shared groups ambíguos usam `serviceCandidates` e `containerCandidates`
    - Nunca inferir service/container exato quando prefixo estiver ausente ou houver múltiplos matches
    - _Requirements: 5.6, 5.7, 7.3, 7.4, 7.7_

  - [ ] 6.4 Evoluir timeline para múltiplas origens
    - Tokens acessíveis e estáveis por origem, Badge textual, Tooltip e aviso de ordenação aproximada
    - Busca local sem AWS, JSON/raw, expansão e cópia com toast
    - _Requirements: 9.1–9.6, 13.5, 13.6_

  - [ ] 6.5 Adicionar virtualização ou janela visual limitada
    - Provar responsividade com pelo menos 5.000 eventos fictícios
    - _Requirements: 9.7, 14.5_

  - [ ] 6.6 Testar timestamps iguais, duplicatas, grupo compartilhado, falha parcial, limite de query keys e pesquisa local
    - Incluir grupo de mesmo nome em regiões diferentes, dois containers no mesmo grupo, match único de prefixo, prefixo ausente e match ambíguo
    - **Demo:** timeline agregada de dois services, incluindo uma fonte compartilhada e um erro parcial
    - _Requirements: 5.5–5.8, 7.1–7.7, 9.1–9.8_

- [ ] 7. Implementar acompanhamento quase em tempo real
  - [ ] 7.1 Implementar protocolo WebSocket autenticado e validação de Origin/token
    - Frames start, event, status, warning, dropped, error, stop
    - _Requirements: 1.5, 8.1_

  - [ ] 7.2 Implementar LiveService com polling de 5 s, overlap de 2 s e dedupe LRU
    - Clock e sleep injetáveis para testes
    - _Requirements: 8.2, 8.3_

  - [ ] 7.3 Implementar backoff/jitter, heartbeat, caps e encerramento
    - Dedupe 20.000 IDs, buffer 10.000 eventos, máximo 3 sessões locais
    - Cancelar em stop, disconnect e shutdown
    - _Requirements: 8.5–8.8, 14.4, 14.5_

  - [ ] 7.4 Criar UI live
    - Start/stop, estado, intervalo/backoff atual, número de query keys e eventos, pause auto-scroll, contador de novos, dropped e erro de auth
    - Manter métricas somente em memória, sem telemetria externa
    - Reutilizar timeline histórica
    - _Requirements: 8.1, 8.4–8.8, 9.6, 14.7_

  - [ ] 7.5 Testar overlap, duplicata, atraso de ingestão, throttling, expiração, disconnect e shutdown
    - Incluir query keys em regiões distintas, múltiplos containers no grupo e prefixo ausente/ambíguo
    - Verificar métricas locais sem transmissão externa e registry com zero tasks/processos após cada cenário
    - **Demo:** iniciar live fake, receber eventos, pausar, retomar e parar
    - _Requirements: 5.5–5.8, 8.1–8.8, 11.6, 14.7_

- [ ] 8. Endurecer UX, acessibilidade, privacidade e resiliência
  - [ ] 8.1 Completar componentes shadcn necessários
    - Input, Dialog/AlertDialog, Tooltip, Tabs, Checkbox, Popover, Command, ScrollArea, DropdownMenu, Sheet, Collapsible/Accordion e Sonner
    - Remover componentes gerados que não forem usados
    - _Requirements: 13.2, 13.3_

  - [ ] 8.2 Implementar tema, tokens de origem/nível, responsividade e navegação por teclado
    - Tema inicial segue sistema; foco e contraste WCAG AA
    - _Requirements: 13.4–13.8_

  - [ ] 8.3 Implementar confirmação persistente para Profile de produção
    - Uma confirmação antes da primeira consulta por sessão local; badge PROD sempre visível
    - _Requirements: 12.4_

  - [ ] 8.4 Auditar ausência de persistência e logging sensível
    - Nenhum evento em local/session storage, arquivos, snapshots ou logs
    - Limpar caches e buffers no shutdown
    - _Requirements: 12.1, 12.2, 12.6_

  - [ ] 8.5 Completar estados vazios, loading, parcial, error e ações contextuais
    - Agrupar erros, máximo cinco notificações, detalhes expansíveis sanitizados
    - _Requirements: 10.3–10.5, 13.8_

  - [ ] 8.6 Adicionar testes de acessibilidade, teclado, temas, 5.000 eventos, produção e ausência de Web Storage
    - **Demo:** realizar investigação completa em tema claro/escuro e viewport estreito
    - _Requirements: 9.7, 12.1–12.6, 13.4–13.8_

- [ ] 9. Integrar build, E2E e documentação de execução
  - [ ] 9.1 Servir frontend compilado pelo FastAPI com fallback SPA e token injetado
    - Falhar claramente se build estiver ausente no modo integrado
    - _Requirements: 1.4, 15.5_

  - [ ] 9.2 Implementar `scripts/dev.py` e o target canônico `make dev`
    - `make dev` prepara dependências ausentes pelos lockfiles e inicia Backend/Vite; `make setup` apenas prepara
    - Compartilhar token efêmero somente por variáveis dos processos filhos, sem gravá-lo em `.env`, arquivo, URL ou log
    - Encerrar ambos os processos ao receber sinal
    - _Requirements: 1.4, 11.6, 12.2, 15.6_

  - [ ] 9.3 Criar suíte E2E com provider fake
    - Fluxo profile → login → cluster → dois services → histórico → load more → live → pause → stop
    - _Requirements: 15.1–15.4_

  - [ ] 9.4 Atualizar README com pré-requisitos, instalação, comandos, troubleshooting e limitações comprovadas
    - Manter aviso de não persistência e smoke opt-in
    - _Requirements: 15.6, 15.7_

  - [ ] 9.5 Implementar e executar `make check` como gate único
    - O target deve rodar testes backend, frontend, E2E fake, lint, typecheck e build limpo, falhando no primeiro erro
    - Corrigir todas as falhas e também provar que os comandos individuais continuam disponíveis para feedback rápido
    - **Checkpoint:** um segundo processo/sessão deve conseguir seguir o README sem contexto oral
    - _Requirements: 15.3–15.6, 15.8_

- [ ] 10. Auditar segurança e realizar smoke test opt-in
  - [ ] 10.1 Executar busca estática por APIs proibidas e operações AWS de escrita
    - Falhar se encontrar shell, unmask, no-verify-ssl, endpoint-url ou operação não allowlisted fora de docs/testes negativos
    - _Requirements: 11.1–11.7_

  - [ ] 10.2 Provar cancelamento e cleanup sob timeout, WebSocket disconnect e shutdown
    - Registry final deve conter zero processos e zero live tasks
    - _Requirements: 3.8, 8.5, 11.6, 12.6_

  - [ ] 10.3 Verificar que artefatos de testes/build não contêm mensagens de fixtures marcadas como sensíveis
    - Usar canary fictício e buscar no workspace após as suítes
    - _Requirements: 12.1–12.3_

  - [ ] 10.4 Solicitar autorização explícita antes de qualquer smoke AWS
    - Sem autorização, registrar como não executado e não bloquear as suítes fake
    - _Requirements: 15.7_

  - [ ] 10.5 Após autorização, executar smoke estritamente somente leitura começando em `dev`
    - Validar CLI, profiles sanitizados, sessão, clusters, services e resolução de fontes
    - Consulta de mensagens somente com nova confirmação, janela/limite mínimos e sem salvar output
    - Não consultar produção sem confirmação específica
    - _Requirements: 11.1, 12.1, 15.7_

  - [ ] 10.6 Realizar avaliação com 2–3 integrantes e registrar somente feedback não sensível no README
    - Critérios: iniciar, login, selecionar services, histórico, live e stop
    - **Demo final:** fluxo completo sem Console AWS e sem processos órfãos
    - _Requirements: 15.6, 15.7_
