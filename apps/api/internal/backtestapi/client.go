package backtestapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
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

func New(baseURL string) *Client {
	clean := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	return &Client{
		baseURL: clean,
		http: &http.Client{
			Timeout: 20 * time.Second,
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
