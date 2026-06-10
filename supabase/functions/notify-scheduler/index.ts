// ─── MacroQuest notification scheduler ────────────────────────────────────────
// Invoked every ~15 min by pg_cron. For each onboarded user it evaluates, in the
// user's OWN timezone, whether to fire:
//   • streak-saver push  — 8 PM local, only if a streak is at risk (has streak +
//                          hasn't logged today)
//   • daily reminder push — at the user's chosen hour, only if not logged today
//   • email digest        — 1 PM local, at most once every 2 days
//
// Safety / idempotency:
//   • Authorized only via the x-cron-secret header (CRON_SECRET env).
//   • Each channel has a last_*_at marker; we never fire twice in one local day
//     (or within 2 days for email).
//   • Quiet hours 10 PM–8 AM are always respected.
//   • Missing secrets => that channel is silently skipped (safe no-op rollout).
//   • Dead push subscriptions (404/410) are pruned.

import webpush from "npm:web-push@3.6.7";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const QUIET_START = 22; // 10 PM
const QUIET_END = 8;    // 8 AM
const STREAK_SAVER_HOUR = 20; // 8 PM
const EMAIL_HOUR = 13;        // 1 PM
const EMAIL_MIN_GAP_DAYS = 2;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Local wall-clock parts for a tz, using a fixed YYYY-MM-DD date string.
function localParts(at: Date, tz: string): { dateStr: string; hour: number } {
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", hour12: false,
    });
    const parts: Record<string, string> = {};
    for (const p of fmt.formatToParts(at)) parts[p.type] = p.value;
    let hour = parseInt(parts.hour, 10);
    if (hour === 24) hour = 0; // some runtimes emit 24 for midnight
    return { dateStr: `${parts.year}-${parts.month}-${parts.day}`, hour };
  } catch {
    // Unknown timezone — fall back to UTC
    return localParts(at, "UTC");
  }
}

function localDateOf(ts: string | null, tz: string): string | null {
  if (!ts) return null;
  return localParts(new Date(ts), tz).dateStr;
}

function daysBetween(aStr: string, bStr: string): number {
  const a = Date.parse(aStr + "T00:00:00Z");
  const b = Date.parse(bStr + "T00:00:00Z");
  return Math.round((b - a) / 86400000);
}

