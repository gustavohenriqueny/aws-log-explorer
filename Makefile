.PHONY: setup dev build start test backend-test frontend-test e2e lint typecheck check smoke

setup:
	uv sync --project backend --locked
	npm ci --prefix frontend

dev:
	python3 scripts/dev.py

build:
	npm run build --prefix frontend

start: build
	ALE_PROVIDER=cli uv run --project backend uvicorn aws_log_explorer.main:app --host 127.0.0.1 --port 8000

backend-test:
	uv run --project backend pytest backend/tests

frontend-test:
	npm test --prefix frontend

e2e:
	uv run --project backend pytest -c backend/pyproject.toml e2e

test: backend-test frontend-test e2e

lint:
	uv run --project backend ruff check backend/src backend/tests e2e
	npm run lint --prefix frontend

typecheck:
	uv run --project backend mypy backend/src
	npm run typecheck --prefix frontend

check: test lint typecheck build
	@! grep -RInE 'create_subprocess_shell|shell=True|os\.system' backend/src
	@echo "check concluído: todas as suítes são fake-only; smoke AWS não foi executado."

smoke:
	@echo "Smoke AWS é opt-in e requer autorização explícita. Nenhum comando foi executado."
	@exit 2
