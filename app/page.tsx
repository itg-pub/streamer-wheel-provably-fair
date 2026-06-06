"use client";

import { CheckCircle2, ShieldCheck } from "lucide-react";
import { type ReactNode, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import {
  ALGORITHM,
  type FairnessInput,
  type Winner,
  drawPrizeWinners,
  inputHash,
  sha256Hex,
} from "../lib/fairness";

const GITHUB_REPOSITORY_URL =
  "https://github.com/itg-pub/streamer-wheel-provably-fair";

type PlayerVerifierPayload = {
  roundId?: string;
  algorithm?: string;
  serverSeedHash?: string;
  inputHash?: string;
  frozenInputHash?: string;
  participantsHash?: string;
  serverSeed?: string;
  clientSeed?: string;
  wheel?: {
    roundId?: string;
    algorithm?: string;
    serverSeedHash?: string;
  };
  beforeDraw?: {
    serverSeedHash?: string;
  };
  frozenInput?: FairnessInput;
  input?: FairnessInput;
  participants?: FairnessInput["participants"];
  prizeTiers?: FairnessInput["prizeTiers"];
  freeze?: {
    frozenInput?: FairnessInput;
    inputHash?: string;
    frozenInputHash?: string;
    participantsHash?: string;
  };
  afterFreeze?: {
    inputHash?: string;
    frozenInputHash?: string;
    participantsHash?: string;
  };
  declaredWinners?: Winner[];
  winners?: Winner[];
  verifierInput?: {
    serverSeedHash?: string;
    inputHash?: string;
    frozenInputHash?: string;
    participantsHash?: string;
    serverSeed?: string;
    clientSeed?: string;
  };
  proof?: {
    roundId?: string;
    algorithm?: string;
    serverSeed?: string;
    serverSeedHash?: string;
    clientSeed?: string;
    inputHash?: string;
    winners?: Winner[];
  };
  reveal?: {
    serverSeed?: string;
    clientSeed?: string;
    proof?: {
      roundId?: string;
      algorithm?: string;
      serverSeed?: string;
      serverSeedHash?: string;
      clientSeed?: string;
      inputHash?: string;
      winners?: Winner[];
    };
  };
  afterReveal?: {
    serverSeed?: string;
    clientSeed?: string;
    declaredWinners?: Winner[];
  };
};

type VerificationState =
  | { status: "idle"; message: string }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type DetailsModal = "participants" | "winners" | null;

export default function Home() {
  const [roundJson, setRoundJson] = useState("");
  const [roundJsonFileName, setRoundJsonFileName] = useState("");
  const [roundJsonLoaded, setRoundJsonLoaded] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [participantHash, setParticipantHash] = useState("");
  const [participantHashError, setParticipantHashError] = useState("");
  const [serverSeedHash, setServerSeedHash] = useState("");
  const [frozenInputHash, setFrozenInputHash] = useState("");
  const [serverSeed, setServerSeed] = useState("");
  const [clientSeed, setClientSeed] = useState("");
  const [verification, setVerification] = useState<VerificationState>({
    status: "idle",
    message: "Upload a JSON file or paste text, then click Verify.",
  });
  const [detailsModal, setDetailsModal] = useState<DetailsModal>(null);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);

  async function handleRoundJsonFileChange(file: File | null) {
    if (!file) {
      return;
    }

    try {
      const value = await file.text();
      const loaded = handleRoundJsonChange(value);
      if (!loaded) {
        setVerification({
          status: "error",
          message: "The file was read, but the JSON is invalid.",
        });
        return;
      }

      setRoundJsonFileName(file.name);
      setVerification({
        status: "idle",
        message: `File ${file.name} loaded. Enter the Player join hash and click Verify.`,
      });
    } catch {
      setVerification({
        status: "error",
        message: "Failed to read the JSON file.",
      });
    }
  }

  function handleRoundJsonChange(value: string): boolean {
    setRoundJson(value);

    if (!value.trim()) {
      setRoundJsonLoaded(false);
      setServerSeedHash("");
      setFrozenInputHash("");
      setServerSeed("");
      setClientSeed("");
      return false;
    }

    try {
      fillFieldsFromJson(JSON.parse(value));
      setRoundJsonLoaded(true);
      setShowTextInput(false);
      return true;
    } catch {
      // Keep the current values while the user is still pasting/editing JSON.
      setRoundJsonLoaded(false);
      return false;
    }
  }

  function fillFieldsFromJson(payload: PlayerVerifierPayload) {
    setServerSeedHash(
      payload.verifierInput?.serverSeedHash ??
        payload.proof?.serverSeedHash ??
        payload.reveal?.proof?.serverSeedHash ??
        payload.serverSeedHash ??
        payload.wheel?.serverSeedHash ??
        payload.beforeDraw?.serverSeedHash ??
        "",
    );
    setFrozenInputHash(
      payload.verifierInput?.inputHash ??
        payload.verifierInput?.frozenInputHash ??
        payload.verifierInput?.participantsHash ??
        payload.proof?.inputHash ??
        payload.reveal?.proof?.inputHash ??
        payload.inputHash ??
        payload.frozenInputHash ??
        payload.participantsHash ??
        payload.freeze?.inputHash ??
        payload.freeze?.frozenInputHash ??
        payload.freeze?.participantsHash ??
        payload.afterFreeze?.inputHash ??
        payload.afterFreeze?.frozenInputHash ??
        payload.afterFreeze?.participantsHash ??
        "",
    );
    setServerSeed(
      payload.verifierInput?.serverSeed ??
        payload.proof?.serverSeed ??
        payload.reveal?.proof?.serverSeed ??
        payload.reveal?.serverSeed ??
        payload.afterReveal?.serverSeed ??
        payload.serverSeed ??
        "",
    );
    setClientSeed(
      payload.verifierInput?.clientSeed ??
        payload.proof?.clientSeed ??
        payload.reveal?.proof?.clientSeed ??
        payload.reveal?.clientSeed ??
        payload.afterReveal?.clientSeed ??
        payload.clientSeed ??
        "",
    );
  }

  async function verifyPlayerData() {
    setParticipantHashError("");

    let payload: PlayerVerifierPayload;
    try {
      payload = JSON.parse(roundJson);
    } catch {
      setVerification({
        status: "error",
        message: "JSON cannot be parsed. Check the syntax and try again.",
      });
      return;
    }

    const algorithm =
      payload.algorithm ??
      payload.wheel?.algorithm ??
      payload.proof?.algorithm ??
      payload.reveal?.proof?.algorithm;
    if (algorithm && algorithm !== ALGORITHM) {
      setVerification({
        status: "error",
        message: "The algorithm version in JSON does not match this verifier.",
      });
      return;
    }

    const roundId = (
      payload.roundId ??
      payload.wheel?.roundId ??
      payload.proof?.roundId ??
      payload.reveal?.proof?.roundId
    )?.trim();
    if (!roundId) {
      setVerification({
        status: "error",
        message: "JSON must contain roundId.",
      });
      return;
    }

    const rootInput =
      payload.participants && payload.prizeTiers
        ? {
            participants: payload.participants,
            prizeTiers: payload.prizeTiers,
          }
        : null;
    const frozenInput =
      payload.frozenInput ??
      payload.input ??
      payload.freeze?.frozenInput ??
      rootInput;
    if (!frozenInput) {
      setVerification({
        status: "error",
        message:
          "JSON must contain frozenInput/input or participants and prizeTiers fields.",
      });
      return;
    }

    const joinHash = participantHash.trim();
    if (!joinHash) {
      setParticipantHashError("Enter the player join hash.");
      return;
    }

    const participantEntry = (frozenInput.participants ?? []).find(
      (item) => item.hash === joinHash,
    );
    if (!participantEntry) {
      setParticipantHashError("Player join hash was not found in JSON.");
      return;
    }

    const actualServerSeedHash = await sha256Hex(serverSeed.trim());
    if (actualServerSeedHash !== serverSeedHash.trim()) {
      setVerification({
        status: "error",
        message: "Server seed does not match the server seed hash.",
      });
      return;
    }

    const actualFrozenInputHash = await inputHash(frozenInput);
    if (actualFrozenInputHash !== frozenInputHash.trim()) {
      setVerification({
        status: "error",
        message: "JSON frozenInput does not match the frozen input hash.",
      });
      return;
    }

    const winnersFromJson =
      payload.declaredWinners ??
      payload.winners ??
      payload.proof?.winners ??
      payload.reveal?.proof?.winners ??
      payload.afterReveal?.declaredWinners ??
      [];

    if (winnersFromJson.length === 0) {
      setVerification({
        status: "error",
        message: "JSON must contain declaredWinners or winners.",
      });
      return;
    }

    const winners = await drawPrizeWinners(
      roundId,
      serverSeed.trim(),
      clientSeed.trim(),
      frozenInput,
    );

    if (JSON.stringify(winners) !== JSON.stringify(winnersFromJson)) {
      setVerification({
        status: "error",
        message:
          "Hashes match, but calculated winners differ from JSON.",
      });
      return;
    }

    const playerWin = winners.find(
      (winner) => winner.participant === participantEntry.id,
    );
    setVerification({
      status: "success",
      message: playerWin
        ? `Fair result. Join hash found for ${participantEntry.id}; the player won place #${playerWin.place} (${playerWin.tierName}).`
        : `Fair result. Join hash found for ${participantEntry.id}; the player participated but did not win.`,
    });
  }

  function clearVerifier() {
    setRoundJson("");
    setRoundJsonFileName("");
    setRoundJsonLoaded(false);
    setShowTextInput(false);
    setParticipantHash("");
    setParticipantHashError("");
    setServerSeedHash("");
    setFrozenInputHash("");
    setServerSeed("");
    setClientSeed("");
    setDetailsModal(null);
    setHowItWorksOpen(false);
    setVerification({
      status: "idle",
      message: "Upload a JSON file or paste text, then click Verify.",
    });
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8">
        <header className="border-b pb-6">
          <Badge className="gap-2 px-4 py-2 text-base" variant="secondary">
            <ShieldCheck className="size-5" />
            Provably fair verifier
          </Badge>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">
            Player Result Verification
          </h1>
          <p className="mt-3 max-w-3xl text-muted-foreground">
            The player uploads the round JSON and public proof data. The verifier checks
            that the join hash exists in frozen input, the seed matches the commit
            hash, the participant list was not changed, and the winners match
            the deterministic algorithm. For transparency, this validator is kept
            in an open{" "}
            <a
              href={GITHUB_REPOSITORY_URL}
              rel="noreferrer"
              target="_blank"
              className="font-medium text-foreground underline underline-offset-4 hover:text-foreground/80"
            >
              GitHub repository
            </a>
            , so anyone can inspect the source code and verify how the checks are
            performed.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Button onClick={() => setHowItWorksOpen(true)} variant="secondary">
              How It Works
            </Button>
            <Button asChild variant="outline">
              <a
                href={GITHUB_REPOSITORY_URL}
                rel="noreferrer"
                target="_blank"
              >
                <GitHubIcon />
                View Source on GitHub
              </a>
            </Button>
          </div>
        </header>

        <section className="space-y-4">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="size-5 text-muted-foreground" />
              Player verification form
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              No internal admin actions: only the data the player received after the draw.
            </p>
          </div>

          <Field error={participantHashError} label="Player join hash">
            <Input
              className="font-mono"
              onChange={(event) => {
                setParticipantHash(event.target.value);
                setParticipantHashError("");
              }}
              placeholder="hash received on join"
              value={participantHash}
            />
          </Field>

          {roundJsonLoaded && (
            <>
              <ResultCard verification={verification} />
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button onClick={verifyPlayerData}>Verify</Button>
                <Button onClick={clearVerifier} variant="secondary">
                  Clear
                </Button>
              </div>
            </>
          )}

          {!roundJsonLoaded && (
            <>
              <div className="grid gap-3">
                <Field
                  hint="By default, the verifier expects a JSON file."
                  label="Round JSON file"
                >
                  <Input
                    accept="application/json,.json"
                    onChange={(event) =>
                      void handleRoundJsonFileChange(event.target.files?.[0] ?? null)
                    }
                    type="file"
                  />
                </Field>
                <Button
                  className="w-fit"
                  onClick={() => setShowTextInput((current) => !current)}
                  variant="secondary"
                >
                  Paste Text
                </Button>
              </div>

              {showTextInput && (
                <Field
                  hint="JSON must contain roundId, frozenInput/input, and declaredWinners/winners."
                  label="Round JSON text"
                >
                  <Textarea
                    className="min-h-80 font-mono text-xs"
                    onChange={(event) => handleRoundJsonChange(event.target.value)}
                    placeholder={JSON.stringify(
                      {
                        roundId: "stream-001",
                        algorithm: ALGORITHM,
                        frozenInput: {
                          participants: [
                            {
                              id: "alice",
                              index: 1,
                              hash: "player join hash",
                            },
                          ],
                          prizeTiers: [
                            { id: "tier-1", name: "100EUR", place: 1 },
                          ],
                        },
                        declaredWinners: [
                          {
                            participant: "alice",
                            tierId: "tier-1",
                            tierName: "100EUR",
                            place: 1,
                          },
                        ],
                      },
                      null,
                      2,
                    )}
                    value={roundJson}
                  />
                </Field>
              )}
            </>
          )}

          {roundJsonLoaded && (
            <>
              <div className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  JSON loaded{roundJsonFileName ? `: ${roundJsonFileName}` : ""}.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    onClick={() => setDetailsModal("participants")}
                    size="sm"
                    variant="secondary"
                  >
                    Show Participants
                  </Button>
                  <Button
                    onClick={() => setDetailsModal("winners")}
                    size="sm"
                    variant="secondary"
                  >
                    Show Winners
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <ValueCard label="Published server seed hash" value={serverSeedHash} />
                <ValueCard label="Frozen input hash" value={frozenInputHash} />
                <ValueCard label="Revealed server seed" value={serverSeed} />
                <ValueCard label="Public / client seed" value={clientSeed} />
              </div>

            </>
          )}
        </section>
        <DetailsDialog
          modal={detailsModal}
          onClose={() => setDetailsModal(null)}
          payload={parseRoundPayload(roundJson)}
        />
        <HowItWorksDialog
          onOpenChange={setHowItWorksOpen}
          open={howItWorksOpen}
        />
      </div>
    </main>
  );
}

