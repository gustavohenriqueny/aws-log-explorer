# Requirements Document — AWS Log Explorer

## Introdução

Aplicação web local para investigação de logs de serviços executados em Amazon ECS. A ferramenta reduz a navegação manual entre ECS e CloudWatch, usa exclusivamente os profiles e permissões AWS já presentes na máquina do desenvolvedor e apresenta logs históricos ou novos eventos de múltiplos serviços em uma timeline única.

A POC não cria credenciais, não amplia permissões e não persiste conteúdo dos logs. A integração inicial usa AWS CLI v2 e deve permanecer isolada atrás de uma abstração substituível por SDK.

## Glossário

- **App**: conjunto formado pelo Backend local e pela UI executada no browser
- **Backend**: API FastAPI ligada somente a `127.0.0.1`
- **UI**: SPA React + TypeScript + Vite baseada em shadcn/ui
- **AWS_CLI**: executável AWS CLI v2 instalado na máquina do usuário
- **AWS_Config**: arquivo indicado por `AWS_CONFIG_FILE` ou, na ausência da variável, `~/.aws/config`
- **Profile**: profile nomeado do AWS CLI, com região e forma de autenticação próprias
- **SSO_Session**: sessão do AWS IAM Identity Center associada a um ou mais profiles
- **Cluster**: cluster Amazon ECS visível ao Profile
- **Service**: service Amazon ECS pertencente a um Cluster
- **Log_Source**: combinação descoberta de Service, task definition, container, log group, região e stream prefix configurada com driver `awslogs`
- **Shared_Log_Group**: log group associado a mais de um Service selecionado, sem atribuição inequívoca de cada evento
- **Historical_Search**: consulta de eventos em janela fechada por `filter-log-events`
- **Live_Session**: acompanhamento quase em tempo real feito por polling repetido de `filter-log-events`
- **Normalized_Log_Event**: representação comum de evento retornada pelo Backend
- **Provider**: interface interna `AwsProvider`; no MVP, implementada por `AwsCliProvider`
- **Local_Session_Token**: segredo efêmero gerado no boot do Backend para impedir que páginas externas usem a API local
- **Production_Profile**: profile classificado automaticamente pelo padrão conservador de nome ou elevado manualmente pelo usuário somente durante a sessão local

## Requirements

### Requirement 1: Inicialização e diagnóstico local

**User Story:** Como desenvolvedor, quero iniciar a POC localmente e receber um diagnóstico claro das dependências, para que eu saiba se a máquina está pronta para consultar a AWS.

#### Acceptance Criteria

1. WHEN o App é iniciado, THE Backend SHALL ligar exclusivamente em `127.0.0.1` e rejeitar bind público por configuração do MVP
2. WHEN `GET /api/health` é chamado, THE Backend SHALL informar o estado do processo, a disponibilidade do AWS_CLI e sua versão principal, sem retornar credenciais, account IDs ou tokens
3. IF o AWS_CLI não estiver instalado ou não for versão 2, THEN THE App SHALL exibir `CLI_MISSING` ou `CLI_UNSUPPORTED` com orientação de correção e desabilitar operações AWS
4. WHEN o frontend de produção é servido pelo Backend, THE Backend SHALL injetar um Local_Session_Token efêmero no HTML e exigir o token em todas as rotas `/api` e conexões WebSocket, exceto health
5. IF a origem, host ou Local_Session_Token de uma chamada não for válido, THEN THE Backend SHALL rejeitar a chamada sem executar subprocesso AWS

### Requirement 2: Descoberta de profiles

**User Story:** Como desenvolvedor, quero visualizar os profiles AWS configurados na minha máquina, para que eu use o ambiente e as permissões que já possuo.

#### Acceptance Criteria

