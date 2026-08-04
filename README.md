# @pipeworx/ecb

European Central Bank Data Portal MCP — exchange rates, interest rates, monetary aggregates, HICP, bank lending. No auth.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

- `exchange_rate(currency, start_period?, end_period?, frequency?)` — EUR exchange rate for a given currency
- `get_data(flow_ref, key, start_period?, end_period?, last_n?)` — generic SDMX query
- `list_dataflows(filter?)` — list available data flows
- `hicp_inflation(country?, start_period?, end_period?)` — Harmonised Index of Consumer Prices YoY change

## Common flow refs

- `EXR` — Exchange rates
- `ICP` — Inflation (HICP)
- `BSI` — Bank balance sheet items
- `IRS` — Interest rate statistics
- `STS` — Short-term statistics
- `BLS` — Bank lending survey
- `MIR` — MFI interest rates

## Data source

`https://data-api.ecb.europa.eu/service/data/<flowRef>/<key>?format=jsondata`

Key syntax is dot-separated dimension values. Empty positions = wildcard. E.g. `D.USD.EUR.SP00.A` is daily USD-against-EUR.

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "ecb": {
      "url": "https://gateway.pipeworx.io/ecb/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Ecb data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
