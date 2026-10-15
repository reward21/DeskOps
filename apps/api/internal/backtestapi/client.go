package backtestapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

type Client struct {
	baseURL string
	http    *http.Client
}

type QueryResponse struct {
	OK       bool            `json:"ok"`
	Columns  []string        `json:"columns"`
	Rows     [][]interface{} `json:"rows"`
	RowCount int             `json:"row_count"`
	Error    string          `json:"error"`
}

type SchemaResponse struct {
	OK      bool            `json:"ok"`
	Columns []string        `json:"columns"`
	Rows    [][]interface{} `json:"rows"`
	Error   string          `json:"error"`
}

func New(baseURL string) *Client {
	clean := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	timeout := 60 * time.Second
	if raw := strings.TrimSpace(os.Getenv("BACKTEST_API_TIMEOUT_S")); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil {
			if n < 5 {
				n = 5
			}
			if n > 600 {
				n = 600
			}
			timeout = time.Duration(n) * time.Second
		}
	}
	return &Client{
		baseURL: clean,
		http: &http.Client{
			Timeout: timeout,
		},
	}
}

func (c *Client) Query(ctx context.Context, sql string, limit int) (QueryResponse, error) {
	payload := map[string]interface{}{
		"sql":   sql,
		"limit": limit,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return QueryResponse{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/api/query", bytes.NewReader(body))
	if err != nil {
		return QueryResponse{}, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return QueryResponse{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return QueryResponse{}, fmt.Errorf("backtest api returned %s", resp.Status)
	}

	var out QueryResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return QueryResponse{}, err
	}
	if !out.OK {
		return out, fmt.Errorf("backtest api error: %s", strings.TrimSpace(out.Error))
	}
	return out, nil
}

func (c *Client) Schema(ctx context.Context, table string) (SchemaResponse, error) {
	target := c.baseURL + "/api/schema?table=" + url.QueryEscape(strings.TrimSpace(table))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return SchemaResponse{}, err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return SchemaResponse{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return SchemaResponse{}, fmt.Errorf("backtest api returned %s", resp.Status)
	}
	var out SchemaResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return SchemaResponse{}, err
	}
	if !out.OK {
		return out, fmt.Errorf("backtest api error: %s", strings.TrimSpace(out.Error))
	}
	return out, nil
}

func (c *Client) SchemaProfile(ctx context.Context, limit int) (map[string]interface{}, error) {
	if limit <= 0 {
		limit = 200
	}
	if limit > 2000 {
		limit = 2000
	}
	target := fmt.Sprintf("%s/api/schema/profile?limit=%d", c.baseURL, limit)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("backtest api returned %s", resp.Status)
	}
	var out map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	if okVal, _ := out["ok"].(bool); !okVal {
		if errText, ok := out["error"].(string); ok && strings.TrimSpace(errText) != "" {
			return out, fmt.Errorf("backtest api error: %s", strings.TrimSpace(errText))
		}
		return out, fmt.Errorf("backtest api error")
	}
	return out, nil
}
