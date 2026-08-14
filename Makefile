.PHONY: install install-backend install-frontend \
        dev dev-backend dev-frontend \
        build start stop restart logs \
        sync clean help

# ── Config ────────────────────────────────────────────────────────────────────
BACKEND_DIR  := backend
FRONTEND_DIR := frontend

# ── Install ───────────────────────────────────────────────────────────────────
install: install-backend install-frontend ## Install all dependencies

install-backend: ## Install backend dependencies
	cd $(BACKEND_DIR) && npm install

install-frontend: ## Install frontend dependencies
	cd $(FRONTEND_DIR) && npm install

# ── Development ───────────────────────────────────────────────────────────────
dev: ## Start backend and frontend in parallel (requires terminal that supports &)
	@echo "Starting backend and frontend..."
	@cd $(BACKEND_DIR) && npm run dev & cd $(FRONTEND_DIR) && npm run dev

dev-backend: ## Start backend only (nodemon)
	cd $(BACKEND_DIR) && npm run dev

dev-frontend: ## Start frontend only (Vite)
	cd $(FRONTEND_DIR) && npm run dev

# ── Build ─────────────────────────────────────────────────────────────────────
build: ## Build frontend for production
	cd $(FRONTEND_DIR) && npm run build

# ── Docker ────────────────────────────────────────────────────────────────────
start: ## Start all services via Docker Compose
	docker compose up -d

stop: ## Stop all Docker Compose services
	docker compose down

restart: ## Restart all Docker Compose services
	docker compose restart

logs: ## Tail logs from all Docker Compose services
	docker compose logs -f

logs-backend: ## Tail backend logs only
	docker compose logs -f backend

logs-frontend: ## Tail frontend logs only
	docker compose logs -f frontend

# ── Data ──────────────────────────────────────────────────────────────────────
sync: ## Trigger a transaction sync via the API
	curl -s -X POST http://localhost:3002/api/plaid/sync | jq .

# ── Clean ─────────────────────────────────────────────────────────────────────
clean: ## Remove node_modules and build artifacts
	rm -rf $(BACKEND_DIR)/node_modules
	rm -rf $(FRONTEND_DIR)/node_modules
	rm -rf $(FRONTEND_DIR)/dist

clean-db: ## Delete the local SQLite database (irreversible)
	rm -f $(BACKEND_DIR)/expense_tracker.db

# ── Help ──────────────────────────────────────────────────────────────────────
help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*##' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*##"}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
