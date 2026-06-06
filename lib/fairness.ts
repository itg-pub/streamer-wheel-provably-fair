import {
  HmacRandom,
  canonicalizeParticipant,
  drawUnique,
  inputHash,
  sha256Hex,
} from "./helpers";
import type {
  FairnessInput,
  FairnessProof,
  ParticipantReceipt,
  PrizeTier,
  Winner,
} from "./types";

/**
 * This file is the business-logic facade for provably fair validation.
 *
 * Low-level cryptography intentionally does NOT live here:
 * - SHA-256;
 * - HMAC;
 * - hex/bytes conversion;
 * - deterministic RNG.
 *
 * Those details are implemented in `helpers.ts`.
 *
 * This file keeps domain operations:
 * - create a participant entry;
 * - verify a receipt;
 * - draw winners;
 * - verify a proof;
 * - parse and validate user input.
 *
 * This separation keeps business rules readable without mixing them with byte
 * generation and WebCrypto details.
 */

export type {
  FairnessInput,
  FairnessProof,
  ParticipantReceipt,
  PrizeTier,
  Winner,
} from "./types";
export { generateHexSeed, inputHash, sha256Hex } from "./helpers";

/**
 * Algorithm version.
 *
 * This string is included in the proof and in the random stream context.
 *
 * Why versioning matters:
 * if winner selection changes later, old proofs must still be verifiable using
 * the old implementation.
 *
 * Current technical meaning:
 * - partial-fisher-yates — only the first N winners are selected;
 * - hmac-sha256 — the random stream is derived via HMAC-SHA256;
 * - v1 — version.
 */
export const ALGORITHM = "partial-fisher-yates-hmac-sha256-v1";

/**
 * Creates a join receipt for a participant.
 *
 * When a player joins an open wheel, they immediately receive proof of entry:
 * `hash`.
 *
 * This hash is derived from:
 * - roundId;
 * - id;
 * - index.
 *
 * Important:
 * - the receipt is created BEFORE freeze;
 * - after freeze, all participants become part of frozen input;
 * - later the player can paste only their join hash into the verifier;
 * - the verifier finds this hash in frozen participants.
 *
 * This means the player does not have to manually enter id/index:
 * the hash acts as their ticket into the frozen snapshot.
 */
export async function createParticipantReceipt(
  roundId: string,
  participant: string,
  joinIndex: number,
): Promise<ParticipantReceipt> {
  return {
    id: participant,
    index: joinIndex,
    hash: await sha256Hex(canonicalizeParticipant(roundId, participant, joinIndex)),
  };
}

/**
 * Checks that a receipt is internally consistent.
 *
 * The function recalculates hash from the participant fields and compares it
 * with the stored hash.
 *
 * The current UI mostly verifies by looking up the join hash in the frozen
 * snapshot, so this function is not always called directly from the form.
 * It is still useful as a domain operation: "is this participant receipt
 * valid by itself?"
 */
export async function verifyParticipantReceipt(
  roundId: string,
  receipt: ParticipantReceipt,
): Promise<boolean> {
  const participantHash = await sha256Hex(
    canonicalizeParticipant(roundId, receipt.id, receipt.index),
  );

  return participantHash === receipt.hash;
}

/**
 * Draws winners for frozen input.
 *
 * Inputs:
 * - roundId — part of the random stream context;
 * - serverSeed — revealed server seed;
 * - clientSeed — public/client entropy;
 * - input — frozen participants and prize places.
 *
 * Main properties:
 * - the result is deterministic;
 * - identical inputs always produce identical winners;
 * - if a receipt is added before freeze and the round is frozen again,
 *   inputHash changes and the result may change;
 * - if only reveal is reset while frozen input and seeds stay unchanged,
 *   the result repeats.
 */
export async function drawPrizeWinners(
  roundId: string,
  serverSeed: string,
  clientSeed: string,
  input: FairnessInput,
): Promise<Winner[]> {
  /**
   * Validate frozen input first.
   *
   * Domain constraints checked here:
   * - at least one participant exists;
   * - at least one prize place exists;
   * - prize places are not duplicated.
   */
  await validateInput(roundId, input);

  /**
   * Sort prizes by place.
   *
   * This matters if the user entered prizes out of order, for example:
   *
   * 100EUR:3
   * 100EUR:1
   * 100EUR:2
   *
   * Winners must still be assigned to places 1, 2, 3.
   */
  const sortedPrizes = [...input.prizeTiers].sort((a, b) => a.place - b.place);

  /**
   * Winner count is limited by the smaller of:
   * - participant count;
   * - prize place count.
   *
   * This allows the wheel to be created with any number of prize places before
   * the final participant count is known.
   */
  const participants = input.participants.map((participant) => participant.id);
  const totalWinnerCount = Math.min(participants.length, sortedPrizes.length);

  /**
   * RNG context includes:
   * - algorithm version;
   * - roundId;
   * - clientSeed.
   *
   * serverSeed is used as the HMAC key.
   *
   * As a result, the random stream is bound to a specific round and algorithm
   * version.
   */
  const rng = new HmacRandom(
    serverSeed,
    `${ALGORITHM}:${roundId}:${clientSeed}`,
  );

  /**
   * Select the required number of unique participants.
   *
   * `drawUnique` does not know about prizes. Its only job is to produce N unique
   * participants in a fair deterministic order.
   */
  const selected = await drawUnique(participants, totalWinnerCount, rng);

  /**
   * Assign selected participants to prize places.
   *
   * selected[0] gets sortedPrizes[0], i.e. first place.
   * selected[1] gets sortedPrizes[1], i.e. second place.
   * And so on.
   */
  return selected.map((participant, index) => {
    const prize = sortedPrizes[index];

    return {
      participant,
      tierId: prize.id,
      tierName: prize.name,
      place: prize.place,
    };
  });
}

