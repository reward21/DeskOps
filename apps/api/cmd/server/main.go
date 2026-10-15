package main

import (
	"context"
	"database/sql"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/reward21/DeskOps/apps/api/internal/backtestapi"
	"github.com/reward21/DeskOps/apps/api/internal/config"
	"github.com/reward21/DeskOps/apps/api/internal/db"
	"github.com/reward21/DeskOps/apps/api/internal/httpapi"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	var sqlDB *sql.DB
	if strings.TrimSpace(cfg.DatabaseURL) != "" {
		sqlDB, err = db.Open(ctx, cfg.DatabaseURL)
		if err != nil {
			if strings.TrimSpace(cfg.BacktestAPI) == "" {
				log.Fatalf("database error: %v", err)
			}
			log.Printf("database unavailable, continuing in backtest-api-only mode: %v", err)
		}
	} else {
		log.Printf("DATABASE_URL not set; starting without postgres connection")
	}
	if sqlDB != nil {
		defer sqlDB.Close()
	}

	var backtest *backtestapi.Client
	if cfg.BacktestAPI != "" {
		backtest = backtestapi.New(cfg.BacktestAPI)
		log.Printf("Backtest API enabled: %s", cfg.BacktestAPI)
	} else {
		log.Printf("Backtest API disabled")
	}

	api := httpapi.New(sqlDB, backtest)
	addr := ":" + cfg.Port
	log.Printf("DeskOps API listening on %s", addr)
	if err := http.ListenAndServe(addr, api.Handler()); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