1. WHEN a UI solicita profiles, THE Backend SHALL ler primeiro o caminho definido por `AWS_CONFIG_FILE` e, quando ausente, SHALL usar `~/.aws/config`
2. WHEN o AWS_Config contém seções `[default]` ou `[profile <nome>]`, THE Backend SHALL retornar os nomes, a região configurada e a presença de configuração SSO, sem retornar `sso_start_url`, account ID ou role name
3. IF um Profile não possuir região, THEN THE Backend SHALL aplicar `us-east-1` como default e marcar a origem do valor como `default`
4. IF o AWS_Config não existir, estiver ilegível ou for inválido, THEN THE Backend SHALL retornar erro `AWS_CONFIG_INVALID` com caminho sanitizado e orientação, sem criar ou alterar o arquivo
5. THE Backend SHALL NOT ler nem expor o arquivo `~/.aws/credentials` ou arquivos do cache SSO
6. WHEN profiles são exibidos, THE UI SHALL permitir pesquisa por nome e indicar região, tipo SSO quando conhecido e ambiente de produção quando aplicável
7. THE Backend SHALL classificar automaticamente como Production_Profile nomes que correspondam, sem diferenciar maiúsculas, a `prod`, `prd` ou `production` como segmento delimitado por início/fim, hífen, underscore ou ponto
8. WHEN um Profile não for classificado automaticamente, THE UI MAY permitir marcá-lo como produção somente para a sessão local; essa marcação SHALL apenas elevar a proteção e SHALL NOT permitir remover uma classificação automática

### Requirement 3: Estado da sessão e login SSO

**User Story:** Como desenvolvedor, quero verificar e renovar minha sessão SSO pela interface, para que eu não precise alternar para o terminal.

#### Acceptance Criteria

1. WHEN um Profile é selecionado, THE Backend SHALL verificar a sessão com `aws sts get-caller-identity --profile <profile> --region <region>` e descartar o payload de identidade após classificar o resultado
2. WHEN a verificação for bem-sucedida, THE UI SHALL exibir o Profile como conectado sem mostrar account ID, ARN ou user ID
3. IF a sessão estiver ausente ou expirada, THEN THE UI SHALL exibir estado `AUTH_EXPIRED` e ação explícita **Fazer login**
4. WHEN o usuário confirma **Fazer login**, THE Backend SHALL executar `aws sso login --profile <profile>` sem shell e acompanhar o job até sucesso, falha, cancelamento ou timeout
5. WHILE um login estiver ativo para uma SSO_Session, THE Backend SHALL impedir outro login concorrente para a mesma sessão
6. WHEN o login termina com sucesso, THE Backend SHALL verificar novamente a sessão e THE UI SHALL atualizar o estado para conectado
7. IF o Profile não utilizar SSO, THEN THE Backend SHALL rejeitar a tentativa com `PROFILE_NOT_SSO` e não executar comando alternativo de autenticação
8. WHEN o Backend é encerrado, THE Backend SHALL cancelar jobs de login ainda ativos sem executar `aws sso logout`

### Requirement 4: Navegação ECS

**User Story:** Como desenvolvedor, quero navegar por clusters e services acessíveis ao profile, para que eu encontre os serviços sem conhecer nomes de recursos previamente.

#### Acceptance Criteria

1. WHEN um Profile conectado é selecionado, THE UI SHALL permitir listar os Clusters da região ativa
2. WHEN um Cluster é selecionado, THE UI SHALL permitir listar todos os Services visíveis, respeitando paginação do AWS_CLI
3. WHEN o usuário pesquisa Services, THE UI SHALL filtrar a lista já carregada por nome sem emitir uma chamada AWS a cada tecla
4. WHEN um ou mais Services são selecionados, THE Backend SHALL descrever os services em lotes compatíveis com a API ECS e obter as task definitions associadas
5. IF uma operação de descoberta for negada para um recurso, THEN THE App SHALL exibir erro parcial por recurso e preservar recursos carregados com sucesso
6. WHILE dados de descoberta estiverem dentro do TTL configurado, THE Backend SHALL reutilizar cache somente em memória por Profile, região e recurso
7. WHEN o Profile ou região muda, THE UI SHALL limpar Cluster, Services e Log_Sources selecionados anteriormente

