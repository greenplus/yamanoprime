"""Deterministic legal hands for the 5000-question load test, not public content."""
import random
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'server'))
from domain import is_prime, canonical, notation_cards, build_int_from_cards
rng = random.Random(20261002)
found = {}
while len(found) < 5000:
    hand = [rng.randint(1, 13) for _ in range(rng.randint(5, 9))]
    try:
        _, key = canonical(hand)
    except ValueError:
        continue
    if key not in found and is_prime(build_int_from_cards(hand)):
        found[key] = notation_cards(hand)
Path(__file__).with_name('legal-5000.txt').write_text('\n'.join(found.values()) + '\n', encoding='utf-8')
print(f'Generated {len(found)} distinct legal hands.')
