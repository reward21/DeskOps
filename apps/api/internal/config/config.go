package config

import (
	"fmt"
	"os"
	"strings"
)

type Config struct {
	Port        string
	DatabaseURL string
	BacktestAPI string
}

func Load() (Config, error) {
	cfg := Config{
		Port:        envOrDefault("API_PORT", "9090"),
		DatabaseURL: os.Getenv("DATABASE_URL"),
		BacktestAPI: envOrFirst("BACKTEST_API_BASE", "BACKTEST_API_URL"),
	}
	if strings.TrimSpace(cfg.DatabaseURL) == "" && strings.TrimSpace(cfg.BacktestAPI) == "" {
		return Config{}, fmt.Errorf("either DATABASE_URL or BACKTEST_API_BASE/BACKTEST_API_URL is required")
	}
	return cfg, nil
}

func envOrDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envOrFirst(keys ...string) string {
	for _, key := range keys {
		if v := os.Getenv(key); v != "" {
			return v
		}
	}
	return ""
}
