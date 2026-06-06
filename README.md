# Streamer Wheel Provably Fair

Next.js validation tool for checking provably fair streamer wheel results.

The project demonstrates a commit/reveal flow where a player can verify that:

- their personal join hash exists in the frozen participant list;
- the revealed server seed matches the server seed hash published before the draw;
- the frozen participant/prize input was not changed after freeze;
- the declared winners match the deterministic draw algorithm.

## Pages

- `/` — player-facing verifier. The player uploads a JSON proof file or pastes JSON text, enters only their join hash, and verifies the result.
- `/form` — round builder/test page. It creates a wheel, lets participants join, freezes input, reveals winners, and generates player JSON for `/`.

## Install

Use `pnpm`.

```bash
pnpm install
```

## Run Locally

```bash
pnpm dev
```

Open:

```text
http://localhost:3000
```

## Build And Lint

```bash
pnpm lint
pnpm build
```

## Proof Format

The verifier expects JSON with draw input and proof data. The important fields are:

- `input` or `frozenInput` — frozen participants and prize tiers;
- `proof.serverSeedHash` — hash published before reveal;
- `proof.serverSeed` — server seed revealed after the draw;
- `proof.clientSeed` — public/client entropy;
- `proof.inputHash` — hash of frozen input;
- `proof.winners` — declared winners.

The player separately enters their personal join hash. That hash is checked against `input.participants`.

## Algorithm

The draw uses `partial-fisher-yates-hmac-sha256-v1`.

In short:

- `serverSeed`, `clientSeed`, `roundId`, and algorithm version produce a deterministic HMAC-SHA256 random stream;
- partial Fisher-Yates selects unique participants without shuffling the whole list;
- selected participants receive prize places in ascending `place` order.
