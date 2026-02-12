package main

import (
	"context"
	"log"
	"net/http"
	"time"

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

	sqlDB, err := db.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("database error: %v", err)
	}
	defer sqlDB.Close()

	api := httpapi.New(sqlDB)
	addr := ":" + cfg.Port
	log.Printf("DeskOps API listening on %s", addr)
	if err := http.ListenAndServe(addr, api.Handler()); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
