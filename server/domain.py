"""YamanoPrime notation and physical-card adapter around upstream game rules."""
from collections import Counter
import json
import re
import sys

from vendor.core import is_prime, build_int_from_cards, parse_and_eval_composite, CompositeError
from vendor.rules import PRESETS

RULE = PRESETS['std-11-n-c']
RANKS = {str(n): n for n in range(1, 10)} | {'A': 1, 'T': 10, 'J': 11, 'Q': 12, 'K': 13}
LABELS = {n: str(n) for n in range(1, 10)} | {10: 'T', 11: 'J', 12: 'Q', 13: 'K'}
MODES = ('PRIME_ONLY', 'COMPOSITE_ONLY', 'BOTH')

class InputError(ValueError):
    pass

def require(condition, message):
    if not condition:
        raise InputError(message)

def clean(text):
    require(isinstance(text, str) and len(text) <= 512, '1行は512文字以内で入力してください。')
    return re.sub(r'\s+', '', text).upper().replace('×', '*').replace('Ａ', 'A')

def parse_hand(text):
    text = clean(text)
    require(bool(text) and all(c in RANKS for c in text), '手札は1〜9 / A / T / J / Q / Kで入力してください。0札・Xは対象外です。')
    hand = [RANKS[c] for c in text]
    canonical(hand)
    return hand

def canonical(hand):
    require(isinstance(hand, list) and 1 <= len(hand) <= 52, '手札は1〜52枚です。')
    require(all(type(n) is int and 1 <= n <= 13 for n in hand), '不正なカードがあります。')
    require(all(n <= 4 for n in Counter(hand).values()), '同じランクの物理札は4枚までです。見せ札と材料札も別々に必要です。')
    result = sorted(hand)
    # Fixed-width ranks preserve numeric rank lexicographic order, including prefixes.
    return result, ''.join(f'{n:02d}' for n in result)

def notation_cards(hand):
    return ''.join(LABELS[n] for n in hand)

def convert_external(text):
    """Only this importer understands the supplied 素数探索 bracket-token format."""
    text = clean(text)
    def replace(match):
        visible = match.group(1)
        parts = match.group(2).split(',')
        result = []
        for token in parts:
            if token in ('*', '^'):
                result.append(token)
            else:
                require(token.isdigit() and 1 <= int(token) <= 13, '素数探索の材料トークンは1〜13、*、^です。')
                result.append(LABELS[int(token)])
        return visible + '=' + ''.join(result)
    converted = re.sub(r'([1-9ATJQK]+),\[([^\[\]]*)\]', replace, text)
    require('[' not in converted and ']' not in converted, '素数探索の角括弧形式を読み取れません。')
    return converted

def parse_action(text):
    require(text.count('=') <= 1, '等号は1つまでです。')
    sides = text.split('=')
    display = parse_hand(sides[0])
    value = build_int_from_cards(display)
    if len(sides) == 1:
        return {'kind': 'cut' if value == 57 else 'prime', 'cards': display,
                'value': str(value), 'notation': notation_cards(display)}
    expression = sides[1]
    require(expression and all(c in RANKS or c in '*^' for c in expression), '素因数式にはカードと * / ^ だけを使ってください。')
    tokens, materials = [], []
    for c in expression:
        if c in '*^':
            tokens.append({'kind': 'op', 'op': '×' if c == '*' else '^'})
        else:
            tokens.append({'kind': 'card', 'card_id': f'm{len(materials)}'})
            materials.append(RANKS[c])
    canonical(display + materials)
    return {'kind': 'composite', 'cards': display, 'materials': materials, 'tokens': tokens,
            'value': str(value), 'notation': notation_cards(display) + '=' + expression.replace('A', '1')}

def parse_solution(text):
    text = clean(text)
    parts = text.split(',')
    require(all(parts) and len(parts) <= 5, '57をカンマで区切り、上がり手を1つ入力してください。')
    actions = [parse_action(part) for part in parts]
    cuts = [a for a in actions if a['kind'] == 'cut']
    finals = [a for a in actions if a['kind'] != 'cut']
    require(len(finals) <= 1, '57以外の上がり手は1つだけ指定できます。')
    actions = cuts + finals
    hand = [n for a in actions for n in a['cards'] + a.get('materials', [])]
    hand, key = canonical(hand)
    return {'actions': actions, 'notation': ','.join(a['notation'] for a in actions),
            'canonical_hand': hand, 'canonical_hand_key': key}

