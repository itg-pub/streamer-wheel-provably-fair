/**
 * Describes a single prize place in the wheel.
 *
 * Important: this is NOT a "tier with N winners".
 * Each line like `100EUR:1`, `100EUR:2`, `100EUR:3`
 * becomes a separate PrizeTier:
 *
 * - name: "100EUR"
 * - place: 1 / 2 / 3
 *
 * In other words, `place` is a concrete place in the final winners list.
 * If there are fewer participants than prize places, only the first
 * `participants.length` places are drawn. For example:
 *
 * - participants: 1
 * - prize places: 3
 * - winners: 1
 *
 * This allows the wheel to be created before the final number of participants
 * is known.
 */
export type PrizeTier = {
  /**
   * Stable local identifier of the prize place.
   *
   * In this validation tool it is generated as `tier-1`, `tier-2`, ...
   * When integrated with persistent storage, this can be a stored record ID.
   *
   * The ID is included in the proof so a winner is tied not only to a display
   * prize name, but also to a specific prize entity.
   */
  id: string;

  /**
   * Human-readable prize name.
   *
   * Examples:
   * - "100EUR"
   * - "Free spin"
   * - "VIP bonus"
   */
  name: string;

  /**
   * The place number this prize is assigned to.
   *
   * Examples:
   * - place = 1 — first winner
   * - place = 2 — second winner
   * - place = 3 — third winner
   *
   * `place` must be unique within a single round. This is checked by
   * `validateInput`.
   */
  place: number;
};

/**
 * Participant receipt — a public participant entry for the wheel.
 *
 * The idea: when a player joins the wheel, they immediately receive a
 * `hash`. Later, the player can verify that this hash is present
 * in the round's frozen snapshot.
 *
 * The hash is currently built from:
 *
 * - roundId
 * - id
 * - index
 *
 * More fields can be added if needed, for example:
 *
 * - joinedAt
 * - userId
 * - wallet/user public id
 * - nonce
 *
 * The important rule: every field used to build the hash must be stable. The
 * receipt stores id/index/hash, while roundId is recovered from
 * the round proof instead of being duplicated in every receipt.
 */
export type ParticipantReceipt = {
  /**
   * Participant identifier.
   *
   * This can be a user id, username, wallet id, or another public identifier
   * used by the verified round.
   */
  id: string;

  /**
   * Participant's join order inside the round.
   *
   * This binds the receipt to the participant's join position.
   * After freeze, receipt order must not change, otherwise `inputHash`
   * changes as well.
   */
  index: number;

  /**
   * Hash received by the player when they join.
   *
   * The player only needs to keep this hash. After freeze/reveal, they can
   * paste it into the verifier and check that:
   *
   * - the hash exists in the frozen snapshot;
   * - the frozen snapshot matches `inputHash`;
   * - winners are recalculated from the published seeds.
   */
  hash: string;
};

/**
 * Frozen input — immutable input data for the draw.
 *
 * This is the main structure hashed into `inputHash`.
 * It must not be changed after freeze. If a participant is added/removed or
 * prize places are changed after freeze, the hash changes and the proof no
 * longer verifies.
 */
export type FairnessInput = {
  /**
   * Participants included in the draw.
   *
   * Why they are here:
   * - participants are the source of draw entries;
   * - the player only pastes their join hash;
   * - the verifier looks for this hash in frozen participants;
   * - the player does not need to manually enter id/index.
   */
  participants: ParticipantReceipt[];

  /**
   * Prize places created before participant collection is complete.
   *
   * The final number of participants is unknown ahead of time, so the number of
   * winners is `min(participants.length, prizeTiers.length)`.
   */
  prizeTiers: PrizeTier[];
};

/**
 * One winner after reveal.
 *
 * Important: Winner is not only the participant. It also stores the exact
 * prize/place assigned to the participant, so the verifier can show:
 *
 * - declared winners;
 * - recalculated winners;
 * - whether place and prize match.
 */
export type Winner = {
  /** Participant selected by the algorithm. */
  participant: string;

  /** Prize place ID from PrizeTier. */
  tierId: string;

  /** Prize name convenient for UI display. */
  tierName: string;

  /** Place number, for example 1, 2, 3. */
  place: number;
};

/**
 * Proof — public proof of the result after reveal.
 *
 * Its purpose is to allow anyone to independently recalculate the result.
 *
 * The verifier must:
 *
 * 1. Check that `SHA256(serverSeed) === serverSeedHash`.
 * 2. Check that the frozen input produces the same `inputHash`.
 * 3. Repeat the draw algorithm with the same `roundId`, `serverSeed`, `clientSeed`.
 * 4. Compare recalculated winners with `winners`.
 */
export type FairnessProof = {
  /** Round ID, included in the RNG context. */
  roundId: string;

  /**
   * Algorithm version.
   *
   * This is required so old proofs can still be verified after future
   * algorithm changes.
   */
  algorithm: string;

  /**
   * Server secret revealed only after reveal.
   *
   * Before reveal, only `serverSeedHash` should be public.
   */
  serverSeed: string;

  /**
   * Hash of serverSeed published ahead of time.
   *
   * This is the commit: the server cannot reveal a different seed after the
   * draw, because `SHA256(serverSeed)` would no longer match.
   */
  serverSeedHash: string;

  /**
   * Public/client entropy.
   *
   * Ideally this appears after freeze, so neither the server nor the organizer
   * can pick the participant set against a known final random stream.
   */
  clientSeed: string;

  /**
   * Hash of frozen input.
   *
   * In this project it commits to participants and prizeTiers.
   */
  inputHash: string;

  /** Declared winners that the verifier must reproduce. */
  winners: Winner[];
};
