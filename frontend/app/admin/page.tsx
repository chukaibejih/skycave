"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  AdminAuthError,
  adminLogin,
  clearAdminToken,
  getAdminToken,
  getFeedback,
  getGames,
  getInsights,
  getOverview,
  getTimeseries,
  getUsers,
  type FeedbackRow,
  type GameRow,
  type Insights,
  type Overview,
  type Timeseries,
  type UserRow,
} from "@/lib/admin";
import { BarList, Legend, SplitBar, TimeChart } from "@/components/admin/AdminCharts";

const GAME_NAME: Record<string, string> = {
  geoguess: "GeoGuess 1v1",
  color_clash: "Color Clash",
  flag_rush: "Flag Rush",
  outline_quiz: "Outline Quiz",
  word_duel: "Word Duel",
  reaction_grid: "Reaction Grid",
  mad_math: "Mad Math",
  word_hunt: "Word Hunt",
  tile_takeover: "Tile Takeover",
};
const gname = (t: string) => GAME_NAME[t] ?? t;

type Section = "overview" | "users" | "games" | "feedback";

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [section, setSection] = useState<Section>("overview");

  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [games, setGames] = useState<GameRow[] | null>(null);
  const [feedback, setFeedback] = useState<FeedbackRow[] | null>(null);

  // Login form
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadOverview = useCallback(async () => {
    try {
      setOverview(await getOverview());
      setAuthed(true);
    } catch (e) {
      if (e instanceof AdminAuthError) setAuthed(false);
      else setError((e as Error).message);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (getAdminToken()) loadOverview();
    else setChecking(false);
  }, [loadOverview]);

  // Lazy-load sections.
  useEffect(() => {
    if (!authed) return;
    if (section === "users" && !users) getUsers().then((r) => setUsers(r.users)).catch(handleErr);
    if (section === "games" && !games) getGames().then((r) => setGames(r.games)).catch(handleErr);
    if (section === "feedback" && !feedback) getFeedback().then((r) => setFeedback(r.feedback)).catch(handleErr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, authed]);

  function handleErr(e: unknown) {
    if (e instanceof AdminAuthError) {
      setAuthed(false);
    }
  }

  const submitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminLogin(password);
      setPassword("");
      await loadOverview();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const logout = () => {
    clearAdminToken();
    setAuthed(false);
    setOverview(null);
    setUsers(null);
    setGames(null);
    setFeedback(null);
  };

  if (checking) {
    return <Center>checking session…</Center>;
  }

  if (!authed) {
    return (
      <Center>
        <form
          onSubmit={submitLogin}
          className="w-full max-w-sm rounded-[16px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
        >
          <div className="mb-1 font-[var(--font-display)] text-xl font-bold">
            Skycave <span className="text-[var(--color-primary)]">backoffice</span>
          </div>
          <p className="mb-5 text-sm text-[var(--color-text-secondary)]">
            Enter the admin password to continue.
          </p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="admin password"
            autoFocus
            className="mb-3 w-full rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-base)] px-4 py-3 text-base outline-none focus:border-[var(--color-primary)]"
          />
          <button
            type="submit"
            disabled={busy || !password}
            style={{ backgroundColor: "#6C63FF", color: "#F0F0FF" }}
            className="flex h-[52px] w-full items-center justify-center rounded-[12px] font-[var(--font-body)] font-semibold disabled:opacity-50"
          >
            {busy ? "…" : "Sign in"}
          </button>
          {error && (
            <p className="mt-3 text-center text-sm text-[var(--color-warm)]">{error}</p>
          )}
        </form>
      </Center>
    );
  }

  return (
    <main className="mx-auto min-h-[100dvh] w-full max-w-5xl px-4 py-6 sm:px-6">
      <header className="mb-6 flex items-center justify-between">
        <div className="font-[var(--font-display)] text-2xl font-bold">
          Skycave <span className="text-[var(--color-primary)]">backoffice</span>
        </div>
        <button
          onClick={logout}
          className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-secondary)] active:text-[var(--color-text-primary)]"
        >
          Log out
        </button>
      </header>

      {/* Tabs */}
      <div className="mb-6 flex gap-2">
        {(["overview", "users", "games", "feedback"] as Section[]).map((s) => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className="rounded-full border px-4 py-2 text-sm capitalize transition-colors"
            style={{
              borderColor: section === s ? "#6C63FF" : "var(--color-border)",
              color: section === s ? "#F0F0FF" : "var(--color-text-secondary)",
              background: section === s ? "#6C63FF22" : "transparent",
            }}
          >
            {s === "games" ? "game history" : s}
          </button>
        ))}
      </div>

      {section === "overview" && overview && <OverviewView o={overview} />}
      {section === "users" && <UsersView users={users} />}
      {section === "games" && <GamesView games={games} />}
      {section === "feedback" && <FeedbackView feedback={feedback} />}
    </main>
  );
}

