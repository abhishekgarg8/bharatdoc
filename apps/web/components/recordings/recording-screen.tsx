"use client";

import { ArrowLeft, Mic, Pause, Play, RotateCcw, Save, Square, UploadCloud } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { MAX_RECORDING_SECONDS, normalizePatientId, type LocalRecordingCaptureState } from "@bharatdoc/shared";
import { BharatButton } from "@/components/bharat-button";
import { createRecordingMetadata } from "@/lib/client/dashboard-data";
import {
  createDemoAudioRecorder,
  createRecordRtcAudioRecorder,
  type AudioRecorder,
  type AudioRecorderFactory
} from "@/lib/client/audio-recorder";
import {
  createIndexedDbLocalRecordingRepository,
  localRecordingAudioBlob,
  type LocalRecording,
  type LocalRecordingRepository
} from "@/lib/client/local-recordings";
import { transcribeRecordingAudio } from "@/lib/client/transcription-api";
import { cn } from "@/lib/utils";

interface RecordingScreenProps {
  idToken?: string;
  clinicName?: string;
  fetcher?: typeof fetch;
  localRepository?: LocalRecordingRepository;
  recorderFactory?: AudioRecorderFactory;
  useDemoRecorder?: boolean;
  onNavigate?: (href: string) => void;
}

const DEMO_TRANSCRIPT =
  "Doctor: What brings you in today?\nPatient: I have had fever for two days and mild cough.\nDoctor: Please take fluids and paracetamol.";

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function objectUrlFor(blob: Blob): string | null {
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    return null;
  }

  return URL.createObjectURL(blob);
}