/**
 * Verifies a full proof after reveal.
 *
 * This models what an independent verifier must do:
 *
 * 1. Check that the proof uses a supported algorithm version.
 * 2. Check that revealed serverSeed matches the previously published
 *    serverSeedHash.
 * 3. Check that frozen input matches inputHash.
 * 4. Recalculate winners.
 * 5. Compare recalculated winners with declared winners.
 */
export async function verifyProof(
  proof: FairnessProof,
  input: FairnessInput,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  /** Proofs from other algorithm versions must not be verified by this implementation. */
  if (proof.algorithm !== ALGORITHM) {
    return { ok: false, reason: "Algorithm mismatch" };
  }

  /**
   * Commit-reveal check.
   *
   * If the server tries to reveal a different serverSeed after the draw,
   * SHA-256 will not match the previously published serverSeedHash.
   */
  const serverSeedHash = await sha256Hex(proof.serverSeed);
  if (serverSeedHash !== proof.serverSeedHash) {
    return { ok: false, reason: "Server seed hash mismatch" };
  }

  /**
   * Frozen input check.
   *
   * If participants or prizes are changed after freeze, inputHash
   * will no longer match.
   */
  const frozenInputHash = await inputHash(input);
  if (frozenInputHash !== proof.inputHash) {
    return { ok: false, reason: "Input hash mismatch" };
  }

  /** Repeat the draw using the same algorithm and the same seeds. */
  const winners = await drawPrizeWinners(
    proof.roundId,
    proof.serverSeed,
    proof.clientSeed,
    input,
  );

  /**
   * Compare the full winner structure:
   * - participant;
   * - tierId;
   * - tierName;
   * - place.
   *
   * This is simpler than manually comparing fields. If Winner grows, this can
   * be replaced with a more explicit deepEqual function.
   */
  if (JSON.stringify(winners) !== JSON.stringify(proof.winners)) {
    return { ok: false, reason: "Winners mismatch" };
  }

  return { ok: true };
}

/**
 * Parses a textarea with participant rows.
 *
 * Used by pages where participants can be entered as a list of lines.
 * In the join flow, participants are added one by one and receive hashes,
 * but this function remains part of the public API.
 *
 * Behavior:
 * - empty lines are ignored;
 * - surrounding whitespace is removed;
 * - duplicates are removed while keeping the first occurrence.
 */
export function parseParticipants(value: string): string[] {
  const seen = new Set<string>();
  const participants: string[] = [];

  for (const rawLine of value.split("\n")) {
    const participant = rawLine.trim();
    if (!participant || seen.has(participant)) {
      continue;
    }

    seen.add(participant);
    participants.push(participant);
  }

  return participants;
}

/**
 * Parses a textarea with prize places.
 *
 * Row format:
 *
 *   <name>:<place>
 *
 * Examples:
 *
 *   100EUR:1
 *   100EUR:2
 *   Bonus:3
 *
 * Important business meaning:
 * the number after `:` is NOT winner count.
 * It is the concrete place number.
 */
export function parsePrizeTiers(value: string): PrizeTier[] {
  return value
    .split("\n")
    .map((line, index) => {
      /**
       * For the current format, split(":") is enough.
       * If a prize name can contain a colon, the format should be replaced
       * with separate form fields or structured JSON.
       */
      const [rawName, rawPlace] = line.split(":");
      const name = rawName?.trim();
      const place = Number(rawPlace?.trim());

      /**
       * Invalid rows are silently ignored.
       *
       * This is convenient for quick input, but a strict form should show
       * the exact row-level validation error.
       */
      if (!name || !Number.isInteger(place) || place < 1) {
        return null;
      }

      return {
        id: `tier-${index + 1}`,
        name,
        place,
      };
    })
    .filter((tier): tier is PrizeTier => tier !== null);
}

/**
 * Validates frozen input before freeze/draw.
 *
 * This checks business invariants, not cryptography.
 *
 * Invariants:
 * - a draw cannot run without participants;
 * - a draw cannot run without prizes;
 * - two prizes cannot have the same place.
 */
export async function validateInput(
  roundId: string,
  input: FairnessInput,
): Promise<void> {
  if (input.participants.length === 0) {
    throw new Error("Add at least one participant");
  }

  if (input.prizeTiers.length === 0) {
    throw new Error("Add at least one prize tier");
  }

  for (const participant of input.participants) {
    if (!(await verifyParticipantReceipt(roundId, participant))) {
      throw new Error(`Participant hash is invalid: ${participant.id}`);
    }
  }

  const places = new Set<number>();
  for (const tier of input.prizeTiers) {
    if (places.has(tier.place)) {
      throw new Error(`Prize place ${tier.place} is duplicated`);
    }

    places.add(tier.place);
  }
}