function HowItWorksDialog({
  open,
  onOpenChange,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>How Verification Works</DialogTitle>
          <DialogDescription>
            The verifier does not trust the organizer&apos;s claim. It takes public data
            from JSON, recalculates every control hash, and repeats winner
            selection locally in the browser.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] space-y-6 overflow-auto pr-2 text-sm">
          <section className="space-y-3 rounded-lg border p-4">
            <h3 className="font-semibold">What Data The Player Needs</h3>
            <p className="text-muted-foreground">
              Verification needs two things: the player&apos;s personal join hash and the public
              draw JSON. The player receives the join hash when joining the
              wheel. The JSON is published after reveal and contains frozen
              input, proof, seeds, hashes, and declared winners.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold">1. Check That The Player Was In The Round</h3>
            <p className="text-muted-foreground">
              The player enters their join hash. The verifier searches for that hash inside
              the frozen input participant list. If the hash is found, that
              participant was really included in the fixed snapshot. If the hash
              is not found, the player is not in the published snapshot and the
              result cannot be considered verified for them.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold">2. Check That The List Was Not Changed After Freeze</h3>
            <p className="text-muted-foreground">
              The JSON contains frozen input: participants, their join hashes, join order,
              and prize places. The verifier hashes this block. If the result
              matches the input hash from proof, participants and prizes were not
              replaced after freeze. Changing even one participant, player hash,
              order, or prize place changes the hash.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold">3. Check The Server Seed Commit</h3>
            <p className="text-muted-foreground">
              Before reveal, the organizer publishes only the server seed hash. The actual
              server seed stays hidden, so it cannot be used to pick winners in
              advance. After reveal, the server seed is published. The verifier
              calculates SHA-256 of the revealed server seed and compares it with
              the published server seed hash. If they differ, the seed was
              changed.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold">4. Client Seed Adds Public Entropy</h3>
            <p className="text-muted-foreground">
              Client seed is part of the random stream context together with round id and
              server seed. Ideally, client seed is known only after freeze or
              comes from a public source. Then the organizer cannot tune the
              participant list against a known final random stream.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold">5. How The Algorithm Selects Winners</h3>
            <p className="text-muted-foreground">
              The algorithm does not spin a visual wheel and does not use browser randomness
              during verification. It builds a verifiable random stream from
              `serverSeed`, `clientSeed`, `roundId`, and algorithm version using
              HMAC-SHA256. The same inputs always produce the same stream.
            </p>
            <p className="text-muted-foreground">
              Then partial Fisher-Yates shuffle is used. On the first step, the algorithm
              selects a random index from the full participant list and moves that
              participant to the first selected position. On the second step, it
              selects only from the remaining participants and moves the selected
              participant to the second position. This continues until all prize
              places that can be drawn are filled.
            </p>
            <p className="text-muted-foreground">
              An already selected participant is excluded from later steps, so the same
              player cannot take two places in one draw. After participants are
              selected, prizes are assigned by `place`: the first selected
              participant gets place #1, the second selected participant gets
              place #2, and so on.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold">What A Successful Verification Means</h3>
            <p className="text-muted-foreground">
              Success means four things at once: the player&apos;s join hash was found in frozen
              input, the revealed server seed matched the previously published
              hash, frozen input matched input hash, and locally calculated
              winners matched the declared winners. If any part fails, the
              verifier shows an error.
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function parseRoundPayload(roundJson: string): PlayerVerifierPayload | null {
  try {
    return JSON.parse(roundJson);
  } catch {
    return null;
  }
}

function getFrozenInput(payload: PlayerVerifierPayload | null): FairnessInput | null {
  if (!payload) {
    return null;
  }

  const rootInput =
    payload.participants && payload.prizeTiers
      ? {
          participants: payload.participants,
          prizeTiers: payload.prizeTiers,
        }
      : null;

  return payload.frozenInput ?? payload.input ?? payload.freeze?.frozenInput ?? rootInput;
}

function getDeclaredWinners(payload: PlayerVerifierPayload | null): Winner[] {
  if (!payload) {
    return [];
  }

  return (
    payload.declaredWinners ??
    payload.winners ??
    payload.proof?.winners ??
    payload.reveal?.proof?.winners ??
    payload.afterReveal?.declaredWinners ??
    []
  );
}

function DetailsDialog({
  modal,
  onClose,
  payload,
}: Readonly<{
  modal: DetailsModal;
  onClose: () => void;
  payload: PlayerVerifierPayload | null;
}>) {
  const frozenInput = getFrozenInput(payload);
  const winners = getDeclaredWinners(payload);

  return (
    <Dialog open={Boolean(modal)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl p-0">
        <div className="border-b p-4 pr-12">
          <DialogHeader>
            <DialogTitle>
              {modal === "participants" ? "Participants" : "Winners"}
            </DialogTitle>
            <DialogDescription>Data from the loaded JSON.</DialogDescription>
          </DialogHeader>
        </div>

        <div className="max-h-[65vh] overflow-auto p-4">
          {modal === "participants" ? (
            <ParticipantsTable participants={frozenInput?.participants ?? []} />
          ) : (
            <WinnersTable winners={winners} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ParticipantsTable({
  participants,
}: Readonly<{
  participants: FairnessInput["participants"];
}>) {
  if (participants.length === 0) {
    return <p className="text-sm text-muted-foreground">No participants.</p>;
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b text-left">
          <th className="p-3 font-medium">Index</th>
          <th className="p-3 font-medium">Participant</th>
          <th className="p-3 font-medium">Join hash</th>
        </tr>
      </thead>
      <tbody>
        {participants.map((participant) => (
          <tr className="border-b" key={participant.hash}>
            <td className="p-3">{participant.index}</td>
            <td className="p-3 font-medium">{participant.id}</td>
            <td className="break-all p-3 font-mono text-xs">{participant.hash}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function WinnersTable({
  winners,
}: Readonly<{
  winners: Winner[];
}>) {
  if (winners.length === 0) {
    return <p className="text-sm text-muted-foreground">No winners.</p>;
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b text-left">
          <th className="p-3 font-medium">Place</th>
          <th className="p-3 font-medium">Participant</th>
          <th className="p-3 font-medium">Prize</th>
          <th className="p-3 font-medium">Tier ID</th>
        </tr>
      </thead>
      <tbody>
        {winners.map((winner) => (
          <tr className="border-b" key={`${winner.place}-${winner.participant}`}>
            <td className="p-3">#{winner.place}</td>
            <td className="p-3 font-medium">{winner.participant}</td>
            <td className="p-3">{winner.tierName}</td>
            <td className="p-3 font-mono text-xs">{winner.tierId}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: Readonly<{
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}>) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function ValueCard({
  label,
  value,
}: Readonly<{
  label: string;
  value: string;
}>) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 break-all font-mono text-sm">{value || "-"}</p>
    </div>
  );
}

function GitHubIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-4"
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.1 3.29 9.42 7.86 10.95.58.1.79-.25.79-.56v-2.16c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.27-1.69-1.27-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.24 3.34.95.1-.74.4-1.24.72-1.53-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.15 1.18A10.9 10.9 0 0 1 12 6.07c.97 0 1.95.13 2.86.39 2.18-1.49 3.14-1.18 3.14-1.18.62 1.58.23 2.75.11 3.04.74.8 1.18 1.82 1.18 3.08 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14v3.18c0 .31.21.67.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

function ResultCard({
  verification,
}: Readonly<{
  verification: VerificationState;
}>) {
  const className =
    verification.status === "error"
      ? "rounded-lg border border-destructive/40 bg-destructive/5 p-4"
      : verification.status === "success"
        ? "rounded-lg border border-primary/40 bg-primary/5 p-4"
        : "rounded-lg border bg-muted/30 p-4";

  return (
    <div className={className}>
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
        Result
      </p>
      <p
        className={
          verification.status === "error"
            ? "mt-2 text-sm text-destructive"
            : "mt-2 text-sm text-foreground"
        }
      >
        {verification.message}
      </p>
    </div>
  );
}
