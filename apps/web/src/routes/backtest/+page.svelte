<script>
  import { onMount, onDestroy } from 'svelte';
  import LLMPanel from '$lib/components/LLMPanel.svelte';
  import { fetchRuns, fetchRunDetail, runBacktestQuery, fetchSchemaProfile } from '$lib/api.js';

  let runs = [];
  let loading = true;
  let error = '';
  let selectedRunId = '';
  let selectedRun = null;
  let selectedLoading = false;
  let selectedError = '';
  let selectedNotice = '';
  let runFilter = '';
  let runTypeFilter = 'all';
  let runSourceFilter = 'all';
  let runTimeFilter = 'all';
  let runLimit = 800;
  let querySql = 'SELECT run_id, created_at_utc, date_start_et, date_end_et FROM runs ORDER BY created_at_utc DESC LIMIT 50';
  let queryLimit = 200;
  let queryResult = null;
  let queryLoading = false;
  let queryError = '';
  let selectedSchema = 'runs';
  let schemaProfile = [];
  let profileLoading = false;
  let profileError = '';
  let selectedBlock = null;
  let selectedParams = {};
  let selectedMetrics = {};
  let gateMetrics = [];
  let tradeRows = [];
  let tradePassRows = [];
  let gateDecisions = [];
  let perfSummary = null;
  let topWinners = [];
  let topLosers = [];
  let topDenials = [];
  let tradeTab = 'trades';
  let tradeSearch = '';
  let filterGate = '';
  let filterSide = '';
  let filterExit = '';
  let filterDecision = '';
  let filterDenial = '';
  let relatedLoading = false;
  let relatedError = '';
  let selectedTrade = null;
  let dbSchemaProfile = null;
  let dbSchemaLoading = false;
  let dbSchemaError = '';
  let schemaSort = 'flow';
  let showConfig = false;
  let viewName = '';
  let savedViews = [];
  let dragPanelId = '';
  let dragGroup = '';
  let refreshTimer = null;
  let runsWarning = '';
  let runsTotalAvailable = 0;

  const layoutKey = 'deskops.backtest.layout.v2';
  const viewsKey = 'deskops.backtest.views.v1';
  const defaultViewConfig = {
    panels: {
      runs: true,
      selected: true,
      gateMetrics: true,
      tradeProfile: true,
      advanced: false,
      llm: false
    },
    orderTop: ['runs', 'selected'],
    orderMid: ['gateMetrics', 'tradeProfile'],
    orderBottom: ['advanced', 'llm'],
    layout: {
      mode: 'two',
      leftWidth: 55
    },
    density: 'comfortable',
    autoRefresh: {
      enabled: false,
      intervalSec: 60
    },
    columns: {
      runs: {
        run_id: true,
        run_type: true,
        source: true,
        created_at_utc: true,
        date_start_et: true,
        date_end_et: true
      },
      gateMetrics: {
        gate_id: true,
        trade_count: true,
        win_rate: true,
        pf: true,
        expectancy: true,
        maxdd: true,
        ending_equity: true
      },
      trades: {
        signal_id: true,
        entry_ts: true,
        exit_ts: true,
        side: true,
        entry_px: true,
        exit_px: true,
        pnl_points: true,
        exit_reason: true
      },
      trades_pass: {
        gate_id: true,
        signal_id: true,
        entry_ts: true,
        exit_ts: true,
        entry_px: true,
        exit_px: true,
        pnl_points: true,
        exit_reason: true
      },
      gate_decisions: {
        gate_id: true,
        signal_id: true,
        decision: true,
        denial_code: true,
        ts: true
      }
    },
    defaults: {
      tradeTab: 'trades',
      runFilter: '',
      runTypeFilter: 'all',
      runSourceFilter: 'all',
      runTimeFilter: 'all',
      tradeSearch: '',
      filterGate: '',
      filterSide: '',
      filterExit: '',
      filterDecision: '',
      filterDenial: ''
    },
    metrics: {
      perfSummary: ['trades', 'win_rate', 'net_pnl', 'avg_pnl', 'pf']
    }
  };
  let viewConfig = JSON.parse(JSON.stringify(defaultViewConfig));

  const densityOptions = [
    { value: 'compact', label: 'Compact' },
    { value: 'comfortable', label: 'Comfortable' },
    { value: 'spacious', label: 'Spacious' }
  ];
  const metricOptions = [
    { id: 'trades', label: 'Trades' },
    { id: 'win_rate', label: 'Win Rate' },
    { id: 'net_pnl', label: 'Net PnL' },
    { id: 'avg_pnl', label: 'Avg PnL' },
    { id: 'pf', label: 'Profit Factor' }
  ];
  const layoutPresets = [
    {
      id: 'runs_focus',
      label: 'Runs Focus',
      config: {
        panels: { runs: true, selected: true, gateMetrics: false, tradeProfile: false, advanced: false, llm: false },
        layout: { mode: 'two', leftWidth: 60 }
      }
    },
    {
      id: 'trades_focus',
      label: 'Trades Focus',
      config: {
        panels: { runs: false, selected: true, gateMetrics: false, tradeProfile: true, advanced: false, llm: false },
        layout: { mode: 'stacked', leftWidth: 55 }
      }
    },
    {
      id: 'gates_focus',
      label: 'Gates Focus',
      config: {
        panels: { runs: false, selected: true, gateMetrics: true, tradeProfile: false, advanced: false, llm: false },
        layout: { mode: 'stacked', leftWidth: 55 }
      }
    },
    {
      id: 'research',
      label: 'Research',
      config: {
        panels: { runs: true, selected: true, gateMetrics: true, tradeProfile: true, advanced: true, llm: true },
        layout: { mode: 'two', leftWidth: 55 }
      }
    }
  ];


  const schemaBlocks = [
    {
      title: 'runs',
      desc: 'Core run metadata, params, and report paths.',
      query:
        'SELECT run_id, created_at_utc, date_start_et, date_end_et, report_path, equity_curve_path, pnl_hist_path, params_json, metrics_json FROM runs ORDER BY created_at_utc DESC LIMIT 50',
      profile: [
        {
          label: 'Run count + date range',
          sql: 'SELECT COUNT(*) AS total_runs, MIN(created_at_utc) AS first_run, MAX(created_at_utc) AS last_run FROM runs'
        },
        {
          label: 'Top symbols',
          sql: "SELECT COALESCE(symbol, 'unknown') AS symbol, COUNT(*) AS runs FROM runs GROUP BY symbol ORDER BY runs DESC LIMIT 5"
        }
      ]
    },
    {
      title: 'signals',
      desc: 'Signal rows with feature payloads.',
      query: 'SELECT run_id, signal_id, ts, direction, features_json FROM signals ORDER BY ts DESC LIMIT 50',
      profile: [
        {
          label: 'Signal count + date range',
          sql: 'SELECT COUNT(*) AS total_signals, MIN(ts) AS first_signal, MAX(ts) AS last_signal FROM signals'
        },
        {
          label: 'Direction breakdown',
          sql: 'SELECT direction, COUNT(*) AS signals FROM signals GROUP BY direction ORDER BY signals DESC LIMIT 5'
        }
      ]
    },
    {
      title: 'trades',
      desc: 'Trade execution records per run.',
      query:
        'SELECT run_id, signal_id, entry_ts, exit_ts, side, entry_px, exit_px, stop_px, target_px, pnl_points, bars_held, minutes_held, exit_reason FROM trades ORDER BY entry_ts DESC LIMIT 100',
      profile: [
        {
          label: 'Trade count + entry range',
          sql: 'SELECT COUNT(*) AS total_trades, MIN(entry_ts) AS first_entry, MAX(entry_ts) AS last_entry FROM trades'
        },
        {
          label: 'Avg PnL (points)',
          sql: 'SELECT AVG(pnl_points) AS avg_pnl_points FROM trades'
        }
      ]
    },
    {
      title: 'trades_pass',
      desc: 'Trade pass/deny per gate.',
      query:
        'SELECT run_id, gate_id, trade_id, signal_id, entry_ts, exit_ts, side, entry_px, exit_px, stop_px, target_px, pnl, pnl_points, size, mae_points, mfe_points, hold_minutes, exit_reason FROM trades_pass ORDER BY entry_ts DESC LIMIT 100',
      profile: [
        {
          label: 'Pass trades',
          sql: 'SELECT COUNT(*) AS total_pass_trades FROM trades_pass'
        },
        {
          label: 'Top gates',
          sql: 'SELECT gate_id, COUNT(*) AS trades FROM trades_pass GROUP BY gate_id ORDER BY trades DESC LIMIT 5'
        }
      ]
    },
    {
      title: 'gate_decisions',
      desc: 'Per-gate decisions for each trade.',
      query:
        'SELECT run_id, gate_id, signal_id, decision, denial_code, denial_detail, equity_at_decision, risk_at_decision, ts FROM gate_decisions ORDER BY ts DESC LIMIT 100',
      profile: [
        {
          label: 'Decision count + date range',
          sql: 'SELECT COUNT(*) AS total_decisions, MIN(ts) AS first_decision, MAX(ts) AS last_decision FROM gate_decisions'
        },
        {
          label: 'Decision breakdown',
          sql: 'SELECT decision, COUNT(*) AS count FROM gate_decisions GROUP BY decision ORDER BY count DESC LIMIT 5'
        },
        {
          label: 'Top denial codes',
          sql: 'SELECT denial_code, COUNT(*) AS count FROM gate_decisions WHERE denial_code IS NOT NULL AND denial_code != \"\" GROUP BY denial_code ORDER BY count DESC LIMIT 5'
        }
      ]
    },
    {
      title: 'gate_metrics',
      desc: 'Gate-level metrics.',
      query:
        'SELECT run_id, gate_id, trade_count, win_rate, pf, expectancy, maxdd, worst_day, worst_trade, avg_hold, zero_trade_day_pct, ending_equity FROM gate_metrics ORDER BY run_id DESC LIMIT 100',
      profile: [
        {
          label: 'Metric rows',
          sql: 'SELECT COUNT(*) AS total_metrics FROM gate_metrics'
        },
        {
          label: 'Avg win rate',
          sql: 'SELECT AVG(win_rate) AS avg_win_rate FROM gate_metrics'
        }
      ]
    },
    {
      title: 'gate_daily_stats',
      desc: 'Daily aggregates by gate.',
      query:
        'SELECT run_id, gate_id, session_date, trades_taken, pnl_day, dd_day, kill_switch_hit FROM gate_daily_stats ORDER BY session_date DESC LIMIT 100',
      profile: [
        {
          label: 'Daily rows + range',
          sql: 'SELECT COUNT(*) AS total_rows, MIN(session_date) AS first_day, MAX(session_date) AS last_day FROM gate_daily_stats'
        },
        {
          label: 'Top gates',
          sql: 'SELECT gate_id, COUNT(*) AS rows FROM gate_daily_stats GROUP BY gate_id ORDER BY rows DESC LIMIT 5'
        }
      ]
    },
    {
      title: 'trades_legacy',
      desc: 'Legacy trade format (if present).',
      query: 'SELECT * FROM trades_legacy ORDER BY trade_id DESC LIMIT 100',
      profile: [
        {
          label: 'Legacy rows',
          sql: 'SELECT COUNT(*) AS total_rows FROM trades_legacy'
        }
      ]
    }
  ];

  const cloneConfig = (config) => JSON.parse(JSON.stringify(config || {}));

  const mergeColumns = (baseCols, patchCols) => {
    const out = { ...(baseCols || {}) };
    if (!patchCols) return out;
    Object.entries(patchCols).forEach(([table, cols]) => {
      out[table] = { ...(baseCols?.[table] || {}), ...(cols || {}) };
    });
    return out;
  };

  const mergeConfig = (base, patch) => {
    if (!patch || typeof patch !== 'object') return cloneConfig(base);
    return {
      ...base,
      ...patch,
      panels: { ...(base.panels || {}), ...(patch.panels || {}) },
      layout: { ...(base.layout || {}), ...(patch.layout || {}) },
      autoRefresh: { ...(base.autoRefresh || {}), ...(patch.autoRefresh || {}) },
      columns: mergeColumns(base.columns, patch.columns),
      defaults: { ...(base.defaults || {}), ...(patch.defaults || {}) },
      metrics: { ...(base.metrics || {}), ...(patch.metrics || {}) },
      orderTop: patch.orderTop || base.orderTop,
      orderMid: patch.orderMid || base.orderMid,
      orderBottom: patch.orderBottom || base.orderBottom,
      density: patch.density || base.density
    };
  };

  const normalizeConfig = (raw) => mergeConfig(defaultViewConfig, raw || {});

  const persistViewConfig = (patch) => {
    viewConfig = mergeConfig(viewConfig, patch);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(layoutKey, JSON.stringify(viewConfig));
      } catch (err) {
        // Ignore storage errors (private mode, etc.)
      }
    }
  };

  const persistSavedViews = (next) => {
    savedViews = next;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(viewsKey, JSON.stringify(next));
      } catch (err) {
        // Ignore storage errors
      }
    }
  };

  const loadSavedViews = () => {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(viewsKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        savedViews = Array.isArray(parsed) ? parsed : [];
      }
    } catch (err) {
      savedViews = [];
    }
  };

  const setPanelVisible = (panelId, value) => {
    persistViewConfig({ panels: { [panelId]: value } });
  };

  const setLayoutMode = (mode) => {
    persistViewConfig({ layout: { mode } });
  };

  const setLayoutSplit = (value) => {
    const next = Math.max(30, Math.min(70, Number(value) || 55));
    persistViewConfig({ layout: { leftWidth: next } });
  };

  const setDensity = (value) => {
    persistViewConfig({ density: value });
  };

  const setAutoRefresh = (value) => {
    persistViewConfig({ autoRefresh: { enabled: value } });
  };

  const setRefreshInterval = (value) => {
    const next = Math.max(5, Number(value) || 60);
    persistViewConfig({ autoRefresh: { intervalSec: next } });
  };

  const setColumnVisible = (table, col, value) => {
    persistViewConfig({ columns: { [table]: { [col]: value } } });
  };

  const setMetricVisible = (metricId, value) => {
    const current = new Set(viewConfig.metrics?.perfSummary || []);
    if (value) {
      current.add(metricId);
    } else {
      current.delete(metricId);
    }
    persistViewConfig({ metrics: { perfSummary: Array.from(current) } });
  };

  const resetViewConfig = () => {
    persistViewConfig(cloneConfig(defaultViewConfig));
    applyDefaultFilters(defaultViewConfig.defaults);
  };

  const applyDefaultFilters = (defaults = viewConfig.defaults) => {
    tradeTab = defaults.tradeTab || 'trades';
    runFilter = defaults.runFilter || '';
    runTypeFilter = defaults.runTypeFilter || 'all';
    runSourceFilter = defaults.runSourceFilter || 'all';
    runTimeFilter = defaults.runTimeFilter || 'all';
    tradeSearch = defaults.tradeSearch || '';
    filterGate = defaults.filterGate || '';
    filterSide = defaults.filterSide || '';
    filterExit = defaults.filterExit || '';
    filterDecision = defaults.filterDecision || '';
    filterDenial = defaults.filterDenial || '';
  };

  const captureCurrentFilters = () => {
    persistViewConfig({
      defaults: {
        tradeTab,
        runFilter,
        runTypeFilter,
        runSourceFilter,
        runTimeFilter,
        tradeSearch,
        filterGate,
        filterSide,
        filterExit,
        filterDecision,
        filterDenial
      }
    });
  };

  const saveCurrentView = () => {
    const trimmed = viewName.trim();
    if (!trimmed) return;
    const next = [...savedViews];
    const existing = next.findIndex((view) => view.name === trimmed);
    const entry = { name: trimmed, config: cloneConfig(viewConfig) };
    if (existing >= 0) {
      next[existing] = entry;
    } else {
      next.push(entry);
    }
    persistSavedViews(next);
    viewName = '';
  };

  const deleteView = (name) => {
    persistSavedViews(savedViews.filter((view) => view.name !== name));
  };

  const applyView = (entry) => {
    if (!entry?.config) return;
    persistViewConfig(entry.config);
    applyDefaultFilters(entry.config.defaults || {});
  };

  const updateDefault = (key, value) => {
    persistViewConfig({ defaults: { [key]: value } });
  };

  const applyDefaultsNow = () => {
    applyDefaultFilters(viewConfig.defaults);
  };

  const applyPreset = (presetId) => {
    const preset = layoutPresets.find((item) => item.id === presetId);
    if (!preset) return;
    persistViewConfig(preset.config);
  };

  const reorderPanels = (groupKey, fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return;
    const orderKey =
      groupKey === 'top' ? 'orderTop' : groupKey === 'mid' ? 'orderMid' : 'orderBottom';
    const order = [...(viewConfig[orderKey] || [])];
    const fromIdx = order.indexOf(fromId);
    const toIdx = order.indexOf(toId);
    if (fromIdx === -1 || toIdx === -1) return;
    order.splice(fromIdx, 1);
    order.splice(toIdx, 0, fromId);
    persistViewConfig({ [orderKey]: order });
  };

  const handleDragStart = (panelId, groupKey) => {
    dragPanelId = panelId;
    dragGroup = groupKey;
  };

  const handleDrop = (panelId, groupKey) => {
    if (!dragPanelId || dragGroup !== groupKey) return;
    reorderPanels(groupKey, dragPanelId, panelId);
    dragPanelId = '';
    dragGroup = '';
  };

  const refreshData = async () => {
    try {
      const data = await fetchRuns({ limit: runLimit, include_artifacts: true });
      runs = data.items || [];
      runsTotalAvailable = Number(data.total_available || (data.items || []).length || 0);
      runsWarning = Array.isArray(data.warnings) ? data.warnings.filter(Boolean).join(' | ') : '';
      error = '';
    } catch (err) {
      runsTotalAvailable = runs.length;
      runsWarning = '';
      error = err?.message || 'Failed to load runs.';
    }
    if (selectedRunId) {
      await loadRunDetail(selectedRunId);
    }
  };

  const stopAutoRefresh = () => {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  };

  const maybeStartAutoRefresh = () => {
    stopAutoRefresh();
    if (typeof window === 'undefined') return;
    if (!viewConfig.autoRefresh?.enabled) return;
    const interval = Math.max(5, Number(viewConfig.autoRefresh?.intervalSec) || 60);
    refreshTimer = setInterval(refreshData, interval * 1000);
  };

  const metricEnabled = (metricId) => (viewConfig.metrics?.perfSummary || []).includes(metricId);

  $: topPanels = (viewConfig.orderTop || []).filter((id) => viewConfig.panels?.[id]);
  $: midPanels = (viewConfig.orderMid || []).filter((id) => viewConfig.panels?.[id]);
  $: bottomPanels = (viewConfig.orderBottom || []).filter((id) => viewConfig.panels?.[id]);
  $: topSingle = viewConfig.layout?.mode === 'stacked' || topPanels.length <= 1;
  $: midSingle = viewConfig.layout?.mode === 'stacked' || midPanels.length <= 1;

  $: maybeStartAutoRefresh();

  onMount(async () => {
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(layoutKey);
        if (raw) {
          viewConfig = normalizeConfig(JSON.parse(raw));
        }
      } catch (err) {
        viewConfig = cloneConfig(defaultViewConfig);
      }
    }

    loadSavedViews();
    applyDefaultFilters(viewConfig.defaults);

    try {
      const data = await fetchRuns({ limit: runLimit, include_artifacts: true });
      runs = data.items || [];
      runsTotalAvailable = Number(data.total_available || (data.items || []).length || 0);
      runsWarning = Array.isArray(data.warnings) ? data.warnings.filter(Boolean).join(' | ') : '';
      error = '';
    } catch (err) {
      runsTotalAvailable = runs.length;
      runsWarning = '';
      error = err?.message || 'Failed to load runs.';
    } finally {
      loading = false;
    }

    await loadDbSchemaProfile();
    maybeStartAutoRefresh();

    return () => {};
  });

  onDestroy(() => {
    stopAutoRefresh();
  });

  const runTypeOrder = ['single', 'batch', 'walk_forward', 'regime_switch', 'unknown'];

  const runTypeLabel = (value) => {
    const key = String(value || 'unknown').trim().toLowerCase();
    if (key === 'walk_forward') return 'Walk Forward';
    if (key === 'regime_switch') return 'Regime Switch';
    if (key === 'batch') return 'Batch';
    if (key === 'single') return 'Single';
    return 'Unknown';
  };

  const runTimeCutoffMs = (preset) => {
    const now = Date.now();
    if (preset === '24h') return now - 24 * 60 * 60 * 1000;
    if (preset === '7d') return now - 7 * 24 * 60 * 60 * 1000;
    if (preset === '30d') return now - 30 * 24 * 60 * 60 * 1000;
    if (preset === '90d') return now - 90 * 24 * 60 * 60 * 1000;
    return 0;
  };

  const runTimestampMs = (run) => {
    const created = Date.parse(String(run?.created_at_utc || '').trim());
    if (Number.isFinite(created)) return created;
    const m = String(run?.run_id || '').match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})_/);
    if (!m) return 0;
    const [, yy, mm, dd, hh, mi, ss] = m;
    const ts = Date.UTC(Number(yy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss));
    return Number.isFinite(ts) ? ts : 0;
  };

  const resetRunFilters = () => {
    runFilter = '';
    runTypeFilter = 'all';
    runSourceFilter = 'all';
    runTimeFilter = 'all';
  };

  $: runTypeOptions = (() => {
    const set = new Set(
      (runs || [])
        .map((run) => String(run?.run_type || 'unknown').trim().toLowerCase())
        .filter(Boolean)
    );
    const sorted = Array.from(set).sort((a, b) => {
      const ia = runTypeOrder.indexOf(a);
      const ib = runTypeOrder.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b);
    });
    return ['all', ...sorted];
  })();
  $: runSourceOptions = (() => {
    const set = new Set(
      (runs || [])
        .map((run) => String(run?.source || 'unknown').trim().toLowerCase())
        .filter(Boolean)
    );
    return ['all', ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  })();

  $: filteredRuns = (runs || []).filter((run) => {
    const search = runFilter.trim().toLowerCase();
    const runId = String(run?.run_id || '').toLowerCase();
    const runType = String(run?.run_type || 'unknown').toLowerCase();
    const source = String(run?.source || 'unknown').toLowerCase();
    const batchId = String(run?.batch_id || '').toLowerCase();

    if (search) {
      const haystack = `${runId} ${runType} ${source} ${batchId}`;
      if (!haystack.includes(search)) return false;
    }

    if (runTypeFilter !== 'all' && runType !== runTypeFilter) return false;
    if (runSourceFilter !== 'all' && source !== runSourceFilter) return false;

    const cutoff = runTimeCutoffMs(runTimeFilter);
    if (cutoff > 0 && runTimestampMs(run) < cutoff) return false;

    return true;
  });
  $: selectedBlock = schemaBlocks.find((b) => b.title === selectedSchema);

  const formatJson = (value) => {
    if (!value) return '';
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value, null, 2);
      } catch (err) {
        return String(value);
      }
    }
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch (err) {
      return String(value);
    }
  };

  const parseJsonSafe = (value) => {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try {
      return JSON.parse(value);
    } catch (err) {
      return {};
    }
  };

  const rowsToObjects = (res) => {
    if (!res || !Array.isArray(res.rows)) return [];
    const cols = res.columns || [];
    return res.rows.map((row) => {
      const obj = {};
      cols.forEach((col, idx) => {
        obj[col] = row?.[idx];
      });
      return obj;
    });
  };

  const formatList = (value) => {
    if (!value) return '-';
    if (Array.isArray(value)) return value.join(', ');
    return String(value);
  };

  const computePf = (summary) => {
    if (!summary) return null;
    const gw = numVal(summary.gross_win);
    const gl = numVal(summary.gross_loss);
    if (gw === null || gl === null || gl === 0) return null;
    return gw / gl;
  };

  const numVal = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const fmtNum = (value, digits = 2) => {
    const n = numVal(value);
    if (n === null) return '-';
    return n.toFixed(digits);
  };

  const fmtPct = (value) => {
    const n = numVal(value);
    if (n === null) return '-';
    const pct = n <= 1 ? n * 100 : n;
    return `${pct.toFixed(2)}%`;
  };

  const hasValue = (value) => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim() !== '';
    return true;
  };

  const tradeDetailValue = (key, value) => {
    if (!hasValue(value)) return '';
    if (
      [
        'entry_px',
        'exit_px',
        'stop_px',
        'target_px',
        'pnl_points',
        'pnl',
        'mae_points',
        'mfe_points',
        'risk_at_decision',
        'equity_at_decision'
      ].includes(key)
    ) {
      return fmtNum(value, 3);
    }
    if (key === 'size' || key === 'hold_minutes' || key === 'bars_held') {
      const n = numVal(value);
      return n === null ? String(value) : String(n);
    }
    return String(value);
  };

  $: selectedTradeSections = (() => {
    if (!selectedTrade) return [];
    const groups = [
      {
        title: 'Identifiers',
        fields: [
          ['Signal ID', 'signal_id'],
          ['Gate', 'gate_id'],
          ['Trade ID', 'trade_id'],
          ['Run ID', 'run_id']
        ]
      },
      {
        title: 'Timing',
        fields: [
          ['Entry', 'entry_ts'],
          ['Exit', 'exit_ts'],
          ['Decision Time', 'ts']
        ]
      },
      {
        title: 'Position',
        fields: [
          ['Side', 'side'],
          ['Entry Px', 'entry_px'],
          ['Exit Px', 'exit_px'],
          ['Stop Px', 'stop_px'],
          ['Target Px', 'target_px'],
          ['Size', 'size'],
          ['Hold (mins)', 'hold_minutes'],
          ['Bars Held', 'bars_held']
        ]
      },
      {
        title: 'Outcome',
        fields: [
          ['PnL (pts)', 'pnl_points'],
          ['PnL', 'pnl'],
          ['Exit Reason', 'exit_reason'],
          ['Decision', 'decision'],
          ['Denial Code', 'denial_code'],
          ['Denial Detail', 'denial_detail'],
          ['MAE (pts)', 'mae_points'],
          ['MFE (pts)', 'mfe_points'],
          ['Equity @ Decision', 'equity_at_decision'],
          ['Risk @ Decision', 'risk_at_decision']
        ]
      }
    ];

    return groups
      .map((group) => {
        const rows = group.fields
          .map(([label, key]) => {
            const raw = selectedTrade[key];
            if (!hasValue(raw)) return null;
            return { label, value: tradeDetailValue(key, raw) };
          })
          .filter(Boolean);
        return rows.length ? { title: group.title, rows } : null;
      })
      .filter(Boolean);
  })();

  const pickBy = (rows, key, direction = 1) => {
    const vals = (rows || []).filter((row) => numVal(row?.[key]) !== null);
    if (!vals.length) return null;
    return vals.reduce((best, row) => {
      if (!best) return row;
      const a = numVal(best?.[key]);
      const b = numVal(row?.[key]);
      if (a === null || b === null) return best || row;
      return direction * (b - a) > 0 ? row : best;
    }, null);
  };

  const uniqueValues = (rows, key) => {
    const out = new Set();
    (rows || []).forEach((row) => {
      const val = row?.[key];
      if (val !== null && val !== undefined && val !== '') {
        out.add(val);
      }
    });
    return Array.from(out);
  };

  const loadRunDetail = async (runId) => {
    if (!runId) return;
    const baseRun = (runs || []).find((item) => item.run_id === runId) || null;
    selectedRunId = runId;
    selectedLoading = true;
    selectedError = '';
    selectedNotice = '';
    try {
      const detail = await fetchRunDetail(runId);
      selectedRun = { ...(baseRun || {}), ...(detail || {}) };
      await loadRunRelated(runId);
    } catch (err) {
      if (baseRun) {
        selectedRun = { ...baseRun };
        selectedNotice = `Run detail unavailable from DB API (${err?.message || 'not found'}). Showing artifact-index metadata.`;
        await loadRunRelated(runId);
      } else {
        selectedRun = null;
        selectedError = err?.message || 'Failed to load run detail.';
      }
    } finally {
      selectedLoading = false;
    }
  };

  const artifactHref = (runId) => `/backtest/artifacts/${encodeURIComponent(String(runId || ''))}`;

  const loadRunRelated = async (runId) => {
    relatedLoading = true;
    relatedError = '';
    gateMetrics = [];
    tradeRows = [];
    tradePassRows = [];
    gateDecisions = [];
    perfSummary = null;
    topWinners = [];
    topLosers = [];
    topDenials = [];
    selectedTrade = null;
    try {
      const gateRes = await runBacktestQuery(
        `SELECT gate_id, trade_count, win_rate, pf, expectancy, maxdd, ending_equity
         FROM gate_metrics WHERE run_id='${runId}' ORDER BY gate_id`,
        500
      );
      gateMetrics = rowsToObjects(gateRes);

      const tradesRes = await runBacktestQuery(
        `SELECT signal_id, entry_ts, exit_ts, side, entry_px, exit_px, pnl_points, exit_reason
         FROM trades WHERE run_id='${runId}' ORDER BY entry_ts DESC LIMIT 500`,
        500
      );
      tradeRows = rowsToObjects(tradesRes);

      const passRes = await runBacktestQuery(
        `SELECT gate_id, signal_id, entry_ts, exit_ts, entry_px, exit_px, pnl_points, exit_reason
         FROM trades_pass WHERE run_id='${runId}' ORDER BY entry_ts DESC LIMIT 500`,
        500
      );
      tradePassRows = rowsToObjects(passRes);

      const decisionsRes = await runBacktestQuery(
        `SELECT gate_id, signal_id, decision, denial_code, ts
         FROM gate_decisions WHERE run_id='${runId}' ORDER BY ts DESC LIMIT 500`,
        500
      );
      gateDecisions = rowsToObjects(decisionsRes);

      const summaryRes = await runBacktestQuery(
        `SELECT
           COUNT(*) AS trades,
           SUM(CASE WHEN pnl_points > 0 THEN pnl_points ELSE 0 END) AS gross_win,
           ABS(SUM(CASE WHEN pnl_points < 0 THEN pnl_points ELSE 0 END)) AS gross_loss,
           SUM(pnl_points) AS net_pnl,
           AVG(pnl_points) AS avg_pnl,
           SUM(CASE WHEN pnl_points > 0 THEN 1 ELSE 0 END) * 1.0 / COUNT(*) AS win_rate
         FROM trades WHERE run_id='${runId}'`,
        1
      );
      perfSummary = rowsToObjects(summaryRes)[0] || null;

      const winnersRes = await runBacktestQuery(
        `SELECT signal_id, side, entry_ts, exit_ts, pnl_points, exit_reason
         FROM trades WHERE run_id='${runId}' ORDER BY pnl_points DESC LIMIT 10`,
        10
      );
      topWinners = rowsToObjects(winnersRes);

      const losersRes = await runBacktestQuery(
        `SELECT signal_id, side, entry_ts, exit_ts, pnl_points, exit_reason
         FROM trades WHERE run_id='${runId}' ORDER BY pnl_points ASC LIMIT 10`,
        10
      );
      topLosers = rowsToObjects(losersRes);

      const denialsRes = await runBacktestQuery(
        `SELECT denial_code, COUNT(*) AS n
         FROM gate_decisions WHERE run_id='${runId}' AND decision='FAIL'
         GROUP BY denial_code ORDER BY n DESC LIMIT 10`,
        10
      );
      topDenials = rowsToObjects(denialsRes);
    } catch (err) {
      relatedError = err?.message || 'Failed to load gate/trade data.';
    } finally {
      relatedLoading = false;
    }
  };

  $: selectedParams = selectedRun ? (selectedRun.params || parseJsonSafe(selectedRun.params_json)) : {};
  $: selectedMetrics = selectedRun ? (selectedRun.metrics || parseJsonSafe(selectedRun.metrics_json)) : {};
  $: gateOptions = uniqueValues([...tradePassRows, ...gateDecisions], 'gate_id');
  $: sideOptions = uniqueValues(tradeRows, 'side');
  $: exitOptions = uniqueValues([...tradeRows, ...tradePassRows], 'exit_reason');
  $: denialOptions = uniqueValues(gateDecisions, 'denial_code');
  $: decisionOptions = uniqueValues(gateDecisions, 'decision');
  $: runCount = runs.length;
  $: bestPfGate = pickBy(gateMetrics, 'pf', 1);
  $: mostTradesGate = pickBy(gateMetrics, 'trade_count', 1);
  $: worstDdGate = pickBy(gateMetrics, 'maxdd', -1);
  $: perfPf = computePf(perfSummary);
  $: tradeCounts = {
    trades: tradeRows.length,
    pass: tradePassRows.length,
    decisions: gateDecisions.length
  };

  $: tradeTableRaw =
    tradeTab === 'trades' ? tradeRows : tradeTab === 'trades_pass' ? tradePassRows : gateDecisions;

  $: filteredTradeRows = (tradeTableRaw || []).filter((row) => {
    const search = tradeSearch.trim().toLowerCase();
    const matchSearch =
      !search ||
      String(row.signal_id || '').toLowerCase().includes(search) ||
      String(row.exit_reason || '').toLowerCase().includes(search) ||
      String(row.denial_code || '').toLowerCase().includes(search);
    if (!matchSearch) return false;

    if (tradeTab === 'trades') {
      if (filterSide && row.side !== filterSide) return false;
      if (filterExit && row.exit_reason !== filterExit) return false;
      return true;
    }
    if (tradeTab === 'trades_pass') {
      if (filterGate && row.gate_id !== filterGate) return false;
      if (filterExit && row.exit_reason !== filterExit) return false;
      return true;
    }
    if (tradeTab === 'gate_decisions') {
      if (filterGate && row.gate_id !== filterGate) return false;
      if (filterDecision && row.decision !== filterDecision) return false;
      if (filterDenial && row.denial_code !== filterDenial) return false;
      return true;
    }
    return true;
  });
  const runQuery = async () => {
    queryLoading = true;
    queryError = '';
    try {
      queryResult = await runBacktestQuery(querySql, queryLimit);
    } catch (err) {
      queryResult = null;
      queryError = err?.message || 'Failed to run query.';
    } finally {
      queryLoading = false;
    }
  };

  const presetQuery = (sql) => {
    querySql = sql;
  };

  const selectSchema = async (block) => {
    selectedSchema = block.title;
    presetQuery(block.query);
    await runQuery();
    await loadSchemaProfile(block);
  };

  const loadSchemaProfile = async (block) => {
    profileLoading = true;
    profileError = '';
    schemaProfile = [];
    const queries = block?.profile || [];
    for (const q of queries) {
      try {
        const res = await runBacktestQuery(q.sql, 200);
        schemaProfile = [
          ...schemaProfile,
          { label: q.label, columns: res.columns || [], rows: res.rows || [], error: '' }
        ];
      } catch (err) {
        schemaProfile = [
          ...schemaProfile,
          { label: q.label, columns: [], rows: [], error: err?.message || 'Query failed.' }
        ];
      }
    }
    profileLoading = false;
  };

  const loadDbSchemaProfile = async () => {
    dbSchemaLoading = true;
    dbSchemaError = '';
    try {
      dbSchemaProfile = await fetchSchemaProfile(200);
    } catch (err) {
      dbSchemaProfile = null;
      dbSchemaError = err?.message || 'Failed to load schema profile.';
    } finally {
      dbSchemaLoading = false;
    }
  };

  $: paramsJsonProfile = dbSchemaProfile?.json_fields?.['runs.params_json'] || null;
  $: signalsJsonProfile = dbSchemaProfile?.json_fields?.['signals.features_json'] || null;
  $: schemaTableCounts = (() => {
    const out = {};
    const tables = dbSchemaProfile?.tables || [];
    for (const table of tables) {
      if (table?.table) {
        out[table.table] = table.row_count ?? 0;
      }
    }
    return out;
  })();
  $: sortedSchemaBlocks = (() => {
    if (schemaSort === 'flow') return schemaBlocks;
    const copy = [...schemaBlocks];
    if (schemaSort === 'name') {
      return copy.sort((a, b) => a.title.localeCompare(b.title));
    }
    if (schemaSort === 'rows') {
      return copy.sort(
        (a, b) => (schemaTableCounts[b.title] ?? 0) - (schemaTableCounts[a.title] ?? 0)
      );
    }
    return copy;
  })();