### Requirement 5: Descoberta e seleção das fontes de log

**User Story:** Como desenvolvedor, quero visualizar containers e log groups associados aos services, para que eu consulte somente as fontes relevantes.

#### Acceptance Criteria

1. WHEN task definitions são descritas, THE Backend SHALL considerar somente container definitions cujo `logDriver` seja `awslogs`
2. WHEN uma configuração `awslogs` é encontrada, THE Backend SHALL extrair container, `awslogs-group`, `awslogs-region` e `awslogs-stream-prefix`, preservando ausência de campos opcionais
3. WHEN Log_Sources são retornadas, THE UI SHALL agrupá-las por Service e permitir seleção individual por container/log group
4. IF um Service não possuir container com `awslogs`, THEN THE UI SHALL mostrar estado informativo sem tratar o Service como falha global
5. WHEN o mesmo par `(awslogs-region, awslogs-group)` é associado a mais de um Service ou container selecionado, THE Backend SHALL consultar esse par uma única vez, marcar as fontes como compartilhadas e preencher `serviceCandidates` e `containerCandidates`
6. WHEN `awslogs-stream-prefix` e o nome do container identificarem unicamente uma fonte pelo formato de stream esperado, THE Backend MAY atribuir o evento a essa fonte; IF a atribuição for ausente ou ambígua, THEN THE Backend SHALL deixar `service` e `container` ausentes e preservar os candidatos
7. THE App SHALL NOT afirmar que um evento pertence a um Service ou container específico quando a associação for ambígua
8. THE App SHALL limitar uma consulta ou Live_Session a no máximo 10 chaves únicas `(região, log group)` no MVP

### Requirement 6: Consulta histórica

**User Story:** Como desenvolvedor, quero consultar logs de um período e aplicar filtros, para que eu localize rapidamente onde uma falha ocorreu.

#### Acceptance Criteria

1. WHEN o usuário escolhe período, Log_Sources e filtro opcional, THE Backend SHALL executar `aws logs filter-log-events` uma vez por chave única `(região, log group)` com profile, início, fim e limite explícitos
2. THE UI SHALL oferecer presets de 15 minutos, 1 hora, 6 horas e 24 horas, além de intervalo customizado válido
3. IF o início não for anterior ao fim, a janela exceder 24 horas no MVP ou não houver Log_Source selecionada, THEN THE Backend SHALL retornar `VALIDATION_ERROR` antes de executar AWS_CLI
4. WHEN a resposta possui token de continuação, THE Backend SHALL armazenar o estado em memória e retornar cursor opaco com expiração
5. WHEN o usuário solicita **Carregar mais**, THE Backend SHALL continuar cada grupo pelo token correspondente e SHALL NOT reiniciar silenciosamente a consulta
6. WHEN uma página AWS vier vazia com token de continuação, THE Backend SHALL preservar a possibilidade de continuação
7. THE Backend SHALL usar no máximo 500 eventos por grupo por página e 5.000 eventos normalizados por resposta
8. THE App SHALL NOT oferecer opção `--unmask` nem retornar conteúdo não mascarado por política do CloudWatch

### Requirement 7: Agregação e normalização

**User Story:** Como desenvolvedor, quero ver eventos de vários serviços em uma timeline única, para que eu entenda a sequência aproximada de uma falha distribuída.

#### Acceptance Criteria

