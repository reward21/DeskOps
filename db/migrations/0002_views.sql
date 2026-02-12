CREATE OR REPLACE VIEW vw_run_summary AS
SELECT
  r.run_id,
  r.created_at_utc,
  r.date_start_et,
  r.date_end_et,
  r.report_path,
  r.equity_curve_path,
  r.params_json
FROM runs r;
