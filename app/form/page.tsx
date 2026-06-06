"use client";

import {
  CheckCircle2,
  CircleDot,
  Clipboard,
  Hash,
  Lock,
  ShieldCheck,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import {
  ALGORITHM,
  type FairnessInput,
  type FairnessProof,
  type ParticipantReceipt,
  type Winner,
  createParticipantReceipt,
  drawPrizeWinners,
  generateHexSeed,
  inputHash,
  parsePrizeTiers,
  sha256Hex,
  validateInput,
} from "../../lib/fairness";

const statusLabels = {
  draft: "Draft",
  open: "Open for joins",
  expired: "Join window closed",
  frozen: "Frozen",
  revealed: "Revealed",
} as const;

export default function Home() {
  const [roundId, setRoundId] = useState("stream-001");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [tiersText, setTiersText] = useState(
    ["100EUR:1", "100EUR:2", "100EUR:3"].join("\n"),
  );
  const [serverSeed, setServerSeed] = useState("");
  const [serverSeedHash, setServerSeedHash] = useState("");
  const [createdAt, setCreatedAt] = useState("");
  const [joinsCloseAt, setJoinsCloseAt] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [participantName, setParticipantName] = useState("");
  const [participantEntries, setParticipantEntries] = useState<
    ParticipantReceipt[]
  >([]);
  const [frozenInput, setFrozenInput] = useState<FairnessInput | null>(null);
  const [frozenInputHash, setFrozenInputHash] = useState("");
  const [clientSeed, setClientSeed] = useState("");
  const [proof, setProof] = useState<FairnessProof | null>(null);
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");

  const [verifyParticipantHash, setVerifyParticipantHash] = useState("");
  const [verifyServerSeedHash, setVerifyServerSeedHash] = useState("");
  const [verifyInputHash, setVerifyInputHash] = useState("");
  const [verifyServerSeed, setVerifyServerSeed] = useState("");
  const [verifyClientSeed, setVerifyClientSeed] = useState("");
  const [verifyResult, setVerifyResult] = useState("");
  const [recalculatedWinners, setRecalculatedWinners] = useState<Winner[]>([]);

  const prizeTiers = useMemo(() => parsePrizeTiers(tiersText), [tiersText]);
  const participants = useMemo(
    () => participantEntries.map((entry) => entry.id),
    [participantEntries],
  );
  const drawablePlaces = Math.min(participants.length, prizeTiers.length);
  const joinCloseMs = joinsCloseAt ? new Date(joinsCloseAt).getTime() : 0;
  const joinWindowExpired =
    Boolean(serverSeedHash) && joinCloseMs > 0 && nowMs >= joinCloseMs;
  const canJoin = Boolean(serverSeedHash) && !frozenInput && !joinWindowExpired;
  const status: keyof typeof statusLabels = proof
    ? "revealed"
    : frozenInput
      ? "frozen"
      : joinWindowExpired
        ? "expired"
        : serverSeedHash
          ? "open"
          : "draft";
  const debugJson = {
    wheel: {
      roundId,
      status,
      algorithm: ALGORITHM,
      createdAt,
      joinsCloseAt,
      joinWindowExpired,
      canJoin,
      serverSeedHash,
    },
    prizeTiers,
    participants,
    participantEntries,
    freeze: {
      frozenInput,
      inputHash: frozenInputHash,
    },
    reveal: {
      serverSeed: proof?.serverSeed ?? null,
      clientSeed,
      proof,
    },
    verifier: {
      participantHash: verifyParticipantHash,
      serverSeedHash: verifyServerSeedHash,
      inputHash: verifyInputHash,
      serverSeed: verifyServerSeed,
      clientSeed: verifyClientSeed,
      result: verifyResult,
      recalculatedWinners,
    },
  };
  const playerJson = {
    roundId,
    algorithm: ALGORITHM,
    frozenInput,
    declaredWinners: proof?.winners ?? [],
    status,
    beforeDraw: {
      serverSeedHash,
      joinsCloseAt,
    },
    afterFreeze: {
      inputHash: frozenInputHash || null,
      participantJoinHashes: participantEntries.map((receipt) => ({
        participant: receipt.id,
        joinHash: receipt.hash,
      })),
    },
    afterReveal: {
      serverSeed: proof?.serverSeed ?? null,
      clientSeed: proof?.clientSeed ?? null,
      declaredWinners: proof?.winners ?? [],
    },
    verifierInput: {
      participantJoinHash:
        verifyParticipantHash || participantEntries[0]?.hash || "",
      serverSeedHash,
      inputHash: frozenInputHash,
      serverSeed: proof?.serverSeed ?? "",
      clientSeed: proof?.clientSeed ?? clientSeed,
    },
  };

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1_000);

    return () => window.clearInterval(timer);
  }, []);

  async function createWheel() {
    setError("");

    if (prizeTiers.length === 0) {
      setError("Add at least one prize place, for example 100EUR:1");
      return;
    }

    const seed = generateHexSeed();
    const now = new Date();
    const closeAt = new Date(now.getTime() + durationMinutes * 60_000);

    setServerSeed(seed);
    setServerSeedHash(await sha256Hex(seed));
    setCreatedAt(now.toISOString());
    setJoinsCloseAt(closeAt.toISOString());
    setNowMs(now.getTime());
    setParticipantEntries([]);
    setParticipantName("");
    setFrozenInput(null);
    setFrozenInputHash("");
    setClientSeed("");
    setProof(null);
    clearVerifier();
  }

  async function joinParticipant() {
    setError("");

    const participant = participantName.trim();

    if (!serverSeedHash) {
      setError("Create the wheel first.");
      return;
    }

    if (frozenInput) {
      setError("The round is already frozen; new participants cannot be added.");
      return;
    }

    if (joinWindowExpired) {
      setError("The join window is closed; new participants cannot be added.");
      return;
    }

    if (!participant) {
      setError("Enter participant name/ID.");
      return;
    }

    if (participantEntries.some((receipt) => receipt.id === participant)) {
      setError("This participant has already joined.");
      return;
    }

    const receipt = await createParticipantReceipt(
      roundId,
      participant,
      participantEntries.length + 1,
    );

    setParticipantEntries((current) => [...current, receipt]);
    setParticipantName("");
    setCopied(`Join hash for ${participant} created`);
  }

  async function freezeParticipants() {
    setError("");

    try {
      const input = { participants: participantEntries, prizeTiers };
      await validateInput(roundId, input);

      setFrozenInput(input);
      setFrozenInputHash(await inputHash(input));
      setClientSeed(generateHexSeed());
      setProof(null);
      setRecalculatedWinners([]);
      setVerifyResult("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to freeze round");
    }
  }

  async function revealWinners() {
    setError("");

    if (!frozenInput) {
      setError("Freeze participants first.");
      return;
    }

    const winners = await drawPrizeWinners(
      roundId,
      serverSeed,
      clientSeed,
      frozenInput,
    );

    const nextProof = {
      roundId,
      algorithm: ALGORITHM,
      serverSeed,
      serverSeedHash,
      clientSeed,
      inputHash: frozenInputHash,
      winners,
    };

    setProof(nextProof);
    if (verifyParticipantHash) {
      setVerifyServerSeedHash(serverSeedHash);
      setVerifyInputHash(frozenInputHash);
      setVerifyServerSeed(nextProof.serverSeed);
      setVerifyClientSeed(nextProof.clientSeed);
    }
    setRecalculatedWinners([]);
    setVerifyResult("");
  }

  function resetRevealStep() {
    setProof(null);
    setRecalculatedWinners([]);
    setVerifyResult("");
    setVerifyServerSeed("");
    setVerifyClientSeed(clientSeed);
  }

  async function fillVerifierFromParticipant(receipt: ParticipantReceipt) {
    setVerifyParticipantHash(receipt.hash);
    setVerifyServerSeedHash(serverSeedHash);
    setVerifyInputHash(frozenInputHash);
    setVerifyServerSeed(proof?.serverSeed ?? "");
    setVerifyClientSeed(clientSeed);
    setVerifyResult("");
    setRecalculatedWinners([]);
  }

  async function verifyPlayerData() {
    setVerifyResult("");
    setRecalculatedWinners([]);

    if (!frozenInput || !proof) {
      setVerifyResult("A frozen round and revealed result are required.");
      return;
    }

    const participantHash = verifyParticipantHash.trim();
    if (!participantHash) {
      setVerifyResult("Enter the participant join hash.");
      return;
    }

    const receipt = (frozenInput.participants ?? []).find(
      (item) => item.hash === participantHash,
    );
    if (!receipt) {
      setVerifyResult("This join hash is not in the round frozen list.");
      return;
    }

    const actualServerSeedHash = await sha256Hex(verifyServerSeed.trim());
    if (actualServerSeedHash !== verifyServerSeedHash.trim()) {
      setVerifyResult("Server seed does not match the server seed hash.");
      return;
    }

    const actualFrozenInputHash = await inputHash(frozenInput);
    if (actualFrozenInputHash !== verifyInputHash.trim()) {
      setVerifyResult("Frozen input does not match the frozen input hash.");
      return;
    }

    const winners = await drawPrizeWinners(
      roundId,
      verifyServerSeed.trim(),
      verifyClientSeed.trim(),
      frozenInput,
    );

    setRecalculatedWinners(winners);

    if (JSON.stringify(winners) !== JSON.stringify(proof.winners)) {
      setVerifyResult("Hashes match, but winners do not match.");
      return;
    }

    setVerifyResult(
      `Fair result: join hash found for ${receipt.id}, hashes and winners match.`,
    );
  }

  async function copyToClipboard(label: string, value: string) {
    if (!value) {
      return;
    }

    await navigator.clipboard.writeText(value);
    setCopied(`Copied: ${label}`);
  }

  function clearVerifier() {
    setVerifyParticipantHash("");
    setVerifyServerSeedHash("");
    setVerifyInputHash("");
    setVerifyServerSeed("");
    setVerifyClientSeed("");
    setVerifyResult("");
    setRecalculatedWinners([]);
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8">
        <header className="flex flex-col gap-4 border-b pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <Badge variant="secondary">
              <ShieldCheck className="size-3.5" />
              Provably fair streamer wheel
            </Badge>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight">
              Create wheel, join players, verify winners
            </h1>
            <p className="mt-3 text-muted-foreground">
              Prize places are known ahead of time. The number of participants is unknown:
              each player joins separately and receives their own join hash.
            </p>
          </div>
          <Badge variant="outline" className="w-fit">
            <CircleDot className="size-3.5" />
            {statusLabels[status]}
          </Badge>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <StepTitle icon={<Sparkles className="size-5" />}>
                  1. Create wheel
                </StepTitle>
                <CardDescription>
                  Prize places are defined here and the server seed hash is created.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Round ID">
                    <Input
                      value={roundId}
                      onChange={(event) => setRoundId(event.target.value)}
                    />
                  </Field>
                  <Field label="Join window, minutes">
                    <Input
                      min={1}
                      type="number"
                      value={durationMinutes}
                      onChange={(event) =>
                        setDurationMinutes(Number(event.target.value))
                      }
                    />
                  </Field>
                </div>

                <Field
                  hint="One row = one prize place. For example: 100EUR:1, 100EUR:2."
                  label="Prize places"
                >
                  <Textarea
                    className="min-h-40 font-mono"
                    value={tiersText}
                    onChange={(event) => setTiersText(event.target.value)}
                  />
                </Field>

                <Button onClick={createWheel}>Create wheel</Button>

                <div className="grid gap-3">
                  <KeyValue label="Algorithm" value={ALGORITHM} />
                  <KeyValue label="Created at" value={createdAt || "-"} />
                  <KeyValue
                    label="Join closes at"
                    value={joinsCloseAt || "-"}
                  />
                  <KeyValue
                    label="Published server seed hash"
                    value={serverSeedHash || "Create wheel first"}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <StepTitle icon={<UserPlus className="size-5" />}>
                  2. Join participants
                </StepTitle>
                <CardDescription>
                  Each new participant receives their join hash immediately after joining.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Input
                    placeholder="Participant username / ID"
                    value={participantName}
                    onChange={(event) => setParticipantName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && canJoin) {
                        void joinParticipant();
                      }
                    }}
                  />
                  <Button disabled={!canJoin} onClick={joinParticipant}>
                    Join
                  </Button>
                </div>

                {joinWindowExpired && !frozenInput && (
                  <p className="rounded-lg border p-3 text-sm text-muted-foreground">
                    The join window is closed. New participants cannot be added; only freeze and reveal are available.
                  </p>
                )}

                <div className="grid gap-3 sm:grid-cols-3">
                  <Metric label="Participants" value={participants.length} />
                  <Metric label="Prize places" value={prizeTiers.length} />
                  <Metric label="Will draw" value={drawablePlaces} />
                </div>

                <div className="rounded-lg border p-4">
                  <p className="text-sm font-medium">Participants</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    This is what can be given to a specific player after joining.
                  </p>
                  <div className="mt-3 space-y-2">
                    {participantEntries.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No participants yet.
                      </p>
                    ) : (
                      participantEntries.map((receipt) => (
                        <div
                          className="rounded-lg border bg-background p-3"
                          key={receipt.hash}
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="font-medium">
                                #{receipt.index} {receipt.id}
                              </p>
                              <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                                {receipt.hash}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                onClick={() =>
                                  copyToClipboard(
                                    `${receipt.id} join hash`,
                                    receipt.hash,
                                  )
                                }
                                size="sm"
                                variant="secondary"
                              >
                                <Clipboard className="size-3.5" />
                                Copy hash
                              </Button>
                              <Button
                                onClick={() =>
                                  fillVerifierFromParticipant(receipt)
                                }
                                size="sm"
                                variant="outline"
                              >
                                Test verify
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <Button
                  disabled={!serverSeedHash || Boolean(frozenInput)}
                  onClick={freezeParticipants}
                >
                  Freeze participants
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <StepTitle icon={<Hash className="size-5" />}>
                  Player public info
                </StepTitle>
                <CardDescription>
                  Everything the player needs: their join hash, public hashes, seed after reveal, and declared winners.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <KeyValue label="Round ID" value={roundId || "-"} />
                <KeyValue
                  label="Published server seed hash"
                  value={serverSeedHash || "Create wheel first"}
                />
                <KeyValue
                  label="Frozen input hash"
                  value={frozenInputHash || "Freeze participants first"}
                />
                <KeyValue
                  label="Revealed server seed"
                  value={proof?.serverSeed ?? "Reveal winners first"}
                />
                <KeyValue
                  label="Public / client seed"
                  value={clientSeed || "Freeze participants first"}
                />
                <div className="rounded-lg border p-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Declared winners
                  </p>
                  <WinnersList
                    empty="Reveal winners first"
                    winners={proof?.winners ?? []}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <StepTitle icon={<Lock className="size-5" />}>
                  3. Freeze and reveal
                </StepTitle>
                <CardDescription>
                  After freeze, the participant list is closed. After reveal, the server seed is revealed and winners are declared.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <KeyValue
                  label="Frozen input hash"
                  value={frozenInputHash || "Freeze participants first"}
                />
                <KeyValue
                  label="Client seed"
                  value={clientSeed || "Freeze participants first"}
                />
                <div className="rounded-lg border p-4">
                  <p className="text-sm font-medium">Frozen participants</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {frozenInput ? (
                      frozenInput.participants.map((receipt) => (
                        <Badge key={receipt.hash} variant="outline">
                          {receipt.id}
                        </Badge>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Freeze participants first.
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button
                    disabled={!frozenInput || Boolean(proof)}
                    onClick={revealWinners}
                  >
                    Reveal winners
                  </Button>
                  <Button
                    disabled={!proof}
                    onClick={resetRevealStep}
                    variant="secondary"
                  >
                    Reset to frozen
                  </Button>
                </div>
                <WinnersList
                  empty="Winners have not been declared yet."
                  winners={proof?.winners ?? []}
                />
              </CardContent>
            </Card>
          </div>
        </section>

        <Card>
          <CardHeader>
            <StepTitle icon={<CheckCircle2 className="size-5" />}>
              Player verification form
            </StepTitle>
            <CardDescription>
              The player enters their join hash and public round data. The form checks player inclusion, hashes, and winners.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-3">
              <Field label="Participant join hash">
                <Input
                  className="font-mono"
                  value={verifyParticipantHash}
                  onChange={(event) =>
                    setVerifyParticipantHash(event.target.value)
                  }
                  placeholder="hash received on join"
                />
              </Field>
              <Field label="Published server seed hash">
                <Input
                  className="font-mono"
                  value={verifyServerSeedHash}
                  onChange={(event) =>
                    setVerifyServerSeedHash(event.target.value)
                  }
                />
              </Field>
              <Field label="Frozen input hash">
                <Input
                  className="font-mono"
                  value={verifyInputHash}
                  onChange={(event) => setVerifyInputHash(event.target.value)}
                />
              </Field>
              <Field label="Revealed server seed">
                <Input
                  className="font-mono"
                  value={verifyServerSeed}
                  onChange={(event) => setVerifyServerSeed(event.target.value)}
                />
              </Field>
              <Field label="Public / client seed">
                <Input
                  className="font-mono"
                  value={verifyClientSeed}
                  onChange={(event) => setVerifyClientSeed(event.target.value)}
                />
              </Field>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button onClick={verifyPlayerData}>Verify player data</Button>
              <Button onClick={clearVerifier} variant="secondary">
                Clear verifier
              </Button>
            </div>

            {verifyResult && (
              <p className="rounded-lg border p-3 text-sm text-muted-foreground">
                {verifyResult}
              </p>
            )}

            {(Boolean(proof?.winners.length) ||
              Boolean(recalculatedWinners.length)) && (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border p-4">
                  <p className="text-sm font-medium">Declared winners</p>
                  <WinnersList
                    empty="Winners have not been declared yet."
                    winners={proof?.winners ?? []}
                  />
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-sm font-medium">Recalculated winners</p>
                  <WinnersList
                    empty="Click Verify player data."
                    winners={recalculatedWinners}
                  />
                </div>
              </div>
            )}

            {copied && (
              <p className="rounded-lg border p-3 text-sm text-muted-foreground">
                {copied}
              </p>
            )}

            {error && (
              <p className="rounded-lg border p-3 text-sm text-destructive">
                {error}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Player JSON</CardTitle>
            <CardDescription>
              This JSON can be pasted into the verifier on the home page. Hashes for the form fields are in `verifierInput`.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="max-h-[480px] overflow-auto rounded-lg border p-4 text-xs">
              {JSON.stringify(playerJson, null, 2)}
            </pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Debug JSON data</CardTitle>
            <CardDescription>
              Technical data for the current page state.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="max-h-[640px] overflow-auto rounded-lg border p-4 text-xs">
              {JSON.stringify(debugJson, null, 2)}
            </pre>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function StepTitle({
  icon,
  children,
}: Readonly<{
  icon: ReactNode;
  children: ReactNode;
}>) {
  return (
    <CardTitle className="flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      {children}
    </CardTitle>
  );
}

function Field({
  label,
  hint,
  children,
}: Readonly<{
  label: string;
  hint?: string;
  children: ReactNode;
}>) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}

function KeyValue({
  label,
  value,
}: Readonly<{
  label: string;
  value: string;
}>) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 break-all font-mono text-sm">{value}</p>
    </div>
  );
}

function Metric({
  label,
  value,
}: Readonly<{
  label: string;
  value: number;
}>) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function WinnersList({
  empty,
  winners,
}: Readonly<{
  empty: string;
  winners: Winner[];
}>) {
  if (winners.length === 0) {
    return <p className="mt-3 text-sm text-muted-foreground">{empty}</p>;
  }

  return (
    <div className="mt-3 space-y-2">
      {winners.map((winner) => (
        <div
          className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2"
          key={`${winner.place}-${winner.participant}-${winner.tierId}`}
        >
          <span className="font-medium">
            #{winner.place} {winner.participant}
          </span>
          <Badge variant="outline">{winner.tierName}</Badge>
        </div>
      ))}
    </div>
  );
}