1. WHEN resultados de vários grupos são recebidos, THE Backend SHALL convertê-los em Normalized_Log_Event e ordenar por `timestamp`, `ingestionTime` e `eventId`
2. WHEN o mesmo `eventId` aparecer mais de uma vez, THE Backend SHALL retornar somente uma ocorrência
3. WHEN um evento vier de Shared_Log_Group, THE Backend SHALL preencher `serviceCandidates` e `containerCandidates` e SHALL deixar `service` ou `container` ausente quando não houver atribuição inequívoca
4. IF uma fonte falhar e outra tiver sucesso, THEN THE Backend SHALL retornar eventos válidos e uma lista `partialErrors` em vez de falhar toda a consulta
5. WHEN mensagens forem JSON válido, THE Backend SHALL manter a mensagem original e MAY adicionar `parsedMessage` somente em memória na resposta
6. THE Backend SHALL preservar mensagens texto e multilinha sem truncar silenciosamente; IF um limite visual for aplicado, THEN THE UI SHALL indicar truncamento e permitir expansão
7. THE UI SHALL comunicar que a ordenação entre diferentes log groups é aproximada

### Requirement 8: Acompanhamento quase em tempo real

**User Story:** Como desenvolvedor, quero acompanhar novos eventos de vários serviços, para que eu observe uma falha enquanto a reproduzo.

#### Acceptance Criteria

1. WHEN o usuário inicia acompanhamento, THE UI SHALL abrir WebSocket autenticado e enviar Profile, região, Log_Sources e filter pattern validados
2. WHILE a Live_Session estiver ativa, THE Backend SHALL consultar cada log group em intervalo entre 3 e 5 segundos, com concorrência limitada e sobreposição temporal
3. WHEN eventos repetidos forem retornados pela sobreposição, THE Backend SHALL deduplicá-los por `eventId` usando estrutura limitada em memória
4. WHEN o usuário pausa a visualização, THE UI SHALL parar auto-scroll sem interromper a coleta e SHALL indicar a quantidade de eventos pendentes
5. WHEN o usuário aciona **Parar**, fecha a aba, perde a conexão ou o Backend encerra, THE Backend SHALL cancelar todas as tarefas relacionadas à Live_Session
6. IF houver throttling, THEN THE Backend SHALL aplicar backoff com jitter, emitir aviso de estado e não abrir consultas concorrentes adicionais
7. IF a sessão AWS expirar durante o acompanhamento, THEN THE Backend SHALL encerrar a Live_Session com `AUTH_EXPIRED` e THE UI SHALL oferecer novo login
8. THE Backend SHALL limitar o buffer da Live_Session a 10.000 eventos e informar quando eventos antigos forem descartados

### Requirement 9: Timeline e ferramentas de investigação

**User Story:** Como desenvolvedor, quero uma timeline legível e pesquisável, para que eu inspecione grandes volumes sem perder a origem de cada evento.

#### Acceptance Criteria

1. WHEN eventos são exibidos, THE UI SHALL mostrar timestamp, origem conhecida ou candidatos, container, log group e mensagem
2. THE UI SHALL atribuir cores estáveis e acessíveis às origens, sem depender somente de cor para identificação
3. WHEN uma mensagem for JSON válido, THE UI SHALL oferecer visualização formatada e acesso ao conteúdo original
4. WHEN o usuário pesquisa localmente, THE UI SHALL filtrar somente eventos já carregados sem emitir nova consulta AWS
5. WHEN o usuário copia uma mensagem, THE UI SHALL copiar apenas o evento escolhido e exibir confirmação por toast
6. THE UI SHALL exibir contadores de eventos, fontes, erros parciais, resultado truncado e estado do acompanhamento
7. WHILE milhares de eventos estiverem carregados, THE UI SHALL manter navegação responsiva por virtualização ou janela visual limitada
8. THE UI SHALL manter eventos apenas em memória e SHALL limpar os dados ao recarregar ou fechar a aba

### Requirement 10: Tratamento de erros

**User Story:** Como desenvolvedor, quero mensagens de erro acionáveis, para que eu diferencie autenticação, permissão, configuração e limites da AWS.

#### Acceptance Criteria