def legal_finish(solution, hand, mode, allow57):
    require(mode in MODES and type(allow57) is bool, '回答条件が不正です。')
    expected, key = canonical(hand)
    require(key == solution['canonical_hand_key'], '元の手札を重複なく、すべて使い切ってください。')
    remaining = Counter(expected)
    actions = solution['actions']
    for i, action in enumerate(actions):
        consumed = action['cards'] + action.get('materials', [])
        for rank in consumed:
            require(remaining[rank] > 0, '手札にないカードを使用しています。')
            remaining[rank] -= 1
        last = i == len(actions)-1
        if action['kind'] == 'cut':
            require(allow57, 'このセットでは57を使用できません。')
            require(not last or mode != 'COMPOSITE_ONLY', '合成数のみでは、57の後に合成数出しで上がる必要があります。')
        elif action['kind'] == 'composite':
            require(last and mode != 'PRIME_ONLY', 'このセットでは合成数出しを使用できません。')
            ranks = {f'm{i}': n for i, n in enumerate(action['materials'])}
            # The original game parser checks syntax, prime bases, powers and physical IDs.
            value, used = parse_and_eval_composite(action['tokens'], ranks, RULE)
            require(value == int(action['value']), '見せ札の数と素因数式の値が一致しません。')
            require(len(used) == len(action['materials']), '材料札が一致しません。')
        else:
            require(last and mode != 'COMPOSITE_ONLY', '合成数のみでは素因数付きの合成数出しが必要です。')
            require(int(action['value']) == 1729 or is_prime(int(action['value'])), '素数または1729の合法な特殊出しではありません。')
    require(not any(remaining.values()), '使っていないカードが残っています。')
    return {'actions': actions, 'notation': solution['notation']}

def validate(payload):
    try:
        solution = parse_solution(payload.get('solution'))
        judged = legal_finish(solution, payload.get('hand'), payload.get('answer_mode'), payload.get('allow_57'))
        return {'legal': True, 'solution': judged}
    except (InputError, CompositeError, ValueError, TypeError, KeyError) as error:
        return {'legal': False, 'reason': str(error)}

def import_problems(payload):
    errors, warnings, problems, seen = [], [], [], {}
    sections = [('normal', payload.get('normal_text', '')), ('dead', payload.get('dead_text', ''))]
    if any(not isinstance(text, str) for _, text in sections):
        return {'problems': [], 'errors': [{'section':'normal','line':0,'input':'','reason':'入力は文字列で指定してください。'}], 'warnings': []}
    count = sum(bool(line.strip()) for _, text in sections for line in text.splitlines())
    if count > 5000:
        return {'problems': [], 'errors': [{'section':'normal','line':5001,'input':'','reason':'1バージョンに入力できる問題は5000行までです。'}], 'warnings': []}
    for section, text in sections:
        for line, raw in enumerate(text.splitlines(), 1):
            if not raw.strip():
                continue
            item = {'section': section, 'line': line, 'input': raw}
            try:
                if section == 'normal':
                    converted = convert_external(raw) if payload.get('format') == 'sosutansaku' else raw
                    solution = parse_solution(converted)
                    hand, key = solution['canonical_hand'], solution['canonical_hand_key']
                    example = legal_finish(solution, hand, payload.get('answer_mode'), payload.get('allow_57'))
                    kind = 'NORMAL'
                else:
                    hand, key = canonical(parse_hand(raw))
                    example, kind = None, 'CLAIMED_DEAD'
                if key in seen:
                    previous = seen[key]
                    require(previous['kind'] == kind, f'通常問題と詰み問題が同じ手札です（{previous["section"]} {previous["line"]}行目）。')
                    warnings.append(item | {'reason': f'{previous["section"]} {previous["line"]}行目と同じ手札のため、先の問題を採用します。'})
                    continue
                seen[key] = item | {'kind': kind}
                problems.append({'canonical_hand': hand, 'canonical_hand_key': key,
                                 'problem_kind': kind, 'example_solution': example, 'author_order': len(problems)})
            except (InputError, CompositeError, ValueError, TypeError, KeyError) as error:
                errors.append(item | {'reason': str(error)})
    if not count:
        errors.append({'section':'normal','line':0,'input':'','reason':'1問以上入力してください。'})
    return {'problems': problems, 'errors': errors, 'warnings': warnings}

def dispatch(payload):
    if payload.get('op') == 'import':
        return import_problems(payload)
    if payload.get('op') == 'validate':
        return validate(payload)
    return {'error': 'Unknown operation'}

if __name__ == '__main__':
    for line in sys.stdin:
        try:
            result = dispatch(json.loads(line))
        except Exception:
            # Unexpected failures are infrastructure errors, never an incorrect answer.
            result = {'worker_error': True}
        print(json.dumps(result, ensure_ascii=False), flush=True)