export function RecordingScreen({
  idToken,
  clinicName = "Hospital",
  fetcher = fetch,
  localRepository,
  recorderFactory,
  useDemoRecorder = false,
  onNavigate
}: RecordingScreenProps) {
  const repository = useMemo(
    () => localRepository ?? createIndexedDbLocalRecordingRepository(),
    [localRepository]
  );
  const selectedRecorderFactory =
    recorderFactory ?? (useDemoRecorder ? createDemoAudioRecorder : createRecordRtcAudioRecorder);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const chunkUnsubscribeRef = useRef<(() => void) | null>(null);
  const patientIdRef = useRef("");
  const labelRef = useRef("");
  const limitReachedRef = useRef(false);
  const [phase, setPhase] = useState<LocalRecordingCaptureState>("idle");
  const [recording, setRecording] = useState<LocalRecording | null>(null);
  const [patientId, setPatientId] = useState("");
  const [label, setLabel] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = onNavigate ?? ((href: string) => window.location.assign(href));

  useEffect(() => {
    patientIdRef.current = patientId;
  }, [patientId]);

  useEffect(() => {
    function syncOnlineState() {
      setIsOnline(navigator.onLine);
    }

    window.addEventListener("online", syncOnlineState);
    window.addEventListener("offline", syncOnlineState);
    syncOnlineState();

    return () => {
      window.removeEventListener("online", syncOnlineState);
      window.removeEventListener("offline", syncOnlineState);
    };
  }, []);

  useEffect(() => {
    labelRef.current = label;
  }, [label]);

  useEffect(() => {
    if (phase !== "recording") {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setElapsedSeconds((seconds) => Math.min(seconds + 1, MAX_RECORDING_SECONDS));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [phase]);

  useEffect(() => {
    if (phase !== "recording" || elapsedSeconds < MAX_RECORDING_SECONDS || limitReachedRef.current) {
      return;
    }

    limitReachedRef.current = true;
    void stopRecording("60-minute limit reached. Recording saved on this device.");
  }, [elapsedSeconds, phase]);

  useEffect(() => {
    let isMounted = true;

    async function loadRecoverableRecording() {
      if (!localRepository && typeof indexedDB === "undefined") {
        return;
      }

      try {
        const recoverable = await repository.getLatestRecoverable();

        if (!isMounted || !recoverable) {
          return;
        }

        const recoveredAudio = localRecordingAudioBlob(recoverable);
        const nextUrl = recoveredAudio ? objectUrlFor(recoveredAudio) : null;

        if (audioUrl && typeof URL.revokeObjectURL === "function") {
          URL.revokeObjectURL(audioUrl);
        }

        if (recoverable.captureState === "recording" || recoverable.captureState === "paused") {
          await repository.updateDraft({
            id: recoverable.id,
            captureState: "stopped",
            durationSeconds: recoverable.durationSeconds
          });
        }

        const refreshed = (await repository.get(recoverable.id)) ?? recoverable;
        setRecording(refreshed);
        setPatientId(refreshed.patientId ?? "");
        setLabel(refreshed.label ?? "");
        setElapsedSeconds(refreshed.durationSeconds);
        setAudioUrl(nextUrl);
        setPhase("stopped");
        setMessage("Recovered an interrupted local recording.");
      } catch {
        return;
      }
    }

    if (phase === "idle" && !recording) {
      void loadRecoverableRecording();
    }

    return () => {
      isMounted = false;
    };
  }, [audioUrl, localRepository, phase, recording, repository]);

  useEffect(() => {
    return () => {
      chunkUnsubscribeRef.current?.();

      if (audioUrl && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  async function startRecording() {
    setError(null);
    setMessage(null);
    setElapsedSeconds(0);
    limitReachedRef.current = false;

    try {
      const nextRecorder = await selectedRecorderFactory();
      const draft = await repository.createDraft({ patientId, label });
      chunkUnsubscribeRef.current?.();
      chunkUnsubscribeRef.current = nextRecorder.onChunk(async (chunk) => {
        const updated = await repository.appendChunk({
          id: draft.id,
          audioChunk: chunk.blob,
          audioMimeType: chunk.mimeType,
          durationSeconds: chunk.durationSeconds,
          patientId: patientIdRef.current,
          label: labelRef.current
        });

        setRecording(updated);
        setElapsedSeconds(updated.durationSeconds);
      });
      await nextRecorder.start();
      recorderRef.current = nextRecorder;
      const activeDraft = await repository.updateDraft({
        id: draft.id,
        patientId,
        label,
        durationSeconds: 0,
        captureState: "recording"
      });
      setRecording(activeDraft);
      setPhase("recording");
      setMessage("Recording started.");
    } catch {
      setPhase("failed");
      setError("Unable to start microphone recording.");
    }
  }

  async function pauseRecording() {
    if (!recorderRef.current || !recording) {
      return;
    }

    await recorderRef.current.pause();
    const updated = await repository.updateDraft({
      id: recording.id,
      patientId,
      label,
      durationSeconds: elapsedSeconds,
      captureState: "paused"
    });
    setRecording(updated);
    setPhase("paused");
  }

  async function resumeRecording() {
    if (!recorderRef.current || !recording) {
      return;
    }

    await recorderRef.current.resume();
    const updated = await repository.updateDraft({
      id: recording.id,
      patientId,
      label,
      durationSeconds: elapsedSeconds,
      captureState: "recording"
    });
    setRecording(updated);
    setPhase("recording");
  }

  async function stopRecording(successMessage = "Recording saved on this device.") {
    if (!recorderRef.current || !recording) {
      return;
    }

    setError(null);
    setMessage(null);

    try {
      const recordedAudio = await recorderRef.current.stop();
      recorderRef.current = null;
      chunkUnsubscribeRef.current?.();
      chunkUnsubscribeRef.current = null;
      const durationSeconds = Math.max(1, recordedAudio.durationSeconds ?? elapsedSeconds);
      const finalized = await repository.finalize({
        id: recording.id,
        patientId,
        label,
        durationSeconds,
        audioBlob: recordedAudio.blob,
        audioMimeType: recordedAudio.mimeType
      });
      const nextUrl = objectUrlFor(recordedAudio.blob);

      if (audioUrl && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(audioUrl);
      }

      setAudioUrl(nextUrl);
      setRecording(finalized);
      setElapsedSeconds(durationSeconds);
      setPhase("stopped");
      setMessage(successMessage);
    } catch (caught) {
      setPhase("failed");
      setError(caught instanceof Error ? caught.message : "Unable to save local recording.");
    }
  }

  async function persistEditableMetadata(currentRecording: LocalRecording): Promise<LocalRecording> {
    const updated = await repository.updateDraft({
      id: currentRecording.id,
      patientId,
      label
    });
    setRecording(updated);
    return updated;
  }

  async function transcribeNow() {
    let workingRecording = recording;

    if (idToken && !isOnline) {
      setError("Reconnect to transcribe. Audio stays saved on this device.");
      setMessage(null);
      return;
    }

    if (workingRecording && (phase === "stopped" || phase === "failed")) {
      workingRecording = await persistEditableMetadata(workingRecording);
    }

    if (!normalizePatientId(workingRecording?.patientId ?? patientId)) {
      setError("Patient ID is required before transcription.");
      setMessage(null);
      return;
    }

    const audioBlob = workingRecording ? localRecordingAudioBlob(workingRecording) : null;
    const audioMimeType = workingRecording?.audioMimeType ?? null;

    if (!workingRecording || !audioBlob || !audioMimeType) {
      setError("Stop and save audio before transcription.");
      return;
    }

    const localRecordingId = workingRecording.id;

    setError(null);
    setMessage(null);
    setPhase("transcribing");

    try {
      workingRecording = await repository.markTranscribing(localRecordingId);
      setRecording(workingRecording);

      if (idToken) {
        let serverRecordingId = workingRecording.serverRecordingId;

        if (!serverRecordingId) {
          const serverRecord = await createRecordingMetadata(
            idToken,
            {
              id: workingRecording.id,
              patient_id: workingRecording.patientId,
              label: label.trim() || null,
              duration_seconds: workingRecording.durationSeconds,
              recorded_at: workingRecording.recordedAt
            },
            fetcher
          );
          const synced = await repository.markSynced(workingRecording.id, serverRecord.id);
          setRecording(synced);
          workingRecording = synced;
          serverRecordingId = serverRecord.id;
        }

        const result = await transcribeRecordingAudio(
          idToken,
          serverRecordingId,
          audioBlob,
          audioMimeType,
          fetcher
        );
        const updated = await repository.markTranscribed(workingRecording.id, result.transcript);
        setRecording(updated);
        navigate(`/recordings/${serverRecordingId}`);
      } else {
        const updated = await repository.markTranscribed(workingRecording.id, DEMO_TRANSCRIPT);
        setRecording(updated);
      }

      setPhase("transcribed");
      setMessage("Transcript ready.");
    } catch {
      if (workingRecording) {
        const failed = await repository.markFailed(workingRecording.id, "Unable to transcribe recording.");
        setRecording(failed);
      }
      setPhase("failed");
      setError("Unable to transcribe recording.");
    }
  }

  function resetLocalFlow() {
    recorderRef.current = null;
    chunkUnsubscribeRef.current?.();
    chunkUnsubscribeRef.current = null;
    limitReachedRef.current = false;
    setPhase("idle");
    setRecording(null);
    setElapsedSeconds(0);
    setAudioUrl(null);
    setMessage(null);
    setError(null);
  }

  const canEditPatient = phase === "idle" || phase === "recording" || phase === "paused" || phase === "stopped";
  const transcript = recording?.transcript;
  const hasSavedAudio = Boolean(recording && localRecordingAudioBlob(recording));
  const canTranscribe = Boolean(normalizePatientId(patientId)) && (!idToken || isOnline);

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-paper text-ink shadow-[0_30px_80px_rgba(55,35,15,0.18)]">
      <section className="paper-bg flex min-h-0 flex-1 flex-col">
        <header className="flex items-start gap-3 px-5 pb-4 pt-5">
          <Link
            className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-rule bg-paper-deep text-ink-soft"
            href="/dashboard"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="font-body text-[11px] font-bold uppercase tracking-[0.18em] text-terracotta">
              New consultation
            </p>
            <h1 className="mt-1 font-display text-[30px] italic leading-none tracking-normal text-ink">
              Recording
            </h1>
            <p className="mt-2 font-body text-xs text-ink-muted">
              {clinicName} · {isOnline ? "Online" : "Offline"}
            </p>
            <p className="mt-1 font-body text-xs text-ink-muted">
              {isOnline ? "Audio stays on this device until transcription." : "Reconnect to transcribe; audio remains saved locally."}
            </p>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          <section className="rounded-xl border border-rule bg-paper p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-body text-[11px] font-bold uppercase tracking-[0.16em] text-terracotta">
                  Timer
                </p>
                <div className="mt-2 font-mono text-[42px] font-bold leading-none text-ink">
                  {formatElapsed(elapsedSeconds)}
                </div>
              </div>
              <div
                className={cn(
                  "flex h-16 w-16 items-center justify-center rounded-full border",
                  phase === "recording"
                    ? "border-terracotta bg-terracotta text-white"
                    : "border-rule bg-paper-deep text-ink-muted"
                )}
                aria-label={`Recorder state ${phase}`}
              >
                <Mic className="h-7 w-7" />
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <label className="col-span-2 block">
                <span className="font-body text-[11px] font-bold uppercase tracking-[0.16em] text-terracotta">
                  Patient ID
                </span>
                <input
                  className="mt-2 min-h-12 w-full rounded-xl border border-rule bg-paper-deep px-3 font-mono text-base font-bold text-ink outline-none focus:ring-2 focus:ring-terracotta/20"
                  value={patientId}
                  onChange={(event) => setPatientId(event.target.value)}
                  onBlur={() => {
                    if (recording && (phase === "stopped" || phase === "failed")) {
                      void persistEditableMetadata(recording);
                    }
                  }}
                  disabled={!canEditPatient}
                  placeholder="P-10482"
                  aria-label="Patient ID"
                />
              </label>
              <label className="col-span-2 block">
                <span className="font-body text-[11px] font-bold uppercase tracking-[0.16em] text-terracotta">
                  Label
                </span>
                <input
                  className="mt-2 min-h-12 w-full rounded-xl border border-rule bg-paper-deep px-3 font-body text-sm text-ink outline-none focus:ring-2 focus:ring-terracotta/20"
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  onBlur={() => {
                    if (recording && (phase === "stopped" || phase === "failed")) {
                      void persistEditableMetadata(recording);
                    }
                  }}
                  disabled={!canEditPatient}
                  placeholder="Follow-up, walk-in, fever review"
                  aria-label="Label"
                />
              </label>
            </div>

            {audioUrl ? (
              <audio className="mt-4 w-full" controls src={audioUrl}>
                <track kind="captions" />
              </audio>
            ) : null}
          </section>

          {message ? <p className="mt-3 font-body text-xs font-semibold text-sage">{message}</p> : null}
          {error ? <p className="mt-3 font-body text-xs font-semibold text-stamp">{error}</p> : null}

          {transcript ? (
            <section className="mt-4 rounded-xl border border-rule bg-paper p-4">
              <p className="font-body text-[11px] font-bold uppercase tracking-[0.16em] text-terracotta">
                Transcript
              </p>
              <p className="mt-3 whitespace-pre-line font-body text-[13px] leading-relaxed text-ink-soft">
                {transcript}
              </p>
            </section>
          ) : null}
        </div>

        <footer className="grid shrink-0 grid-cols-2 gap-2 border-t border-rule bg-paper px-5 pb-4 pt-3">
          {phase === "idle" || (phase === "failed" && !hasSavedAudio) ? (
            <BharatButton className="col-span-2" icon={<Mic className="h-4 w-4" />} onClick={startRecording}>
              Start recording
            </BharatButton>
          ) : null}
          {phase === "failed" && hasSavedAudio ? (
            <>
              <Link
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-rule bg-transparent px-4 py-3 font-body text-sm font-bold text-ink-soft transition active:scale-[0.99]"
                href="/dashboard"
              >
                <Save className="h-4 w-4" />
                Later
              </Link>
              <BharatButton icon={<UploadCloud className="h-4 w-4" />} onClick={transcribeNow} disabled={!canTranscribe}>
                Retry
              </BharatButton>
            </>
          ) : null}
          {phase === "recording" ? (
            <>
              <BharatButton variant="ghost" icon={<Pause className="h-4 w-4" />} onClick={pauseRecording}>
                Pause
              </BharatButton>
              <BharatButton icon={<Square className="h-4 w-4" />} onClick={() => void stopRecording()}>
                Stop
              </BharatButton>
            </>
          ) : null}
          {phase === "paused" ? (
            <>
              <BharatButton variant="ghost" icon={<Play className="h-4 w-4" />} onClick={resumeRecording}>
                Resume
              </BharatButton>
              <BharatButton icon={<Square className="h-4 w-4" />} onClick={() => void stopRecording()}>
                Stop
              </BharatButton>
            </>
          ) : null}
          {phase === "stopped" ? (
            <>
              <Link
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-rule bg-transparent px-4 py-3 font-body text-sm font-bold text-ink-soft transition active:scale-[0.99]"
                href="/dashboard"
              >
                <Save className="h-4 w-4" />
                Later
              </Link>
              <BharatButton icon={<UploadCloud className="h-4 w-4" />} onClick={transcribeNow} disabled={!canTranscribe}>
                Transcribe
              </BharatButton>
            </>
          ) : null}
          {phase === "transcribing" ? (
            <BharatButton className="col-span-2" icon={<UploadCloud className="h-4 w-4" />} disabled>
              Transcribing
            </BharatButton>
          ) : null}
          {phase === "transcribed" ? (
            <>
              <BharatButton variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={resetLocalFlow}>
                New
              </BharatButton>
              <Link
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-terracotta px-4 py-3 font-body text-sm font-bold text-white shadow-warm transition active:scale-[0.99]"
                href="/dashboard"
              >
                Dashboard
              </Link>
            </>
          ) : null}
        </footer>
      </section>
    </main>
  );
}
