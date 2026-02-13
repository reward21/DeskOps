package httpapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/reward21/DeskOps/apps/api/internal/backtestapi"
)

type API struct {
	db       *sql.DB
	backtest *backtestapi.Client
}

func New(db *sql.DB, backtest *backtestapi.Client) *API {
	return &API{db: db, backtest: backtest}
}

func (a *API) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", a.handleHealth)
	mux.HandleFunc("GET /v1/backtests/runs", a.handleRuns)
	mux.HandleFunc("GET /v1/backtests/run", a.handleRunByID)
	mux.HandleFunc("POST /v1/backtests/query", a.handleQuery)
	mux.HandleFunc("GET /v1/settings", a.handleSettings)
	mux.HandleFunc("POST /v1/settings", a.handleSettingsUpdate)
	return loggingMiddleware(mux)
}

func (a *API) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (a *API) handleRuns(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	if a.backtest != nil {
		items, err := a.fetchRunsFromBacktest(ctx)
		if err != nil {
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": items, "count": len(items)})
		return
	}

	rows, err := a.db.QueryContext(ctx, `SELECT run_id, created_at_utc, date_start_et, date_end_et FROM runs ORDER BY created_at_utc DESC NULLS LAST LIMIT 200`)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer rows.Close()

	items := make([]map[string]interface{}, 0)
	for rows.Next() {
		var runID, createdAt, startET, endET sql.NullString
		if err := rows.Scan(&runID, &createdAt, &startET, &endET); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		items = append(items, map[string]interface{}{
			"run_id":         runID.String,
			"created_at_utc": createdAt.String,
			"date_start_et":  startET.String,
			"date_end_et":    endET.String,
		})
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"items": items, "count": len(items)})
}

func (a *API) handleRunByID(w http.ResponseWriter, r *http.Request) {
	runID := r.URL.Query().Get("run_id")
	if runID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "run_id is required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	if a.backtest != nil {
		item, found, err := a.fetchRunDetailFromBacktest(ctx, runID)
		if err != nil {
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
			return
		}
		if !found {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "run not found"})
			return
		}
		writeJSON(w, http.StatusOK, item)
		return
	}

	row := a.db.QueryRowContext(ctx, `SELECT run_id, created_at_utc, date_start_et, date_end_et, params_json, metrics_json, report_path, equity_curve_path FROM runs WHERE run_id = $1`, runID)
	var run struct {
		RunID           string
		CreatedAt       sql.NullString
		DateStart       sql.NullString
		DateEnd         sql.NullString
		ParamsJSON      sql.NullString
		MetricsJSON     sql.NullString
		ReportPath      sql.NullString
		EquityCurvePath sql.NullString
	}
	if err := row.Scan(&run.RunID, &run.CreatedAt, &run.DateStart, &run.DateEnd, &run.ParamsJSON, &run.MetricsJSON, &run.ReportPath, &run.EquityCurvePath); err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "run not found"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"run_id":            run.RunID,
		"created_at_utc":    run.CreatedAt.String,
		"date_start_et":     run.DateStart.String,
		"date_end_et":       run.DateEnd.String,
		"params_json":       run.ParamsJSON.String,
		"metrics_json":      run.MetricsJSON.String,
		"report_path":       run.ReportPath.String,
		"equity_curve_path": run.EquityCurvePath.String,
	})
}

func (a *API) handleSettings(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{"llm_read": true, "llm_write": false})
}

func (a *API) handleSettingsUpdate(w http.ResponseWriter, r *http.Request) {
	var payload map[string]interface{}
	_ = json.NewDecoder(r.Body).Decode(&payload)
	writeJSON(w, http.StatusOK, map[string]interface{}{"ok": true, "applied": payload})
}

type queryRequest struct {
	SQL   string `json:"sql"`
	Limit int    `json:"limit"`
}

func (a *API) handleQuery(w http.ResponseWriter, r *http.Request) {
	if a.backtest == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "backtest api not configured"})
		return
	}
	var req queryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON body"})
		return
	}
	sqlText := strings.TrimSpace(req.SQL)
	if sqlText == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "sql is required"})
		return
	}
	limit := req.Limit
	if limit <= 0 {
		limit = 200
	}
	if limit > 2000 {
		limit = 2000
	}
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	res, err := a.backtest.Query(ctx, sqlText, limit)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func writeJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(start))
	})
}

func (a *API) fetchRunsFromBacktest(ctx context.Context) ([]map[string]interface{}, error) {
	sqlText := `SELECT run_id, created_at_utc, date_start_et, date_end_et FROM runs ORDER BY created_at_utc DESC LIMIT 200`
	res, err := a.backtest.Query(ctx, sqlText, 200)
	if err != nil {
		return nil, err
	}
	idx := columnIndex(res.Columns)
	items := make([]map[string]interface{}, 0, len(res.Rows))
	for _, row := range res.Rows {
		items = append(items, map[string]interface{}{
			"run_id":         getString(row, idx, "run_id"),
			"created_at_utc": getString(row, idx, "created_at_utc"),
			"date_start_et":  getString(row, idx, "date_start_et"),
			"date_end_et":    getString(row, idx, "date_end_et"),
		})
	}
	return items, nil
}

func (a *API) fetchRunDetailFromBacktest(ctx context.Context, runID string) (map[string]interface{}, bool, error) {
	escaped := sqlQuote(runID)
	sqlText := fmt.Sprintf(
		`SELECT run_id, created_at_utc, date_start_et, date_end_et, params_json, metrics_json, report_path, equity_curve_path FROM runs WHERE run_id = %s LIMIT 1`,
		escaped,
	)
	res, err := a.backtest.Query(ctx, sqlText, 1)
	if err != nil {
		return nil, false, err
	}
	if len(res.Rows) == 0 {
		return nil, false, nil
	}
	idx := columnIndex(res.Columns)
	row := res.Rows[0]
	item := map[string]interface{}{
		"run_id":            getString(row, idx, "run_id"),
		"created_at_utc":    getString(row, idx, "created_at_utc"),
		"date_start_et":     getString(row, idx, "date_start_et"),
		"date_end_et":       getString(row, idx, "date_end_et"),
		"params_json":       getString(row, idx, "params_json"),
		"metrics_json":      getString(row, idx, "metrics_json"),
		"report_path":       getString(row, idx, "report_path"),
		"equity_curve_path": getString(row, idx, "equity_curve_path"),
	}
	return item, true, nil
}

func columnIndex(cols []string) map[string]int {
	idx := make(map[string]int, len(cols))
	for i, c := range cols {
		idx[strings.ToLower(strings.TrimSpace(c))] = i
	}
	return idx
}

func getString(row []interface{}, idx map[string]int, key string) string {
	i, ok := idx[strings.ToLower(key)]
	if !ok || i < 0 || i >= len(row) {
		return ""
	}
	return valueToString(row[i])
}

func valueToString(v interface{}) string {
	if v == nil {
		return ""
	}
	switch t := v.(type) {
	case string:
		return t
	default:
		return fmt.Sprint(t)
	}
}

func sqlQuote(v string) string {
	return "'" + strings.ReplaceAll(v, "'", "''") + "'"
}