function FeedbackView({ feedback }: { feedback: FeedbackRow[] | null }) {
  if (!feedback) return <Loading />;
  if (feedback.length === 0) return <Empty label="No feedback yet." />;
  return (
    <div className="space-y-3">
      {feedback.map((f) => (
        <div
          key={f.id}
          className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
        >
          <p className="whitespace-pre-wrap text-sm text-[var(--color-text-primary)]">
            {f.message}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-[var(--font-mono)] text-[11px] text-[var(--color-text-secondary)]">
            <span>
              {f.submitter_handle
                ? (f.is_guest ? f.submitter_handle : `@${f.submitter_handle}`)
                : "anonymous"}
            </span>
            <span className="rounded-full bg-[var(--color-elevated)] px-2 py-0.5">
              {f.is_guest ? "guest" : "bluesky"}
            </span>
            {f.page && <span>{f.page}</span>}
            <span className="ml-auto">
              {new Date(f.created_at).toLocaleString()}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

const RANGES = [7, 30, 90];

function OverviewView({ o }: { o: Overview }) {
  const cards = [
    { label: "Bluesky users", value: o.users },
    { label: "Games played", value: o.games_played },
    { label: "Last 24h", value: o.games_24h },
    { label: "Live rooms", value: o.active_rooms },
    { label: "In progress", value: o.rooms_in_progress },
  ];

  const [days, setDays] = useState(30);
  const [ts, setTs] = useState<Timeseries | null>(null);
  useEffect(() => {
    let active = true;
    setTs(null);
    getTimeseries(days)
      .then((t) => active && setTs(t))
      .catch(() => active && setTs(null));
    return () => {
      active = false;
    };
  }, [days]);

  const [ins, setIns] = useState<Insights | null>(null);
  useEffect(() => {
    let active = true;
    getInsights()
      .then((i) => active && setIns(i))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const labels = ts?.buckets.map((b) => b.date) ?? [];
  const gamesSeries = [
    { name: "1v1", color: "#8b7cff", values: ts?.buckets.map((b) => b.versus) ?? [] },
    { name: "solo", color: "#ff725e", values: ts?.buckets.map((b) => b.solo) ?? [] },
  ];
  const usersSeries = [
    { name: "new members", color: "#67e8f9", values: ts?.buckets.map((b) => b.users) ?? [] },
  ];
  const byType = o.by_game
    .map((g) => ({ label: gname(g.game_type), value: g.count }))
    .sort((a, b) => b.value - a.value);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="font-[var(--font-display)] text-3xl font-bold">{c.value.toLocaleString()}</div>
            <div className="mt-1 text-xs text-[var(--color-text-secondary)]">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="font-[var(--font-display)] text-lg font-semibold">Activity</h2>
        <div className="flex gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-1">
          {RANGES.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className="rounded-full px-3 py-1 text-xs font-semibold transition-colors"
              style={{
                background: days === d ? "var(--color-primary)" : "transparent",
                color: days === d ? "#05060a" : "var(--color-text-secondary)",
              }}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <ChartCard title="Games per day" legend={<Legend series={gamesSeries} />}>
          {ts ? <TimeChart labels={labels} series={gamesSeries} unit="games" /> : <ChartSkeleton />}
        </ChartCard>

        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="New members per day">
            {ts ? <TimeChart labels={labels} series={usersSeries} unit="members" /> : <ChartSkeleton />}
          </ChartCard>
          <ChartCard title="Games by type">
            <BarList items={byType} />
          </ChartCard>
        </div>
      </div>

      <h2 className="mt-10 font-[var(--font-display)] text-lg font-semibold">Insights</h2>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Who's playing">
          {ins ? (
            <>
              <SplitBar
                segments={[
                  { label: "guests", value: ins.plays.guest, color: "#ff725e" },
                  { label: "Bluesky", value: ins.plays.bluesky, color: "#8b7cff" },
                ]}
              />
              <p className="mt-3 text-xs text-[var(--color-text-secondary)]">
                Share of every play by account type. Connecting Bluesky is what turns a guest into a player who can be brought back.
              </p>
            </>
          ) : (
            <ChartSkeleton />
          )}
        </ChartCard>

        <ChartCard title="1v1 invite funnel">
          {ins ? (
            <>
              <SplitBar
                segments={[
                  { label: "found an opponent", value: ins.funnel.filled, color: "#56f0aa" },
                  { label: "expired · no-show", value: ins.funnel.expired, color: "#ff725e" },
                ]}
              />
              <p className="mt-3 text-xs text-[var(--color-text-secondary)]">
                Of 1v1 rooms opened from a shared link, how many actually filled. A high no-show share means the invite loop is leaking.
              </p>
            </>
          ) : (
            <ChartSkeleton />
          )}
        </ChartCard>

        <ChartCard title="Feedback by screen">
          {ins ? (
            <BarList items={ins.feedback_by_page.map((p) => ({ label: p.label, value: p.count }))} color="#67e8f9" />
          ) : (
            <ChartSkeleton />
          )}
        </ChartCard>

        <ChartCard title="Feedback by device">
          {ins ? (
            <SplitBar
              segments={[
                { label: "mobile", value: ins.feedback_by_device.mobile, color: "#67e8f9" },
                { label: "desktop", value: ins.feedback_by_device.desktop, color: "#8b7cff" },
                { label: "unknown", value: ins.feedback_by_device.unknown, color: "#3a4258" },
              ]}
            />
          ) : (
            <ChartSkeleton />
          )}
        </ChartCard>
      </div>
    </motion.div>
  );
}

function ChartCard({
  title,
  legend,
  children,
}: {
  title: string;
  legend?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[16px] border border-[var(--color-border)] bg-[var(--color-surface)]/60 p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h3 className="font-[var(--font-display)] text-[1rem] font-semibold">{title}</h3>
        {legend}
      </div>
      {children}
    </div>
  );
}

function ChartSkeleton() {
  return <div className="h-[200px] animate-pulse rounded-[12px] bg-[var(--color-surface)]" />;
}

function UsersView({ users }: { users: UserRow[] | null }) {
  if (!users) return <Loading />;
  if (users.length === 0) return <Empty label="No Bluesky users yet (guests aren't stored)." />;
  return (
    <Table head={["#", "Handle", "Played", "Won", "Win %", "Score"]}>
      {users.map((u, i) => (
        <tr key={u.did} className="border-t border-[var(--color-border)]">
          <Td className="text-[var(--color-text-secondary)]">{i + 1}</Td>
          <Td>
            <div className="font-medium">{u.display_name ?? u.handle}</div>
            <div className="font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)]">@{u.handle}</div>
          </Td>
          <Td>{u.games_played}</Td>
          <Td>{u.games_won}</Td>
          <Td>{Math.round(u.win_rate * 100)}%</Td>
          <Td className="font-[var(--font-mono)]">{u.total_score.toLocaleString()}</Td>
        </tr>
      ))}
    </Table>
  );
}

function GamesView({ games }: { games: GameRow[] | null }) {
  if (!games) return <Loading />;
  if (games.length === 0) return <Empty label="No games recorded yet." />;
  return (
    <Table head={["When", "Game", "Result", "Winner"]}>
      {games.map((g) => {
        const solo = g.mode === "solo";
        const winner = solo
          ? "solo run"
          : g.player1_score === g.player2_score
            ? "draw"
            : g.player1_score > g.player2_score
              ? g.player1_handle
              : g.player2_handle ?? "-";
        return (
          <tr key={g.id} className="border-t border-[var(--color-border)]">
            <Td className="whitespace-nowrap text-[var(--color-text-secondary)]">
              {new Date(g.created_at).toLocaleString()}
            </Td>
            <Td>
              {gname(g.game_type)}
              {solo && (
                <span className="ml-2 rounded-full bg-[var(--color-elevated)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--color-text-secondary)]">
                  solo
                </span>
              )}
            </Td>
            <Td className="font-[var(--font-mono)] whitespace-nowrap">
              <span className="text-[var(--color-primary)]">{g.player1_handle}</span>{" "}
              {solo ? (
                g.player1_score.toLocaleString()
              ) : (
                <>
                  {g.player1_score}-{g.player2_score}{" "}
                  <span className="text-[var(--color-warm)]">{g.player2_handle ?? "-"}</span>
                </>
              )}
            </Td>
            <Td className={winner === "draw" || solo ? "text-[var(--color-text-secondary)]" : "text-[var(--color-success)]"}>
              {winner}
            </Td>
          </tr>
        );
      })}
    </Table>
  );
}

// ── small UI helpers ──
function Center({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-6 text-center text-sm text-[var(--color-text-secondary)]">
      {children}
    </main>
  );
}
function Loading() {
  return <p className="py-10 text-center text-sm text-[var(--color-text-secondary)]">loading…</p>;
}
function Empty({ label }: { label: string }) {
  return <p className="py-10 text-center text-sm text-[var(--color-text-secondary)]">{label}</p>;
}
function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-[14px] border border-[var(--color-border)]">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="bg-[var(--color-surface)]">
            {head.map((h) => (
              <th key={h} className="px-4 py-3 font-[var(--font-mono)] text-[11px] uppercase tracking-wide text-[var(--color-text-secondary)]">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-top ${className}`}>{children}</td>;
}
