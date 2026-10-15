import { json } from '@sveltejs/kit';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { resolveGulfchainRoot } from '$lib/server/gulfchainRoot.js';
import { resolveMysticPaths } from '$lib/server/mysticPaths.js';

const HISTORY_PREFIX = 'poolcare_chemical_history_';
const ALL_USERS_HISTORY_PREFIX = 'poolcare_all_users_history_';
const SERVICES_PREFIX = 'poolcare_services_';
const MAX_SERVICES = 150000;
const execFileAsync = promisify(execFile);
const photoSignalCache = new Map();

const normalizeSlashes = (value) => String(value || '').replace(/\\/g, '/');

const parseNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const match = String(value).match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseLocalDate = (value) => {
  if (!value) return null;
  const raw = String(value).trim();
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slash) return `${slash[3]}-${slash[1].padStart(2, '0')}-${slash[2].padStart(2, '0')}`;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
};

const formatSize = (size) => {
  if (!Number.isFinite(size)) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
};

async function listFiles(rootDir, displaySegments = []) {
  const entries = await fs.readdir(rootDir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name.endsWith('.sqlite-wal') || entry.name.endsWith('.sqlite-shm')) continue;
    const absPath = path.join(rootDir, entry.name);
    const stat = await fs.stat(absPath).catch(() => null);
    files.push({
      name: entry.name,
      path: normalizeSlashes(path.join('Mystic', ...displaySegments, entry.name)),
      size: stat?.size || 0,
      sizeLabel: formatSize(stat?.size || 0),
      modifiedAt: stat?.mtime?.toISOString?.() || ''
    });
  }
  return files.sort((a, b) => String(b.modifiedAt).localeCompare(String(a.modifiedAt)));
}

async function sqliteJson(dbPath, sql) {
  const { stdout } = await execFileAsync('sqlite3', ['-readonly', '-json', dbPath, sql], {
    maxBuffer: 1024 * 1024 * 256
  });
  const raw = String(stdout || '').trim();
  return raw ? JSON.parse(raw) : [];
}

function pickLatest(files, prefix, suffix = '.json') {
  return files
    .filter(
      (file) =>
        file.name.startsWith(prefix) &&
        file.name.endsWith(suffix) &&
        !file.name.includes('.raw-grid.') &&
        !file.name.endsWith('_partial.json')
    )
    .sort((a, b) => String(b.modifiedAt).localeCompare(String(a.modifiedAt)))[0];
}

function readingMap(service) {
  const map = {};
  for (const reading of service?.measures?.readings || []) {
    const key = String(reading?.name || '').trim();
    if (!key) continue;
    map[key] = {
      raw: String(reading?.value ?? '').trim(),
      value: parseNumber(reading?.value)
    };
  }
  return map;
}

function normalizeAdditions(additions = []) {
  return (additions || [])
    .filter((item) => Number(item?.amount_number || 0) !== 0 || String(item?.chemical || '').trim())
    .map((item) => ({
      chemical: String(item?.chemical || 'Unknown').trim(),
      amount: Number(item?.amount_number || 0),
      amountLabel: String(item?.amount || '').trim(),
      unit: String(item?.unit || '').trim()
    }));
}

async function loadChemicalDetails(files, mysticPaths) {
  const chemicalFile = pickLatest(files, HISTORY_PREFIX, '.json');
  if (!chemicalFile) return { file: null, byService: new Map() };

  try {
    const raw = await fs.readFile(path.join(mysticPaths.outputsDir, chemicalFile.name), 'utf-8');
    const data = JSON.parse(raw);
    const byService = new Map();

    for (const day of data.days || []) {
      for (const service of day.services || []) {
        const serviceId = String(service?.service_id || '').trim();
        if (!serviceId) continue;
        byService.set(serviceId, {
          readings: readingMap(service),
          additions: normalizeAdditions(service.treatments?.additions || []),
          measureNotes: String(service.measures?.notes || ''),
          treatmentNotes: String(service.treatments?.notes || ''),
          scrapedAt: data.scraped_at || '',
          file: chemicalFile.name
        });
      }
    }

    return { file: chemicalFile, byService };
  } catch {
    return { file: chemicalFile, byService: new Map() };
  }
}

