"use client";

import {
  ArrowLeft,
  FastForward,
  Loader2,
  Mic,
  Pause,
  Play,
  Rewind,
  Save,
  Sparkles,
  Square,
  Trash2
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { MAX_RECORDING_SECONDS, normalizePatientId } from "@bharatdoc/shared";
import { BharatButton } from "@/components/bharat-button";
import {
  createMockAudioRecorder,
  createRecordRtcAudioRecorder,
  type AudioRecorderController,
  type AudioRecorderFactory
} from "@/lib/client/audio-recorder";
import {
  buildLocalRecordingMetadata,
  createLocalRecordingsRepository,
  type LocalRecordingDraft,
  type LocalRecordingMetadata,
  type LocalRecordingsRepository
} from "@/lib/client/local-recordings";
import { createFirebasePhoneAuthClient } from "@/lib/client/phone-auth";
import { formatElapsedTime, initialRecordingState, reduceRecordingState } from "@/lib/client/recording-state";
import { transcribeLocalRecording, type RecordingTranscriber } from "@/lib/client/transcription-api";
import { cn } from "@/lib/utils";

interface RecordingScreenProps {
  audioRecorderFactory?: AudioRecorderFactory;
  getIdToken?: () => Promise<string | null>;
  mockAudio?: boolean;
  now?: () => string;
  online?: () => boolean;
  repository?: LocalRecordingsRepository;
  transcribeRecording?: RecordingTranscriber;
}

function getDefaultIdToken(): Promise<string | null> {
  return createFirebasePhoneAuthClient().getCurrentIdToken();
}

function isBrowserOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

export function RecordingScreen({
  audioRecorderFactory,
  getIdToken = getDefaultIdToken,
  mockAudio = false,
  now = () => new Date().toISOString(),
  online = isBrowserOnline,
  repository = createLocalRecordingsRepository(),
  transcribeRecording = transcribeLocalRecording
}: RecordingScreenProps) {
  const [state, dispatch] = useReducer(reduceRecordingState, initialRecordingState);
  const [patientId, setPatientId] = useState("");
  const [label, setLabel] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const recorderRef = useRef<AudioRecorderController | null>(null);
  const durationRef = useRef(initialRecordingState.durationSeconds);
  const elapsed = formatElapsedTime(state.durationSeconds);
  const remainingMinutes = Math.max(0, Math.ceil((MAX_RECORDING_SECONDS - state.durationSeconds) / 60));
  const waveformBars = useMemo(() => Array.from({ length: 44 }, (_, index) => index), []);
  const selectedAudioRecorderFactory =
    audioRecorderFactory ?? (mockAudio ? createMockAudioRecorder : createRecordRtcAudioRecorder);

  useEffect(() => {
    durationRef.current = state.durationSeconds;
  }, [state.durationSeconds]);

  useEffect(() => {
    if (state.phase !== "recording") {
      return;
    }

    const intervalId = window.setInterval(() => {
      dispatch({ type: "tick", seconds: Math.min(durationRef.current + 1, MAX_RECORDING_SECONDS) });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [state.phase]);

  useEffect(() => {
    return () => {
      recorderRef.current?.destroy();
      recorderRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!audioBlob || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
      setAudioPreviewUrl(null);
      return;
    }

    const previewUrl = URL.createObjectURL(audioBlob);
    setAudioPreviewUrl(previewUrl);

    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [audioBlob]);

  async function startRecording() {
    if (isStarting) {
      return;
    }

    setSavedId(null);
    setError(null);
    setAudioBlob(null);
    setTranscript(null);
    setIsStarting(true);

    try {
      recorderRef.current = await selectedAudioRecorderFactory();
      dispatch({ type: "start", now: now() });
    } catch {
      recorderRef.current = null;
      setError("Microphone access is required to start recording.");
    } finally {
      setIsStarting(false);
    }
  }

  function discardRecording() {
    recorderRef.current?.destroy();
    recorderRef.current = null;
    setAudioBlob(null);
    setSavedId(null);
    setError(null);
    setTranscript(null);
    dispatch({ type: "discard" });
  }

  function togglePause() {
    const recorder = recorderRef.current;

    try {
      if (state.phase === "paused") {
        recorder?.resume();
        dispatch({ type: "resume" });
      } else {
        recorder?.pause();
        dispatch({ type: "pause" });
      }
    } catch {
      setError("Unable to update the recording state.");
    }
  }

  async function completeRecording() {
    if (isCompleting) {
      return;
    }

    const recorder = recorderRef.current;
    setError(null);
    setIsCompleting(true);

    try {
      const recordedAudioBlob = recorder ? await recorder.stop() : null;
      recorderRef.current = null;
      setAudioBlob(recordedAudioBlob);
      dispatch({ type: "stop", now: now() });
    } catch {
      setError("Unable to finish recording. Please try again.");
    } finally {
      setIsCompleting(false);
    }
  }

  function buildRecordingDraft(): LocalRecordingDraft {
    const draft: LocalRecordingDraft = {
      patientId,
      label,
      durationSeconds: state.durationSeconds,
      recordedAt: state.startedAt ?? now(),
      updatedAt: now(),
      audioMimeType: audioBlob?.type ?? null
    };

    if (savedId) {
      draft.id = savedId;
    }

    if (audioBlob) {
      draft.audioBlob = audioBlob;
    }

    return draft;
  }

  async function saveRecording(): Promise<LocalRecordingMetadata | null> {
    setError(null);

    try {
      const saved = await repository.save(buildLocalRecordingMetadata(buildRecordingDraft()));
      setSavedId(saved.id);
      return saved;
    } catch {
      setError("Unable to save recording locally.");
      return null;
    }
  }

  async function transcribeNow() {
    const normalizedPatientId = normalizePatientId(patientId);

    setError(null);

    if (!normalizedPatientId) {
      setError("Patient ID is required before transcription.");
      return;
    }

    if (!audioBlob) {
      setError("Recording audio is required before transcription.");
      return;
    }

    if (!online()) {
      const saved = await saveRecording();

      if (saved) {
        setError("You're offline. Recording saved locally. Transcribe when connected.");
      }

      return;
    }

    setIsTranscribing(true);

    try {
      const idToken = await getIdToken();

      if (!idToken) {
        setError("Please sign in again before transcription.");
        return;
      }

      const saved = await saveRecording();

      if (!saved) {
        return;
      }

      const result = await transcribeRecording({ idToken, recording: saved });
      setTranscript(result.transcript);
    } catch {
      setError("Unable to transcribe recording. Please try again.");
    } finally {
      setIsTranscribing(false);
    }
  }

  if (state.phase === "recording" || state.phase === "paused") {
    const paused = state.phase === "paused";

    return (
      <main className="relative mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-ink text-paper shadow-[0_30px_80px_rgba(55,35,15,0.28)]">
        <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(214,138,60,0.08),transparent_70%)]" />
          <header className="relative flex items-center justify-between px-5 py-5">
            <button
              className="rounded-full border border-paper/20 px-4 py-2 font-body text-sm font-semibold text-paper"
              type="button"
              onClick={discardRecording}
            >
              Cancel
            </button>
            <div className="flex items-center gap-2 rounded-full border border-saffron/35 bg-saffron/15 px-3 py-1.5 text-saffron">
              {paused ? <Pause className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              <span className="font-body text-[11px] font-bold uppercase tracking-[0.14em]">
                {paused ? "Paused" : "Recording"}
              </span>
            </div>
          </header>

          <div className="relative px-5 text-center">
            <p className="font-body text-[11px] font-semibold uppercase tracking-[0.18em] text-paper/55">
              Sunrise Clinic · Dr. Aparna Iyer
            </p>
            <div className="mt-8 font-display text-[92px] italic leading-none text-paper/80">
              {elapsed}
            </div>
            <p className="mt-2 font-body text-xs text-paper/55">
              {paused ? "Paused · tap resume when ready" : `${remainingMinutes} min left · chunks save every 30s`}
            </p>
            {error ? <p className="mt-3 font-body text-xs font-semibold text-saffron">{error}</p> : null}
          </div>

          <div className="relative flex min-h-0 flex-1 items-center px-6">
            <div className="flex h-[120px] w-full items-center gap-[3px]">
              {waveformBars.map((bar) => (
                <div
                  key={bar}
                  className={cn("min-h-1 flex-1 rounded-full", paused ? "bg-paper/15" : "bg-saffron/55")}
                  style={{ height: `${26 + Math.abs(Math.sin(bar * 0.7)) * 58}%` }}
                />
              ))}
            </div>
          </div>

          <footer className="relative flex items-center justify-center gap-6 px-5 pb-9">
            <button
              className="flex h-16 w-16 items-center justify-center rounded-full border border-paper/20 bg-paper/10 text-paper disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
              aria-label="Stop recording"
              disabled={isCompleting}
              onClick={() => void completeRecording()}
            >
              <Square className="h-6 w-6 fill-current" />
            </button>
            <button
              className={cn(
                "flex h-[92px] w-[92px] items-center justify-center rounded-full border-4 border-paper text-white shadow-[0_10px_40px_rgba(95,122,82,0.4)] disabled:cursor-not-allowed disabled:opacity-50",
                paused ? "bg-sage" : "bg-terracotta"
              )}
              type="button"
              aria-label={paused ? "Resume recording" : "Pause recording"}
              disabled={isCompleting}
              onClick={togglePause}
            >
              {paused ? <Play className="h-9 w-9 fill-current" /> : <Pause className="h-9 w-9 fill-current" />}
            </button>
          </footer>
        </section>
      </main>
    );
  }

  return (
    <main className="relative mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-paper text-ink shadow-[0_30px_80px_rgba(55,35,15,0.18)]">
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
              {state.phase === "complete" ? "Review" : "New consultation"}
            </p>
            <h1 className="mt-1 font-display text-[32px] italic leading-none tracking-normal text-ink">
              {state.phase === "complete" ? "Recording complete" : "New consultation"}
            </h1>
            <p className="mt-2 font-body text-xs leading-relaxed text-ink-muted">
              Audio stays on this device until you choose to transcribe or upload it.
            </p>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          {state.phase === "complete" ? (
            <section className="mb-4 rounded-[14px] border border-rule bg-paper p-4 shadow-[0_1px_0_#E5DAC5]">
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-[34px] italic leading-none text-ink">{elapsed}</h2>
                <span className="font-mono text-[11px] text-ink-muted">
                  {savedId ? "Saved locally" : "Ready to save"}
                </span>
              </div>
              <PlaybackPreview audioPreviewUrl={audioPreviewUrl} elapsed={elapsed} waveformBars={waveformBars} />
            </section>
          ) : null}

          <Field
            label={state.phase === "complete" ? "Patient ID · required before transcription" : "Patient ID"}
            value={patientId}
            placeholder="e.g. P-10483"
            mono
            onChange={setPatientId}
          />
          <Field
            label="Consultation label"
            value={label}
            placeholder="e.g. Follow-up, first visit"
            onChange={setLabel}
            suffix="Optional"
          />

          <div className="mt-4 rounded-xl border border-rule bg-paper-deep px-3.5 py-3">
            <p className="font-body text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">Before you start</p>
            <p className="mt-2 font-body text-[12.5px] leading-relaxed text-ink-soft">
              You have <span className="font-bold text-ink">60 minutes</span> per consultation. Local metadata is prepared for 30-second audio chunks.
            </p>
          </div>

          {transcript ? (
            <section className="mt-4 rounded-xl border border-indigo/20 bg-paper px-3.5 py-3">
              <p className="font-body text-[11px] font-bold uppercase tracking-[0.14em] text-indigo">Transcript ready</p>
              <p className="mt-2 max-h-28 overflow-y-auto font-body text-[12.5px] leading-relaxed text-ink-soft">
                {transcript}
              </p>
            </section>
          ) : null}

          {savedId ? (
            <p className="mt-3 rounded-lg border border-sage/30 bg-sage/10 px-3 py-2 font-body text-xs font-semibold text-sage">
              Recording saved locally as {savedId}.
            </p>
          ) : null}
          {error ? <p className="mt-3 font-body text-xs font-semibold text-stamp">{error}</p> : null}
        </div>

        <footer className="shrink-0 px-6 pb-8 pt-3">
          {state.phase === "complete" ? (
            <div className="grid grid-cols-[0.8fr_1.2fr] gap-2">
              <BharatButton
                className="border-stamp/30 px-3 text-xs text-stamp"
                variant="ghost"
                icon={<Trash2 className="h-4 w-4" />}
                onClick={discardRecording}
              >
                Discard
              </BharatButton>
              <div className="grid min-w-0 grid-cols-1 gap-2">
                <BharatButton
                  className="px-3 text-xs"
                  icon={<Save className="h-4 w-4" />}
                  onClick={() => void saveRecording()}
                >
                  Save, transcribe later
                </BharatButton>
                <BharatButton
                  className="px-3 text-xs"
                  disabled={isTranscribing}
                  icon={
                    isTranscribing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )
                  }
                  variant="ink"
                  onClick={() => void transcribeNow()}
                >
                  {isTranscribing ? "Transcribing" : "Transcribe now"}
                </BharatButton>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <button
                className="flex h-[108px] w-[108px] items-center justify-center rounded-full bg-terracotta text-white shadow-[0_12px_40px_rgba(194,74,42,0.4),0_0_0_10px_rgba(194,74,42,0.08)] disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                aria-label="Start recording"
                disabled={isStarting}
                onClick={() => void startRecording()}
              >
                <Mic className="h-11 w-11" />
              </button>
              <p className="font-body text-sm font-semibold text-ink">
                {isStarting ? "Requesting microphone" : "Tap to start recording"}
              </p>
            </div>
          )}
        </footer>
      </section>
    </main>
  );
}

function PlaybackPreview({
  audioPreviewUrl,
  elapsed,
  waveformBars
}: {
  audioPreviewUrl: string | null;
  elapsed: string;
  waveformBars: number[];
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  function seek(seconds: number) {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    audio.currentTime = Math.max(0, Math.min(duration, audio.currentTime + seconds));
  }

  async function togglePlayback() {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    if (isPlaying) {
      audio.pause();
      return;
    }

    try {
      await audio.play();
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
    }
  }

  return (
    <div className="mt-4">
      <audio
        ref={audioRef}
        aria-label="Recording playback"
        src={audioPreviewUrl ?? undefined}
        preload="metadata"
        onEnded={() => setIsPlaying(false)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
      />
      <div className="flex h-16 items-center gap-[3px]">
        {waveformBars.slice(0, 38).map((bar) => (
          <div
            key={bar}
            className="min-h-1 flex-1 rounded-full bg-terracotta"
            style={{ height: `${20 + Math.abs(Math.cos(bar * 0.5)) * 66}%` }}
          />
        ))}
      </div>
      <div className="mt-1 flex items-center justify-between font-mono text-[10px] text-ink-muted">
        <span>00:00</span>
        <span>{elapsed}</span>
      </div>
      <div className="mt-3 flex items-center justify-center gap-4">
        <button
          className="flex h-11 w-11 items-center justify-center rounded-full border border-rule bg-paper-deep text-ink-soft disabled:cursor-not-allowed disabled:opacity-40"
          type="button"
          aria-label="Rewind 10 seconds"
          disabled={!audioPreviewUrl}
          onClick={() => seek(-10)}
        >
          <Rewind className="h-4 w-4" />
        </button>
        <button
          className="flex h-14 w-14 items-center justify-center rounded-full bg-ink text-paper shadow-[0_10px_24px_rgba(28,23,18,0.2)] disabled:cursor-not-allowed disabled:opacity-40"
          type="button"
          aria-label={isPlaying ? "Pause playback" : "Play recording"}
          disabled={!audioPreviewUrl}
          onClick={() => void togglePlayback()}
        >
          {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 fill-current" />}
        </button>
        <button
          className="flex h-11 w-11 items-center justify-center rounded-full border border-rule bg-paper-deep text-ink-soft disabled:cursor-not-allowed disabled:opacity-40"
          type="button"
          aria-label="Forward 10 seconds"
          disabled={!audioPreviewUrl}
          onClick={() => seek(10)}
        >
          <FastForward className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  placeholder,
  onChange,
  mono,
  suffix
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  mono?: boolean;
  suffix?: string;
}) {
  return (
    <label className="mb-3 block">
      <span className="mb-1.5 flex items-center justify-between font-body text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta">
        {label}
        {suffix ? <span className="font-body text-[10px] text-ink-muted">{suffix}</span> : null}
      </span>
      <input
        className={cn(
          "h-12 w-full rounded-xl border border-rule bg-paper px-3.5 font-body text-sm text-ink outline-none placeholder:text-ink-faint focus:border-terracotta focus:ring-2 focus:ring-terracotta/15",
          mono ? "font-mono" : "font-body"
        )}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
