.PHONY: install run build deploy lint types cap-sync cap-open clean help

NPM ?= npm
DEV_PORT ?= 5173

.DEFAULT_GOAL := help

help:
	@echo "Music Mind"
	@echo ""
	@echo "  make install    Install npm dependencies"
	@echo "  make run        Start Vite + Worker dev server (port $(DEV_PORT))"
	@echo "  make build      Production build"
	@echo "  make deploy     Build and deploy to musicmind.wildideazone.com"
	@echo "  make lint       Run oxlint"
	@echo "  make types      Regenerate worker-configuration.d.ts"
	@echo "  make cap-sync   Build web assets and sync the iOS Capacitor project"
	@echo "  make cap-open   Open the iOS project in Xcode"
	@echo "  make clean      Remove node_modules, dist, and .wrangler"

install:
	$(NPM) install

run:
	$(NPM) run dev -- --port $(DEV_PORT)

build:
	$(NPM) run build

deploy:
	$(NPM) run deploy

lint:
	$(NPM) run lint

types:
	$(NPM) run cf-typegen

cap-sync:
	$(NPM) run cap:sync

cap-open:
	$(NPM) run cap:open

clean:
	rm -rf node_modules dist .wrangler
