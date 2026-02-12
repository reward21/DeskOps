package httpapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"time"
)

type API struct {
	db *sql.DB
}

func New(db *sql.DB) *API {
	return &API{db: db}
}

func (a *API) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", a.handleHealth)
	mux.HandleFunc("GET /v1/backtests/runs", a.handleRuns)
	mux.HandleFunc("GET /v1/backtests/run", a.handleRunByID)
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
