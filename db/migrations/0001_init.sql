-- DeskOps initial schema (Postgres)

CREATE TABLE IF NOT EXISTS runs (
  run_id TEXT PRIMARY KEY,
  created_at_utc TEXT,
  synthetic_data INTEGER,
  date_start_et TEXT,
  date_end_et TEXT,
  params_json TEXT,
  metrics_json TEXT,
  report_path TEXT,
  equity_curve_path TEXT,
  pnl_hist_path TEXT
);

CREATE TABLE IF NOT EXISTS signals (
  run_id TEXT NOT NULL,
  signal_id TEXT NOT NULL,
  ts TEXT,
  direction INTEGER,
  features_json TEXT,
  PRIMARY KEY (run_id, signal_id)
);

CREATE TABLE IF NOT EXISTS trades (
  run_id TEXT NOT NULL,
  signal_id TEXT NOT NULL,
  entry_ts TEXT,
  exit_ts TEXT,
  side TEXT,
  entry_px DOUBLE PRECISION,
  exit_px DOUBLE PRECISION,
  stop_px DOUBLE PRECISION,
  target_px DOUBLE PRECISION,
  pnl_points DOUBLE PRECISION,
  bars_held INTEGER,
  minutes_held INTEGER,
  exit_reason TEXT,
  PRIMARY KEY (run_id, signal_id)
);

CREATE TABLE IF NOT EXISTS trades_pass (
  run_id TEXT NOT NULL,
  gate_id TEXT NOT NULL,
  trade_id TEXT NOT NULL,
  signal_id TEXT,
  entry_ts TEXT,
  exit_ts TEXT,
  side TEXT,
  entry_px DOUBLE PRECISION,
  exit_px DOUBLE PRECISION,
  stop_px DOUBLE PRECISION,
  target_px DOUBLE PRECISION,
  pnl DOUBLE PRECISION,
  pnl_points DOUBLE PRECISION,
  size DOUBLE PRECISION,
  mae_points DOUBLE PRECISION,
  mfe_points DOUBLE PRECISION,
  hold_minutes INTEGER,
  exit_reason TEXT,
  PRIMARY KEY (run_id, gate_id, trade_id)
);

CREATE TABLE IF NOT EXISTS gate_decisions (
  run_id TEXT NOT NULL,
  gate_id TEXT NOT NULL,
  signal_id TEXT NOT NULL,
  decision TEXT,
  denial_code TEXT,
  denial_detail TEXT,
  equity_at_decision DOUBLE PRECISION,
  risk_at_decision DOUBLE PRECISION,
  ts TEXT,
  PRIMARY KEY (run_id, gate_id, signal_id)
);

CREATE TABLE IF NOT EXISTS gate_metrics (
  run_id TEXT NOT NULL,
  gate_id TEXT NOT NULL,
  trade_count INTEGER,
  win_rate DOUBLE PRECISION,
  pf DOUBLE PRECISION,
  expectancy DOUBLE PRECISION,
  maxdd DOUBLE PRECISION,
  worst_day DOUBLE PRECISION,
  worst_trade DOUBLE PRECISION,
  avg_hold DOUBLE PRECISION,
  zero_trade_day_pct DOUBLE PRECISION,
  ending_equity DOUBLE PRECISION,
  PRIMARY KEY (run_id, gate_id)
);

CREATE TABLE IF NOT EXISTS gate_daily_stats (
  run_id TEXT NOT NULL,
  gate_id TEXT NOT NULL,
  session_date TEXT NOT NULL,
  trades_taken INTEGER,
  pnl_day DOUBLE PRECISION,
  dd_day DOUBLE PRECISION,
  kill_switch_hit INTEGER,
  PRIMARY KEY (run_id, gate_id, session_date)
);

CREATE TABLE IF NOT EXISTS trades_legacy (
  run_id TEXT,
  entry_ts TEXT,
  exit_ts TEXT,
  side TEXT,
  entry_px DOUBLE PRECISION,
  exit_px DOUBLE PRECISION,
  pnl DOUBLE PRECISION,
  exit_reason TEXT,
  bars_held INTEGER,
  vix_regime TEXT,
  weekday TEXT,
  entry_bucket TEXT,
  day TEXT
);

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_runs_created ON runs(created_at_utc);
CREATE INDEX IF NOT EXISTS idx_trades_run ON trades(run_id);
CREATE INDEX IF NOT EXISTS idx_signals_run ON signals(run_id);
CREATE INDEX IF NOT EXISTS idx_gate_decisions_run ON gate_decisions(run_id);
