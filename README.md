# custos-attestation

Signs Nansen attestations for Custos, pull-on-demand. Like Pyth Hermes or Chainlink Data Streams, this service never sends a transaction: a client asks for a signed payload and relays it to `NansenModule.submitAttestation` itself. The contract checks the signature against the attestor address, binds the payload to the agent (the signed wallet must be the agent's creator), and rejects anything older than what it already holds.

```
client ──GET /attestation/:wallet──▶ service ──Nansen Profiler──▶ label, pnl, winRate
       ◀── {wallet,label,pnl,winRate,timestamp,hash,signature,attestor} ──
client ──submitAttestation(agentId, …payload, signature)──▶ NansenModule
```

## Layout

```
src/
  index.ts              listen
  app.ts                composition root: config → Nansen client → service → routes
  config.ts             env → typed config, fails fast on missing vars
  routes/attestation.ts GET /attestation/:wallet
  attestation/
    sign.ts             attestHash + EIP-191 signature (mirrors NansenModule)
    service.ts          profile → hash → sign; JSON shape
  nansen/
    client.ts           NansenClient interface + HttpNansenClient (labels, pnl-summary)
    fixture.ts          FixtureNansenClient, used when NANSEN_API_KEY is empty
    profile.ts          Nansen → {label, pnl, winRate}; label policy; per-wallet cache
fixtures/nansen.json    wallet → labels/pnl for local runs
test/                   unit, HTTP (via app.handle), opt-in e2e against anvil
```

## Run

```bash
cp .env.example .env      # ATTESTOR_PRIVATE_KEY, NANSEN_API_KEY
bun install
bun dev                   # http://localhost:3001
curl localhost:3001/attestation/0x70997970C51812dc3A010C7d01b50e0d17dc79C8
```

`ATTESTOR_PRIVATE_KEY` must match `NansenModule.attestor()`; otherwise every relayed payload reverts with `AttestationInvalid`. With `NANSEN_API_KEY` empty the service reads `fixtures/nansen.json`.

## Endpoints

| | |
|---|---|
| `GET /health` | `{ ok, attestor, nansen: "http" \| "fixture" }` |
| `GET /attestation/:wallet` | Signed payload for that wallet. `pnl` is a decimal string. A fresh `timestamp` per call, so a newer pull always supersedes an older one on-chain. |

Nansen results are cached per wallet for `PROFILE_TTL_MS` (default 10 min) so repeated pulls do not each spend credits; the timestamp and signature are still fresh per call.

## What Nansen provides

| Hash field | Source |
|---|---|
| `label` | `POST /api/v1/profiler/address/premium-labels`, falling back to `/labels`; first match in `LABEL_PRIORITY` (`profile.ts`), else any `smart_money` label, else `""` |
| `pnl` | `realized_pnl_usd` from `POST /api/v1/profiler/address/pnl-summary`, whole USD |
| `winRate` | `win_rate` from the same call, clamped 0..100 |

A wallet Nansen knows nothing about still gets a payload with an empty label and zero PnL.

## Tests

```bash
bun test          # unit + HTTP
```

The e2e test deploys nothing itself; point it at an anvil that has the Custos stack, pull a payload, relay it from a wallet that is not the attestor, and assert `verifyAttestation` returns true:

```bash
# cd ../custos-contract && anvil            (terminal 1)
# cd ../custos-contract && make deploy RPC_URL=http://127.0.0.1:8545   (terminal 2)
E2E_RPC_URL=http://127.0.0.1:8545 \
E2E_ATTESTOR_KEY=<DEPLOYER_PRIVATE_KEY from custos-contract/.env.example> \
E2E_RELAYER_KEY=<DEMO_USER_PRIVATE_KEY from the same file> \
bun test test/e2e.test.ts
```
