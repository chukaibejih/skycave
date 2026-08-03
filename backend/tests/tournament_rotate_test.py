"""Tests for the /internal/tournaments/rotate endpoint against a real database.

Usage: python tests/tournament_rotate_test.py (inside the api container)
"""
import asyncio
import sys
sys.path.insert(0, ".")

from datetime import datetime, timezone
from fastapi import HTTPException
from sqlalchemy import delete, select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.tournament import Tournament, FINISHED
from app.routers import internal

settings.oauth_internal_secret = "test-secret"
settings.oauth_sidecar_url = "http://127.0.0.1:9"  # nothing listens here


async def main():
    async with AsyncSessionLocal() as s:
        # Cleanup any non-finished tournaments created by test runs
        active = (await s.execute(select(Tournament).where(Tournament.status != FINISHED))).scalars().all()
        for t in active:
            t.status = FINISHED
        await s.commit()

        # 1. Refuses unauthorized call
        try:
            await internal.rotate_tournament(x_internal_secret="wrong", dry_run=False, db=s)
            raise AssertionError("rotate ran with a wrong secret")
        except HTTPException as e:
            assert e.status_code == 401, f"Expected 401, got {e.status_code}"
        print("✓ rotate refuses wrong secret")

        # 2. Dry run test
        dry = await internal.rotate_tournament(x_internal_secret="test-secret", dry_run=True, db=s)
        assert dry["status"] == "dry_run", f"Unexpected status: {dry}"
        assert "would_create" in dry and "announcement_text" in dry, dry
        print("✓ dry run returns proposed creation details without persisting")

        # 3. Execution - creates tournament
        res = await internal.rotate_tournament(x_internal_secret="test-secret", dry_run=False, db=s)
        assert res["status"] == "created", f"Unexpected status: {res}"
        created_id = res["tournament_id"]
        assert created_id is not None
        print(f"✓ successfully created tournament {created_id}")

        # Verify DB persistence
        t_db = await s.get(Tournament, created_id)
        assert t_db is not None
        assert t_db.name == "Skycave Weekend Tournament"
        assert t_db.status == "registering"
        print("✓ tournament correctly persisted in DB")

        # 4. Idempotency - returns already_exists on subsequent run
        dup = await internal.rotate_tournament(x_internal_secret="test-secret", dry_run=False, db=s)
        assert dup["status"] == "already_exists", f"Unexpected status: {dup}"
        assert dup["tournament_id"] == created_id
        print("✓ idempotency verified (returns already_exists)")

        # Cleanup created test tournament
        await s.delete(t_db)
        await s.commit()
        print("✓ cleanup complete")

if __name__ == "__main__":
    asyncio.run(main())
