"""Read public stamina references without executing remote JavaScript."""
import json
import math
import re
import urllib.request
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    'regeneration': 'https://myislemap.com/assets/charts/stamina-regeneration.json',
    'rest': 'https://myislemap.com/assets/charts/rest-multiplier-time.json',
    'timings': 'https://www.evrimaquickguide.com/gameplay/health-statuses/stamina',
}
STATES = ('standing', 'walking', 'trotting', 'resting')
ALIASES = dict(zip(
    ('Troodon', 'Herrera', 'Omni', 'Dilo', 'Cerato', 'Carno', 'Ptera', 'Deino', 'TRex', 'Allo', 'Hypsi', 'Dryo', 'Pachy', 'Teno', 'Stego', 'Maia', 'Trike', 'Dibble', 'Kentro', 'Beipia', 'Galli'),
    ('Troodon', 'Herrerasaurus', 'Omniraptor', 'Dilophosaurus', 'Ceratosaurus', 'Carnotaurus', 'Pteranodon', 'Deinosuchus', 'Tyrannosaurus', 'Allosaurus', 'Hypsilophodon', 'Dryosaurus', 'Pachycephalosaurus', 'Tenontosaurus', 'Stegosaurus', 'Maiasaura', 'Triceratops', 'Diabloceratops', 'Kentrosaurus', 'Beipiaosaurus', 'Gallimimus'),
))

class Blocks(HTMLParser):
    def __init__(self):
        super().__init__(); self.records = []; self.current = None; self.parts = []
    def handle_starttag(self, tag, attrs):
        if tag in ('p', 'h2', 'h3'):
            self.current = tag; self.parts = []
        elif tag == 'br' and self.current:
            self.parts.append(' ')
    def handle_data(self, data):
        if self.current:
            self.parts.append(data)
    def handle_endtag(self, tag):
        if tag == self.current:
            self.records.append((tag, ' '.join(''.join(self.parts).split())))
            self.current = None; self.parts = []

def timer(value):
    value = re.sub(r'\s+', '', value)
    if not value or len(value) > 120 or not re.fullmatch(r'[A-Za-z0-9:().]+', value):
        raise ValueError('Unrecognized stamina time text')
    matches = list(re.finditer(r'(\d+)(?::(\d{1,2}))?m', value))
    if not matches or any(m.group(2) and int(m.group(2)) >= 60 for m in matches):
        raise ValueError('Invalid reference duration')
    return value

def universal_timer(text):
    found = re.fullmatch(r'(?:Buffed:\s*)?(\d+)\s*m\s*(?:(\d+)\s*s)?', text)
    if not found:
        raise ValueError('Universal recovery timer changed')
    return timer(f'{found[1]}:{int(found[2] or 0):02d}m')

def parse_timings(html):
    parser = Blocks(); parser.feed(html)
    groups = {'normal': {}, 'buff': {}}
    common = {key: {} for key in STATES[:3]}
    section = None; state = None
    for tag, text in parser.records:
        compact = text.replace(' ', '').lower()
        if tag == 'h2' and compact.startswith('staminaregeneration('):
            section = 'normal' if compact == 'staminaregeneration(nobuff)' else 'buff' if compact == 'staminaregeneration(max15%buff)' else None
            state = None
        elif tag == 'h3' and text.lower() in common:
            state = text.lower()
        elif tag == 'p' and state and section is None:
            common[state]['buff' if text.startswith('Buffed:') else 'normal'] = universal_timer(text)
        elif tag == 'p' and section and '|' in text:
            fields = [part.strip() for part in text.split('|')]
            name = ALIASES.get(fields[0].lstrip('*'))
            if not name:
                raise ValueError('Unrecognized dinosaur in reference table')
            expected = 6 if name == 'Tyrannosaurus' else 3
            if len(fields) != expected or name in groups[section]:
                raise ValueError('Missing, duplicated or changed stamina time columns')
            groups[section][name] = [timer(part) for part in fields[1:]]
    names = set(ALIASES.values())
    if any(set(group) != names for group in groups.values()) or any(set(pair) != {'normal', 'buff'} for pair in common.values()):
        raise ValueError('Incomplete stamina time reference; keeping the previous snapshot')
    result = {}
    for name in names:
        pair = [groups[mode][name] for mode in ('normal', 'buff')]
        result[name] = {'duration': pair[0][0], 'resting': [row[1] for row in pair]}
        for index, key in enumerate(STATES[:3]):
            result[name][key] = [row[index+2] for row in pair] if name == 'Tyrannosaurus' else [common[key][mode] for mode in ('normal', 'buff')]
    return result

