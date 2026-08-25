"use client";
import { Fragment, useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  AdminAuthError,
  adminLogin,
  clearAdminToken,
  getAdminToken,
  getFeedback,
  setFeedbackResolved,
  getGames,
  getInsights,
  getOverview,
  getTimeseries,
  getUsers,
  getTournamentsAdmin,
  getTournamentMatches,
  decideMatch,
  resolveForfeits,
  closeRegistration,
  recomputeUser,
  deleteGame,
  getAdminSeries,
  deleteAdminSeries,
  type SeriesAdminRow,
  type SeriesAdminResponse,
  type UserSort,
  type TournamentMatches,
  type TournamentAdminRow,
  type FeedbackRow,
  type GameRow,
  type Insights,
  type Overview,
  type Timeseries,
  type UserRow,
  type TournamentsAdmin,
} from "@/lib/admin";
import { BarList, Legend, SplitBar, TimeChart } from "@/components/admin/AdminCharts";
import { Avatar } from "@/components/ui/Avatar";

const PAGE = 25; // rows per page for the users + games tables
const FB_PAGE = 15; // feedback cards are taller, show fewer

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
  connect4: "Connect 4",
  dots_boxes: "Dots and Boxes",
  clay: "Clay",
  uno: "Uno",
  mancala: "Mancala",
  crossing: "Crossing",
};
const gname = (t: string) => GAME_NAME[t] ?? t;

