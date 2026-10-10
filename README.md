# AWS Log Explorer

POC web local para investigar logs de serviços ECS sem alternar entre os consoles ECS e CloudWatch. O backend FastAPI fica restrito a `127.0.0.1`; a UI é React/Vite com Tailwind e componentes shadcn/ui versionados. A integração de produção é exclusivamente AWS CLI v2 por subprocessos sem shell, atrás de uma allowlist fechada.

## Segurança e privacidade

- Somente estas operações são implementadas: versão da CLI, `sts get-caller-identity`, `sso login`, descoberta ECS e `logs filter-log-events`.
- Não há comando arbitrário, escrita AWS, `--unmask`, endpoint customizado, debug ou desativação de TLS.
- Logs, tokens, credenciais, STS bruto e cache SSO não são persistidos. A aplicação não lê `~/.aws/credentials` nem o cache SSO.
- Todos os testes e a demonstração fake usam dados fictícios. A suíte padrão não chama AWS.
- O token local é aleatório por processo e transmitido apenas entre processos/HTML controlado; não vai para URL, arquivos ou logs.

## Pré-requisitos

- Python 3.12
- [uv](https://docs.astral.sh/uv/)
- Node.js 24+ e npm
- AWS CLI v2 apenas para uso com o provider real

## Início rápido

```bash
make dev
```

O comando instala apenas pelas lockfiles quando necessário e inicia FastAPI em `127.0.0.1:8000` e Vite em `127.0.0.1:5173`. Por padrão o provider é `cli`, mas nenhuma chamada AWS é emitida até uma ação de sessão/descoberta na UI. Para uma demonstração totalmente offline com profiles, ECS e eventos fictícios:

```bash
ALE_PROVIDER=fake make dev
```

Nesse modo, o backend usa profiles, ECS e eventos fictícios somente em memória; ele não lê configuração, credenciais ou cache AWS locais.

Use `Ctrl+C` para encerrar ambos os processos filhos. O token efêmero não é impresso nem escrito em disco.

## Comandos

| Comando | Finalidade |
| --- | --- |
| `make setup` | Instala ambientes a partir de `backend/uv.lock` e `frontend/package-lock.json`. |
| `make dev` | Prepara dependências ausentes e inicia backend + Vite. |
| `make build` | Compila a SPA em `frontend/dist`. |
| `make start` | Serve a SPA compilada pelo FastAPI local. |
| `make test` | Testes backend, frontend e E2E com provider fake. |
| `make lint` / `make typecheck` | Verificações rápidas por pacote. |
| `make check` | Gate completo: testes fake, lint, tipos, build e auditoria estática de shell proibido. |
| `make smoke` | Deliberadamente falha: smoke AWS exige autorização explícita e não faz parte da POC automatizada. |

## Fluxos entregues

1. Seleção de profile, diagnóstico local, indicação SSO/PROD e login SSO com job cancelável.
2. Clusters, serviços múltiplos e resolução de containers `awslogs`, incluindo grupos compartilhados e origem ambígua.
3. Busca histórica em até 10 chaves `(região, log group)`, paginação opaca, merge/deduplicação, erros parciais e timeline local pesquisável.
4. Acompanhamento por WebSocket e polling estruturado de cinco segundos, dedupe, pausa visual e parada/cancelamento.

A ordenação entre log groups é aproximada. Grupos compartilhados preservam candidatos de serviço/contêiner em vez de afirmar uma origem que não pode ser comprovada.

## Uso do provider AWS CLI

O app descobre somente nomes de profiles e metadados sanitizados em `AWS_CONFIG_FILE` ou `~/.aws/config`; não exibe account ID, role nem URL SSO. Uma consulta requer profile e recursos já descobertos na sessão local. Profiles cujo nome contém os segmentos `prod`, `prd` ou `production` recebem badge `PROD` e confirmação antes da primeira consulta.

Antes de qualquer smoke AWS real, obtenha autorização explícita. O escopo permitido é somente leitura, começa em desenvolvimento e não deve salvar outputs de logs.

## Limitações do MVP

Não há Logs Insights, X-Ray, persistência, exportação, multi-região simultânea, correlação automática ou Live Tail nativo. O máximo é dez log groups por busca/live e quatro consultas de logs concorrentes. Eventos e métricas são somente memória e são descartados no encerramento.