def numeric(value, minimum=0, maximum=1000):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and minimum <= value <= maximum

def normalize(regeneration, rest, timings, checked_on):
    if regeneration.get('metric') != 'Configured stamina regeneration value' or {row['key'] for row in regeneration['states']} != set(STATES):
        raise ValueError('Regeneration schema changed')
    maximum = rest['maxSeconds']
    if not numeric(maximum, 1, 3600) or int(maximum) != maximum:
        raise ValueError('Invalid rest time range')
    base = {}; curves = {}
    for row in regeneration['species']:
        name = row['name']
        if not re.fullmatch(r'[A-Z][A-Za-z]{1,63}', name) or name in base or set(row) != {'name', *STATES}:
            raise ValueError('Regeneration roster or fields changed')
        if not all(numeric(row[key]) for key in STATES):
            raise ValueError('Invalid regeneration value')
        base[name] = {key: row[key] for key in STATES}
    for row in rest['series']:
        name = row['name']; samples = row['samples']; peak = row['maxMultiplier']; full_at = row['fullMultiplierAt']
        if name in curves or not numeric(peak, 1, 100) or not numeric(full_at, 0, maximum) or int(full_at) != full_at:
            raise ValueError('Invalid rest curve metadata')
        if len(samples) != maximum+1 or any(point['seconds'] != index or not numeric(point['multiplier'], .8, peak+.02) for index, point in enumerate(samples)):
            raise ValueError('Missing or invalid rest curve samples')
        if abs(samples[full_at]['multiplier']-peak) > .02:
            raise ValueError('Rest peak does not match the original samples')
        curves[name] = {'maximum': peak, 'fullAt': full_at, 'samples': [point['multiplier'] for point in samples]}
    if len(base) < 20 or set(base) != set(curves) or not set(timings).issubset(base):
        raise ValueError('Source rosters do not match; keeping the previous snapshot')
    return {'schema': 1, 'sourceName': 'MyIsleMap', 'sources': SOURCES, 'checkedOn': checked_on, 'unit': 'configured-value', 'growthSpecific': False, 'totalStaminaAvailable': False, 'maxSeconds': maximum,
            'timingSourceUpdating': True, 'timingGrowth': None,
            'species': {name: {'regeneration': base[name], 'rest': curves[name], 'timing': timings.get(name)} for name in sorted(base)}}

def download(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'Evrima-Compare-Reference/1.0'})
    with urllib.request.urlopen(request, timeout=30) as response:
        if response.status != 200:
            raise ValueError('Source download failed')
        content = response.read(5_000_001)
    if len(content) > 5_000_000:
        raise ValueError('Unexpectedly large reference source')
    return content.decode('utf-8')

def main():
    raw = {key: download(url) for key, url in SOURCES.items()}
    day = datetime.now(timezone(timedelta(hours=9))).date().isoformat()
    data = normalize(json.loads(raw['regeneration']), json.loads(raw['rest']), parse_timings(raw['timings']), day)
    data['timingSourceUpdating'] = 'updating outdated information' in raw['timings'].lower()
    target = ROOT / 'data' / 'stamina-reference.json'
    temporary = target.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':'))+'\n', encoding='utf-8')
    temporary.replace(target)
    print(f'Validated {len(data["species"])} species, {data["maxSeconds"]+1} rest samples each, {sum(p["timing"] is not None for p in data["species"].values())} timing profiles.')

if __name__ == '__main__':
    main()
