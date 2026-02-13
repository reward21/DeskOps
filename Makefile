SHELL := /bin/bash
.DEFAULT_GOAL := help

.PHONY: help setup up down stop restart reset clean logs status migrate api fastapi web build rebuild preflight doctor bootstrap live

help:
	@echo "DeskOps Makefile"
	@echo ""
	@echo "Targets:"
	@echo "  make setup    - install deps (Go, Python venv, npm)"
	@echo "  make up       - start all services (background)"
	@echo "  make live     - start all services and tail logs"
	@echo "  make down     - stop all services"
	@echo "  make stop     - alias for down"
	@echo "  make restart  - non-destructive restart"
	@echo "  make reset    - HARD RESET (prompt, deletes data/deps)"
	@echo "  make clean    - remove build caches/logs (non-destructive)"
	@echo "  make logs     - tail logs from background services"
	@echo "  make status   - show service status"
	@echo "  make migrate  - run DB migrations"
	@echo "  make metadata - build metadata indices"
	@echo "  make api      - run Go API (foreground)"
	@echo "  make fastapi  - run FastAPI (foreground)"
	@echo "  make web      - run SvelteKit (foreground)"
	@echo "  make build    - build the SvelteKit UI"
	@echo "  make rebuild  - clean + build the SvelteKit UI"
	@echo "  make preflight- check deps and env for running services"
	@echo "  make doctor   - full environment scan with optional fixes"
	@echo "  make bootstrap- run setup + migrate + up"

setup:
	@./deskops setup

up:
	@./deskops up

live:
	@./deskops live

down:
	@./deskops down

stop:
	@./deskops down

restart:
	@./deskops restart

reset:
	@./deskops reset

clean:
	@./deskops down
	@./deskops clean

logs:
	@./deskops logs

status:
	@./deskops status

migrate:
	@./deskops migrate

metadata:
	@./deskops metadata

api:
	@./deskops preflight api
	@cd apps/api && go run ./cmd/server

fastapi:
	@./deskops preflight fastapi
	@. .venv/bin/activate && cd services/fastapi && uvicorn app.main:app --reload --host 127.0.0.1 --port 8090

web:
	@./deskops preflight web
	@cd apps/web && npm run dev -- --host 127.0.0.1 --port 8888

build:
	@./deskops preflight web
	@cd apps/web && npm run build

rebuild: clean build

preflight:
	@./deskops preflight all

doctor:
	@./deskops doctor

bootstrap:
	@./deskops setup
	@./deskops migrate
	@./deskops up