function resolvePhotoPath(localPath, mysticPaths) {
  const clean = String(localPath || '').replace(/\\/g, '/').replace(/^all_users\//, '');
  if (!clean) return '';

  for (const root of [mysticPaths.allUsersDir, mysticPaths.outputsDir]) {
    const target = path.resolve(root, clean);
    const rel = path.relative(root, target);
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) return target;
  }
  return '';
}

async function analyzePhotoSignal(localPath, mysticPaths) {
  const target = resolvePhotoPath(localPath, mysticPaths);
  if (!target) return { greenWater: false, score: 0 };
  if (photoSignalCache.has(target)) return photoSignalCache.get(target);

  const result = await sharp(target)
    .resize({ width: 96, height: 96, fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
    .then(({ data, info }) => {
      let greenPixels = 0;
      let visiblePixels = 0;
      const channels = info.channels || 3;
      const pixels = Math.max(1, Math.floor(data.length / channels));

      for (let index = 0; index < data.length; index += channels) {
        const red = data[index] || 0;
        const green = data[index + 1] || 0;
        const blue = data[index + 2] || 0;
        const brightness = (red + green + blue) / 3;
        const saturation = (Math.max(red, green, blue) - Math.min(red, green, blue)) / Math.max(1, Math.max(red, green, blue));

        if (brightness < 35 || brightness > 235 || saturation < 0.12) continue;
        visiblePixels += 1;
        if (green > red * 1.15 && green > blue * 1.08 && green - red > 18 && green - blue > 10) greenPixels += 1;
      }

      const greenRatio = greenPixels / pixels;
      const visibleGreenRatio = greenPixels / Math.max(1, visiblePixels);
      const score = Number(Math.max(greenRatio, visibleGreenRatio).toFixed(3));
      return { greenWater: greenRatio >= 0.08 && visibleGreenRatio >= 0.16, score };
    })
    .catch(() => ({ greenWater: false, score: 0 }));

  photoSignalCache.set(target, result);
  return result;
}

async function analyzeServicePhotos(photos, mysticPaths) {
  const signals = await Promise.all(
    (photos || [])
      .filter((photo) => photo?.localPath)
      .slice(0, 4)
      .map((photo) => analyzePhotoSignal(photo.localPath, mysticPaths))
  );
  const strongest = signals.reduce((max, signal) => Math.max(max, signal.score || 0), 0);
  return {
    greenWater: signals.some((signal) => signal.greenWater),
    greenScore: Number(strongest.toFixed(3))
  };
}

function needsPhotoChemistryCheck(readings) {
  const freeCl = readings['Chlorine - FREE CL']?.value;
  return freeCl !== null && freeCl !== undefined && freeCl < 1;
}

function flagService(service, readings, additions, options = {}) {
  const flags = [];
  const isOpen = String(service.status || '').toLowerCase() === 'open' || !String(service.completed || '').trim();
  const pH = readings['pH']?.value;
  const freeCl = readings['Chlorine - FREE CL']?.value;
  const totalCl = readings['Chlorine - TOTAL CL']?.value;
  const cya = readings['Cyanuric Acid/Stabilizer']?.value;
  const alkalinity = readings['Total Alkalinity']?.value;
  const phosphates = readings['Phosphates']?.value;
  const customer = String(service.customer || '');
  const notes = `${customer} ${service.measures?.notes || ''} ${service.treatments?.notes || ''}`;
  const visibleAlgaeIssue = /\b(algae|algaecide|green)\b/i.test(notes) || Boolean(options.photoSignals?.greenWater);

  if (isOpen) {
    flags.push({ level: 'critical', label: 'Open service' });
    if (/\b(call|dog|bite|do not|approval|send pic|no diag|photo|picture)\b/i.test(notes)) {
      flags.push({ level: 'critical', label: 'Customer instruction' });
    }
    return flags;
  }

  if (!options.gridOnly) {
    if (!service.measures?.readings?.length) flags.push({ level: 'critical', label: 'Missing readings' });
    if (!service.treatments || !Array.isArray(service.treatments.additions)) flags.push({ level: 'warn', label: 'Missing treatment log' });
    if (pH !== null && pH !== undefined && pH >= 7.9) flags.push({ level: 'warn', label: 'pH high' });
    if (pH !== null && pH !== undefined && pH <= 7.1) flags.push({ level: 'warn', label: 'pH low' });
    if (freeCl !== null && freeCl !== undefined && freeCl < 1 && visibleAlgaeIssue) {
      flags.push({ level: 'warn', label: options.photoSignals?.greenWater ? 'Low chlorine with green photo' : 'Low chlorine with algae' });
    }
    if (freeCl !== null && freeCl !== undefined && freeCl > 6) flags.push({ level: 'warn', label: 'Free chlorine high' });
    if (totalCl !== null && totalCl !== undefined && freeCl !== null && freeCl !== undefined && totalCl > freeCl + 1) {
      flags.push({ level: 'warn', label: 'Combined chlorine gap' });
    }
    if (cya !== null && cya !== undefined && cya >= 100) flags.push({ level: 'warn', label: 'Stabilizer high' });
    if (alkalinity !== null && alkalinity !== undefined && (alkalinity < 70 || alkalinity > 130)) {
      flags.push({ level: 'warn', label: 'Alkalinity review' });
    }
    if (phosphates !== null && phosphates !== undefined && phosphates > 500) flags.push({ level: 'warn', label: 'Phosphates elevated' });
    if (!additions.length) flags.push({ level: 'info', label: 'No chemicals added' });
  }
  if (/\b(call|dog|bite|do not|approval|send pic|no diag|photo|picture)\b/i.test(notes)) {
    flags.push({ level: 'critical', label: 'Customer instruction' });
  }
  return flags;
}

function normalizePhotos(service) {
  return (service.photos || [])
    .filter((photo) => photo && typeof photo === 'object')
    .map((photo, index) => {
      const localPath = String(photo.local_path || photo.localPath || '').replace(/\\/g, '/');
      const sourceUrl = String(photo.source_url || photo.sourceUrl || photo.url || '').trim();
      const src = localPath ? `/api/mystic/photo?path=${encodeURIComponent(localPath)}` : sourceUrl;
      return {
        label: String(photo.label || `Visit photo ${index + 1}`).trim(),
        localPath,
        sourceUrl,
        contentType: String(photo.content_type || photo.contentType || '').trim(),
        src,
        thumbSrc: localPath ? `${src}&w=720` : sourceUrl
      };
    })
    .filter((photo) => photo.src);
}

function groupBy(rows, key) {
  const grouped = new Map();
  for (const row of rows) {
    const value = row[key];
    if (!grouped.has(value)) grouped.set(value, []);
    grouped.get(value).push(row);
  }
  return grouped;
}

function buildServiceFromDb(row, readingsByService, additionsByService, photosByService, source) {
  const readings = {};
  for (const reading of readingsByService.get(row.service_id) || []) {
    const key = String(reading.name || '').trim();
    if (!key) continue;
    readings[key] = {
      raw: String(reading.value ?? '').trim(),
      value: parseNumber(reading.value)
    };
  }

  const additions = normalizeAdditions(additionsByService.get(row.service_id) || []);

  const photoRows = photosByService.get(row.service_id) || [];
  const photos = normalizePhotos({
    photos: photoRows.map((photo, index) => ({
      label: photo.label || `Visit photo ${index + 1}`,
      local_path: photo.local_path || '',
      source_url: photo.source_url || '',
      content_type: photo.content_type || ''
    }))
  });

  return {
    id: row.service_id,
    customerId: row.customer_id || '',
    customer: row.customer || 'Unknown customer',
    address: row.address || row.customer_address || '',
    assignedTo: row.assigned_to || '',
    serviceDate: row.service_date || '',
    completed: row.completed || '',
    repeat: row.repeat || '',
    status: row.status || '',
    type: row.service_type || '',
    serviceUrl: row.service_url ? `${source}${row.service_url}` : '',
    siteUrl: row.site_url ? `${source}${row.site_url}` : '',
    readings: {
      pH: readings['pH']?.raw || '',
      freeChlorine: readings['Chlorine - FREE CL']?.raw || '',
      totalChlorine: readings['Chlorine - TOTAL CL']?.raw || '',
      alkalinity: readings['Total Alkalinity']?.raw || '',
      stabilizer: readings['Cyanuric Acid/Stabilizer']?.raw || '',
      temperature: readings['Water Temperature']?.raw || '',
      phosphates: readings['Phosphates']?.raw || ''
    },
    additions,
    photos,
    _flagSource: {
      status: row.status || '',
      completed: row.completed || '',
      customer: row.customer || '',
      measures: { readings: Object.entries(readings).map(([name, value]) => ({ name, value: value.raw })), notes: row.measure_notes || '' },
      treatments: { additions, notes: row.treatment_notes || '' }
    },
    _readingsForFlags: readings
  };
}

function applyChemicalDetails(service, detail) {
  if (!detail) return service;
  const readings = detail.readings || {};
  service.readings = {
    pH: readings['pH']?.raw || service.readings.pH || '',
    freeChlorine: readings['Chlorine - FREE CL']?.raw || service.readings.freeChlorine || '',
    totalChlorine: readings['Chlorine - TOTAL CL']?.raw || service.readings.totalChlorine || '',
    alkalinity: readings['Total Alkalinity']?.raw || service.readings.alkalinity || '',
    stabilizer: readings['Cyanuric Acid/Stabilizer']?.raw || service.readings.stabilizer || '',
    temperature: readings['Water Temperature']?.raw || service.readings.temperature || '',
    phosphates: readings['Phosphates']?.raw || service.readings.phosphates || ''
  };
  if (detail.additions?.length) service.additions = detail.additions;
  service._flagSource.measures = {
    readings: Object.entries(readings).map(([name, value]) => ({ name, value: value.raw })),
    notes: detail.measureNotes || service._flagSource.measures?.notes || ''
  };
  service._flagSource.treatments = {
    additions: service.additions,
    notes: detail.treatmentNotes || service._flagSource.treatments?.notes || ''
  };
  service._readingsForFlags = readings;
  service.chemicalSource = detail.file || '';
  return service;
}

async function summarizeDb(dbPath, files, mysticPaths) {
  const chemicalDetails = await loadChemicalDetails(files, mysticPaths);
  const [
    exportsRows,
    servicesRows,
    readingsRows,
    additionsRows,
    photosRows,
    customersRows,
    summaryRows,
    dailyRows,
    statusRows,
    typeRows
  ] = await Promise.all([
    sqliteJson(dbPath, 'SELECT * FROM exports ORDER BY id DESC LIMIT 1'),
    sqliteJson(
      dbPath,
      `SELECT
        s.*,
        c.primary_address AS customer_address
      FROM services s
      LEFT JOIN customers c ON c.customer_id = s.customer_id
      ORDER BY s.service_date DESC, s.customer ASC
      LIMIT ${MAX_SERVICES}`
    ),
    sqliteJson(dbPath, 'SELECT * FROM readings'),
    sqliteJson(dbPath, 'SELECT * FROM chemical_additions'),
    sqliteJson(dbPath, 'SELECT * FROM photos'),
    sqliteJson(dbPath, 'SELECT * FROM customers ORDER BY name'),
    sqliteJson(
      dbPath,
      `SELECT
        COUNT(*) AS service_count,
        COUNT(DISTINCT customer) AS customer_count,
        COUNT(DISTINCT service_date) AS day_count,
        MIN(service_date) AS earliest_service_date,
        MAX(service_date) AS latest_service_date,
        (SELECT COUNT(*) FROM photos WHERE local_path <> '') AS photo_count,
        SUM(
          CASE
            WHEN COALESCE(NULLIF(TRIM(s.address), ''), NULLIF(TRIM(c.primary_address), '')) IS NOT NULL
            THEN 1
            ELSE 0
          END
        ) AS address_count
      FROM services s
      LEFT JOIN customers c ON c.customer_id = s.customer_id`
    ),
    sqliteJson(
      dbPath,
      `SELECT service_date AS date, COUNT(*) AS count
      FROM services
      WHERE service_date <> ''
      GROUP BY service_date
      ORDER BY service_date`
    ),
    sqliteJson(
      dbPath,
      `SELECT COALESCE(NULLIF(status, ''), 'Unknown') AS label, COUNT(*) AS count
      FROM services
      GROUP BY COALESCE(NULLIF(status, ''), 'Unknown')
      ORDER BY count DESC, label`
    ),
    sqliteJson(
      dbPath,
      `SELECT COALESCE(NULLIF(service_type, ''), 'Unknown') AS label, COUNT(*) AS count
      FROM services
      GROUP BY COALESCE(NULLIF(service_type, ''), 'Unknown')
      ORDER BY count DESC, label`
    )
  ]);

  const exportRow = exportsRows[0] || {};
  const summaryRow = summaryRows[0] || {};
  const source = String(exportRow.source || 'https://mystic.poolcareonline.com').replace(/\/+$/, '');
  const readingsByService = groupBy(readingsRows, 'service_id');
  const additionsByService = groupBy(additionsRows, 'service_id');
  const photosByService = groupBy(photosRows, 'service_id');
  const serviceRecords = [];
  const chemicalTotals = new Map();

  for (const row of servicesRows) {
    const service = applyChemicalDetails(
      buildServiceFromDb(row, readingsByService, additionsByService, photosByService, source),
      chemicalDetails.byService.get(row.service_id)
    );
    const photoSignals = needsPhotoChemistryCheck(service._readingsForFlags || {})
      ? await analyzeServicePhotos(service.photos, mysticPaths)
      : { greenWater: false, greenScore: 0 };
    service.flags = flagService(service._flagSource, service._readingsForFlags || {}, service.additions, {
      gridOnly: readingsRows.length === 0,
      photoSignals
    });
    service.photoSignals = photoSignals;
    delete service._flagSource;
    delete service._readingsForFlags;

    const serviceDate = service.serviceDate || '';

    for (const addition of service.additions) {
      const key = `${addition.chemical}|${addition.unit}`;
      const current = chemicalTotals.get(key) || { chemical: addition.chemical, unit: addition.unit, amount: 0, uses: 0 };
      current.amount += Number(addition.amount || 0);
      current.uses += 1;
      chemicalTotals.set(key, current);
    }

    serviceRecords.push(service);
  }

  const reviewRecords = serviceRecords
    .filter((service) => service.flags.some((flag) => flag.level === 'critical' || flag.level === 'warn'))
    .sort((a, b) => {
      const aCritical = a.flags.some((flag) => flag.level === 'critical') ? 1 : 0;
      const bCritical = b.flags.some((flag) => flag.level === 'critical') ? 1 : 0;
      return bCritical - aCritical || String(b.serviceDate).localeCompare(String(a.serviceDate));
    });

  const latestServiceDate = summaryRow.latest_service_date || '';

  return {
    ok: true,
    meta: {
      source,
      scrapedAt: exportRow.scraped_at || '',
      indexedAt: exportRow.indexed_at || '',
      dateRange: exportRow.start_date || exportRow.end_date ? { start: exportRow.start_date || '', end: exportRow.end_date || '' } : null,
      user: '',
      historyFile: path.basename(exportRow.export_path || ''),
      chemicalHistoryFile: chemicalDetails.file?.name || '',
      servicesFile: '',
      detailMode: readingsRows.length === 0 ? 'grid' : 'sqlite',
      earliestServiceDate: summaryRow.earliest_service_date || '',
      latestServiceDate,
      databasePath: dbPath,
      workspacePath: '/Volumes/OWC/Mystic/Mystic.code-workspace'
    },
    summary: {
      serviceCount: Number(summaryRow.service_count || 0),
      customerCount: Number(summaryRow.customer_count || 0),
      dayCount: Number(summaryRow.day_count || 0),
      reviewCount: reviewRecords.length,
      criticalCount: reviewRecords.filter((service) => service.flags.some((flag) => flag.level === 'critical')).length,
      chemicalTypes: chemicalTotals.size,
      photoCount: Number(summaryRow.photo_count || 0),
      addressCount: Number(summaryRow.address_count || 0),
      loadedServiceCount: serviceRecords.length,
      loadedPhotoCount: serviceRecords.reduce((sum, service) => sum + (service.photos?.length || 0), 0)
    },
    daily: dailyRows,
    chemicals: Array.from(chemicalTotals.values())
      .map((item) => ({
        ...item,
        amount: Number(item.amount.toFixed(2))
      }))
      .sort((a, b) => b.uses - a.uses || a.chemical.localeCompare(b.chemical)),
    statusCounts: statusRows,
    typeCounts: typeRows,
    customers: customersRows.map((customer) => ({
      id: customer.customer_id || '',
      name: customer.name || '',
      address: customer.primary_address || '',
      siteUrl: customer.site_url ? `${source}${customer.site_url}` : '',
      firstServiceDate: customer.first_service_date || '',
      lastServiceDate: customer.last_service_date || '',
      serviceCount: Number(customer.service_count || 0),
      photoCount: Number(customer.photo_count || 0)
    })),
    reviewRecords: reviewRecords.slice(0, 80),
    services: serviceRecords.sort((a, b) => String(b.serviceDate).localeCompare(String(a.serviceDate))).slice(0, MAX_SERVICES),
    files
  };
}

async function summarize(data, files, historyFile, servicesFile, mysticPaths) {
  const source = String(data.source || 'https://mystic.poolcareonline.com').replace(/\/+$/, '');
  const gridOnly = data.detail_mode === 'grid' || data.detail_mode === 'grid_export';
  const serviceRecords = [];
  const dayCounts = new Map();
  const chemicalTotals = new Map();
  const customerSet = new Set();
  const statusCounts = new Map();
  const typeCounts = new Map();
  const seen = new Set();
  let photoCount = 0;

  for (const day of data.days || []) {
    for (const service of day.services || []) {
      if (serviceRecords.length >= MAX_SERVICES) break;
      const serviceKey = service.service_id || `${service.service_date || day.date || ''}-${service.customer || ''}-${service.completed || ''}`;
      if (seen.has(serviceKey)) continue;
      seen.add(serviceKey);

      const readings = readingMap(service);
      const additions = normalizeAdditions(service.treatments?.additions || []);
      const photos = normalizePhotos(service);
      const photoSignals = needsPhotoChemistryCheck(readings)
        ? await analyzeServicePhotos(photos, mysticPaths)
        : { greenWater: false, greenScore: 0 };
      const flags = flagService(service, readings, additions, { gridOnly, photoSignals });
      photoCount += photos.filter((photo) => photo.localPath).length;
      const serviceDate = parseLocalDate(service.service_date) || day.date || '';
      const serviceUrl = service.service_url ? `${source}${service.service_url}` : '';
      const siteUrl = service.site_url ? `${source}${service.site_url}` : '';

      dayCounts.set(serviceDate, (dayCounts.get(serviceDate) || 0) + 1);
      customerSet.add(String(service.customer || 'Unknown customer'));
      statusCounts.set(service.status || 'Unknown', (statusCounts.get(service.status || 'Unknown') || 0) + 1);
      typeCounts.set(service.service_type || 'Unknown', (typeCounts.get(service.service_type || 'Unknown') || 0) + 1);

      for (const addition of additions) {
        const key = `${addition.chemical}|${addition.unit}`;
        const current = chemicalTotals.get(key) || { chemical: addition.chemical, unit: addition.unit, amount: 0, uses: 0 };
        current.amount += Number(addition.amount || 0);
        current.uses += 1;
        chemicalTotals.set(key, current);
      }

      serviceRecords.push({
        id: service.service_id || `${serviceDate}-${serviceRecords.length}`,
        customerId: '',
        customer: service.customer || 'Unknown customer',
        address: service.address || '',
        assignedTo: service.assigned_to || '',
        serviceDate,
        completed: service.completed || '',
        repeat: service.repeat || '',
        status: service.status || '',
        type: service.service_type || '',
        serviceUrl,
        siteUrl,
        readings: {
          pH: readings['pH']?.raw || '',
          freeChlorine: readings['Chlorine - FREE CL']?.raw || '',
          totalChlorine: readings['Chlorine - TOTAL CL']?.raw || '',
          alkalinity: readings['Total Alkalinity']?.raw || '',
          stabilizer: readings['Cyanuric Acid/Stabilizer']?.raw || '',
          temperature: readings['Water Temperature']?.raw || '',
          phosphates: readings['Phosphates']?.raw || ''
        },
        additions,
        photos,
        photoSignals,
        flags
      });
    }
  }

  const reviewRecords = serviceRecords
    .filter((service) => service.flags.some((flag) => flag.level === 'critical' || flag.level === 'warn'))
    .sort((a, b) => {
      const aCritical = a.flags.some((flag) => flag.level === 'critical') ? 1 : 0;
      const bCritical = b.flags.some((flag) => flag.level === 'critical') ? 1 : 0;
      return bCritical - aCritical || String(b.serviceDate).localeCompare(String(a.serviceDate));
    });

  const latestServiceDate = serviceRecords
    .map((service) => service.serviceDate)
    .filter(Boolean)
    .sort()
    .at(-1) || '';

  return {
    ok: true,
    meta: {
      source,
      scrapedAt: data.scraped_at || '',
      dateRange: data.date_range || null,
      user: data.user?.name || data.user || '',
      historyFile: historyFile?.name || '',
      servicesFile: servicesFile?.name || '',
      detailMode: data.detail_mode || '',
      latestServiceDate,
      workspacePath: '/Volumes/OWC/Mystic/Mystic.code-workspace'
    },
    summary: {
      serviceCount: serviceRecords.length,
      customerCount: customerSet.size,
      dayCount: dayCounts.size,
      reviewCount: reviewRecords.length,
      criticalCount: reviewRecords.filter((service) => service.flags.some((flag) => flag.level === 'critical')).length,
      chemicalTypes: chemicalTotals.size,
      photoCount
    },
    daily: Array.from(dayCounts.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    chemicals: Array.from(chemicalTotals.values())
      .map((item) => ({
        ...item,
        amount: Number(item.amount.toFixed(2))
      }))
      .sort((a, b) => b.uses - a.uses || a.chemical.localeCompare(b.chemical)),
    statusCounts: Array.from(statusCounts.entries()).map(([label, count]) => ({ label, count })),
    typeCounts: Array.from(typeCounts.entries()).map(([label, count]) => ({ label, count })),
    customers: Array.from(customerSet.values())
      .map((name) => ({ id: '', name, address: '', siteUrl: '', firstServiceDate: '', lastServiceDate: '', serviceCount: 0, photoCount: 0 }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    reviewRecords: reviewRecords.slice(0, 80),
    services: serviceRecords.sort((a, b) => String(b.serviceDate).localeCompare(String(a.serviceDate))).slice(0, MAX_SERVICES),
    files
  };
}

export async function GET() {
  const gulfchainRoot = resolveGulfchainRoot();
  if (!gulfchainRoot) {
    return json({ ok: false, error: 'Gulfchain root not found. Set GULFCHAIN_ROOT or run from the DeskOps workspace.' }, { status: 500 });
  }

  const mysticPaths = resolveMysticPaths(gulfchainRoot);
  const files = [
    ...(await listFiles(mysticPaths.storageDir, ['storage'])),
    ...(await listFiles(mysticPaths.allUsersDir, ['poolcare_scraper', 'outputs', 'all_users'])),
    ...(await listFiles(mysticPaths.outputsDir, ['poolcare_scraper', 'outputs']))
  ];
  const historyFile = pickLatest(files, ALL_USERS_HISTORY_PREFIX, '.json') || pickLatest(files, HISTORY_PREFIX, '.json');
  const servicesFile = pickLatest(files, SERVICES_PREFIX, '.json');

  try {
    await fs.access(mysticPaths.sqlitePath);
    return json(await summarizeDb(mysticPaths.sqlitePath, files, mysticPaths), {
      headers: { 'cache-control': 'no-store' }
    });
  } catch {
    // Fall back to the most recent JSON export if the SQLite database is missing.
  }

  if (!historyFile) {
    return json({ ok: false, error: 'No Mystic SQLite database or PoolCarePro JSON export found.' }, { status: 404 });
  }

  try {
    const raw = await fs.readFile(path.join(mysticPaths.mysticRoot, historyFile.path.replace(/^Mystic\//, '')), 'utf-8');
    const data = JSON.parse(raw);
    return json(await summarize(data, files, historyFile, servicesFile, mysticPaths), {
      headers: { 'cache-control': 'no-store' }
    });
  } catch (err) {
    return json({ ok: false, error: err?.message || 'Failed to read Mystic dashboard data.' }, { status: 500 });
  }
}