1. WHEN o AWS_CLI termina com erro, THE Backend SHALL mapear o resultado para um dos códigos: `CLI_MISSING`, `CLI_UNSUPPORTED`, `AWS_CONFIG_INVALID`, `AUTH_EXPIRED`, `PROFILE_NOT_SSO`, `ACCESS_DENIED`, `NOT_FOUND`, `THROTTLED`, `TIMEOUT`, `CANCELLED`, `VALIDATION_ERROR` ou `UNKNOWN_AWS_ERROR`
2. THE Backend SHALL sanitizar stderr antes de retorná-lo, removendo account IDs, ARNs, URLs SSO, caminhos de usuário e possíveis tokens
3. WHEN um erro recuperável ocorre, THE UI SHALL apresentar ação contextual como **Tentar novamente**, **Fazer login** ou **Recarregar recursos**
4. IF erros iguais ocorrerem em várias fontes, THEN THE UI SHALL agrupá-los por código e mostrar a quantidade
5. THE UI SHALL exibir no máximo cinco notificações simultâneas e manter detalhes técnicos em seção expansível
6. THE App SHALL registrar somente metadados operacionais locais em nível de desenvolvimento e SHALL NOT registrar mensagens dos logs ou outputs brutos de identidade

### Requirement 11: Superfície AWS estritamente limitada

**User Story:** Como responsável técnico, quero garantir que a ferramenta não modifique recursos AWS, para que profiles amplos não transformem a POC em risco operacional.

#### Acceptance Criteria

1. THE executor SHALL aceitar somente combinações allowlisted de serviço e operação: `--version`, `sts get-caller-identity`, `sso login`, `ecs list-clusters`, `ecs list-services`, `ecs describe-services`, `ecs describe-task-definition` e `logs filter-log-events`
2. IF qualquer outro serviço, operação ou flag proibida for solicitada internamente, THEN THE executor SHALL falhar com `COMMAND_NOT_ALLOWED` antes de criar subprocesso
3. THE executor SHALL usar `asyncio.create_subprocess_exec()` com argumentos separados e SHALL NOT usar `shell=True`, `create_subprocess_shell`, `os.system` ou equivalentes
4. THE executor SHALL sempre desabilitar pager e auto-prompt nas consultas estruturadas e solicitar JSON
5. THE Backend SHALL validar Profile contra a lista descoberta e recursos contra resultados previamente descobertos na Local_Session_Token corrente
6. THE executor SHALL aplicar timeout e cancelamento, drenar stdout/stderr sem deadlock e encerrar processo filho ao finalizar o Backend
7. Automated tests SHALL inspecionar a allowlist e provar que operações de escrita representativas são rejeitadas

### Requirement 12: Privacidade e ausência de persistência

**User Story:** Como responsável por compliance, quero impedir cópias locais não inventariadas de logs e credenciais, para que a POC não aumente exposição de dados financeiros ou pessoais.

#### Acceptance Criteria

1. THE App SHALL NOT persistir mensagens de log em arquivo, banco, cache em disco, localStorage, sessionStorage, telemetria ou relatório de testes
2. THE App SHALL NOT persistir credenciais AWS, tokens SSO, Local_Session_Token ou outputs completos de STS, e SHALL NOT retornar esses valores em payloads de API, erros, logs ou URLs; o Local_Session_Token MAY ser entregue exclusivamente pelo bootstrap controlado no HTML integrado ou por variável efêmera de processo no modo de desenvolvimento
3. WHEN testes precisarem de eventos, THE test suite SHALL usar somente fixtures fictícias sem CPF, CNPJ, dados bancários, e-mails reais ou identificadores de contas AWS reais
4. WHEN o Profile for classificado como produção, THE UI SHALL exibir indicação visual persistente `PROD` e confirmação antes da primeira consulta de logs da sessão local
5. THE App SHALL respeitar mascaramento já aplicado pelo CloudWatch e SHALL NOT fornecer mecanismo para removê-lo
6. WHEN o processo é encerrado, THE Backend SHALL descartar caches, cursores, buffers e jobs mantidos em memória

