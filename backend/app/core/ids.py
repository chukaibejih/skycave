"""Short, URL-friendly id generation."""
import secrets

# Unambiguous alphabet (no 0/O/1/l/I).
_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz"


def new_room_id(length: int = 5) -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(length))


def new_guest_id() -> str:
    return "guest:" + secrets.token_hex(8)
