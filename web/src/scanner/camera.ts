// The camera for scanning: the right rear lens, a sharp image at the right
// distance, less glare. Every option is used only if the camera says it has
// it (getCapabilities), and each one may fail silently (iPhone ignores most).

const DEVICE_KEY = "scanner-camera";

/** Why the camera could not be opened. */
export type CameraProblem = "insecure" | "unsupported" | "denied" | "nocamera" | "busy";

export class CameraError extends Error {
  constructor(readonly problem: CameraProblem) {
    super(problem);
  }
}

/** Camera options newer than TypeScript's DOM types (Chrome on Android has them). */
interface Range {
  min: number;
  max: number;
  step?: number;
}
type ExtCapabilities = MediaTrackCapabilities & {
  focusMode?: string[];
  zoom?: Range;
  torch?: boolean;
  pointsOfInterest?: unknown;
  exposureCompensation?: Range;
};
type ExtConstraint = MediaTrackConstraintSet & {
  focusMode?: string;
  zoom?: number;
  torch?: boolean;
  pointsOfInterest?: { x: number; y: number }[];
  exposureCompensation?: number;
};

const SIZE: MediaTrackConstraints = { width: { ideal: 1280, max: 1920 }, height: { ideal: 720, max: 1080 } };

export interface OpenCamera {
  stream: MediaStream;
  track: MediaStreamTrack;
  /** The camera has a torch (flash light) that can be switched on. */
  hasTorch: boolean;
}

function caps(track: MediaStreamTrack): ExtCapabilities {
  try {
    return (track.getCapabilities?.() ?? {}) as ExtCapabilities;
  } catch {
    return {};
  }
}

function problemOf(err: unknown): CameraProblem {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return "denied";
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") return "nocamera";
  if (name === "NotSupportedError" || name === "TypeError") return "unsupported";
  return "busy";
}

const stop = (s: MediaStream | null) => s?.getTracks().forEach((t) => t.stop());

function saved(): string | null {
  try {
    return localStorage.getItem(DEVICE_KEY);
  } catch {
    return null;
  }
}
function save(id: string | undefined) {
  try {
    if (id) localStorage.setItem(DEVICE_KEY, id);
    else localStorage.removeItem(DEVICE_KEY);
  } catch {}
}

/**
 * The best rear camera for barcodes: rear, with continuous focus, not the
 * ultra-wide / macro / tele one; on Android the main lens has the lowest
 * "camera2 N" number. Labels are only known once the camera was allowed.
 */
async function bestRearCamera(): Promise<string | null> {
  let devices: MediaDeviceInfo[];
  try {
    devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
  } catch {
    return null;
  }
  if (devices.length < 2) return null;
  let best: { id: string; score: number } | null = null;
  for (const d of devices) {
    const label = d.label.toLowerCase();
    let c: ExtCapabilities = {};
    try {
      c = ((d as InputDeviceInfo).getCapabilities?.() ?? {}) as ExtCapabilities;
    } catch {}
    const facing = c.facingMode ?? [];
    if (facing.includes("user") || /front|user|selfie|avant/.test(label)) continue;
    let score = 0;
    if (facing.includes("environment") || /back|rear|environment|arri[eè]re/.test(label)) score += 10;
    if (c.focusMode?.includes("continuous")) score += 5;
    if (/ultra|wide.?angle|0[.,]5|macro|tele|depth/.test(label)) score -= 20;
    // Android: "camera2 0, facing back" → lens 0 is the main one.
    const n = /camera2? ?(\d+)/.exec(label) ?? /(\d+)/.exec(label);
    if (n) score -= Math.min(5, Number(n[1])) * 0.5;
    if (!best || score > best.score) best = { id: d.deviceId, score };
  }
  return best && best.score > 0 ? best.id : null;
}

async function getStream(constraints: MediaTrackConstraints): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({ video: { ...SIZE, ...constraints }, audio: false });
}

/** Opens the scanning camera, tuned. Throws a CameraError with a clear reason. */
export async function openCamera(): Promise<OpenCamera> {
  if (typeof window === "undefined" || !window.isSecureContext) throw new CameraError("insecure");
  if (!navigator.mediaDevices?.getUserMedia) throw new CameraError("unsupported");

  let stream: MediaStream | null = null;
  // 1. The camera chosen last time on this device.
  const last = saved();
  if (last) {
    try {
      stream = await getStream({ deviceId: { exact: last } });
    } catch (err) {
      if (problemOf(err) === "denied") throw new CameraError("denied");
      save(undefined);
    }
  }
  // 2. Any rear camera, then a better rear lens if this phone has several.
  if (!stream) {
    try {
      stream = await getStream({ facingMode: "environment" });
    } catch (err) {
      throw new CameraError(problemOf(err));
    }
    const current = stream.getVideoTracks()[0]?.getSettings().deviceId;
    const best = await bestRearCamera();
    if (best && best !== current) {
      try {
        const better = await getStream({ deviceId: { exact: best } });
        stop(stream);
        stream = better;
      } catch {
        // Keep the first one.
      }
    }
  }
  const track = stream.getVideoTracks()[0];
  if (!track) {
    stop(stream);
    throw new CameraError("nocamera");
  }
  save(track.getSettings().deviceId);
  await tune(track);
  return { stream, track, hasTorch: caps(track).torch === true };
}

/** Focus, zoom, centre point and exposure: each only if the camera has it, each may fail silently. */
async function tune(track: MediaStreamTrack) {
  const c = caps(track);
  const steps: ExtConstraint[] = [];
  if (c.focusMode?.includes("continuous")) steps.push({ focusMode: "continuous" });
  // About 2× zoom: the phone is held farther away, where the lens can focus.
  if (c.zoom && c.zoom.max > 1) steps.push({ zoom: Math.max(c.zoom.min, Math.min(2, c.zoom.max)) });
  if (c.pointsOfInterest !== undefined) steps.push({ pointsOfInterest: [{ x: 0.5, y: 0.5 }] });
  // A little darker: less glare from a lamp on shiny packaging.
  if (c.exposureCompensation) {
    const { min, max, step } = c.exposureCompensation;
    const value = -Math.max(step ?? 0.33, 0.33);
    if (min <= value && value <= max) steps.push({ exposureCompensation: Math.max(min, value) });
  }
  for (const s of steps) {
    try {
      await track.applyConstraints({ advanced: [s] });
    } catch {
      // Not supported after all: keep going.
    }
  }
}

/** Switches the torch on / off; false if it didn't work. */
export async function setTorch(track: MediaStreamTrack, on: boolean): Promise<boolean> {
  try {
    await track.applyConstraints({ advanced: [{ torch: on } as ExtConstraint] });
    return true;
  } catch {
    return false;
  }
}

export function closeCamera(stream: MediaStream | null) {
  stop(stream);
}