type Section = "overview" | "users" | "games" | "series" | "tournaments" | "feedback";

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [section, setSection] = useState<Section>("overview");

  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<{ total: number; users: UserRow[] } | null>(null);
  const [games, setGames] = useState<{ total: number; games: GameRow[] } | null>(null);
  const [feedback, setFeedback] = useState<{ total: number; feedback: FeedbackRow[] } | null>(null);
  const [tournaments, setTournaments] = useState<TournamentsAdmin | null>(null);
  const [series, setSeries] = useState<SeriesAdminResponse | null>(null);
  const [usersOff, setUsersOff] = useState(0);
  const [gamesOff, setGamesOff] = useState(0);
  const [seriesOff, setSeriesOff] = useState(0);
  const [fbOff, setFbOff] = useState(0);

  // Filters / search / sort
  const [usersQ, setUsersQ] = useState("");
  const [usersSort, setUsersSort] = useState<UserSort>("created");
  const [usersOrder, setUsersOrder] = useState<"asc" | "desc">("desc");
  const [gamesType, setGamesType] = useState("");
  const [gamesMode, setGamesMode] = useState("");
  const [gamesQ, setGamesQ] = useState("");
  const [seriesStatus, setSeriesStatus] = useState("");
  const [seriesQ, setSeriesQ] = useState("");
  const [fbHideResolved, setFbHideResolved] = useState(false);
  const [note, setNote] = useState<string | null>(null); // transient action result

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

  // Lazy-load + paginate each section. Refetch when its page offset changes.
  useEffect(() => {
    if (!authed || section !== "users") return;
    getUsers(PAGE, usersOff, { q: usersQ || undefined, sort: usersSort, order: usersOrder })
      .then(setUsers)
      .catch(handleErr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, authed, usersOff, usersQ, usersSort, usersOrder]);
  useEffect(() => {
    if (!authed || section !== "games") return;
    getGames(PAGE, gamesOff, {
      game_type: gamesType || undefined,
      mode: gamesMode || undefined,
      q: gamesQ || undefined,
    })
      .then(setGames)
      .catch(handleErr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, authed, gamesOff, gamesType, gamesMode, gamesQ]);
  useEffect(() => {
    if (!authed || section !== "series") return;
    getAdminSeries(PAGE, seriesOff, { status: seriesStatus || undefined, q: seriesQ || undefined })
      .then(setSeries)
      .catch(handleErr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, authed, seriesOff, seriesStatus, seriesQ]);
  useEffect(() => {
    if (!authed || section !== "feedback") return;
    getFeedback(FB_PAGE, fbOff, fbHideResolved ? false : undefined)
      .then(setFeedback)
      .catch(handleErr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, authed, fbOff, fbHideResolved]);
  const loadTournaments = useCallback(() => {
    getTournamentsAdmin().then(setTournaments).catch(handleErr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!authed || section !== "tournaments") return;
    loadTournaments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, authed, loadTournaments]);

  function handleErr(e: unknown) {
    if (e instanceof AdminAuthError) {
      setAuthed(false);
    }
  }

  const toggleFeedback = async (id: number, resolved: boolean) => {
    try {
      await setFeedbackResolved(id, resolved);
      setFeedback((prev) =>
        prev
          ? { ...prev, feedback: prev.feedback.map((f) => (f.id === id ? { ...f, resolved } : f)) }
          : prev
      );
    } catch (e) {
      handleErr(e);
    }
  };

  const onRecompute = async (did: string) => {
    if (!window.confirm("Recompute this user's stats from their game history?")) return;
    try {
      const r = await recomputeUser(did);
      setUsers((prev) =>
        prev
          ? {
              ...prev,
              users: prev.users.map((u) =>
                u.did === did
                  ? {
                      ...u,
                      games_played: r.games_played,
                      games_won: r.games_won,
                      total_score: r.total_score,
                      win_rate: r.games_played ? r.games_won / r.games_played : 0,
                    }
                  : u,
              ),
            }
          : prev,
      );
      setNote(`Recomputed: ${r.games_played} played · ${r.games_won} won · ${r.total_score.toLocaleString()} pts`);
    } catch (e) {
      handleErr(e);
      setNote(`Recompute failed: ${(e as Error).message}`);
    }
  };

  const onDeleteGame = async (id: number) => {
    if (!window.confirm(`Delete game #${id}? Affected players' stats are recomputed. This cannot be undone.`)) return;
    try {
      await deleteGame(id);
      setGames((prev) =>
        prev ? { ...prev, total: prev.total - 1, games: prev.games.filter((g) => g.id !== id) } : prev,
      );
      setNote(`Deleted game #${id} · affected players recomputed.`);
    } catch (e) {
      handleErr(e);
      setNote(`Delete failed: ${(e as Error).message}`);
    }
  };

  const onDeleteSeries = async (id: string) => {
    if (!window.confirm(`Delete series ${id}? Its individual games are kept; only the series record is removed.`)) return;
    try {
      await deleteAdminSeries(id);
      setSeries((prev) =>
        prev
          ? { ...prev, total: prev.total - 1, series: prev.series.filter((s) => s.id !== id) }
          : prev,
      );
      setNote(`Deleted series ${id}.`);
    } catch (e) {
      handleErr(e);
      setNote(`Delete failed: ${(e as Error).message}`);
    }
  };

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
    setTournaments(null);
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
        {(["overview", "users", "games", "series", "tournaments", "feedback"] as Section[]).map((s) => (
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

      {note && (
        <div className="mb-4 flex items-center gap-3 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-elevated)] px-4 py-2 text-sm text-[var(--color-text-secondary)]">
          <span className="flex-1">{note}</span>
          <button onClick={() => setNote(null)} className="font-[var(--font-mono)] text-[11px] uppercase tracking-wide hover:text-[var(--color-text-primary)]">
            dismiss
          </button>
        </div>
      )}
      {section === "overview" && overview && <OverviewView o={overview} />}
      {section === "users" && (
        <>
          <div className="mb-3">
            <input
              value={usersQ}
              onChange={(e) => { setUsersQ(e.target.value); setUsersOff(0); }}
              placeholder="Search @handle or name…"
              className="w-full max-w-xs rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
            />
          </div>
          <UsersView
            users={users?.users ?? null}
            startIndex={usersOff}
            sort={usersSort}
            order={usersOrder}
            onSort={(col) => {
              setUsersOff(0);
              if (usersSort === col) setUsersOrder((o) => (o === "desc" ? "asc" : "desc"));
              else { setUsersSort(col); setUsersOrder("desc"); }
            }}
            onRecompute={onRecompute}
          />
          <Pager loaded={!!users} offset={usersOff} pageSize={PAGE} total={users?.total ?? 0} onChange={setUsersOff} />
        </>
      )}
      {section === "games" && (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            <select
              value={gamesType}
              onChange={(e) => { setGamesType(e.target.value); setGamesOff(0); }}
              className="rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
            >
              <option value="">All games</option>
              {(overview?.by_game ?? []).map((g) => (
                <option key={g.game_type} value={g.game_type}>{gname(g.game_type)}</option>
              ))}
            </select>
            <select
              value={gamesMode}
              onChange={(e) => { setGamesMode(e.target.value); setGamesOff(0); }}
              className="rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
            >
              <option value="">All modes</option>
              {["versus", "solo", "daily", "tournament"].map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <input
              value={gamesQ}
              onChange={(e) => { setGamesQ(e.target.value); setGamesOff(0); }}
              placeholder="Search player…"
              className="rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
            />
          </div>
          <GamesView games={games?.games ?? null} onDelete={onDeleteGame} />
          <Pager loaded={!!games} offset={gamesOff} pageSize={PAGE} total={games?.total ?? 0} onChange={setGamesOff} />
        </>
      )}
      {section === "series" && (
        <>
          {series && (
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {([
                ["Total", series.summary.total],
                ["Open", series.summary.open],
                ["Live", series.summary.live],
                ["Finished", series.summary.finished],
              ] as [string, number][]).map(([label, value]) => (
                <div key={label} className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
                  <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-wide text-[var(--color-text-secondary)]">{label}</div>
                  <div className="mt-1 font-[var(--font-display)] text-2xl font-bold">{value.toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
          <div className="mb-3 flex flex-wrap gap-2">
            <select
              value={seriesStatus}
              onChange={(e) => { setSeriesStatus(e.target.value); setSeriesOff(0); }}
              className="rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
            >
              <option value="">All statuses</option>
              {["open", "live", "finished"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <input
              value={seriesQ}
              onChange={(e) => { setSeriesQ(e.target.value); setSeriesOff(0); }}
              placeholder="Search player…"
              className="rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
            />
          </div>
          <SeriesView series={series?.series ?? null} onDelete={onDeleteSeries} />
          <Pager loaded={!!series} offset={seriesOff} pageSize={PAGE} total={series?.total ?? 0} onChange={setSeriesOff} />
        </>
      )}
      {section === "tournaments" && (
        <TournamentsView data={tournaments} onNote={setNote} onRefresh={loadTournaments} />
      )}
      {section === "feedback" && (
        <>
          <label className="mb-3 flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
            <input
              type="checkbox"
              checked={fbHideResolved}
              onChange={(e) => { setFbHideResolved(e.target.checked); setFbOff(0); }}
            />
            Hide resolved
          </label>
          <FeedbackView feedback={feedback?.feedback ?? null} onResolve={toggleFeedback} />
          <Pager loaded={!!feedback} offset={fbOff} pageSize={FB_PAGE} total={feedback?.total ?? 0} onChange={setFbOff} />
        </>
      )}
    </main>
  );
}

function FeedbackView({
  feedback,
  onResolve,
}: {
  feedback: FeedbackRow[] | null;
  onResolve: (id: number, resolved: boolean) => void;
}) {
  if (!feedback) return <Loading />;
  if (feedback.length === 0) return <Empty label="No feedback yet." />;
  return (
    <div className="space-y-3">
      {feedback.map((f) => (
        <div
          key={f.id}
          className="rounded-[14px] border border-white/5 bg-black/40 p-4 shadow-lg backdrop-blur-md transition-opacity"
          style={{ opacity: f.resolved ? 0.55 : 1 }}
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
            {f.resolved && (
              <span
                className="rounded-full px-2 py-0.5"
                style={{ background: "color-mix(in srgb, var(--color-success) 18%, transparent)", color: "var(--color-success)" }}
              >
                resolved
              </span>
            )}
            <span className="ml-auto">
              {new Date(f.created_at).toLocaleString()}
            </span>
            <button
              onClick={() => onResolve(f.id, !f.resolved)}
              className="rounded-[8px] border px-2.5 py-1 transition-colors hover:bg-[var(--color-elevated)]"
              style={{ borderColor: "var(--color-border)", color: f.resolved ? "var(--color-text-secondary)" : "var(--color-success)" }}
            >
              {f.resolved ? "Reopen" : "Resolve"}
            </button>
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
          <div key={c.label} className="rounded-[14px] border border-white/5 bg-black/40 p-4 shadow-xl backdrop-blur-md">
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

        <ChartCard title="Active members">
          {ins ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                {([["DAU", ins.active.dau], ["WAU", ins.active.wau], ["MAU", ins.active.mau]] as const).map(([l, v]) => (
                  <div key={l} className="rounded-[12px] border border-white/5 bg-black/40 p-3 text-center shadow-md">
                    <div className="font-[var(--font-display)] text-2xl font-bold">{v.toLocaleString()}</div>
                    <div className="mt-0.5 font-[var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-text-secondary)]">{l}</div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-[var(--color-text-secondary)]">
                Distinct Bluesky members who played (day / week / month). Stickiness DAU/MAU: {ins.active.mau ? Math.round((ins.active.dau / ins.active.mau) * 100) : 0}%.
              </p>
            </>
          ) : (
            <ChartSkeleton />
          )}
        </ChartCard>

        <ChartCard title="New vs returning (last 7 days)">
          {ins ? (
            <>
              <SplitBar
                segments={[
                  { label: "returning", value: ins.retention.returning, color: "#56f0aa" },
                  { label: "new", value: ins.retention.new, color: "#67e8f9" },
                ]}
              />
              <p className="mt-3 text-xs text-[var(--color-text-secondary)]">
                Members active this week, split by whether they had played before. Returning is the number that compounds.
              </p>
            </>
          ) : (
            <ChartSkeleton />
          )}
        </ChartCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Top players">
          {ins ? (
            ins.top_players.length ? (
              <>
                <div className="flex items-center gap-3 px-1 pb-1.5 font-[var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-text-secondary)]">
                  <span className="w-5" />
                  <span className="flex-1">player</span>
                  <span className="w-16 text-right">1v1</span>
                  <span className="w-14 text-right">solo</span>
                  <span className="w-14 text-right">1v1 win</span>
                </div>
                <div className="space-y-2">
                  {ins.top_players.map((p, i) => (
                    <div key={p.handle} className="flex items-center gap-3 text-sm">
                      <span className="w-5 text-right font-[var(--font-mono)] text-[var(--color-text-secondary)]">{i + 1}</span>
                      <span className="flex-1 truncate">@{p.handle}</span>
                      <span className="w-16 text-right font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)]">{p.wins}-{p.versus_games - p.wins}</span>
                      <span className="w-14 text-right font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)]">{p.solo}</span>
                      <span className="w-14 text-right font-[var(--font-mono)]">{p.versus_games ? `${Math.round(p.win_rate * 100)}%` : "·"}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-[var(--color-text-secondary)]">No ranked players yet.</p>
            )
          ) : (
            <ChartSkeleton />
          )}
        </ChartCard>

        <ChartCard title="Game balance">
          {ins ? (
            ins.game_balance.length ? (
              <>
                <div className="flex items-center gap-2 px-1 pb-1.5 font-[var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-text-secondary)]">
                  <span className="flex-1">game</span>
                  <span className="w-10 text-right">1v1</span>
                  <span className="w-20 text-right">1st-player</span>
                  <span className="w-12 text-right">draws</span>
                </div>
                {ins.game_balance.map((g) => {
                  const enough = g.decisive >= 8;
                  const imbalanced = enough && (g.first_player_win_rate < 0.4 || g.first_player_win_rate > 0.6);
                  return (
                    <div key={g.game_type} className="flex items-center gap-2 px-1 py-1 text-sm">
                      <span className="flex-1 truncate">{gname(g.game_type)}</span>
                      <span className="w-10 text-right font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)]">{g.versus}</span>
                      <span className="w-20 text-right font-[var(--font-mono)]" style={{ color: imbalanced ? "#ffd166" : undefined }} title={imbalanced ? "far from a fair 50%" : undefined}>
                        {g.decisive ? `${Math.round(g.first_player_win_rate * 100)}%` : "·"}
                      </span>
                      <span className="w-12 text-right font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)]">
                        {g.versus ? `${Math.round(g.draw_rate * 100)}%` : "·"}
                      </span>
                    </div>
                  );
                })}
                <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                  1st-player is how often the host wins a decisive 1v1. Far from 50% (flagged) hints a first-move advantage or a bug. Needs a few games to mean anything.
                </p>
              </>
            ) : (
              <p className="text-sm text-[var(--color-text-secondary)]">No games yet.</p>
            )
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
    <div className="rounded-[16px] border border-white/5 bg-black/40 p-4 shadow-xl backdrop-blur-md sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h3 className="font-[var(--font-display)] text-[1rem] font-semibold text-[var(--color-text-primary)]">{title}</h3>
        {legend}
      </div>
      {children}
    </div>
  );
}

function ChartSkeleton() {
  return <div className="h-[200px] animate-pulse rounded-[12px] bg-white/5" />;
}

function UsersView({
  users,
  startIndex = 0,
  sort,
  order,
  onSort,
  onRecompute,
}: {
  users: UserRow[] | null;
  startIndex?: number;
  sort: UserSort;
  order: "asc" | "desc";
  onSort: (col: UserSort) => void;
  onRecompute: (did: string) => void;
}) {
  if (!users) return <Loading />;
  if (users.length === 0) return <Empty label="No users match." />;
  const col = (label: string, key: UserSort) => (
    <button onClick={() => onSort(key)} className="flex items-center gap-1 uppercase tracking-wide hover:text-[var(--color-text-primary)]">
      {label}
      <span className="text-[9px]">{sort === key ? (order === "desc" ? "▼" : "▲") : "↕"}</span>
    </button>
  );
  return (
    <Table head={["#", "Handle", col("Joined", "created"), col("Played", "played"), col("Won", "won"), col("Win %", "win_rate"), col("Score", "score"), ""]}>
      {users.map((u, i) => (
        <tr key={u.did} className="border-t border-[var(--color-border)]">
          <Td className="text-[var(--color-text-secondary)]">{startIndex + i + 1}</Td>
          <Td>
            <Link href={`/u/${u.handle}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 -my-1 py-1 hover:text-[var(--color-primary)]">
              <Avatar id={u.did} name={u.display_name ?? u.handle} avatarUrl={u.avatar_url} size={32} />
              <div className="min-w-0">
                <div className="truncate font-medium">{u.display_name ?? u.handle}</div>
                <div className="truncate font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)]">@{u.handle}</div>
              </div>
            </Link>
          </Td>
          <Td className="whitespace-nowrap text-[var(--color-text-secondary)]">
            {u.created_at ? new Date(u.created_at).toLocaleDateString() : "-"}
          </Td>
          <Td>{u.games_played}</Td>
          <Td>{u.games_won}</Td>
          <Td>{Math.round(u.win_rate * 100)}%</Td>
          <Td className="font-[var(--font-mono)]">{u.total_score.toLocaleString()}</Td>
          <Td>
            <button
              onClick={() => onRecompute(u.did)}
              title="Recompute this user's stats from their game history"
              className="whitespace-nowrap rounded-[8px] border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-elevated)] hover:text-[var(--color-text-primary)]"
            >
              ↻ stats
            </button>
          </Td>
        </tr>
      ))}
    </Table>
  );
}

function GamesView({ games, onDelete }: { games: GameRow[] | null; onDelete: (id: number) => void }) {
  if (!games) return <Loading />;
  if (games.length === 0) return <Empty label="No games match." />;
  return (
    <Table head={["When", "Game", "Result", "Winner", ""]}>
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
            <Td>
              <button
                onClick={() => onDelete(g.id)}
                title={`Delete game #${g.id} and recompute affected players`}
                className="whitespace-nowrap rounded-[8px] border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:border-[var(--color-warm)] hover:text-[var(--color-warm)]"
              >
                Delete
              </button>
            </Td>
          </tr>
        );
      })}
    </Table>
  );
}

function SeriesView({
  series,
  onDelete,
}: {
  series: SeriesAdminRow[] | null;
  onDelete: (id: string) => void;
}) {
  if (!series) return <Loading />;
  if (series.length === 0) return <Empty label="No series match." />;
  const statusColor: Record<string, string> = {
    open: "var(--color-cyan)",
    live: "var(--color-success)",
    finished: "var(--color-text-secondary)",
  };
  return (
    <Table head={["Created", "Match", "Bo", "Status", "Score", "Games", "Winner", ""]}>
      {series.map((s) => (
        <tr key={s.id} className="border-t border-[var(--color-border)]">
          <Td className="whitespace-nowrap text-[var(--color-text-secondary)]">
            {new Date(s.created_at).toLocaleString()}
          </Td>
          <Td className="font-[var(--font-mono)] whitespace-nowrap">
            <span className="text-[var(--color-primary)]">{s.player1_handle}</span>
            <span className="text-[var(--color-text-secondary)]"> vs </span>
            <span className="text-[var(--color-warm)]">{s.player2_handle ?? "open seat"}</span>
          </Td>
          <Td className="uppercase text-[var(--color-text-secondary)]">{s.format}</Td>
          <Td>
            <span
              className="rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide"
              style={{ background: `color-mix(in srgb, ${statusColor[s.status]} 16%, transparent)`, color: statusColor[s.status] }}
            >
              {s.status}
            </span>
          </Td>
          <Td className="font-[var(--font-mono)] whitespace-nowrap tabular-nums">
            {s.p1_wins} - {s.p2_wins}
          </Td>
          <Td className="max-w-[280px] text-xs text-[var(--color-text-secondary)]">
            {s.games.join(" · ")}
            {s.current_game && (
              <span className="ml-1 text-[var(--color-cyan)]">▶ {s.current_game}</span>
            )}
          </Td>
          <Td className={s.winner_handle ? "text-[var(--color-success)]" : "text-[var(--color-text-secondary)]"}>
            {s.winner_handle ?? "-"}
          </Td>
          <Td>
            <button
              onClick={() => onDelete(s.id)}
              title={`Delete series ${s.id} (its games are kept)`}
              className="whitespace-nowrap rounded-[8px] border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:border-[var(--color-warm)] hover:text-[var(--color-warm)]"
            >
              Delete
            </button>
          </Td>
        </tr>
      ))}
    </Table>
  );
}

// Warm for live, mint for finished, violet for open sign-ups, grey otherwise.
const TSTATUS: Record<string, { label: string; color: string }> = {
  registering: { label: "sign-ups open", color: "#8b7cff" },
  locked: { label: "drawn", color: "#ffd166" },
  in_progress: { label: "live", color: "#ff8a3d" },
  finished: { label: "finished", color: "#56f0aa" },
};

function TournamentsView({
  data,
  onNote,
  onRefresh,
}: {
  data: TournamentsAdmin | null;
  onNote: (n: string) => void;
  onRefresh: () => void;
}) {
  const [manageId, setManageId] = useState<string | null>(null);
  if (!data) return <Loading />;
  const { summary: s, tournaments } = data;
  const cards = [
    { label: "Tournaments", value: s.total },
    { label: "Sign-ups open", value: s.registering },
    { label: "Live now", value: s.live },
    { label: "Finished", value: s.finished },
    { label: "Unique entrants", value: s.unique_entrants },
    { label: "Series played", value: s.series_played },
  ];
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <div key={c.label} className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="font-[var(--font-display)] text-3xl font-bold">{c.value.toLocaleString()}</div>
            <div className="mt-1 text-xs text-[var(--color-text-secondary)]">{c.label}</div>
          </div>
        ))}
      </div>

      <h2 className="mt-8 mb-4 font-[var(--font-display)] text-lg font-semibold">All tournaments</h2>
      {tournaments.length === 0 ? (
        <Empty label="No tournaments have run yet." />
      ) : (
        <Table head={["Created", "Name", "Status", "Entrants", "Series", "Champion", ""]}>
          {tournaments.map((t) => {
            const st = TSTATUS[t.status] ?? { label: t.status, color: "var(--color-text-secondary)" };
            return (
              <Fragment key={t.id}>
                <tr className="border-t border-[var(--color-border)]">
                  <Td className="whitespace-nowrap text-[var(--color-text-secondary)]">
                    {new Date(t.created_at).toLocaleDateString()}
                  </Td>
                  <Td>
                    <div className="font-medium">{t.name}</div>
                    <div className="font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)]">{t.id}</div>
                  </Td>
                  <Td>
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
                      style={{ background: `${st.color}22`, color: st.color }}
                    >
                      {t.status === "in_progress" && (
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: st.color }} />
                      )}
                      {st.label}
                    </span>
                  </Td>
                  <Td className="font-[var(--font-mono)] whitespace-nowrap">
                    {t.entrants}
                    <span className="text-[var(--color-text-secondary)]">/{t.max_players}</span>
                  </Td>
                  <Td className="font-[var(--font-mono)] whitespace-nowrap text-[var(--color-text-secondary)]">
                    {t.matches_total ? `${t.matches_done}/${t.matches_total}` : "·"}
                  </Td>
                  <Td className={t.champion ? "text-[var(--color-success)]" : "text-[var(--color-text-secondary)]"}>
                    {t.champion ? `@${t.champion}` : "·"}
                  </Td>
                  <Td>
                    <button
                      onClick={() => setManageId((id) => (id === t.id ? null : t.id))}
                      className="whitespace-nowrap rounded-[8px] border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-elevated)] hover:text-[var(--color-text-primary)]"
                    >
                      {manageId === t.id ? "Close" : "Manage"}
                    </button>
                  </Td>
                </tr>
                {manageId === t.id && (
                  <tr className="border-t border-[var(--color-border)] bg-black/30">
                    <td colSpan={7} className="p-4">
                      <ManagePanel t={t} onNote={onNote} onRefresh={onRefresh} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </Table>
      )}
    </motion.div>
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
function Pager({
  loaded,
  offset,
  pageSize,
  total,
  onChange,
}: {
  loaded: boolean;
  offset: number;
  pageSize: number;
  total: number;
  onChange: (offset: number) => void;
}) {
  if (!loaded || total <= pageSize) return null;
  const from = offset + 1;
  const to = Math.min(offset + pageSize, total);
  const btn =
    "rounded-[8px] border border-[var(--color-border)] px-3 py-1.5 text-sm transition-colors enabled:hover:bg-[var(--color-elevated)] disabled:opacity-40";
  return (
    <div className="mt-3 flex items-center justify-between gap-3">
      <span className="font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)]">
        {from}-{to} of {total}
      </span>
      <div className="flex gap-2">
        <button className={btn} disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - pageSize))}>
          Prev
        </button>
        <button className={btn} disabled={to >= total} onClick={() => onChange(offset + pageSize)}>
          Next
        </button>
      </div>
    </div>
  );
}
function Empty({ label }: { label: string }) {
  return <p className="py-10 text-center text-sm text-[var(--color-text-secondary)]">{label}</p>;
}
function ManagePanel({
  t,
  onNote,
  onRefresh,
}: {
  t: TournamentAdminRow;
  onNote: (n: string) => void;
  onRefresh: () => void;
}) {
  const [m, setM] = useState<TournamentMatches | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    getTournamentMatches(t.id).then(setM).catch(() => setM(null));
  }, [t.id]);
  useEffect(() => {
    load();
  }, [load]);

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      const r = (await fn()) as { changed?: boolean; status?: string } | undefined;
      onNote(
        label +
          (r?.changed !== undefined ? ` · changed=${r.changed}` : "") +
          (r?.status ? ` · now ${r.status}` : ""),
      );
      load();
      onRefresh();
    } catch (e) {
      onNote(`${label} failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const decide = (round: number, slot: number, did: string, who: string) => {
    if (!window.confirm(`Award r${round} s${slot} to ${who}? This advances the bracket.`)) return;
    act(`Decided r${round}s${slot} → ${who}`, () => decideMatch(t.id, round, slot, did));
  };

  const btn =
    "rounded-[8px] border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-elevated)] hover:text-[var(--color-text-primary)] disabled:opacity-50";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {t.status === "registering" && (
          <button
            disabled={busy}
            onClick={() => {
              if (window.confirm("Close registration and draw the bracket now?"))
                act("Closed registration + drew bracket", () => closeRegistration(t.id));
            }}
            className={btn}
          >
            Close registration + draw
          </button>
        )}
        <button disabled={busy} onClick={() => act("Resolved forfeits", () => resolveForfeits(t.id))} className={btn}>
          Resolve forfeits now
        </button>
      </div>

      {!m ? (
        <div className="text-sm text-[var(--color-text-secondary)]">Loading matches…</div>
      ) : m.matches.length === 0 ? (
        <div className="text-sm text-[var(--color-text-secondary)]">No matches drawn yet.</div>
      ) : (
        <div className="overflow-x-auto rounded-[10px] border border-[var(--color-border)]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-[var(--color-surface)] font-[var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-text-secondary)]">
                <th className="px-3 py-2">R/S</th>
                <th className="px-3 py-2">Players</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Decide</th>
              </tr>
            </thead>
            <tbody>
              {m.matches.map((mm) => {
                const decided = !!mm.winner_did || mm.status === "done" || mm.status === "bye";
                const canDecide = !decided && !!mm.player1_did && !!mm.player2_did;
                return (
                  <tr key={`${mm.round}-${mm.slot}`} className="border-t border-[var(--color-border)]">
                    <td className="whitespace-nowrap px-3 py-2 font-[var(--font-mono)] text-[var(--color-text-secondary)]">
                      r{mm.round} s{mm.slot}
                    </td>
                    <td className="px-3 py-2">
                      <span className={mm.winner_did && mm.winner_did === mm.player1_did ? "text-[var(--color-success)]" : ""}>
                        {mm.player1_handle ? `@${mm.player1_handle}` : "—"}
                      </span>
                      <span className="text-[var(--color-text-secondary)]"> vs </span>
                      <span className={mm.winner_did && mm.winner_did === mm.player2_did ? "text-[var(--color-success)]" : ""}>
                        {mm.player2_handle ? `@${mm.player2_handle}` : "—"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-[var(--color-text-secondary)]">
                      {mm.status}
                      {mm.winner_handle ? ` · @${mm.winner_handle}` : ""}
                    </td>
                    <td className="px-3 py-2">
                      {canDecide ? (
                        <div className="flex gap-1">
                          <button disabled={busy} onClick={() => decide(mm.round, mm.slot, mm.player1_did!, `@${mm.player1_handle}`)} className={btn}>
                            {mm.player1_handle ? `@${mm.player1_handle}` : "P1"}
                          </button>
                          <button disabled={busy} onClick={() => decide(mm.round, mm.slot, mm.player2_did!, `@${mm.player2_handle}`)} className={btn}>
                            {mm.player2_handle ? `@${mm.player2_handle}` : "P2"}
                          </button>
                        </div>
                      ) : (
                        <span className="text-[var(--color-text-secondary)]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Table({ head, children }: { head: React.ReactNode[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-[14px] border border-[var(--color-border)]">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="bg-[var(--color-surface)]">
            {head.map((h, i) => (
              <th key={i} className="px-4 py-3 font-[var(--font-mono)] text-[11px] uppercase tracking-wide text-[var(--color-text-secondary)]">
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
