interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * ECB Data Portal MCP — European Central Bank statistical data
 *
 * The ECB exposes SDMX 2.1 REST endpoints. Default format is XML; we ask for
 * SDMX-JSON via `?format=jsondata`.
 *
 * Auth: none.
 * API docs: https://data.ecb.europa.eu/help/api/
 *
 * Tools:
 * - exchange_rate:     EUR → currency rate (convenience over EXR flow)
 * - hicp_inflation:    Harmonised CPI YoY change (convenience over ICP flow)
 * - get_data:          generic SDMX query against any flow
 * - list_dataflows:    enumerate flow refs in the ECB catalogue
 */


const BASE = 'https://data-api.ecb.europa.eu/service';

const tools: McpToolExport['tools'] = [
  {
    name: 'exchange_rate',
    description:
      'Daily EUR exchange rate against a currency. Returns time series of observations. Currency is the ISO 4217 code (e.g. "USD", "GBP", "JPY", "CHF").',
    inputSchema: {
      type: 'object',
      properties: {
        currency: { type: 'string', description: 'ISO 4217 currency code (USD, GBP, JPY, ...)' },
        start_period: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        end_period: { type: 'string', description: 'End date (YYYY-MM-DD)' },
        frequency: {
          type: 'string',
          description: 'Observation frequency — D (daily), M (monthly), Q (quarterly), A (annual). Default D.',
        },
      },
      required: ['currency'],
    },
  },
  {
    name: 'hicp_inflation',
    description:
      'Harmonised Index of Consumer Prices (HICP) annual rate of change for a country / euro area. Monthly frequency. country defaults to U2 (euro area).',
    inputSchema: {
      type: 'object',
      properties: {
        country: {
          type: 'string',
          description: 'Reference area — U2 (euro area, default), DE, FR, IT, ES, NL, BE, etc.',
        },
        start_period: { type: 'string', description: 'Start date (YYYY or YYYY-MM)' },
        end_period: { type: 'string', description: 'End date (YYYY or YYYY-MM)' },
      },
    },
  },
  {
    name: 'get_data',
    description:
      'Generic SDMX data fetch from any ECB flow. Key is dot-separated dimension values; empty positions are wildcards. Example: flow_ref="EXR", key="D.USD.EUR.SP00.A" (daily USD/EUR spot).',
    inputSchema: {
      type: 'object',
      properties: {
        flow_ref: {
          type: 'string',
          description: 'Flow reference — EXR (exchange rates), ICP (HICP), BSI, IRS, STS, BLS, MIR, ...',
        },
        key: {
          type: 'string',
          description: 'Series key, dot-separated dimension values',
        },
        start_period: { type: 'string', description: 'Start date / period' },
        end_period: { type: 'string', description: 'End date / period' },
        last_n: { type: 'number', description: 'Return only the last N observations' },
      },
      required: ['flow_ref', 'key'],
    },
  },
  {
    name: 'list_dataflows',
    description: 'List ECB SDMX data flows. Optional substring filter on flow ref or name.',
    inputSchema: {
      type: 'object',
      properties: {
        filter: { type: 'string', description: 'Case-insensitive substring filter' },
      },
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'exchange_rate':
      return exchangeRate(args);
    case 'hicp_inflation':
      return hicpInflation(args);
    case 'get_data':
      return getData(args);
    case 'list_dataflows':
      return listDataflows(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function exchangeRate(args: Record<string, unknown>) {
  const currency = reqStr(args, 'currency', '"USD"').toUpperCase();
  const freq = ((args.frequency as string) ?? 'D').toUpperCase();
  // EXR flow key: FREQ.CURRENCY.CURRENCY_DENOM.EXR_TYPE.EXR_SUFFIX
  const key = `${freq}.${currency}.EUR.SP00.A`;
  return fetchData('EXR', key, {
    start_period: args.start_period as string | undefined,
    end_period: args.end_period as string | undefined,
  });
}

async function hicpInflation(args: Record<string, unknown>) {
  const country = ((args.country as string) ?? 'U2').toUpperCase();
  // ICP flow key: FREQ.REF_AREA.ADJUSTMENT.ICP_ITEM.STS_INSTITUTION.ICP_SUFFIX
  // M.U2.N.000000.4.ANR = monthly euro area annual rate of change, all items
  const key = `M.${country}.N.000000.4.ANR`;
  return fetchData('ICP', key, {
    start_period: args.start_period as string | undefined,
    end_period: args.end_period as string | undefined,
  });
}

async function getData(args: Record<string, unknown>) {
  return fetchData(reqStr(args, 'flow_ref', '"EXR"'), reqStr(args, 'key', '"D.USD.EUR.SP00.A"'), {
    start_period: args.start_period as string | undefined,
    end_period: args.end_period as string | undefined,
    last_n: args.last_n as number | undefined,
  });
}

async function fetchData(
  flow: string,
  key: string,
  opts: { start_period?: string; end_period?: string; last_n?: number },
) {
  const params = new URLSearchParams({ format: 'jsondata' });
  if (opts.start_period) params.set('startPeriod', opts.start_period);
  if (opts.end_period) params.set('endPeriod', opts.end_period);
  if (opts.last_n) params.set('lastNObservations', String(opts.last_n));
  const url = `${BASE}/data/${encodeURIComponent(flow)}/${encodeURIComponent(key)}?${params}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (res.status === 404) throw new Error(`ECB: no data for flow=${flow} key=${key}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ECB error: ${res.status} ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as SdmxData;
  return normalizeSdmx(flow, key, data);
}

interface SdmxData {
  dataSets?: {
    series?: Record<string, { observations?: Record<string, [number | null, ...unknown[]]> }>;
  }[];
  structure?: {
    dimensions?: {
      series?: { id: string; name?: string; values?: { id: string; name?: string }[] }[];
      observation?: { id: string; name?: string; values?: { id: string; name?: string }[] }[];
    };
    attributes?: {
      series?: { id: string; values?: { id: string; name?: string }[] }[];
    };
  };
}

function normalizeSdmx(flow: string, key: string, data: SdmxData) {
  const seriesDims = data.structure?.dimensions?.series ?? [];
  const obsDims = data.structure?.dimensions?.observation ?? [];
  const series = data.dataSets?.[0]?.series ?? {};
  const out: { series_key: string; dimensions: Record<string, string>; observations: { period: string; value: number | null }[] }[] = [];
  for (const [skey, sval] of Object.entries(series)) {
    const idx = skey.split(':').map(Number);
    const dims: Record<string, string> = {};
    seriesDims.forEach((d, i) => {
      const v = d.values?.[idx[i]];
      if (v) dims[d.id] = v.name ?? v.id;
    });
    const obs: { period: string; value: number | null }[] = [];
    for (const [oidx, ovals] of Object.entries(sval.observations ?? {})) {
      const period = obsDims[0]?.values?.[Number(oidx)]?.id ?? oidx;
      obs.push({ period, value: ovals[0] ?? null });
    }
    obs.sort((a, b) => (a.period < b.period ? -1 : 1));
    out.push({ series_key: skey, dimensions: dims, observations: obs });
  }
  return { flow, key, series_count: out.length, series: out };
}

async function listDataflows(args: Record<string, unknown>) {
  const url = `${BASE}/dataflow/ECB?format=jsondata`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ECB error: ${res.status} ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { data?: { dataflows?: { id: string; name?: { en?: string } | string }[] } };
  const flows = data.data?.dataflows ?? [];
  const filter = ((args.filter as string) ?? '').toLowerCase();
  const items = flows
    .map((f) => ({
      flow_ref: f.id,
      name: typeof f.name === 'string' ? f.name : (f.name?.en ?? f.id),
    }))
    .filter((f) => !filter || f.flow_ref.toLowerCase().includes(filter) || f.name.toLowerCase().includes(filter));
  return { count: items.length, dataflows: items };
}

function reqStr(args: Record<string, unknown>, key: string, example: string): string {
  const v = args[key];
  if (typeof v !== 'string' || !v.trim()) {
    throw new Error(`Required argument "${key}" is missing. Pass a string like ${example}.`);
  }
  return v;
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