Deno.serve(async (req) => {
  // ── Authorize ──
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return json({ error: "unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── Channel readiness (missing secrets => skip that channel) ──
  const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY") ??
    "BDZBHGZiDwmUPcOKwbzMyjOrVrZgg-MYI4qDcrHPgC6rF15IvZD19ilrVwImLj8w2Ha4GPOwxlThy3Ovp2yM8Io";
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:support@macroquest.app";
  const pushReady = !!vapidPrivate;
  if (pushReady) webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate!);

  const gmailUser = Deno.env.get("GMAIL_SMTP_USER");
  const gmailPass = Deno.env.get("GMAIL_SMTP_PASS");
  const emailReady = !!(gmailUser && gmailPass);

  const now = new Date();
  const stats = { push: 0, email: 0, pruned: 0, users: 0 };

  // ── Load candidate users + supporting data ──
  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select(
      "id, username, timezone, push_daily_reminder, push_streak_saver, daily_reminder_hour, " +
      "email_digest_enabled, last_daily_reminder_at, last_streak_saver_at, last_email_at, " +
      "calorie_goal, protein_goal, goal_direction",
    )
    .eq("onboarded", true);

  if (pErr) return json({ error: pErr.message }, 500);
  if (!profiles?.length) return json({ ok: true, ...stats });

  const ids = profiles.map((p) => p.id);

  const [{ data: streaksRows }, { data: subsRows }] = await Promise.all([
    supabase.from("streaks").select("user_id, logging, last_log_date").in("user_id", ids),
    supabase.from("push_subscriptions").select("*").in("user_id", ids),
  ]);

  const streakMap = new Map((streaksRows ?? []).map((s) => [s.user_id, s]));
  const subsMap = new Map<string, any[]>();
  for (const s of subsRows ?? []) {
    if (!subsMap.has(s.user_id)) subsMap.set(s.user_id, []);
    subsMap.get(s.user_id)!.push(s);
  }

  async function sendPushToUser(userId: string, payload: Record<string, unknown>) {
    const subs = subsMap.get(userId) ?? [];
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
        );
        stats.push++;
      } catch (e: any) {
        const code = e?.statusCode;
        if (code === 404 || code === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
          stats.pruned++;
        }
      }
    }
  }

  const emailQueue: { userId: string; tz: string; profile: any }[] = [];

  // ── Per-user evaluation ──
  for (const p of profiles) {
    stats.users++;
    const tz = p.timezone || "UTC";
    const { dateStr: today, hour } = localParts(now, tz);
    const quiet = hour < QUIET_END || hour >= QUIET_START;
    const streak = streakMap.get(p.id);
    const loggedToday = streak?.last_log_date === today;
    const subs = subsMap.get(p.id) ?? [];

    // ── Streak saver (8 PM, streak at risk) ──
    if (pushReady && p.push_streak_saver && subs.length && !quiet && hour >= STREAK_SAVER_HOUR) {
      const firedToday = localDateOf(p.last_streak_saver_at, tz) === today;
      if (!firedToday) {
        const hasStreak = (streak?.logging || 0) >= 1;
        if (hasStreak && !loggedToday) {
          await sendPushToUser(p.id, {
            title: "🔥 Your streak is at risk!",
            body: `Day ${streak!.logging} streak — log a meal before midnight to keep it alive, ${p.username || "Champion"}!`,
            tag: "streak-saver",
            url: "/log?src=push",
          });
        }
        // Mark evaluated either way so we don't re-check all evening.
        await supabase.from("profiles")
          .update({ last_streak_saver_at: now.toISOString() }).eq("id", p.id);
      }
    }

    // ── Daily reminder (chosen hour, if not logged) ──
    if (pushReady && p.push_daily_reminder && subs.length && !quiet) {
      const targetHour = p.daily_reminder_hour ?? 12;
      const firedToday = localDateOf(p.last_daily_reminder_at, tz) === today;
      if (hour >= targetHour && !firedToday) {
        if (!loggedToday) {
          await sendPushToUser(p.id, {
            title: "⚡ Time to log your meals",
            body: "Keep your empire growing — log today's food to earn XP and resources!",
            tag: "daily-reminder",
            url: "/log?src=push",
          });
        }
        await supabase.from("profiles")
          .update({ last_daily_reminder_at: now.toISOString() }).eq("id", p.id);
      }
    }

    // ── Email digest (1 PM, every 2 days) ──
    if (emailReady && p.email_digest_enabled && hour >= EMAIL_HOUR) {
      const lastDate = localDateOf(p.last_email_at, tz);
      const due = !lastDate || daysBetween(lastDate, today) >= EMAIL_MIN_GAP_DAYS;
      if (due) emailQueue.push({ userId: p.id, tz, profile: p });
    }
  }

  // ── Send queued emails over a single SMTP connection ──
  if (emailReady && emailQueue.length) {
    // Batch-load digest data for ALL queued users up front — avoids 2 DB
    // queries per recipient inside the send loop (N+1).
    const queuedIds = emailQueue.map((q) => q.userId);
    const sevenAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
      .toISOString().slice(0, 10);
    const thirtyAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)
      .toISOString().slice(0, 10);

    const [{ data: allSummaries }, { data: allWeights }] = await Promise.all([
      supabase.from("daily_summaries")
        .select("user_id,summary_date,total_calories,total_protein,quests_completed,xp_earned")
        .in("user_id", queuedIds).gte("summary_date", sevenAgo),
      supabase.from("body_metrics")
        .select("user_id,date,weight_kg")
        .in("user_id", queuedIds).gte("date", thirtyAgo)
        .order("date", { ascending: true }),
    ]);

    const summariesByUser = new Map<string, any[]>();
    for (const s of allSummaries ?? []) {
      if (!summariesByUser.has(s.user_id)) summariesByUser.set(s.user_id, []);
      summariesByUser.get(s.user_id)!.push(s);
    }
    const weightsByUser = new Map<string, any[]>();
    for (const w of allWeights ?? []) {
      if (!weightsByUser.has(w.user_id)) weightsByUser.set(w.user_id, []);
      weightsByUser.get(w.user_id)!.push(w);
    }

    let client: SMTPClient | null = null;
    try {
      client = new SMTPClient({
        connection: {
          hostname: "smtp.gmail.com",
          port: 465,
          tls: true,
          auth: { username: gmailUser!, password: gmailPass! },
        },
      });

      for (const item of emailQueue) {
        const { data: u } = await supabase.auth.admin.getUserById(item.userId);
        const email = u?.user?.email;
        if (!email) continue;

        const html = buildDigestHtml(
          item.profile,
          streakMap.get(item.userId),
          summariesByUser.get(item.userId) ?? [],
          weightsByUser.get(item.userId) ?? [],
        );
        try {
          await client.send({
            from: `MacroQuest <${gmailUser}>`,
            to: email,
            subject: "⚔️ Your MacroQuest Battle Report",
            html,
            content: "auto",
          });
          stats.email++;
          await supabase.from("profiles")
            .update({ last_email_at: now.toISOString() }).eq("id", item.userId);
        } catch (_e) {
          // Per-recipient failure shouldn't abort the batch.
        }
      }
    } catch (_e) {
      // SMTP connect failed — leave markers untouched so we retry next run.
    } finally {
      try { await client?.close(); } catch (_e) { /* ignore */ }
    }
  }

  return json({ ok: true, ...stats });
});

