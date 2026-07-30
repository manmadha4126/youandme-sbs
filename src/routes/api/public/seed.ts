import { createFileRoute } from "@tanstack/react-router";

// Supabase requires >= 6 chars, so the 4-digit PIN is expanded server-side.
export function toPassword(pin: string) {
  return `ym-${pin}`;
}

const USERS = [
  { username: "manmadha", display_name: "Manmadha", pin: "6415" },
  { username: "likhitha", display_name: "Likhitha", pin: "5189" },
];

export const Route = createFileRoute("/api/public/seed")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const created: string[] = [];
        const { data: list } = await supabaseAdmin.auth.admin.listUsers();
        for (const u of USERS) {
          const email = `${u.username}@youandme.app`;
          const password = toPassword(u.pin);
          const existing = list?.users.find((x) => x.email === email);
          let userId = existing?.id;
          if (!existing) {
            const { data, error } = await supabaseAdmin.auth.admin.createUser({
              email,
              password,
              email_confirm: true,
              user_metadata: { username: u.username, display_name: u.display_name },
            });
            if (error) {
              return new Response(JSON.stringify({ error: error.message }), { status: 500 });
            }
            userId = data.user?.id;
            created.push(u.username);
          } else {
            // Idempotently ensure the password matches the username
            await supabaseAdmin.auth.admin.updateUserById(existing.id, { password });
          }
          if (userId) {
            await supabaseAdmin.from("profiles").upsert(
              { id: userId, username: u.username, display_name: u.display_name },
              { onConflict: "id" },
            );
          }
        }

        return new Response(JSON.stringify({ ok: true, created }), {
          headers: { "content-type": "application/json" },
        });
      },
      GET: async () => new Response("POST to seed", { status: 405 }),
    },
  },
});
