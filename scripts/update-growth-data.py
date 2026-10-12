"""Refresh community stage baselines. A partial/invalid fetch never replaces the snapshot."""
import concurrent.futures
import datetime
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
SOURCE = 'https://www.evrimaquickguide.com'
CATEGORIES = {
    'carnivores': ['Allosaurus', 'Carnotaurus', 'Ceratosaurus', 'Deinosuchus', 'Dilophosaurus',
                   'Herrerasaurus', 'Omniraptor', 'Pteranodon', 'Troodon', 'Tyrannosaurus'],
    'herbivores': ['Diabloceratops', 'Dryosaurus', 'Hypsilophodon', 'Kentrosaurus', 'Maiasaura',
                  'Pachycephalosaurus', 'Stegosaurus', 'Tenontosaurus', 'Triceratops'],
    'omnivores': ['Beipiaosaurus', 'Gallimimus'],
}


class PageText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.skipping = 0

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.skipping += 1

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self.skipping = max(0, self.skipping - 1)

    def handle_data(self, text):
        if not self.skipping:
            self.parts.append(text)


def fetch_profile(item):
    category, name = item
    url = f'{SOURCE}/playables/quick-facts-{category}/{name.lower()}'
    request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Growth-baseline-check)'})
    with urllib.request.urlopen(request, timeout=25) as response:
        parser = PageText()
        parser.feed(response.read().decode('utf-8'))
    text = ' '.join(parser.parts)
    section = re.search(r'Grow\s*Times\s*:?(.*?)(?:Group\s*Information|Diet\s*&)', text, re.I | re.S)
    if not section:
        raise ValueError(f'{name}: growth section missing')
    values = re.findall(r'(Hatchling|Juvenile|Sub\s*Adult|Elder|Adult)\s*:\s*([\d\s]+)\s*minutes', section[1], re.I)
    # Two profiles still label their final 75-100% stage "Adult".
    stages = {('elder' if label.strip().lower() == 'adult' else re.sub(r'\s', '', label).lower()): int(re.sub(r'\s', '', minutes)) for label, minutes in values}
    if len(values) != 4 or set(stages) != {'hatchling', 'juvenile', 'subadult', 'elder'}:
        raise ValueError(f'{name}: four stage durations required')
    minutes = [stages[key] for key in ('hatchling', 'juvenile', 'subadult', 'elder')]
    if any(value <= 0 or value > 10000 for value in minutes):
        raise ValueError(f'{name}: invalid stage duration')
    total = re.search(r'Total\s*time\s*:\s*([\d\s]+)\s*hours?(?:\s*([\d\s]+)\s*minutes)?', section[1], re.I)
    if not total:
        raise ValueError(f'{name}: reported total duration required')
    reported = int(re.sub(r'\s', '', total[1])) * 60 + (int(re.sub(r'\s', '', total[2])) if total[2] else 0)
    if sum(minutes) != reported:
        raise ValueError(f'{name}: stage sum does not match total ({sum(minutes)} vs {reported})')
    return name, {'stageMinutes': minutes, 'source': url, 'diet': category[:-1]}


def main():
    tasks = [(category, name) for category, names in CATEGORIES.items() for name in names]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        profiles = dict(pool.map(fetch_profile, tasks))
    snapshot = {
        'schemaVersion': 1,
        'checkedOn': datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).date().isoformat(),
        'sourceName': 'Evrima Quick Guide',
        'sourceUrl': SOURCE,
        'method': 'Community stage baselines at 1x; constant speed within each 25% stage.',
        'boundaries': [0, 25, 50, 75, 100],
        'species': dict(sorted(profiles.items())),
        'unavailable': {'Austroraptor': 'Reliable stage-time data unavailable; known placeholder figures excluded.'},
    }
    target = ROOT / 'data' / 'growth-times.json'
    target.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Updated {len(profiles)} growth profiles, checked {snapshot["checkedOn"]}')
    for name, profile in sorted(profiles.items()):
        print(f'{name}: {profile["stageMinutes"]}')


if __name__ == '__main__':
    main()