</script>

<section class={`page density-${viewConfig.density}`}>
  <header class="hero">
    <div>
      <p class="eyebrow">Backtest operations</p>
      <h2>Multigate Backtest</h2>
      <p class="muted">Run feed, gate performance, and trade detail in one view.</p>
    </div>
    <div class="hero-actions">
      <div class="hero-chip">
        <span>Runs</span>
        <strong>{runCount}</strong>
        {#if runsTotalAvailable > runCount}
          <small>{runsTotalAvailable} indexed</small>
        {/if}
      </div>
      <div class="hero-chip">
        <span>Selected</span>
        <strong class="mono">{selectedRunId || '—'}</strong>
      </div>
      <button class="run" on:click={runQuery} disabled={queryLoading}>Run Feed</button>
      <button class="ghost" on:click={() => (showConfig = !showConfig)}>
        {showConfig ? 'Close Config' : 'Configure'}
      </button>
      {#if queryLoading}
        <span class="muted">Running…</span>
      {/if}
      {#if queryError}
        <span class="error">{queryError}</span>
      {/if}
    </div>
  </header>

  {#if showConfig}
    <div class="config-panel">
      <div class="config-head">
        <div>
          <h3>Backtest Configuration</h3>
          <p class="muted">Layout, data density, filters, and saved views.</p>
        </div>
        <div class="config-actions">
          <button class="ghost" on:click={captureCurrentFilters}>Capture Filters</button>
          <button class="ghost" on:click={resetViewConfig}>Reset Layout</button>
        </div>
      </div>
      <div class="config-grid">
        <div class="config-card">
          <h4>Layout Presets</h4>
          <div class="preset-row">
            {#each layoutPresets as preset}
              <button class="ghost" on:click={() => applyPreset(preset.id)}>{preset.label}</button>
            {/each}
          </div>
          <div class="config-row">
            <label>Layout Mode</label>
            <div class="pill-group">
              <button
                class:selected={viewConfig.layout.mode === 'two'}
                on:click={() => setLayoutMode('two')}
              >
                Two Column
              </button>
              <button
                class:selected={viewConfig.layout.mode === 'stacked'}
                on:click={() => setLayoutMode('stacked')}
              >
                Stacked
              </button>
            </div>
          </div>
          <div class="config-row">
            <label>Split</label>
            <div class="range-row">
              <input
                type="range"
                min="30"
                max="70"
                value={viewConfig.layout.leftWidth}
                on:input={(e) => setLayoutSplit(e.currentTarget.value)}
              />
              <span class="mono">{viewConfig.layout.leftWidth}%</span>
            </div>
          </div>
          <div class="config-row">
            <label>Density</label>
            <select on:change={(e) => setDensity(e.currentTarget.value)} value={viewConfig.density}>
              {#each densityOptions as opt}
                <option value={opt.value}>{opt.label}</option>
              {/each}
            </select>
          </div>
        </div>

        <div class="config-card">
          <h4>Panels</h4>
          <div class="config-grid tight">
            <label class="config-item">
              <input
                type="checkbox"
                checked={viewConfig.panels.runs}
                on:change={(e) => setPanelVisible('runs', e.currentTarget.checked)}
              />
              Runs list
            </label>
            <label class="config-item">
              <input
                type="checkbox"
                checked={viewConfig.panels.selected}
                on:change={(e) => setPanelVisible('selected', e.currentTarget.checked)}
              />
              Selected run
            </label>
            <label class="config-item">
              <input
                type="checkbox"
                checked={viewConfig.panels.gateMetrics}
                on:change={(e) => setPanelVisible('gateMetrics', e.currentTarget.checked)}
              />
              Gate metrics
            </label>
            <label class="config-item">
              <input
                type="checkbox"
                checked={viewConfig.panels.tradeProfile}
                on:change={(e) => setPanelVisible('tradeProfile', e.currentTarget.checked)}
              />
              Trade profile
            </label>
            <label class="config-item">
              <input
                type="checkbox"
                checked={viewConfig.panels.advanced}
                on:change={(e) => setPanelVisible('advanced', e.currentTarget.checked)}
              />
              Advanced query tools
            </label>
            <label class="config-item">
              <input
                type="checkbox"
                checked={viewConfig.panels.llm}
                on:change={(e) => setPanelVisible('llm', e.currentTarget.checked)}
              />
              LLM assistant
            </label>
          </div>
          <p class="muted">Drag panels in the page to reorder them.</p>
        </div>

        <div class="config-card">
          <h4>Auto Refresh</h4>
          <label class="config-item inline">
            <input
              type="checkbox"
              checked={viewConfig.autoRefresh.enabled}
              on:change={(e) => setAutoRefresh(e.currentTarget.checked)}
            />
            Enable auto-refresh
          </label>
          <div class="config-row">
            <label>Interval (sec)</label>
            <input
              type="number"
              min="5"
              value={viewConfig.autoRefresh.intervalSec}
              on:input={(e) => setRefreshInterval(e.currentTarget.value)}
            />
          </div>
          <button class="ghost" on:click={refreshData}>Refresh now</button>
        </div>

        <div class="config-card">
          <h4>Saved Views</h4>
          <div class="config-row">
            <input
              type="text"
              placeholder="View name"
              bind:value={viewName}
            />
            <button class="run" on:click={saveCurrentView}>Save</button>
          </div>
          {#if savedViews.length === 0}
            <p class="muted">No saved views yet.</p>
          {:else}
            <div class="saved-views">
              {#each savedViews as view}
                <div class="saved-row">
                  <span>{view.name}</span>
                  <div class="saved-actions">
                    <button class="ghost" on:click={() => applyView(view)}>Apply</button>
                    <button class="ghost" on:click={() => deleteView(view.name)}>Delete</button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <div class="config-card">
          <h4>Default Filters</h4>
          <div class="config-row">
            <label>Trade tab</label>
            <select
              on:change={(e) => updateDefault('tradeTab', e.currentTarget.value)}
              value={viewConfig.defaults.tradeTab}
            >
              <option value="trades">Trades (All)</option>
              <option value="trades_pass">Trades (Pass)</option>
              <option value="gate_decisions">Gate Decisions</option>
            </select>
          </div>
          <div class="config-row">
            <label>Run filter</label>
            <input
              type="text"
              value={viewConfig.defaults.runFilter}
              on:input={(e) => updateDefault('runFilter', e.currentTarget.value)}
            />
          </div>
          <div class="config-row">
            <label>Run type</label>
            <select
              on:change={(e) => updateDefault('runTypeFilter', e.currentTarget.value)}
              value={viewConfig.defaults.runTypeFilter}
            >
              <option value="all">All</option>
              <option value="single">Single</option>
              <option value="batch">Batch</option>
              <option value="walk_forward">Walk Forward</option>
              <option value="regime_switch">Regime Switch</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>
          <div class="config-row">
            <label>Run source</label>
            <select
              on:change={(e) => updateDefault('runSourceFilter', e.currentTarget.value)}
              value={viewConfig.defaults.runSourceFilter}
            >
              <option value="all">All</option>
              <option value="db">DB</option>
              <option value="artifacts">Artifacts</option>
              <option value="merged">Merged</option>
            </select>
          </div>
          <div class="config-row">
            <label>Run time</label>
            <select
              on:change={(e) => updateDefault('runTimeFilter', e.currentTarget.value)}
              value={viewConfig.defaults.runTimeFilter}
            >
              <option value="all">All time</option>
              <option value="24h">Last 24h</option>
              <option value="7d">Last 7d</option>
              <option value="30d">Last 30d</option>
              <option value="90d">Last 90d</option>
            </select>
          </div>
          <div class="config-row">
            <label>Trade search</label>
            <input
              type="text"
              value={viewConfig.defaults.tradeSearch}
              on:input={(e) => updateDefault('tradeSearch', e.currentTarget.value)}
            />
          </div>
          <div class="config-row">
            <label>Gate filter</label>
            <input
              type="text"
              value={viewConfig.defaults.filterGate}
              on:input={(e) => updateDefault('filterGate', e.currentTarget.value)}
            />
          </div>
          <div class="config-row">
            <label>Side filter</label>
            <input
              type="text"
              value={viewConfig.defaults.filterSide}
              on:input={(e) => updateDefault('filterSide', e.currentTarget.value)}
            />
          </div>
          <div class="config-row">
            <label>Exit filter</label>
            <input
              type="text"
              value={viewConfig.defaults.filterExit}
              on:input={(e) => updateDefault('filterExit', e.currentTarget.value)}
            />
          </div>
          <div class="config-row">
            <label>Decision filter</label>
            <input
              type="text"
              value={viewConfig.defaults.filterDecision}
              on:input={(e) => updateDefault('filterDecision', e.currentTarget.value)}
            />
          </div>
          <div class="config-row">
            <label>Denial filter</label>
            <input
              type="text"
              value={viewConfig.defaults.filterDenial}
              on:input={(e) => updateDefault('filterDenial', e.currentTarget.value)}
            />
          </div>
          <div class="config-actions">
            <button class="ghost" on:click={captureCurrentFilters}>Use current filters</button>
            <button class="ghost" on:click={applyDefaultsNow}>Apply defaults now</button>
          </div>
        </div>

        <div class="config-card">
          <h4>Columns</h4>
          <details open>
            <summary>Runs</summary>
            <div class="config-grid tight">
              <label class="config-item">
                <input
                  type="checkbox"
                  checked={viewConfig.columns.runs.run_id}
                  on:change={(e) => setColumnVisible('runs', 'run_id', e.currentTarget.checked)}
                />
                Run ID
              </label>
              <label class="config-item">
                <input
                  type="checkbox"
                  checked={viewConfig.columns.runs.run_type}
                  on:change={(e) => setColumnVisible('runs', 'run_type', e.currentTarget.checked)}
                />
                Run Type
              </label>
              <label class="config-item">
                <input
                  type="checkbox"
                  checked={viewConfig.columns.runs.source}
                  on:change={(e) => setColumnVisible('runs', 'source', e.currentTarget.checked)}
                />
                Source
              </label>
              <label class="config-item">
                <input
                  type="checkbox"
                  checked={viewConfig.columns.runs.created_at_utc}
                  on:change={(e) => setColumnVisible('runs', 'created_at_utc', e.currentTarget.checked)}
                />
                Created (UTC)
              </label>
              <label class="config-item">
                <input
                  type="checkbox"
                  checked={viewConfig.columns.runs.date_start_et}
                  on:change={(e) => setColumnVisible('runs', 'date_start_et', e.currentTarget.checked)}
                />
                Start (ET)
              </label>
              <label class="config-item">
                <input
                  type="checkbox"
                  checked={viewConfig.columns.runs.date_end_et}
                  on:change={(e) => setColumnVisible('runs', 'date_end_et', e.currentTarget.checked)}
                />
                End (ET)
              </label>
            </div>
          </details>
          <details>
            <summary>Gate Metrics</summary>
            <div class="config-grid tight">
              {#each Object.entries(viewConfig.columns.gateMetrics || {}) as [key, enabled]}
                <label class="config-item">
                  <input
                    type="checkbox"
                    checked={enabled}
                    on:change={(e) => setColumnVisible('gateMetrics', key, e.currentTarget.checked)}
                  />
                  {key}
                </label>
              {/each}
            </div>
          </details>
          <details>
            <summary>Trades</summary>
            <div class="config-grid tight">
              {#each Object.entries(viewConfig.columns.trades || {}) as [key, enabled]}
                <label class="config-item">
                  <input
                    type="checkbox"
                    checked={enabled}
                    on:change={(e) => setColumnVisible('trades', key, e.currentTarget.checked)}
                  />
                  {key}
                </label>
              {/each}
            </div>
          </details>
          <details>
            <summary>Trades (Pass)</summary>
            <div class="config-grid tight">
              {#each Object.entries(viewConfig.columns.trades_pass || {}) as [key, enabled]}
                <label class="config-item">
                  <input
                    type="checkbox"
                    checked={enabled}
                    on:change={(e) => setColumnVisible('trades_pass', key, e.currentTarget.checked)}
                  />
                  {key}
                </label>
              {/each}
            </div>
          </details>
          <details>
            <summary>Gate Decisions</summary>
            <div class="config-grid tight">
              {#each Object.entries(viewConfig.columns.gate_decisions || {}) as [key, enabled]}
                <label class="config-item">
                  <input
                    type="checkbox"
                    checked={enabled}
                    on:change={(e) => setColumnVisible('gate_decisions', key, e.currentTarget.checked)}
                  />
                  {key}
                </label>
              {/each}
            </div>
          </details>
        </div>

        <div class="config-card">
          <h4>Summary Metrics</h4>
          <div class="config-grid tight">
            {#each metricOptions as metric}
              <label class="config-item">
                <input
                  type="checkbox"
                  checked={metricEnabled(metric.id)}
                  on:change={(e) => setMetricVisible(metric.id, e.currentTarget.checked)}
                />
                {metric.label}
              </label>
            {/each}
          </div>
        </div>
      </div>
    </div>
  {/if}

  {#if error}
    <div class="banner error">{error}</div>
  {/if}
  {#if runsWarning}
    <div class="banner warning">{runsWarning}</div>
  {/if}

  {#if topPanels.length}
    <div
      class="grid-top"
      class:single={topSingle}
      style={`--grid-left:${viewConfig.layout.leftWidth}%`}
    >
      {#each viewConfig.orderTop as panelId}
        {#if viewConfig.panels[panelId]}
          {#if panelId === 'runs'}
            <div
              class="panel-wrap"
              draggable="true"
              class:dragging={dragPanelId === 'runs'}
              on:dragstart={() => handleDragStart('runs', 'top')}
              on:dragover|preventDefault
              on:drop={() => handleDrop('runs', 'top')}
              on:dragend={() => { dragPanelId = ''; dragGroup = ''; }}
            >
              <div class="card run-feed resizable">
                <div class="card-head">
                  <div>
                    <h3>Runs</h3>
                    <p class="muted">Unified feed across single, batch, walk-forward, and regime-switch runs.</p>
                  </div>
                  <div class="runs-meta">
                    <div class="runs-search-row">
                      <input
                        class="filter"
                        type="search"
                        placeholder="Search run id, type, source, batch id…"
                        bind:value={runFilter}
                      />
                      <span class="badge">
                        {filteredRuns.length} / {runCount} shown
                        {#if runsTotalAvailable > runCount}
                          · {runsTotalAvailable} indexed
                        {/if}
                      </span>
                    </div>
                    <div class="runs-filter-row">
                      <div class="type-chips">
                        {#each runTypeOptions as type}
                          <button
                            class:selected={runTypeFilter === type}
                            on:click={() => (runTypeFilter = type)}
                            title={`Filter by ${type === 'all' ? 'all run types' : runTypeLabel(type)}`}
                          >
                            {type === 'all' ? 'All Types' : runTypeLabel(type)}
                          </button>
                        {/each}
                      </div>
                      <select bind:value={runSourceFilter}>
                        <option value="all">All sources</option>
                        {#each runSourceOptions.filter((x) => x !== 'all') as src}
                          <option value={src}>{src}</option>
                        {/each}
                      </select>
                      <select bind:value={runTimeFilter}>
                        <option value="all">All time</option>
                        <option value="24h">Last 24h</option>
                        <option value="7d">Last 7d</option>
                        <option value="30d">Last 30d</option>
                        <option value="90d">Last 90d</option>
                      </select>
                      <select bind:value={runLimit} on:change={refreshData}>
                        <option value={200}>200 rows</option>
                        <option value={400}>400 rows</option>
                        <option value={800}>800 rows</option>
                        <option value={1200}>1200 rows</option>
                        <option value={2000}>2000 rows</option>
                      </select>
                      <button class="ghost reset-filters" on:click={refreshData}>Refresh</button>
                      <button class="ghost reset-filters" on:click={resetRunFilters}>Reset</button>
                    </div>
                  </div>
                </div>
                {#if loading}
                  <p>Loading runs...</p>
                {:else if filteredRuns.length === 0}
                  <p>No runs matched the current filter.</p>
                {:else}
                  <div class="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          {#if viewConfig.columns.runs.run_id}
                            <th>Run ID</th>
                          {/if}
                          {#if viewConfig.columns.runs.run_type}
                            <th>Type</th>
                          {/if}
                          {#if viewConfig.columns.runs.source}
                            <th>Source</th>
                          {/if}
                          {#if viewConfig.columns.runs.created_at_utc}
                            <th>Created (UTC)</th>
                          {/if}
                          {#if viewConfig.columns.runs.date_start_et}
                            <th>Start (ET)</th>
                          {/if}
                          {#if viewConfig.columns.runs.date_end_et}
                            <th>End (ET)</th>
                          {/if}
                        </tr>
                      </thead>
                      <tbody>
                        {#each filteredRuns as run}
                          <tr
                            class:selected={selectedRunId === run.run_id}
                            on:click={() => loadRunDetail(run.run_id)}
                          >
                            {#if viewConfig.columns.runs.run_id}
                              <td class="mono">
                                <a
                                  class="run-link"
                                  href={artifactHref(run.run_id)}
                                  on:click|stopPropagation
                                  title="Open run artifacts"
                                >
                                  {run.run_id}
                                </a>
                              </td>
                            {/if}
                            {#if viewConfig.columns.runs.run_type}
                              <td>
                                <span class={`pill type-${run.run_type || 'unknown'}`}>
                                  {runTypeLabel(run.run_type)}
                                </span>
                              </td>
                            {/if}
                            {#if viewConfig.columns.runs.source}
                              <td>
                                <span class="pill source-pill">{run.source || '-'}</span>
                              </td>
                            {/if}
                            {#if viewConfig.columns.runs.created_at_utc}
                              <td>{run.created_at_utc || '-'}</td>
                            {/if}
                            {#if viewConfig.columns.runs.date_start_et}
                              <td>{run.date_start_et || '-'}</td>
                            {/if}
                            {#if viewConfig.columns.runs.date_end_et}
                              <td>{run.date_end_et || '-'}</td>
                            {/if}
                          </tr>
                        {/each}
                      </tbody>
                    </table>
                  </div>
                {/if}
              </div>
            </div>
          {:else if panelId === 'selected'}
            <div
              class="panel-wrap"
              draggable="true"
              class:dragging={dragPanelId === 'selected'}
              on:dragstart={() => handleDragStart('selected', 'top')}
              on:dragover|preventDefault
              on:drop={() => handleDrop('selected', 'top')}
              on:dragend={() => { dragPanelId = ''; dragGroup = ''; }}
            >
              <div class="card run-summary resizable">
                <div class="card-head">
                  <div>
                    <h3>Selected Run</h3>
                    <p class="muted">Snapshot of params, gates, and data sources.</p>
                  </div>
                  {#if selectedRunId}
                    <span class="badge mono">{selectedRunId}</span>
                  {/if}
                </div>
                <div class="run-summary-scroll">
                  {#if selectedLoading}
                    <p>Loading run details...</p>
                  {:else if selectedError}
                    <p class="error">{selectedError}</p>
                  {:else if !selectedRun}
                    <p>Select a run to view details.</p>
                  {:else}
                    {#if selectedNotice}
                      <p class="muted">{selectedNotice}</p>
                    {/if}
                    <div class="summary-strip">
                      <div class="summary-item">
                        <span>Trades (all)</span>
                        <strong>{tradeCounts.trades}</strong>
                      </div>
                      <div class="summary-item">
                        <span>Trades (pass)</span>
                        <strong>{tradeCounts.pass}</strong>
                      </div>
                      <div class="summary-item">
                        <span>Decisions</span>
                        <strong>{tradeCounts.decisions}</strong>
                      </div>
                      <div class="summary-item">
                        <span>Best PF</span>
                        <strong>{bestPfGate ? `${bestPfGate.gate_id} · ${fmtNum(bestPfGate.pf)}` : '-'}</strong>
                      </div>
                      <div class="summary-item">
                        <span>Most Trades</span>
                        <strong>{mostTradesGate ? `${mostTradesGate.gate_id} · ${mostTradesGate.trade_count}` : '-'}</strong>
                      </div>
                      <div class="summary-item">
                        <span>Worst DD</span>
                        <strong>{worstDdGate ? `${worstDdGate.gate_id} · ${fmtNum(worstDdGate.maxdd)}` : '-'}</strong>
                      </div>
                    </div>

                    <div class="detail-grid">
                      <div>
                        <h4>Run Info</h4>
                        <ul class="kv">
                          <li><span>Run ID</span><span class="mono">{selectedRun.run_id}</span></li>
                          <li><span>Run Type</span><span class="mono">{runTypeLabel(selectedRun.run_type)}</span></li>
                          <li><span>Source</span><span class="mono">{selectedRun.source || '-'}</span></li>
                          <li><span>Batch ID</span><span class="mono">{selectedRun.batch_id || '-'}</span></li>
                          <li><span>Created (UTC)</span><span>{selectedRun.created_at_utc || '-'}</span></li>
                          <li><span>Start (ET)</span><span>{selectedRun.date_start_et || '-'}</span></li>
                          <li><span>End (ET)</span><span>{selectedRun.date_end_et || '-'}</span></li>
                        </ul>

                        <h4>Strategy</h4>
                        <ul class="kv">
                          <li><span>Strategy ID</span><span class="mono">{selectedParams.strategy_id || '-'}</span></li>
                          <li><span>Strategy Version</span><span class="mono">{selectedParams.strategy_version || '-'}</span></li>
                        </ul>

                        <h4>Gates</h4>
                        <ul class="kv">
                          <li><span>Gate IDs</span><span class="mono">{formatList(selectedParams.gate_ids)}</span></li>
                          <li><span>Spec Version</span><span class="mono">{selectedParams.spec_version || '-'}</span></li>
                        </ul>
                      </div>
                      <div>
                        <h4>Data Window</h4>
                        <ul class="kv">
                          <li><span>Window Start (ET)</span><span class="mono">{selectedParams.window_start_et || '-'}</span></li>
                          <li><span>Window End (ET)</span><span class="mono">{selectedParams.window_end_et || '-'}</span></li>
                          <li><span>Timezone</span><span class="mono">{selectedParams.timezone || '-'}</span></li>
                          <li><span>RTH</span><span class="mono">{String(selectedParams.rth_enabled ?? '-') }</span></li>
                        </ul>

                        <h4>Data Sources</h4>
                        <ul class="kv">
                          <li><span>Vendor</span><span class="mono">{selectedParams.source_vendor || '-'}</span></li>
                          <li><span>Dataset</span><span class="mono">{selectedParams.source_dataset || '-'}</span></li>
                          <li><span>Schema</span><span class="mono">{selectedParams.source_schema || '-'}</span></li>
                          <li><span>Timeframe</span><span class="mono">{selectedParams.bar_timeframe || '-'}</span></li>
                        </ul>

                        <h4>Artifacts</h4>
                        <ul class="kv">
                          <li><span>Report Path</span><span class="mono">{selectedRun.report_path || '-'}</span></li>
                          <li><span>Equity Curve</span><span class="mono">{selectedRun.equity_curve_path || '-'}</span></li>
                          <li>
                            <span>Artifacts Page</span>
                            <span class="mono">
                              <a class="run-link" href={artifactHref(selectedRun.run_id)}>Open run artifacts</a>
                            </span>
                          </li>
                        </ul>
                      </div>
                    </div>

                    {#if selectedParams.symbol_legs?.length}
                      <div class="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Symbol</th>
                              <th>Bias</th>
                              <th>Vendor</th>
                              <th>Dataset</th>
                              <th>Schema</th>
                              <th>Timeframe</th>
                              <th>Rows (RTH)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {#each selectedParams.symbol_legs as leg}
                              <tr>
                                <td class="mono">{leg.symbol}</td>
                                <td>{leg.bias}</td>
                                <td class="mono">{leg.source_vendor}</td>
                                <td class="mono">{leg.source_dataset}</td>
                                <td class="mono">{leg.source_schema}</td>
                                <td class="mono">{leg.bar_timeframe}</td>
                                <td>{leg.rows_post_rth ?? '-'}</td>
                              </tr>
                            {/each}
                          </tbody>
                        </table>
                      </div>
                    {/if}
                  {/if}
                </div>
              </div>
            </div>
          {/if}
        {/if}
      {/each}
    </div>
  {/if}

  {#if midPanels.length}
    <div
      class="grid-mid"
      class:single={midSingle}
      style={`--grid-left:${viewConfig.layout.leftWidth}%`}
    >
      {#each viewConfig.orderMid as panelId}
        {#if viewConfig.panels[panelId]}
          {#if panelId === 'gateMetrics'}
            <div
              class="panel-wrap"
              draggable="true"
              class:dragging={dragPanelId === 'gateMetrics'}
              on:dragstart={() => handleDragStart('gateMetrics', 'mid')}
              on:dragover|preventDefault
              on:drop={() => handleDrop('gateMetrics', 'mid')}
              on:dragend={() => { dragPanelId = ''; dragGroup = ''; }}
            >
              <div class="card resizable gate-metrics-card">
                <div class="card-head">
                  <div>
                    <h3>Gate Metrics</h3>
                    <p class="muted">Gate performance rollups for the selected run.</p>
                  </div>
                </div>
                <div class="gate-metrics-scroll">
                  {#if relatedLoading}
                    <p>Loading gate + trade data…</p>
                  {:else if relatedError}
                    <p class="error">{relatedError}</p>
                  {:else if gateMetrics.length === 0}
                    <p class="muted">No gate metrics loaded yet.</p>
                  {:else}
                    <div class="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            {#if viewConfig.columns.gateMetrics.gate_id}
                              <th>Gate</th>
                            {/if}
                            {#if viewConfig.columns.gateMetrics.trade_count}
                              <th>Trades</th>
                            {/if}
                            {#if viewConfig.columns.gateMetrics.win_rate}
                              <th>Win %</th>
                            {/if}
                            {#if viewConfig.columns.gateMetrics.pf}
                              <th>PF</th>
                            {/if}
                            {#if viewConfig.columns.gateMetrics.expectancy}
                              <th>Expectancy</th>
                            {/if}
                            {#if viewConfig.columns.gateMetrics.maxdd}
                              <th>MaxDD</th>
                            {/if}
                            {#if viewConfig.columns.gateMetrics.ending_equity}
                              <th>End Equity</th>
                            {/if}
                          </tr>
                        </thead>
                        <tbody>
                          {#each gateMetrics as row}
                            <tr on:click={() => { tradeTab = 'trades_pass'; filterGate = row.gate_id; }}>
                              {#if viewConfig.columns.gateMetrics.gate_id}
                                <td class="mono">{row.gate_id}</td>
                              {/if}
                              {#if viewConfig.columns.gateMetrics.trade_count}
                                <td>{row.trade_count ?? '-'}</td>
                              {/if}
                              {#if viewConfig.columns.gateMetrics.win_rate}
                                <td>{fmtPct(row.win_rate)}</td>
                              {/if}
                              {#if viewConfig.columns.gateMetrics.pf}
                                <td>{fmtNum(row.pf)}</td>
                              {/if}
                              {#if viewConfig.columns.gateMetrics.expectancy}
                                <td>{fmtNum(row.expectancy)}</td>
                              {/if}
                              {#if viewConfig.columns.gateMetrics.maxdd}
                                <td>{fmtNum(row.maxdd)}</td>
                              {/if}
                              {#if viewConfig.columns.gateMetrics.ending_equity}
                                <td>{fmtNum(row.ending_equity)}</td>
                              {/if}
                            </tr>
                          {/each}
                        </tbody>
                      </table>
                    </div>
                  {/if}

                  <div class="card-subhead">
                    <h4>Performance Snapshot</h4>
                    <span class="muted">Summary + top winners/losers for this run.</span>
                  </div>
                  {#if perfSummary}
                    <div class="summary-strip">
                      {#if metricEnabled('trades')}
                        <div class="summary-item">
                          <span>Trades</span>
                          <strong>{perfSummary.trades ?? '-'}</strong>
                        </div>
                      {/if}
                      {#if metricEnabled('win_rate')}
                        <div class="summary-item">
                          <span>Win Rate</span>
                          <strong>{fmtPct(perfSummary.win_rate)}</strong>
                        </div>
                      {/if}
                      {#if metricEnabled('net_pnl')}
                        <div class="summary-item">
                          <span>Net PnL</span>
                          <strong>{fmtNum(perfSummary.net_pnl, 2)}</strong>
                        </div>
                      {/if}
                      {#if metricEnabled('avg_pnl')}
                        <div class="summary-item">
                          <span>Avg PnL</span>
                          <strong>{fmtNum(perfSummary.avg_pnl, 3)}</strong>
                        </div>
                      {/if}
                      {#if metricEnabled('pf')}
                        <div class="summary-item">
                          <span>PF</span>
                          <strong>{perfPf ? fmtNum(perfPf, 2) : '-'}</strong>
                        </div>
                      {/if}
                    </div>
                  {/if}

                  <div class="split-grid">
                    <div>
                      <h4>Top Winners</h4>
                      {#if topWinners.length === 0}
                        <p class="muted">No winners found.</p>
                      {:else}
                        <div class="table-wrap compact tight-scroll">
                          <table>
                            <thead>
                              <tr>
                                <th>Signal</th>
                                <th>Side</th>
                                <th>PnL</th>
                                <th>Exit</th>
                              </tr>
                            </thead>
                            <tbody>
                              {#each topWinners as row}
                                <tr on:click={() => (selectedTrade = row)}>
                                  <td class="mono">{row.signal_id}</td>
                                  <td>{row.side}</td>
                                  <td>{fmtNum(row.pnl_points)}</td>
                                  <td>{row.exit_reason || '-'}</td>
                                </tr>
                              {/each}
                            </tbody>
                          </table>
                        </div>
                      {/if}
                    </div>
                    <div>
                      <h4>Top Losers</h4>
                      {#if topLosers.length === 0}
                        <p class="muted">No losers found.</p>
                      {:else}
                        <div class="table-wrap compact tight-scroll">
                          <table>
                            <thead>
                              <tr>
                                <th>Signal</th>
                                <th>Side</th>
                                <th>PnL</th>
                                <th>Exit</th>
                              </tr>
                            </thead>
                            <tbody>
                              {#each topLosers as row}
                                <tr on:click={() => (selectedTrade = row)}>
                                  <td class="mono">{row.signal_id}</td>
                                  <td>{row.side}</td>
                                  <td>{fmtNum(row.pnl_points)}</td>
                                  <td>{row.exit_reason || '-'}</td>
                                </tr>
                              {/each}
                            </tbody>
                          </table>
                        </div>
                      {/if}
                    </div>
                  </div>

                  <details class="mini">
                    <summary>Top Denial Codes</summary>
                    {#if topDenials.length === 0}
                      <p class="muted">No denial data.</p>
                    {:else}
                      <div class="table-wrap compact tight-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Denial</th>
                              <th>Count</th>
                            </tr>
                          </thead>
                          <tbody>
                            {#each topDenials as row}
                              <tr on:click={() => { tradeTab = 'gate_decisions'; filterDenial = row.denial_code; }}>
                                <td class="mono">{row.denial_code}</td>
                                <td>{row.n}</td>
                              </tr>
                            {/each}
                          </tbody>
                        </table>
                      </div>
                    {/if}
                  </details>
                </div>
              </div>
            </div>
          {:else if panelId === 'tradeProfile'}
            <div
              class="panel-wrap"
              draggable="true"
              class:dragging={dragPanelId === 'tradeProfile'}
              on:dragstart={() => handleDragStart('tradeProfile', 'mid')}
              on:dragover|preventDefault
              on:drop={() => handleDrop('tradeProfile', 'mid')}
              on:dragend={() => { dragPanelId = ''; dragGroup = ''; }}
            >
              <div class="card resizable trade-profile-card">
                <div class="card-head">
                  <div>
                    <h3>Trade Profile</h3>
                    <p class="muted">Drill into trades and gate decisions for this run.</p>
                  </div>
                </div>
                <div class="trade-profile-scroll">
                  <div class="trade-tabs">
                    <button class:selected={tradeTab === 'trades'} on:click={() => (tradeTab = 'trades')}>Trades (All)</button>
                    <button class:selected={tradeTab === 'trades_pass'} on:click={() => (tradeTab = 'trades_pass')}>Trades (Pass)</button>
                    <button class:selected={tradeTab === 'gate_decisions'} on:click={() => (tradeTab = 'gate_decisions')}>Gate Decisions</button>
                  </div>
                  <div class="trade-filters">
                    <input type="search" placeholder="Search signal or reason…" bind:value={tradeSearch} />
                    {#if tradeTab !== 'trades'}
                      <select bind:value={filterGate}>
                        <option value="">All gates</option>
                        {#each gateOptions as g}
                          <option value={g}>{g}</option>
                        {/each}
                      </select>
                    {/if}
                    {#if tradeTab === 'trades'}
                      <select bind:value={filterSide}>
                        <option value="">All sides</option>
                        {#each sideOptions as s}
                          <option value={s}>{s}</option>
                        {/each}
                      </select>
                    {/if}
                    {#if tradeTab !== 'gate_decisions'}
                      <select bind:value={filterExit}>
                        <option value="">All exits</option>
                        {#each exitOptions as e}
                          <option value={e}>{e}</option>
                        {/each}
                      </select>
                    {/if}
                    {#if tradeTab === 'gate_decisions'}
                      <select bind:value={filterDecision}>
                        <option value="">All decisions</option>
                        {#each decisionOptions as d}
                          <option value={d}>{d}</option>
                        {/each}
                      </select>
                      <select bind:value={filterDenial}>
                        <option value="">All denials</option>
                        {#each denialOptions as d}
                          <option value={d}>{d}</option>
                        {/each}
                      </select>
                    {/if}
                  </div>
                  <div class="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          {#if tradeTab === 'trades'}
                            {#if viewConfig.columns.trades.signal_id}<th>Signal</th>{/if}
                            {#if viewConfig.columns.trades.entry_ts}<th>Entry</th>{/if}
                            {#if viewConfig.columns.trades.exit_ts}<th>Exit</th>{/if}
                            {#if viewConfig.columns.trades.side}<th>Side</th>{/if}
                            {#if viewConfig.columns.trades.entry_px}<th>Entry Px</th>{/if}
                            {#if viewConfig.columns.trades.exit_px}<th>Exit Px</th>{/if}
                            {#if viewConfig.columns.trades.pnl_points}<th>PnL</th>{/if}
                            {#if viewConfig.columns.trades.exit_reason}<th>Exit Reason</th>{/if}
                          {:else if tradeTab === 'trades_pass'}
                            {#if viewConfig.columns.trades_pass.gate_id}<th>Gate</th>{/if}
                            {#if viewConfig.columns.trades_pass.signal_id}<th>Signal</th>{/if}
                            {#if viewConfig.columns.trades_pass.entry_ts}<th>Entry</th>{/if}
                            {#if viewConfig.columns.trades_pass.exit_ts}<th>Exit</th>{/if}
                            {#if viewConfig.columns.trades_pass.entry_px}<th>Entry Px</th>{/if}
                            {#if viewConfig.columns.trades_pass.exit_px}<th>Exit Px</th>{/if}
                            {#if viewConfig.columns.trades_pass.pnl_points}<th>PnL</th>{/if}
                            {#if viewConfig.columns.trades_pass.exit_reason}<th>Exit Reason</th>{/if}
                          {:else}
                            {#if viewConfig.columns.gate_decisions.gate_id}<th>Gate</th>{/if}
                            {#if viewConfig.columns.gate_decisions.signal_id}<th>Signal</th>{/if}
                            {#if viewConfig.columns.gate_decisions.decision}<th>Decision</th>{/if}
                            {#if viewConfig.columns.gate_decisions.denial_code}<th>Denial</th>{/if}
                            {#if viewConfig.columns.gate_decisions.ts}<th>Time</th>{/if}
                          {/if}
                        </tr>
                      </thead>
                      <tbody>
                        {#each filteredTradeRows as row}
                          <tr on:click={() => (selectedTrade = row)}>
                            {#if tradeTab === 'trades'}
                              {#if viewConfig.columns.trades.signal_id}<td class="mono">{row.signal_id}</td>{/if}
                              {#if viewConfig.columns.trades.entry_ts}<td class="mono">{row.entry_ts}</td>{/if}
                              {#if viewConfig.columns.trades.exit_ts}<td class="mono">{row.exit_ts}</td>{/if}
                              {#if viewConfig.columns.trades.side}<td>{row.side}</td>{/if}
                              {#if viewConfig.columns.trades.entry_px}<td>{row.entry_px ?? '-'}</td>{/if}
                              {#if viewConfig.columns.trades.exit_px}<td>{row.exit_px ?? '-'}</td>{/if}
                              {#if viewConfig.columns.trades.pnl_points}<td>{row.pnl_points}</td>{/if}
                              {#if viewConfig.columns.trades.exit_reason}<td>{row.exit_reason || '-'}</td>{/if}
                            {:else if tradeTab === 'trades_pass'}
                              {#if viewConfig.columns.trades_pass.gate_id}<td class="mono">{row.gate_id}</td>{/if}
                              {#if viewConfig.columns.trades_pass.signal_id}<td class="mono">{row.signal_id}</td>{/if}
                              {#if viewConfig.columns.trades_pass.entry_ts}<td class="mono">{row.entry_ts}</td>{/if}
                              {#if viewConfig.columns.trades_pass.exit_ts}<td class="mono">{row.exit_ts}</td>{/if}
                              {#if viewConfig.columns.trades_pass.entry_px}<td>{row.entry_px ?? '-'}</td>{/if}
                              {#if viewConfig.columns.trades_pass.exit_px}<td>{row.exit_px ?? '-'}</td>{/if}
                              {#if viewConfig.columns.trades_pass.pnl_points}<td>{row.pnl_points}</td>{/if}
                              {#if viewConfig.columns.trades_pass.exit_reason}<td>{row.exit_reason || '-'}</td>{/if}
                            {:else}
                              {#if viewConfig.columns.gate_decisions.gate_id}<td class="mono">{row.gate_id}</td>{/if}
                              {#if viewConfig.columns.gate_decisions.signal_id}<td class="mono">{row.signal_id}</td>{/if}
                              {#if viewConfig.columns.gate_decisions.decision}<td>{row.decision}</td>{/if}
                              {#if viewConfig.columns.gate_decisions.denial_code}<td>{row.denial_code || '-'}</td>{/if}
                              {#if viewConfig.columns.gate_decisions.ts}<td class="mono">{row.ts}</td>{/if}
                            {/if}
                          </tr>
                        {/each}
                      </tbody>
                    </table>
                  </div>
                  {#if selectedTrade}
                    <div class="trade-detail">
                      <div class="trade-head">
                        <h4>Selected Trade</h4>
                        <button class="ghost reset-filters" on:click={() => (selectedTrade = null)}>Clear</button>
                      </div>
                      {#if selectedTradeSections.length === 0}
                        <p class="muted">No additional trade details available.</p>
                      {:else}
                        <div class="trade-detail-grid">
                          {#each selectedTradeSections as section}
                            <div class="trade-detail-card">
                              <h5>{section.title}</h5>
                              <ul class="kv compact">
                                {#each section.rows as row}
                                  <li><span>{row.label}</span><span class="mono">{row.value}</span></li>
                                {/each}
                              </ul>
                            </div>
                          {/each}
                        </div>
                      {/if}
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          {/if}
        {/if}
      {/each}
    </div>
  {/if}

  {#if bottomPanels.length}
    <div class="bottom-stack">
      {#each viewConfig.orderBottom as panelId}
        {#if viewConfig.panels[panelId]}
          {#if panelId === 'advanced'}
            <div
              class="panel-wrap"
              draggable="true"
              class:dragging={dragPanelId === 'advanced'}
              on:dragstart={() => handleDragStart('advanced', 'bottom')}
              on:dragover|preventDefault
              on:drop={() => handleDrop('advanced', 'bottom')}
              on:dragend={() => { dragPanelId = ''; dragGroup = ''; }}
            >
              <details class="advanced" open>
                <summary>
                  <span>Advanced query tools</span>
                  <span class="muted">Raw SQL + schema profiles</span>
                </summary>
                <div class="advanced-grid">
                  <div class="card">
                    <div class="card-head">
                      <div>
                        <h3>Query Console</h3>
                        <p class="muted">Run read-only SQL against the backtest API.</p>
                      </div>
                      <div class="limit">
                        <label>Limit</label>
                        <input type="number" min="1" max="2000" bind:value={queryLimit} />
                      </div>
                    </div>
                    <div class="preset-row">
                      {#each schemaBlocks as block}
                        <button class:selected={selectedSchema === block.title} on:click={() => selectSchema(block)}>
                          {block.title}
                        </button>
                      {/each}
                    </div>
                    <textarea class="sql" bind:value={querySql} rows="6"></textarea>
                    <div class="query-actions">
                      <button class="run" on:click={runQuery} disabled={queryLoading}>Run Query</button>
                      {#if queryLoading}
                        <span class="muted">Running…</span>
                      {/if}
                    </div>
                    {#if queryError}
                      <p class="error">{queryError}</p>
                    {:else if queryResult}
                      <div class="query-meta">
                        <span class="mono">rows: {queryResult.row_count ?? (queryResult.rows?.length || 0)}</span>
                        {#if queryResult.elapsed_ms}
                          <span>elapsed: {queryResult.elapsed_ms} ms</span>
                        {/if}
                      </div>
                      <div class="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              {#each queryResult.columns || [] as col}
                                <th class="mono">{col}</th>
                              {/each}
                            </tr>
                          </thead>
                          <tbody>
                            {#each queryResult.rows || [] as row}
                              <tr>
                                {#each row as cell}
                                  <td>{cell}</td>
                                {/each}
                              </tr>
                            {/each}
                          </tbody>
                        </table>
                      </div>
                    {/if}
                  </div>

                  <div class="card">
                    <div class="card-head">
                      <div>
                        <h3>Schema Profile</h3>
                        <p class="muted">Quick stats and summaries for <code>{selectedSchema}</code>.</p>
                      </div>
                    </div>
                    {#if profileLoading}
                      <p>Building schema profile…</p>
                    {:else if profileError}
                      <p class="error">{profileError}</p>
                    {:else if schemaProfile.length === 0}
                      <p>Select a schema to load profile stats.</p>
                    {:else}
                      <div class="profile-grid">
                        {#each schemaProfile as block}
                          <div class="profile-card">
                            <h4>{block.label}</h4>
                            {#if block.error}
                              <p class="error">{block.error}</p>
                            {:else if (block.rows || []).length === 0}
                              <p class="muted">No data.</p>
                            {:else}
                              <table>
                                <thead>
                                  <tr>
                                    {#each block.columns as col}
                                      <th class="mono">{col}</th>
                                    {/each}
                                  </tr>
                                </thead>
                                <tbody>
                                  {#each block.rows as row}
                                    <tr>
                                      {#each row as cell}
                                        <td>{cell}</td>
                                      {/each}
                                    </tr>
                                  {/each}
                                </tbody>
                              </table>
                            {/if}
                          </div>
                        {/each}
                      </div>
                      {#if selectedSchema === 'runs'}
                        <div class="profile-grid">
                          <div class="profile-card">
                            <h4>runs.params_json</h4>
                            {#if dbSchemaLoading}
                              <p class="muted">Loading JSON field map…</p>
                            {:else if dbSchemaError}
                              <p class="error">{dbSchemaError}</p>
                            {:else if !paramsJsonProfile}
                              <p class="muted">No JSON profile available.</p>
                            {:else}
                              <table>
                                <thead>
                                  <tr>
                                    <th class="mono">key</th>
                                    <th>count</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {#each paramsJsonProfile.key_counts || [] as row}
                                    <tr>
                                      <td class="mono">{row.key}</td>
                                      <td>{row.count}</td>
                                    </tr>
                                  {/each}
                                </tbody>
                              </table>
                              <div class="json-note">
                                <span class="badge mono">symbol_legs keys</span>
                              </div>
                              <table>
                                <thead>
                                  <tr>
                                    <th class="mono">key</th>
                                    <th>count</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {#each (paramsJsonProfile.symbol_legs?.key_counts || []) as row}
                                    <tr>
                                      <td class="mono">{row.key}</td>
                                      <td>{row.count}</td>
                                    </tr>
                                  {/each}
                                </tbody>
                              </table>
                              <details>
                                <summary>Sample payload</summary>
                                <pre class="mono">{formatJson(paramsJsonProfile.sample)}</pre>
                              </details>
                            {/if}
                          </div>
                        </div>
                      {/if}
                      {#if selectedSchema === 'signals'}
                        <div class="profile-grid">
                          <div class="profile-card">
                            <h4>signals.features_json</h4>
                            {#if dbSchemaLoading}
                              <p class="muted">Loading JSON field map…</p>
                            {:else if dbSchemaError}
                              <p class="error">{dbSchemaError}</p>
                            {:else if !signalsJsonProfile}
                              <p class="muted">No JSON profile available.</p>
                            {:else}
                              <table>
                                <thead>
                                  <tr>
                                    <th class="mono">key</th>
                                    <th>count</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {#each signalsJsonProfile.key_counts || [] as row}
                                    <tr>
                                      <td class="mono">{row.key}</td>
                                      <td>{row.count}</td>
                                    </tr>
                                  {/each}
                                </tbody>
                              </table>
                              <details>
                                <summary>Sample payload</summary>
                                <pre class="mono">{formatJson(signalsJsonProfile.sample)}</pre>
                              </details>
                            {/if}
                          </div>
                        </div>
                      {/if}
                    {/if}
                  </div>

                  <div class="card">
                    <div class="card-head compact">
                      <h3>Schema Map</h3>
                    </div>
                    <p class="muted">Aligned to the multigate-backtest SQLite schema + JSON payloads.</p>
                    <div class="schema-tools">
                      <label class="muted" for="schema-sort">Sort</label>
                      <select id="schema-sort" bind:value={schemaSort}>
                        <option value="flow">By workflow</option>
                        <option value="rows">By row count</option>
                        <option value="name">By name</option>
                      </select>
                    </div>
                    <ul class="schema">
                      {#each sortedSchemaBlocks as block}
                        <li>
                          <button class:selected={selectedSchema === block.title} on:click={() => selectSchema(block)}>
                            <span class="mono">{block.title}</span>
                            <span>{block.desc}</span>
                            <span class="schema-meta">
                              <span class="badge mono">{schemaTableCounts[block.title] ?? '-'}</span>
                              {#if block.title === 'runs'}
                                <span class="tag">params_json</span>
                              {/if}
                              {#if block.title === 'signals'}
                                <span class="tag">features_json</span>
                              {/if}
                            </span>
                          </button>
                        </li>
                      {/each}
                    </ul>
                  </div>
                </div>
              </details>
            </div>
          {:else if panelId === 'llm'}
            <div
              class="panel-wrap"
              draggable="true"
              class:dragging={dragPanelId === 'llm'}
              on:dragstart={() => handleDragStart('llm', 'bottom')}
              on:dragover|preventDefault
              on:drop={() => handleDrop('llm', 'bottom')}
              on:dragend={() => { dragPanelId = ''; dragGroup = ''; }}
            >
              <details class="advanced llm" open>
                <summary>
                  <span>LLM Assistant</span>
                  <span class="muted">Ask questions about the selected run</span>
                </summary>
                <div class="advanced-grid">
                  <LLMPanel title="Backtest LLM" runId={selectedRunId} threadId="backtest" />
                </div>
              </details>
            </div>
          {/if}
        {/if}
      {/each}
    </div>
  {/if}
</section>

<style>
  .page {
    max-width: none;
    width: 100%;
    margin: 0 auto;
    padding: 2.5rem 1.5rem 3rem;
  }
  p { color: var(--text-muted); }

  @keyframes rise {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .hero {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 2rem;
    padding: 1.5rem;
    border-radius: 18px;
    background: linear-gradient(135deg, rgba(0, 172, 172, 0.12), rgba(0, 0, 0, 0.2));
    border: 1px solid rgba(0, 172, 172, 0.18);
    box-shadow: 0 24px 50px rgba(0, 0, 0, 0.35);
  }
  .eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.2em;
    font-size: 0.7rem;
    color: var(--text-muted);
  }
  .hero h2 { margin: 0.3rem 0 0.5rem; }
  .hero-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
    justify-content: flex-end;
  }
  .hero-actions .ghost {
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text);
    border-radius: 999px;
    padding: 0.35rem 0.85rem;
    cursor: pointer;
    font-size: 0.85rem;
  }
  .hero-actions .ghost:hover {
    border-color: var(--accent);
    color: var(--accent);
  }
  .ghost {
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text);
    border-radius: 999px;
    padding: 0.3rem 0.85rem;
    cursor: pointer;
    font-size: 0.85rem;
  }
  .ghost:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .config-panel {
    margin-top: 1rem;
    padding: 1rem 1.1rem;
    border-radius: 16px;
    background: var(--surface);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 12px 26px rgba(0, 0, 0, 0.25);
  }
  .config-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }
  .config-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .config-grid {
    margin-top: 0.85rem;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 0.9rem;
  }
  .config-grid.tight {
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 0.5rem;
    margin-top: 0.5rem;
  }
  .config-card {
    padding: 0.85rem;
    border-radius: 14px;
    border: 1px solid var(--border);
    background: var(--surface-alt);
    display: grid;
    gap: 0.65rem;
  }
  .config-card h4 {
    margin: 0;
  }
  .config-row {
    display: grid;
    grid-template-columns: minmax(120px, 1fr) minmax(0, 1.4fr);
    gap: 0.65rem;
    align-items: center;
  }
  .config-row input[type='text'],
  .config-row input[type='number'],
  .config-row select {
    width: 100%;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 0.4rem 0.6rem;
    color: var(--text);
  }
  .config-row input[type='range'] {
    width: 100%;
  }
  .range-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .pill-group {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .pill-group button {
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    border-radius: 999px;
    padding: 0.3rem 0.8rem;
    cursor: pointer;
    font-size: 0.85rem;
  }
  .pill-group button.selected {
    border-color: var(--accent);
    color: var(--accent);
  }
  .preset-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .saved-views {
    display: grid;
    gap: 0.5rem;
  }
  .saved-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    padding: 0.45rem 0.6rem;
    border-radius: 10px;
    background: var(--surface);
    border: 1px solid var(--border);
  }
  .saved-actions {
    display: flex;
    gap: 0.4rem;
  }
  .config-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.65rem;
    border-radius: 12px;
    border: 1px solid var(--border);
    background: var(--surface-alt);
    font-size: 0.85rem;
  }
  .config-item.inline {
    justify-content: flex-start;
  }
  .config-item input {
    accent-color: var(--accent);
  }
  .panel-wrap {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    cursor: grab;
  }
  .panel-wrap.dragging {
    opacity: 0.7;
    outline: 1px dashed rgba(0, 172, 172, 0.5);
    border-radius: 16px;
  }
  .bottom-stack {
    display: grid;
    gap: 1.25rem;
    margin-top: 1.5rem;
  }
  .hero-chip {
    display: grid;
    gap: 0.15rem;
    padding: 0.45rem 0.75rem;
    border-radius: 12px;
    border: 1px solid var(--border);
    background: var(--surface-alt);
    min-width: 120px;
    text-align: left;
  }
  .hero-chip span {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--text-muted);
  }
  .hero-chip strong {
    font-size: 1rem;
  }
  .hero-chip small {
    font-size: 0.72rem;
    color: var(--text-muted);
  }

  .grid-top {
    display: grid;
    grid-template-columns:
      minmax(0, var(--grid-left, 55%))
      minmax(0, calc(100% - var(--grid-left, 55%)));
    gap: 1.5rem;
    margin: 1.75rem 0 1.25rem;
  }
  .grid-top.single {
    grid-template-columns: minmax(0, 1fr);
  }
  .grid-mid {
    display: grid;
    grid-template-columns:
      minmax(0, var(--grid-left, 50%))
      minmax(0, calc(100% - var(--grid-left, 50%)));
    gap: 1.5rem;
  }
  .grid-mid.single {
    grid-template-columns: minmax(0, 1fr);
  }

  .card {
    background: var(--surface);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    padding: 1rem 1.1rem;
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.28), inset 0 0 0 1px rgba(255, 255, 255, 0.02);
    animation: rise 0.35s ease;
  }
  .card-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
  }
  .card-head.compact {
    align-items: center;
  }

  .banner {
    margin-top: 1rem;
    padding: 0.6rem 0.8rem;
    border-radius: 10px;
    background: rgba(255, 184, 184, 0.1);
    border: 1px solid rgba(255, 184, 184, 0.2);
  }
  .banner.warning {
    background: rgba(255, 214, 102, 0.12);
    border-color: rgba(255, 214, 102, 0.28);
    color: #f6e3b3;
  }

  .runs-meta {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.5rem;
    min-width: min(100%, 620px);
  }
  .runs-search-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .runs-filter-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }
  .runs-filter-row select {
    border: 1px solid var(--border);
    background: var(--surface-alt);
    color: var(--text);
    border-radius: 999px;
    padding: 0.33rem 0.75rem;
    font-size: 0.8rem;
  }
  .reset-filters {
    font-size: 0.78rem;
    padding: 0.28rem 0.72rem;
  }
  .type-chips {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .type-chips button {
    border: 1px solid var(--border);
    background: var(--surface-alt);
    color: var(--text-muted);
    border-radius: 999px;
    padding: 0.27rem 0.68rem;
    font-size: 0.76rem;
    cursor: pointer;
  }
  .type-chips button.selected {
    border-color: var(--accent);
    color: var(--accent);
    background: rgba(0, 172, 172, 0.1);
  }
  .filter {
    flex: 1 1 auto;
    background: var(--surface-alt);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0.35rem 0.8rem;
    color: var(--text);
    font-size: 0.85rem;
  }
  .muted {
    color: var(--text-muted);
    font-size: 0.95rem;
  }
  .badge {
    background: var(--surface-alt);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0.25rem 0.75rem;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .mono {
    font-family: 'Space Mono', monospace;
  }
  .run-link {
    color: var(--accent-strong);
    text-decoration: none;
    border-bottom: 1px dashed transparent;
  }
  .run-link:hover,
  .run-link:focus-visible {
    color: var(--accent);
    border-bottom-color: currentColor;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    border: 1px solid var(--border);
    padding: 0.18rem 0.52rem;
    font-size: 0.72rem;
    letter-spacing: 0.02em;
    white-space: nowrap;
  }
  .source-pill {
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .type-single {
    color: #b8d7ff;
    border-color: rgba(184, 215, 255, 0.4);
    background: rgba(122, 173, 255, 0.12);
  }
  .type-batch {
    color: #ffd6a7;
    border-color: rgba(255, 214, 167, 0.35);
    background: rgba(255, 188, 94, 0.12);
  }
  .type-walk_forward {
    color: #c9f6c8;
    border-color: rgba(201, 246, 200, 0.35);
    background: rgba(111, 212, 111, 0.12);
  }
  .type-regime_switch {
    color: #f8bfd7;
    border-color: rgba(248, 191, 215, 0.35);
    background: rgba(231, 122, 173, 0.12);
  }
  .type-unknown {
    color: #d5d8de;
    border-color: rgba(213, 216, 222, 0.28);
    background: rgba(213, 216, 222, 0.08);
  }
  .table-wrap {
    margin-top: 0.75rem;
    overflow: auto;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.06);
  }
  .card.resizable {
    resize: vertical;
    overflow: hidden;
    min-height: 320px;
    max-height: 70vh;
    display: flex;
    flex-direction: column;
  }
  .card.resizable .table-wrap {
    flex: 1;
    min-height: 0;
    max-height: none;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }
  th, td {
    padding: 0.5rem 0.7rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    text-align: left;
    white-space: nowrap;
  }
  .density-compact th,
  .density-compact td {
    padding: 0.35rem 0.5rem;
    font-size: 0.82rem;
  }
  .density-spacious th,
  .density-spacious td {
    padding: 0.7rem 0.9rem;
    font-size: 0.95rem;
  }
  tr.selected {
    background: rgba(0, 172, 172, 0.12);
  }
  .summary-strip {
    margin-top: 0.75rem;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 0.65rem;
  }
  .summary-item {
    padding: 0.5rem 0.7rem;
    border-radius: 12px;
    background: var(--surface-alt);
    border: 1px solid rgba(255, 255, 255, 0.08);
    display: grid;
    gap: 0.25rem;
  }
  .summary-item span {
    color: var(--text-muted);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }
  .card-subhead {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
  }
  .split-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 0.75rem;
  }
  .gate-metrics-card,
  .trade-profile-card {
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .run-summary {
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .run-summary-scroll {
    flex: 1 1 auto;
    min-height: 0;
  }
  .gate-metrics-scroll,
  .trade-profile-scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    padding-right: 0.2rem;
    display: grid;
    gap: 0.85rem;
    align-content: start;
  }
  .gate-metrics-scroll .table-wrap {
    max-height: 250px;
    flex: 0 0 auto;
  }
  .trade-profile-scroll .table-wrap {
    max-height: 340px;
    flex: 0 0 auto;
  }
  .tight-scroll {
    max-height: 180px;
  }
  .trade-detail {
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface-alt);
    padding: 0.75rem;
  }
  .trade-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
  .trade-head h4 {
    margin: 0;
  }
  .trade-detail-grid {
    display: grid;
    gap: 0.6rem;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }
  .trade-detail-card {
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    padding: 0.6rem 0.7rem;
  }
  .trade-detail-card h5 {
    margin: 0 0 0.45rem;
    color: var(--text-muted);
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }
  .kv.compact {
    margin: 0;
    gap: 0.3rem;
  }
  .kv.compact li {
    font-size: 0.82rem;
  }
  .kv.compact li span:first-child {
    color: var(--text-muted);
  }

  .trade-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 0.75rem 0;
  }
  .trade-tabs button,
  .trade-filters select,
  .trade-filters input,
  .query-actions .run,
  .run {
    border: 1px solid var(--border);
    background: var(--surface-alt);
    color: var(--text);
    border-radius: 999px;
    padding: 0.35rem 0.85rem;
    cursor: pointer;
    font-size: 0.85rem;
  }
  .trade-tabs button.selected {
    border-color: var(--accent);
    color: var(--accent);
  }
  .trade-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .trade-filters input,
  .trade-filters select {
    min-width: 160px;
  }
  .query-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin: 0.75rem 0;
  }
  .query-actions .run,
  .hero-actions .run {
    background: var(--accent);
    color: #001414;
    border: none;
    font-weight: 600;
  }
  .sql {
    width: 100%;
    background: var(--surface-alt);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 0.75rem;
    color: var(--text);
    font-family: 'Space Mono', monospace;
    font-size: 0.85rem;
  }
  .detail-grid {
    display: grid;
    gap: 1.5rem;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    margin-top: 1rem;
  }
  .kv {
    list-style: none;
    padding: 0;
    margin: 0.5rem 0 1rem;
    display: grid;
    gap: 0.35rem;
  }
  .kv li {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
  }
  .code {
    background: var(--surface-alt);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.75rem;
    font-size: 0.8rem;
    white-space: pre-wrap;
    max-height: 280px;
    overflow: auto;
  }

  .advanced {
    margin-top: 1.75rem;
    border: none;
  }
  .advanced summary {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    padding: 0.85rem 1rem;
    border-radius: 14px;
    background: var(--surface-alt);
    border: 1px solid var(--border);
    cursor: pointer;
    list-style: none;
  }
  .advanced summary::-webkit-details-marker {
    display: none;
  }
  .advanced.llm summary {
    background: linear-gradient(135deg, rgba(0, 172, 172, 0.2), rgba(0, 0, 0, 0.1));
    border-color: rgba(0, 172, 172, 0.25);
  }
  .advanced-grid {
    margin-top: 1rem;
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  }

  .profile-grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    margin-top: 1rem;
  }
  .profile-card {
    background: var(--surface-alt);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 0.75rem;
    overflow: auto;
    max-height: 280px;
  }
  .profile-card h4 {
    margin: 0 0 0.5rem;
    font-size: 0.95rem;
  }
  .profile-card details {
    margin-top: 0.65rem;
  }
  .profile-card summary {
    cursor: pointer;
    color: var(--text-muted);
    font-size: 0.85rem;
  }

  .schema {
    list-style: none;
    padding: 0;
    margin: 1rem 0 0;
    display: grid;
    gap: 0.75rem;
  }
  .schema-tools {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }
  .schema-tools select {
    background: var(--surface-alt);
    border: 1px solid var(--border);
    color: var(--text);
    border-radius: 8px;
    padding: 0.3rem 0.5rem;
    font-size: 0.85rem;
  }
  .schema li button {
    display: grid;
    gap: 0.35rem;
    width: 100%;
    text-align: left;
    padding: 0.5rem;
    border-radius: 10px;
    border: 1px solid transparent;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  .schema li button.selected {
    border-color: var(--accent);
    background: rgba(0, 172, 172, 0.12);
  }
  .schema-meta {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    flex-wrap: wrap;
    color: var(--text-muted);
    font-size: 0.75rem;
  }
  .schema-meta .badge {
    font-size: 0.7rem;
  }
  .tag {
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 999px;
    padding: 0.1rem 0.45rem;
    font-size: 0.7rem;
    text-transform: lowercase;
    letter-spacing: 0.02em;
  }
  .limit {
    display: grid;
    gap: 0.35rem;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .limit input {
    background: var(--surface-alt);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.35rem 0.5rem;
    color: var(--text);
    width: 110px;
  }
  .query-meta {
    display: flex;
    gap: 1rem;
    margin-bottom: 0.5rem;
    color: var(--text-muted);
    font-size: 0.85rem;
  }
  .error {
    color: #ffb8b8;
  }

  @media (max-width: 1100px) {
    .grid-top,
    .grid-mid {
      grid-template-columns: 1fr;
    }
    .hero {
      flex-direction: column;
      align-items: flex-start;
    }
    .hero-actions {
      justify-content: flex-start;
    }
    .config-row {
      grid-template-columns: 1fr;
    }
  }
  @media (min-width: 1101px) {
    .run-summary-scroll {
      overflow: auto;
      padding-right: 0.2rem;
    }
  }
</style>
