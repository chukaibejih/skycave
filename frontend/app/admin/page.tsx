"use client";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  AdminAuthError,
  adminLogin,
  clearAdminToken,
  getAdminToken,
  getGames,
  getOverview,
  getUsers,
  type GameRow,
  type Overview,
  type UserRow,
} from "@/lib/admin";

const GAME_NAME: Record<string, string> = {
  geoguess: "GeoGuess 1v1",
  color_clash: "Color Clash",
  flag_rush: "Flag Rush",
  outline_quiz: "Outline Quiz",
  word_duel: "Word Duel",
  reaction_grid: "Reaction Grid",
};
const gname = (t: string) => GAME_NAME[t] ?? t;

type Section = "overview" | "users" | "games";

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [section, setSection] = useState<Section>("overview");

  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [games, setGames] = useState<GameRow[] | null>(null);

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
        {(["overview", "users", "games"] as Section[]).map((s) => (
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
    </main>
  );
}

function OverviewView({ o }: { o: Overview }) {
  const cards = [
    { label: "Bluesky users", value: o.users },
    { label: "Games played", value: o.games_played },
    { label: "Last 24h", value: o.games_24h },
    { label: "Live rooms", value: o.active_rooms },
    { label: "In progress", value: o.rooms_in_progress },
  ];
  const maxCount = Math.max(1, ...o.by_game.map((g) => g.count));
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="font-[var(--font-display)] text-3xl font-bold">{c.value}</div>
            <div className="mt-1 text-xs text-[var(--color-text-secondary)]">{c.label}</div>
          </div>
        ))}
      </div>

      <h2 className="mb-3 mt-8 font-[var(--font-display)] text-lg font-semibold">
        Games played by type
      </h2>
      <div className="space-y-2">
        {o.by_game.length === 0 && (
          <p className="text-sm text-[var(--color-text-secondary)]">No games yet.</p>
        )}
        {o.by_game.map((g) => (
          <div key={g.game_type} className="flex items-center gap-3">
            <div className="w-32 shrink-0 text-sm">{gname(g.game_type)}</div>
            <div className="h-6 flex-1 overflow-hidden rounded-full bg-[var(--color-surface)]">
              <div
                className="h-full rounded-full bg-[var(--color-primary)]"
                style={{ width: `${(g.count / maxCount) * 100}%` }}
              />
            </div>
            <div className="w-10 text-right font-[var(--font-mono)] text-sm">{g.count}</div>
          </div>
        ))}
      </div>
    </motion.div>
  );
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
        const winner =
          g.player1_score === g.player2_score
            ? "draw"
            : g.player1_score > g.player2_score
              ? g.player1_handle
              : g.player2_handle ?? "-";
        return (
          <tr key={g.id} className="border-t border-[var(--color-border)]">
            <Td className="whitespace-nowrap text-[var(--color-text-secondary)]">
              {new Date(g.created_at).toLocaleString()}
            </Td>
            <Td>{gname(g.game_type)}</Td>
            <Td className="font-[var(--font-mono)] whitespace-nowrap">
              <span className="text-[var(--color-primary)]">{g.player1_handle}</span>{" "}
              {g.player1_score}-{g.player2_score}{" "}
              <span className="text-[var(--color-warm)]">{g.player2_handle ?? "-"}</span>
            </Td>
            <Td className={winner === "draw" ? "text-[var(--color-text-secondary)]" : "text-[var(--color-success)]"}>
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
