SHELL := /bin/bash
.DEFAULT_GOAL := help

.PHONY: help setup up down restart reset clean logs status migrate api fastapi web

help:
	@echo "DeskOps Makefile"
	@echo ""
	@echo "Targets:"
	@echo "  make setup    - install deps (Go, Python venv, npm)"
	@echo "  make up       - start all services (background)"
	@echo "  make down     - stop all services"
	@echo "  make restart  - non-destructive restart"
	@echo "  make reset    - HARD RESET (prompt, deletes data/deps)"
	@echo "  make clean    - remove build caches/logs (non-destructive)"
	@echo "  make logs     - tail logs from background services"
	@echo "  make status   - show service status"
	@echo "  make migrate  - run DB migrations"
	@echo "  make api      - run Go API (foreground)"
	@echo "  make fastapi  - run FastAPI (foreground)"
	@echo "  make web      - run SvelteKit (foreground)"

setup:
	@./deskops setup

up:
	@./deskops up

down:
	@./deskops down

restart:
	@./deskops restart

reset:
	@./deskops reset

clean:
	@./deskops clean

logs:
	@./deskops logs

status:
	@./deskops status

migrate:
	@./deskops migrate

api:
	@cd apps/api && go run ./cmd/server

fastapi:
	@cd services/fastapi && . .venv/bin/activate && uvicorn app.main:app --reload --host 127.0.0.1 --port 8090

web:
	@cd apps/web && npm run dev -- --host 127.0.0.1 --port 8888