// Builds a lightweight HTML digest from pre-fetched summaries + weight history.
function buildDigestHtml(profile: any, streak: any, summaries: any[], weights: any[]): string {
  const days = summaries?.length || 0;
  const avgProtein = days ? Math.round(summaries.reduce((s: number, d: any) => s + Number(d.total_protein || 0), 0) / days) : 0;
  const avgCalories = days ? Math.round(summaries.reduce((s: number, d: any) => s + Number(d.total_calories || 0), 0) / days) : 0;
  const totalXP = summaries?.reduce((s: number, d: any) => s + (d.xp_earned || 0), 0) || 0;
  const quests = summaries?.reduce((s: number, d: any) => s + (d.quests_completed || 0), 0) || 0;

  let weightLine = "";
  if (weights && weights.length >= 2) {
    const start = Number(weights[0].weight_kg);
    const cur = Number(weights[weights.length - 1].weight_kg);
    const delta = +(cur - start).toFixed(1);
    const dir = profile.goal_direction || "maintain";
    const good = dir === "cut" ? delta < 0 : dir === "bulk" ? delta > 0 : Math.abs(delta) <= 1.5;
    const arrow = delta < 0 ? "▼" : delta > 0 ? "▲" : "—";
    weightLine = `<tr><td style="padding:8px 0;color:#94a3b8">Weight (${dir})</td>
      <td style="padding:8px 0;text-align:right;color:${good ? "#34d399" : "#fbbf24"};font-weight:600">
      ${cur} kg ${arrow} ${delta > 0 ? "+" : ""}${delta} kg</td></tr>`;
  }

  const name = profile.username || "Champion";
  const streakDays = streak?.logging || 0;

  return `
  <div style="background:#07070f;padding:24px;font-family:'Segoe UI',Arial,sans-serif;color:#e2e8f0">
    <div style="max-width:480px;margin:0 auto;background:#13132e;border:1px solid #1e1e4a;border-radius:12px;overflow:hidden">
      <div style="padding:20px 24px;border-bottom:1px solid #1e1e4a">
        <h1 style="margin:0;font-size:18px;color:#f5a623">⚔️ Battle Report</h1>
        <p style="margin:4px 0 0;font-size:13px;color:#94a3b8">Greetings, ${name} — here's your progress.</p>
      </div>
      <div style="padding:20px 24px">
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:8px 0;color:#94a3b8">🔥 Logging streak</td>
            <td style="padding:8px 0;text-align:right;color:#f43f5e;font-weight:600">${streakDays} days</td></tr>
          <tr><td style="padding:8px 0;color:#94a3b8">⚡ Avg energy</td>
            <td style="padding:8px 0;text-align:right;color:#f5a623;font-weight:600">${avgCalories} EP</td></tr>
          <tr><td style="padding:8px 0;color:#94a3b8">🔩 Avg iron (protein)</td>
            <td style="padding:8px 0;text-align:right;color:#60a5fa;font-weight:600">${avgProtein} g</td></tr>
          <tr><td style="padding:8px 0;color:#94a3b8">🏆 Quests completed</td>
            <td style="padding:8px 0;text-align:right;color:#34d399;font-weight:600">${quests}</td></tr>
          <tr><td style="padding:8px 0;color:#94a3b8">✨ XP earned</td>
            <td style="padding:8px 0;text-align:right;color:#a78bfa;font-weight:600">${totalXP}</td></tr>
          ${weightLine}
        </table>
        <p style="margin:18px 0 0;font-size:13px;color:#cbd5e1;line-height:1.5">
          ${days >= 5
            ? "Outstanding consistency this week — keep the momentum and your empire will flourish. ⚔️"
            : days >= 1
            ? "Good progress — log a little more often this week to unlock bigger streak bonuses. 🔥"
            : "Your realm is quiet — return and log a meal to revive your quest! 🏕️"}
        </p>
      </div>
      <div style="padding:14px 24px;border-top:1px solid #1e1e4a;font-size:11px;color:#6b7280">
        You're receiving this because email digests are on. Turn them off anytime in MacroQuest → Settings.
      </div>
    </div>
  </div>`;
}
