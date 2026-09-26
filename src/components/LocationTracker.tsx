import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MapPin, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type LocationRow = {
  user_id: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  location_at: string | null;
  last_login_at: string | null;
};

/** Likhitha's device silently reports its position so Manmadha can see it. */
export function useLocationReporter(userId: string | null, enabled: boolean) {
  const loggedRef = useRef(false);

  useEffect(() => {
    if (!userId || !enabled || typeof navigator === "undefined" || !navigator.geolocation) return;

    const push = async (pos?: GeolocationPosition) => {
      const payload: Record<string, unknown> = { user_id: userId };
      if (pos) {
        payload['latitude'] = pos.coords.latitude;
        payload['longitude'] = pos.coords.longitude;
        payload['accuracy'] = pos.coords.accuracy;
        payload['location_at'] = new Date(pos.timestamp).toISOString();
      }
      if (!loggedRef.current) {
        payload['last_login_at'] = new Date().toISOString();
        loggedRef.current = true;
      }
      payload['updated_at'] = new Date().toISOString();
      await supabase.from("user_locations").upsert(payload as never, { onConflict: "user_id" });
    };

    // Always record the login moment, even if location permission is denied.
    void push();

    navigator.geolocation.getCurrentPosition(
      (pos) => void push(pos),
      () => undefined,
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );

    const watchId = navigator.geolocation.watchPosition(
      (pos) => void push(pos),
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 120_000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [userId, enabled]);
}

function fmt(ts: string | null) {
  if (!ts) return "unknown";
  const d = new Date(ts);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** Visible to Manmadha only — opens a panel with Likhitha's location & last login. */
export function LocationButton({
  otherId,
  name,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}: {
  otherId: string;
  name: string;
  /** When provided, the panel is controlled from outside (e.g. the three-dot menu). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Hide the header pin trigger (when opened from a menu instead). */
  hideTrigger?: boolean;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [row, setRow] = useState<LocationRow | null>(null);
  const [loading, setLoading] = useState(false);

  const open = controlledOpen ?? internalOpen;
  const setOpen = (v: boolean) => {
    setInternalOpen(v);
    onOpenChange?.(v);
  };

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("user_locations")
      .select("*")
      .eq("user_id", otherId)
      .maybeSingle();
    setRow((data as LocationRow) ?? null);
    setLoading(false);
  };

  useEffect(() => {
    if (!open) return;
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, otherId]);

  const mapsUrl =
    row?.latitude != null && row?.longitude != null
      ? `https://www.google.com/maps?q=${row.latitude},${row.longitude}`
      : null;

  return (
    <>
      {!hideTrigger && (
        <button
          type="button"
          aria-label={`${name} location`}
          onClick={() => setOpen(true)}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 active:scale-95 sm:h-10 sm:w-10"
        >
          <MapPin size={18} />
        </button>
      )}

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4" onClick={() => setOpen(false)}>
            <div
              className="w-full max-w-sm rounded-3xl bg-white p-5 text-slate-900 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-bold">{name}</h2>
                <button aria-label="Close" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-xl bg-black text-red-500 ring-2 ring-red-500">
                  <X size={18} />
                </button>
              </div>

              {loading && !row && <p className="text-sm text-slate-500">Loading…</p>}

              <div className="space-y-3 text-sm">
                <div>
                  <div className="font-semibold">Last login</div>
                  <div className="text-slate-600">{fmt(row?.last_login_at ?? null)}</div>
                </div>
                <div>
                  <div className="font-semibold">Location updated</div>
                  <div className="text-slate-600">{fmt(row?.location_at ?? null)}</div>
                </div>
                {row?.latitude != null && row?.longitude != null ? (
                  <>
                    <div>
                      <div className="font-semibold">Coordinates</div>
                      <div className="text-slate-600">
                        {row.latitude.toFixed(5)}, {row.longitude.toFixed(5)}
                        {row.accuracy != null && ` (±${Math.round(row.accuracy)} m)`}
                      </div>
                    </div>
                    <a
                      href={mapsUrl!}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-2xl bg-emerald-600 px-4 py-3 text-center font-semibold text-white"
                    >
                      Open in Google Maps
                    </a>
                  </>
                ) : (
                  <p className="text-slate-500">No location shared yet. It appears once she opens the chat and allows location on her phone.</p>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
