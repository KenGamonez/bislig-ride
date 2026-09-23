// Bislig Ride — send-push Edge Function (background Web Push sender).
//
// Triggered by Supabase Database Webhooks (observer only):
//   - ride_offers INSERT (status offered)            -> driver_id
//   - pakyawan_bookings UPDATE (driver_id NULL -> X) -> driver_id
//   - deliveries UPDATE (driver_id NULL -> X)        -> driver_id
//   - pakyawan_offers INSERT (status offered)        -> driver_id
//   - delivery_offers INSERT (status offered)        -> driver_id
//
// Reads that driver's rows from public.push_subscriptions with the
// service_role client, sends Web Push via VAPID, and deletes endpoints
// that return permanent errors (404/410). Never mutates ride, booking,
// driver, or presence state. Never returns keys or subscriptions.
//
// Required Edge Function secrets (set via dashboard or CLI):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (built-in),
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT,
//   optional PUSH_WEBHOOK_SECRET (if set, the caller must send it as
//   the x-push-webhook-secret header).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

type PushEventType =
  | "ride_offer"
  | "pakyawan_assignment"
  | "delivery_assignment"
  | "pakyawan_offer"
  | "delivery_offer";

const ALLOWED_TYPES: PushEventType[] = [
  "ride_offer",
  "pakyawan_assignment",
  "delivery_assignment",
  "pakyawan_offer",
  "delivery_offer",
];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PushEvent = {
  type?: unknown;
  driver_id?: unknown;
  ride_id?: unknown;
  booking_id?: unknown;
  delivery_id?: unknown;
  offer_id?: unknown;
};

type SubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function buildBody(
  supabase: ReturnType<typeof createClient>,
  event: Required<Pick<PushEvent, "type">> & PushEvent,
): Promise<{ title: string; body: string; url: string; tag: string }> {
  const short = (value: unknown): string => {
    const text = typeof value === "string" ? value.trim() : "";
    return text.length > 80 ? `${text.slice(0, 77)}...` : text;
  };

  switch (event.type) {
    case "ride_offer": {
      const { data: ride } = typeof event.ride_id === "string"
        ? await supabase
          .from("rides")
          .select("pickup_address,destination_address")
          .eq("id", event.ride_id)
          .maybeSingle()
        : { data: null };
      const route = ride
        ? `${short(ride.pickup_address)} → ${short(ride.destination_address)}`
        : "New ride request";
      return {
        title: "New ride request",
        body: route,
        url: "/",
        tag: `ride-offer-${String(event.offer_id ?? event.ride_id ?? "new")}`,
      };
    }
    case "pakyawan_assignment": {
      const { data: booking } = typeof event.booking_id === "string"
        ? await supabase
          .from("pakyawan_bookings")
          .select("pickup_location,destination")
          .eq("id", event.booking_id)
          .maybeSingle()
        : { data: null };
      const route = booking
        ? `${short(booking.pickup_location)} → ${short(booking.destination)}`
        : "New Pakyawan assignment";
      return {
        title: "New Pakyawan assignment",
        body: route,
        url: "/",
        tag: `pakyawan-${String(event.booking_id ?? "new")}`,
      };
    }
    case "delivery_assignment": {
      const { data: delivery } = typeof event.delivery_id === "string"
        ? await supabase
          .from("deliveries")
          .select("pickup_address,delivery_address")
          .eq("id", event.delivery_id)
          .maybeSingle()
        : { data: null };
      const route = delivery
        ? `${short(delivery.pickup_address)} → ${short(delivery.delivery_address)}`
        : "New delivery assignment";
      return {
        title: "New delivery assignment",
        body: route,
        url: "/",
        tag: `delivery-${String(event.delivery_id ?? "new")}`,
      };
    }
    case "pakyawan_offer": {
      return {
        title: "New Pakyawan offer",
        body: "A Pakyawan trip is available. Open Bislig Ride to review it.",
        url: "/",
        tag: `pakyawan-offer-${String(event.offer_id ?? "new")}`,
      };
    }
    default: {
      return {
        title: "New delivery offer",
        body: "A delivery request is available. Open Bislig Ride to review it.",
        url: "/",
        tag: `delivery-offer-${String(event.offer_id ?? "new")}`,
      };
    }
  }
}

serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed." });
  }

  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "";
  const webhookSecret = Deno.env.get("PUSH_WEBHOOK_SECRET") ?? "";

  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    return json(500, { error: "Push messaging is not configured." });
  }

  if (webhookSecret) {
    const provided = req.headers.get("x-push-webhook-secret") ?? "";
    if (provided !== webhookSecret) {
      return json(401, { error: "Unauthorized." });
    }
  }

  let event: PushEvent;

  try {
    event = (await req.json()) as PushEvent;
  } catch {
    return json(400, { error: "Invalid JSON payload." });
  }

  if (
    typeof event.type !== "string" ||
    !(ALLOWED_TYPES as string[]).includes(event.type)
  ) {
    return json(400, { error: "Unsupported event type." });
  }

  if (typeof event.driver_id !== "string" || !UUID_RE.test(event.driver_id)) {
    return json(400, { error: "A valid driver_id is required." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { error: "Push messaging is not configured." });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: subscriptions, error: subsError } = await supabase
    .from("push_subscriptions")
    .select("id,endpoint,p256dh,auth")
    .eq("driver_id", event.driver_id);

  if (subsError) {
    return json(500, { error: "Unable to load push subscriptions." });
  }

  const rows = (subscriptions ?? []) as SubscriptionRow[];

  if (rows.length === 0) {
    return json(200, { sent: 0, failed: 0, removed: 0 });
  }

  const content = await buildBody(supabase, {
    ...event,
    type: event.type as PushEventType,
  });

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  let sent = 0;
  let failed = 0;
  let removed = 0;

  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          JSON.stringify({ ...content, type: event.type }),
        );
        sent += 1;
      } catch (error) {
        const statusCode =
          typeof error === "object" && error !== null
            ? (error as { statusCode?: unknown }).statusCode
            : undefined;

        if (statusCode === 404 || statusCode === 410) {
          const { error: deleteError } = await supabase
            .from("push_subscriptions")
            .delete()
            .eq("id", row.id);

          if (!deleteError) {
            removed += 1;
          } else {
            failed += 1;
          }
        } else {
          failed += 1;
        }
      }
    }),
  );

  return json(200, { sent, failed, removed });
});