### Requirement 13: Design system e acessibilidade

**User Story:** Como desenvolvedor, quero uma interface consistente e acessível baseada em shadcn/ui, para que a investigação seja rápida e confortável.

#### Acceptance Criteria

1. THE UI SHALL usar React, TypeScript strict, Vite, Tailwind CSS, shadcn/ui e ícones Lucide
2. THE UI SHALL versionar no projeto os componentes adicionados pelo CLI do shadcn/ui
3. THE UI SHALL usar componentes shadcn/ui como base para botões, cards, badges, comboboxes, command palette, checkboxes, tabs, inputs, dialogs, tooltips, skeletons, alerts, scroll areas, dropdowns, sheets e toasts quando esses padrões forem necessários
4. THE UI SHALL oferecer tema claro e escuro baseado em variáveis CSS semânticas do shadcn/ui e respeitar preferência do sistema na primeira carga
5. THE UI SHALL manter contraste WCAG AA, foco visível, labels acessíveis e operação por teclado nos fluxos principais
6. THE UI SHALL utilizar tokens adicionais para serviços e níveis de log sem sobrescrever tokens semânticos do tema
7. IF a largura for inferior a 1024 px, THEN THE UI SHALL mover filtros/fontes para Sheet ou layout empilhado sem perda funcional
8. THE UI SHALL diferenciar estados loading, vazio, erro, parcial, conectado, expirado e ao vivo sem depender apenas de cor

### Requirement 14: Controle de carga e resiliência

**User Story:** Como usuário e responsável pela conta AWS, quero que a ferramenta limite chamadas e memória, para que uma investigação não cause throttling ou consumo descontrolado.

#### Acceptance Criteria

1. THE Backend SHALL limitar concorrência de consultas de log a quatro subprocessos por usuário local
2. THE Backend SHALL limitar o MVP a 10 chaves únicas `(região, log group)` por pesquisa ou Live_Session
3. THE Backend SHALL aplicar timeout configurável com defaults conservadores a comandos de descoberta e logs
4. WHEN `THROTTLED` ocorrer, THE Backend SHALL aplicar retry limitado com backoff e jitter, respeitando cancelamento
5. THE Backend SHALL manter caches de descoberta, cursores e buffers com TTL e tamanho máximos explícitos
6. THE UI SHALL exigir confirmação para janela de 24 horas ou seleção que alcance o limite de 10 chaves `(região, log group)`, e o cancelamento SHALL impedir qualquer chamada AWS
7. THE App SHALL exibir métricas locais de quantidade de grupos, eventos carregados e intervalo de polling, sem enviar telemetria externa

### Requirement 15: Testabilidade, build e handoff

**User Story:** Como mantenedor da POC, quero execução reproduzível e testes sem dependência da AWS, para que o time evolua a ferramenta com segurança.

#### Acceptance Criteria

1. THE Backend SHALL disponibilizar `FakeAwsProvider` e runner falso para testes unitários e de integração
2. Automated tests SHALL NOT acessar AWS real, ler credentials reais ou depender de sessão SSO ativa
3. THE frontend SHALL usar Vitest, Testing Library e MSW ou fake equivalente para testar fluxos sem Backend/AWS reais
4. THE repository SHALL fornecer testes backend, frontend e E2E para o fluxo profile → service → fontes → histórico → live → stop
5. WHEN o frontend é compilado, THE Backend SHALL servir os artefatos estáticos e fallback SPA no mesmo endereço local
6. THE repository SHALL oferecer `make dev` como comando canônico para preparar dependências ausentes e iniciar o desenvolvimento, e `make check` como agregador único de testes backend/frontend/E2E fake, lint, typecheck e build
7. Smoke tests com AWS real SHALL ser opt-in, somente leitura, começar em `dev`, não gravar outputs de logs e exigir autorização explícita do usuário
8. THE repository SHALL fixar versões diretas de dependências e versionar os lockfiles correspondentes
